"""
Cruzamento das vendas do POS (ZoneSoft, tabela dbo.documentos) com as cobranças do Cashlogy.

Serve para o caso "valor errado": comparar o que o POS registou como venda com o que o
Cashlogy foi mandado cobrar. Só faz SELECT.

Confirmado com vendas reais (5 documentos FS/FT numa base ZoneSoft):
  - `datahora` é a hora real do documento; `datapag`/`data` são só a data contabilística (00:00),
    por isso a hora usada é sempre `datahora`;
  - `total` é o valor a pagar (com IVA); `liquido` é o valor sem IVA.
Não confirmado: que código de `pagamento` é dinheiro (o esquema não o diz). Infere-se: os códigos das
vendas que coincidem em valor e hora com uma cobrança do Cashlogy. Falta validar o cruzamento com
vendas pagas mesmo através do Cashlogy.
"""
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Callable, Dict, List, Optional, Tuple

from backend.services.cashlogy_logs import _ev, _eur

MATCH_TOLERANCE = timedelta(minutes=3)   # venda e cobrança até 3 min uma da outra
CONTEXT = timedelta(hours=2)             # contexto à volta do intervalo, para inferir o código de dinheiro
SALES_LIMIT = 500


def fetch_sales(get_connection: Callable[[], Any], start: datetime, end: datetime) -> Dict[str, Any]:
    """Vendas em [start-CONTEXT, end+CONTEXT]. Devolve {available, reason, rows, truncated}."""
    try:
        conn = get_connection()
    except Exception as e:  # sem base configurada / servidor inacessível
        return {"available": False, "reason": f"Sem ligação à base de dados: {e}", "rows": [], "truncated": False}
    try:
        cur = conn.cursor()
        lo, hi = start - CONTEXT, end + CONTEXT
        cur.execute(
            f"SELECT TOP {SALES_LIMIT} id, doc, serie, numero, datahora, total, anulado, pagamento, idcx, emp, mesa "
            "FROM dbo.documentos WHERE ISNULL(total, 0) <> 0 AND datahora >= ? AND datahora <= ? ORDER BY datahora",
            lo, hi)
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        return {"available": True, "reason": None, "rows": rows, "truncated": len(rows) >= SALES_LIMIT}
    except Exception as e:
        return {"available": False, "reason": f"Não foi possível ler as vendas (dbo.documentos): {e}",
                "rows": [], "truncated": False}
    finally:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()


def _cents(value: Any) -> int:
    return int((Decimal(str(value or 0)) * 100).to_integral_value())


def _sale_label(r: Dict[str, Any]) -> str:
    doc = (r.get("doc") or "").strip()
    serie = (r.get("serie") or "").strip()
    return f"{doc} {serie + '/' if serie else ''}{r.get('numero')}".strip()


def _gap(sale: Dict[str, Any], charge: Dict[str, Any]) -> float:
    """Segundos entre a hora do documento e o fim da cobrança."""
    return abs((sale["any"] - charge["end"]).total_seconds())


def match_sales(rows: List[Dict[str, Any]], charges: List[Dict[str, Any]], start: datetime, end: datetime) -> Dict[str, Any]:
    """Emparelha vendas e cobranças e devolve os eventos do intervalo [start, end]."""
    sales = []
    for r in rows:
        dt = r.get("datahora")  # a única hora real do documento (datapag é só a data contabilística)
        if not dt:
            continue
        sales.append({"row": r, "any": dt,
                      "cents": _cents(r.get("total")), "cancelled": bool(r.get("anulado")),
                      "code": r.get("pagamento"), "label": _sale_label(r)})
    live = [s for s in sales if not s["cancelled"]]
    done = [c for c in charges if not c["cancelled"] and c["ok"] is not None]
    tol = MATCH_TOLERANCE.total_seconds()

    # 1) mesmo valor e hora próxima: o par mais próximo primeiro
    cands = sorted((_gap(s, c), i, j) for i, s in enumerate(live) for j, c in enumerate(done)
                   if s["cents"] == c["amount"] and _gap(s, c) <= tol)
    used_s, used_c, pairs = set(), set(), []
    for gap, i, j in cands:
        if i not in used_s and j not in used_c:
            used_s.add(i)
            used_c.add(j)
            pairs.append((i, j))
    cash_codes = sorted({live[i]["code"] for i, _ in pairs if live[i]["code"] is not None})

    # 2) sobras: venda com código "de dinheiro" e cobrança próximas mas com valores diferentes
    left_s = [i for i, s in enumerate(live) if i not in used_s and s["code"] in cash_codes]
    left_c = [j for j in range(len(done)) if j not in used_c]
    diff_pairs = []
    for gap, i, j in sorted((_gap(live[i], done[j]), i, j) for i in left_s for j in left_c if _gap(live[i], done[j]) <= tol):
        if i in left_s and j in left_c:
            left_s.remove(i)
            left_c.remove(j)
            diff_pairs.append((i, j))

    def inside(t: Optional[datetime]) -> bool:
        return t is not None and start <= t <= end

    events: List[Dict[str, Any]] = []
    for i, j in pairs:
        s, c = live[i], done[j]
        if inside(s["any"]):
            events.append(_ev(s["any"], "sales", "sale", "info", f"Venda {s['label']} {_eur(s['cents'])}",
                              f"pagamento {s['code']} · coincide com a cobrança Cashlogy das {c['start'].strftime('%H:%M:%S')}"))
    for i, j in diff_pairs:
        s, c = live[i], done[j]
        if inside(s["any"]) or inside(c["end"]):
            diff = s["cents"] - c["amount"]
            events.append(_ev(s["any"], "sales", "value_mismatch", "error",
                              f"Valor diferente: venda {s['label']} {_eur(s['cents'])} vs cobrança Cashlogy {_eur(c['amount'])}",
                              f"diferença {'+' if diff > 0 else '−'}{_eur(abs(diff))} · possível divergência (pagamento {s['code']}, "
                              f"cobrança das {c['start'].strftime('%H:%M:%S')})"))
    for i in left_s:
        s = live[i]
        if inside(s["any"]):
            events.append(_ev(s["any"], "sales", "sale_without_charge", "warning",
                              f"Venda {s['label']} {_eur(s['cents'])} sem cobrança Cashlogy correspondente",
                              f"pagamento {s['code']} (código que noutras vendas coincide com o Cashlogy) · possível divergência"))
    for j in left_c:
        c = done[j]
        if inside(c["end"]):
            events.append(_ev(c["end"], "sales", "charge_without_sale", "warning",
                              f"Cobrança Cashlogy {_eur(c['amount'])} sem venda correspondente",
                              "nenhuma venda com o mesmo valor, ou com valor diferente em código de dinheiro, a menos de 3 min"))
    for s in sales:
        if s["cancelled"] and inside(s["any"]):
            events.append(_ev(s["any"], "sales", "cancelled", "warning", f"Documento anulado {s['label']} {_eur(s['cents'])}",
                              f"pagamento {s['code']}"))
    others = [s for k, s in enumerate(live) if k not in used_s and k not in {i for i, _ in diff_pairs}
              and s["code"] not in cash_codes and inside(s["any"])]
    for s in others:
        events.append(_ev(s["any"], "sales", "sale", "info", f"Venda {s['label']} {_eur(s['cents'])}", f"pagamento {s['code']}"))

    in_window = [s for s in sales if inside(s["any"])]
    return {
        "events": events,
        "summary": {"sales": len(in_window), "matched": sum(1 for i, _ in pairs if inside(live[i]["any"])),
                    "cash_codes": cash_codes,
                    "note": None if cash_codes else
                    "Nenhuma venda coincidiu com uma cobrança do Cashlogy (valor e hora), por isso não foi possível "
                    "identificar o código de pagamento que corresponde a dinheiro; não se assinalam divergências."},
    }
