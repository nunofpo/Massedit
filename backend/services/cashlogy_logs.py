"""
Análise de logs do Cashlogy (recicladora H500 / driver OPOS).

Ficheiros suportados (identificados pelo nome):
  - Transactions_Cashlogy.log       depósitos, dispensas, stock antes/depois, rejeições
  - Process_Times.log               tempos (ms) de cada fase de depósito/dispensa
  - Opos_ResultCodeExtended.log     avisos e erros do hardware (códigos 1313, 1751, ...)
  - Process_GestorAdminDev.log      fluxo de pagamento (H500_paga_START/END ok|warning)
  - VersionsHistory.log             ficha do equipamento e histórico de versões
  - Opos_Cashlogy.log               níveis cheio/vazio por denominação (ReadCashEmptyFullStatus)
  - LogTran_AAAAMMDD.txt            entradas/saídas de dinheiro do CashlogyConnector, por denominação
  - LogCom_AAAAMMDD.txt             comandos POS↔Connector (#C# cobrar, #G# backoffice) e respostas
  - LogUsr_AAAAMMDD.txt             ações do operador no POS (cobranças, backoffice, mensagens)

Todos os valores monetários são inteiros em cêntimos (denominação 200 = 2,00 €).
Os ficheiros são lidos em memória; não há acesso à base de dados.
"""
import bisect
import re
import statistics
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterator, List, Optional, Tuple

MAX_TRANSACTIONS = 3000
MAX_EVENTS = 500
MAX_PAYMENT_WARNINGS = 200

_MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1)}

# "Mon Sep 15 13:43:53 2025" com milissegundos opcionais ("...13:43:53.667 2025")
_TS = r"[A-Z][a-z]{2} ([A-Z][a-z]{2}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))? (\d{4})"
_TS_LINE = re.compile(r"^\s*" + _TS + r"\s*$")
_SEP_LINE = re.compile(r"^\s*\+{10,}\s*$")

SUPPORTED_KINDS = {
    "transactions": "Transactions_Cashlogy",
    "times": "Process_Times",
    "errors": "Opos_ResultCodeExtended",
    "payments": "Process_GestorAdminDev",
    "versions": "VersionsHistory",
    "opos": "Opos_Cashlogy",
    "tran": "LogTran",
    "com": "LogCom",
    "usr": "LogUsr",
}

_UNSUPPORTED_HINTS = {
    "logiot": "Telemetria IoT em JSON — ainda não suportado",
    "cashlogyedge": "Telemetria IoT (agente Edge) — ainda não suportado",
    "protocoloctalk": "Traço binário do protocolo ccTalk — ainda não suportado",
    "sensores": "Séries de sensores sem cabeçalhos de coluna — ainda não suportado",
    "admissiondata": "Dados de admissão sem cabeçalhos de coluna — ainda não suportado",
    "opos_status": "Estado OPOS (quase só 'Information not changed') — ainda não suportado",
}


# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------

def _dt_from_groups(g: Tuple[str, ...]) -> Optional[datetime]:
    mon, day, hh, mm, ss, ms, year = g
    month = _MONTHS.get(mon)
    if month is None:
        return None
    try:
        return datetime(int(year), month, int(day), int(hh), int(mm), int(ss),
                        int(ms.ljust(3, "0")) * 1000 if ms else 0)
    except ValueError:
        return None


def _fmt(dt: Optional[datetime]) -> Optional[str]:
    return dt.strftime("%Y-%m-%d %H:%M:%S") if dt else None


def decode_log(data: bytes) -> str:
    """UTF-8 (com/sem BOM) e, em alternativa, Windows-1252 — os logs misturam ambos."""
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace")


def detect_kind(filename: str) -> Optional[str]:
    name = (filename or "").lower()
    if "transactions_cashlogy" in name:
        return "transactions"
    if "process_times" in name:
        return "times"
    if "resultcodeextended" in name:
        return "errors"
    if "gestoradmindev" in name:
        return "payments"
    if "versionshistory" in name:
        return "versions"
    if "opos_cashlogy" in name:
        return "opos"
    if "logtran" in name:
        return "tran"
    if "logcom" in name:
        return "com"
    if "logusr" in name:
        return "usr"
    return None


def _unsupported_reason(filename: str) -> str:
    name = (filename or "").lower()
    for key, reason in _UNSUPPORTED_HINTS.items():
        if key in name:
            return reason
    return "Tipo de log não reconhecido"


def _parse_counts(raw: Optional[str]) -> Dict[int, int]:
    """'1:184,2:139;500:4' -> {1: 184, 2: 139, 500: 4}"""
    out: Dict[int, int] = {}
    if not raw:
        return out
    for part in re.split(r"[,;]", raw):
        if ":" not in part:
            continue
        k, v = part.split(":", 1)
        try:
            out[int(k.strip())] = int(v.strip())
        except ValueError:
            continue
    return out


def _counts_value(counts: Dict[int, int]) -> int:
    return sum(d * q for d, q in counts.items())


def denom_label(value: Any) -> str:
    """200 -> '2 €'; 50 -> '50 c' (denominações em cêntimos)."""
    n = int(value)
    return f"{n / 100:g} €" if n >= 100 else f"{n} c"


def _eur(cents: int) -> str:
    """1010 -> '10,10 €'"""
    return f"{cents / 100:.2f}".replace(".", ",") + " €"


def _counts_text(counts: Dict[Any, int]) -> str:
    """{'10': 1, '1000': 1} ou {10: 1, 1000: 1} -> '1 × 0,10 € · 1 × 10,00 €'"""
    return " · ".join(f"{q} × {_eur(int(d))}" for d, q in sorted(counts.items(), key=lambda kv: int(kv[0])) if q)


def _fmt_ms(dt: datetime) -> str:
    base = dt.strftime("%Y-%m-%d %H:%M:%S")
    return base + (f".{dt.microsecond // 1000:03d}" if dt.microsecond else "")


def _ev(dt: datetime, source: str, kind: str, severity: str, title: str, detail: str = "") -> Dict[str, Any]:
    """Evento da linha do tempo (severity: error | warning | info | ok)."""
    return {"dt": dt, "source": source, "kind": kind, "severity": severity, "title": title, "detail": detail}


def _nonzero(counts: Dict[int, int]) -> Dict[str, int]:
    return {str(d): q for d, q in sorted(counts.items()) if q}


def _stats(values: List[int]) -> Dict[str, Any]:
    if not values:
        return {"count": 0, "avg": None, "median": None, "p95": None, "min": None, "max": None}
    s = sorted(values)
    return {
        "count": len(s),
        "avg": round(sum(s) / len(s)),
        "median": round(statistics.median(s)),
        "p95": s[min(len(s) - 1, int(len(s) * 0.95))],
        "min": s[0],
        "max": s[-1],
    }


def _blocks(lines: List[str]) -> Iterator[List[str]]:
    """Divide o texto em blocos delimitados por linhas '++++++'."""
    cur: List[str] = []
    for ln in lines:
        if _SEP_LINE.match(ln):
            if cur:
                yield cur
            cur = []
        else:
            cur.append(ln)
    if cur:
        yield cur


# ---------------------------------------------------------------------------
# Transactions_Cashlogy.log
# ---------------------------------------------------------------------------

_FIELD = re.compile(r"^\s+([A-Za-z]+)=\s*(.*?)\s*$")
_INIT = re.compile(r"^\s+Init (Deposit|Dispense)(?: (Change|Cash))?\s*$")
_END = re.compile(r"^\s+End (Deposit|Dispense)\s*(.*?)\s*$")
_SNAP_FIELDS = {"CashCountsStored", "CashCountsStoredStacker", "ItemsStates", "DevicesErrors", "EmptyFullStates"}
_DEVICE_FIELDS = {
    "IP": "ip", "MAC": "mac", "IDTeamViewer": "teamviewer", "WindowsVersion": "windows",
    "COMInfo": "com", "DispenseAlgorithm": "dispense_algorithm",
}
_REJECTED = re.compile(r"COINS:(\d+);BILLS:(\d+)(?:\(([^)]*)\))?")


def _total_counts(snap: Dict[str, str]) -> Optional[Dict[int, int]]:
    """Stock total por denominação (recicladora + stacker)."""
    if "CashCountsStored" not in snap:
        return None
    total = Counter(_parse_counts(snap["CashCountsStored"]))
    total.update(_parse_counts(snap.get("CashCountsStoredStacker")))
    return dict(total)


def _diff_counts(a: Dict[int, int], b: Dict[int, int]) -> Dict[int, int]:
    """a - b, só denominações com diferença."""
    out = {}
    for d in set(a) | set(b):
        delta = a.get(d, 0) - b.get(d, 0)
        if delta:
            out[d] = delta
    return out


def _parse_rejected(raw: Optional[str]) -> Dict[str, Any]:
    m = _REJECTED.search(raw or "")
    if not m:
        return {"coins": 0, "bills": 0, "detail": {}}
    detail = {}
    for part in (m.group(3) or "").split(","):
        if "-" in part:
            k, v = part.split("-", 1)
            if v.strip().isdigit() and int(v):
                detail[k.strip()] = int(v)
    return {"coins": int(m.group(1)), "bills": int(m.group(2)), "detail": detail}


_REJECT_ORDER = ["DB", "FU", "IN", "MI", "OT"]


def _rejections_by_day(ops: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Notas rejeitadas por dia e por código (DB/FU/IN/MI/OT), com os dias sem rejeições a zero.

    O eixo cobre do primeiro ao último dia com operações, para o gráfico mostrar
    também os dias limpos. O total é o nº de notas (BILLS), não a soma dos códigos.
    """
    per_day: Dict[date, Dict[str, Any]] = {}
    days: List[date] = []
    seen_codes = set()
    for o in ops:
        if not o["ts"]:
            continue
        day = datetime.strptime(o["ts"][:10], "%Y-%m-%d").date()
        days.append(day)
        rej = o["rejected"]
        if not (rej["bills"] or rej["detail"]):
            continue
        row = per_day.setdefault(day, {"total": 0, "codes": Counter()})
        row["total"] += rej["bills"]
        row["codes"].update(rej["detail"])
        seen_codes.update(rej["detail"])
    if not per_day:
        return {"codes": [], "by_day": []}

    codes = [c for c in _REJECT_ORDER if c in seen_codes] + sorted(seen_codes - set(_REJECT_ORDER))
    by_day = []
    for i in range((max(days) - min(days)).days + 1):
        day = min(days) + timedelta(days=i)
        row = per_day.get(day)
        by_day.append({
            "day": day.isoformat(),
            "total": row["total"] if row else 0,
            "codes": {c: row["codes"].get(c, 0) if row else 0 for c in codes},
        })
    return {"codes": codes, "by_day": by_day}


def _bad_devices(snap: Dict[str, str]) -> List[str]:
    return [p.strip() for p in snap.get("DevicesErrors", "").split(";")
            if p.strip() and not p.strip().endswith(":OK")]


def _bad_levels(snap: Dict[str, str]) -> List[str]:
    return [p.strip() for p in re.split(r"[,;]", snap.get("EmptyFullStates", ""))
            if p.strip() and not p.strip().endswith(":OK")]


def _finish_op(op: Dict[str, Any], before: Dict[str, str], after: Dict[str, str],
               start: Optional[datetime], end: Optional[datetime]) -> Dict[str, Any]:
    f = op["fields"]
    is_deposit = op["type"] == "Deposit"
    if is_deposit:
        counts = _parse_counts(f.get("DepositCounts"))
        amount = int(f.get("DepositAmount") or 0)
        requested = None
    else:
        counts = _parse_counts(f.get("DispensedCounts") or f.get("DispenseCounts"))
        amount = int(f.get("DispensedAmount") or 0)
        requested = int(f.get("DispenseAmount") or f.get("CalculatedDispenseAmount") or 0)

    issues: List[str] = []
    if op["result"] is None:
        issues.append("Operação sem 'End' (log truncado ou interrompida)")
    elif op["result"].upper() != "OK":
        issues.append(f"Resultado: {op['result']}")
    if _counts_value(counts) != amount:
        issues.append("Soma das denominações não coincide com o valor da operação")
    if requested is not None and op["result"] is not None and amount < requested:
        issues.append(f"Dispensa parcial: pedido {requested / 100:.2f} €, entregue {amount / 100:.2f} €")

    # reconciliação: (stock depois − stock antes) deve ser +depósito ou −dispensa
    reconciliation: Dict[str, Any] = {"status": "unknown", "diff": {}}
    total_before, total_after = _total_counts(before), _total_counts(after)
    if total_before is not None and total_after is not None and op["result"] is not None:
        sign = 1 if is_deposit else -1
        expected = {d: sign * q for d, q in counts.items()}
        diff = _diff_counts(_diff_counts(total_after, total_before), expected)
        reconciliation = {"status": "mismatch" if diff else "ok",
                          "diff": {str(d): v for d, v in sorted(diff.items())}}
        if diff:
            issues.append("Stock não reconcilia com o movimento registado")

    rej = _parse_rejected(f.get("Rejected"))
    return {
        "ts": _fmt(start),
        "end_ts": _fmt(end),
        "type": "deposit" if is_deposit else "dispense",
        "subtype": (op["subtype"] or "").lower() or None,
        "amount": amount,
        "requested": requested,
        "counts": _nonzero(counts),
        "result": op["result"],
        "rejected": rej,
        "device_errors": _bad_devices(after or before),
        "levels": _bad_levels(after or before),
        "reconciliation": reconciliation,
        "issues": issues,
    }


def parse_transactions(text: str) -> Dict[str, Any]:
    ops: List[Dict[str, Any]] = []
    external: List[Dict[str, Any]] = []
    device: Dict[str, str] = {}
    latest: Optional[Tuple[Optional[datetime], Dict[str, str]]] = None
    prev_total: Optional[Dict[int, int]] = None
    prev_ts: Optional[datetime] = None
    timestamps: List[datetime] = []
    op_starts: List[Optional[datetime]] = []
    events: List[Dict[str, Any]] = []

    for block in _blocks(text.splitlines()):
        stamps: List[datetime] = []
        before: Dict[str, str] = {}
        after: Dict[str, str] = {}
        op: Optional[Dict[str, Any]] = None
        block_ops: List[Tuple[Dict[str, Any], Dict[str, str], Dict[str, str]]] = []

        for ln in block:
            m = _TS_LINE.match(ln)
            if m:
                dt = _dt_from_groups(m.groups())
                if dt:
                    stamps.append(dt)
                continue
            m = _INIT.match(ln)
            if m:
                if op is not None:
                    block_ops.append((op, before, after))
                    before, after = (after or before), {}
                op = {"type": m.group(1), "subtype": m.group(2), "fields": {}, "result": None}
                continue
            m = _END.match(ln)
            if m and op is not None:
                op["result"] = m.group(2) or "OK"
                continue
            m = _FIELD.match(ln)
            if not m:
                continue
            name, value = m.group(1), m.group(2)
            if name in _SNAP_FIELDS:
                (before if op is None else after)[name] = value
            elif name in _DEVICE_FIELDS:
                device[_DEVICE_FIELDS[name]] = value
            elif op is not None:
                op["fields"][name] = value
        if op is not None:
            block_ops.append((op, before, after))

        start, end = (stamps[0], stamps[-1]) if stamps else (None, None)
        timestamps.extend(stamps)

        first_before = block_ops[0][1] if block_ops else before
        cur_before = _total_counts(first_before)
        if cur_before is not None and prev_total is not None:
            delta = _diff_counts(cur_before, prev_total)
            if delta:
                external.append({"from": _fmt(prev_ts), "to": _fmt(start),
                                 "delta": {str(d): v for d, v in sorted(delta.items())}})
                if start:
                    events.append(_ev(start, "transactions", "external_change", "warning",
                                      "Stock alterado fora de transações",
                                      " · ".join(f"{_eur(d)}: {v:+d}" for d, v in sorted(delta.items()))))

        for o, b, a in block_ops:
            ops.append(_finish_op(o, b, a, start, end))
            op_starts.append(start)
        last_snap = (block_ops[-1][2] or block_ops[-1][1]) if block_ops else before
        if _total_counts(last_snap) is not None:
            prev_total, prev_ts = _total_counts(last_snap), end or start
            latest = (end or start, last_snap)

    stock = None
    if latest:
        snap = latest[1]
        stored = _parse_counts(snap.get("CashCountsStored"))
        stacker = _parse_counts(snap.get("CashCountsStoredStacker"))
        states = {}
        for part in re.split(r"[,;]", snap.get("EmptyFullStates", "")):
            if ":" in part:
                k, v = part.split(":", 1)
                states[k.strip()] = v.strip()
        stock = {
            "ts": _fmt(latest[0]),
            "denominations": [
                {"value": d, "stored": stored.get(d, 0), "stacker": stacker.get(d, 0),
                 "state": states.get(str(d), "")}
                for d in sorted(set(stored) | set(stacker))
            ],
            "stacker_state": states.get("STACKER", ""),
            "devices_with_error": _bad_devices(snap),
        }

    deposits = [o for o in ops if o["type"] == "deposit"]
    dispenses = [o for o in ops if o["type"] == "dispense"]
    summary = {
        "deposits": len(deposits),
        "dispenses": len(dispenses),
        "deposit_total": sum(o["amount"] for o in deposits),
        "dispense_total": sum(o["amount"] for o in dispenses),
        "rejected_coins": sum(o["rejected"]["coins"] for o in ops),
        "rejected_bills": sum(o["rejected"]["bills"] for o in ops),
        "with_issues": sum(1 for o in ops if o["issues"]),
        "reconciled": sum(1 for o in ops if o["reconciliation"]["status"] == "ok"),
        "mismatches": sum(1 for o in ops if o["reconciliation"]["status"] == "mismatch"),
        "external_stock_changes": len(external),
    }
    for dt, o in zip(op_starts, ops):
        if dt is None:
            continue
        kind_label = {"change": " (troco)", "cash": " (dinheiro)"}.get(o["subtype"] or "", "")
        title = ("Depósito " if o["type"] == "deposit" else "Dispensa" + kind_label + " ") + _eur(o["amount"])
        if o["requested"] is not None and o["requested"] != o["amount"]:
            title += f" (pedido {_eur(o['requested'])})"
        rej = o["rejected"]
        parts = [_counts_text(o["counts"])]
        if o["end_ts"] and o["end_ts"] != o["ts"]:
            parts.append(f"fim {o['end_ts'][11:]}")
        if o["result"] != "OK":
            parts.append(f"resultado: {o['result'] or 'sem fim'}")
        parts += o["issues"]
        if rej["bills"] or rej["coins"]:
            codes = ",".join(f"{k}-{v}" for k, v in rej["detail"].items())
            parts.append(f"rejeitadas: {rej['bills']} nota(s), {rej['coins']} moeda(s)" + (f" ({codes})" if codes else ""))
        if o["device_errors"]:
            parts.append("dispositivos em erro: " + ", ".join(o["device_errors"]))
        severity = "error" if o["issues"] or o["result"] != "OK" else "warning" if (rej["bills"] or rej["coins"] or o["device_errors"]) else "info"
        events.append(_ev(dt, "transactions", o["type"], severity, title, " · ".join(p for p in parts if p)))

    truncated = len(ops) > MAX_TRANSACTIONS
    return {
        "_events": events,
        "_ops_full": list(zip(op_starts, ops)),
        "summary": summary,
        "transactions": ops[-MAX_TRANSACTIONS:],
        "transactions_truncated": truncated,
        "external_changes": external[-MAX_EVENTS:],
        "rejections": _rejections_by_day(ops),
        "stock": stock,
        "device": device,
        "_timestamps": timestamps,
    }


# ---------------------------------------------------------------------------
# Process_Times.log
# ---------------------------------------------------------------------------

_T_INIT = re.compile(r"^\s*Init(Deposit|Dispense)\s+\++\s+" + _TS)
_T_TOTAL = re.compile(r"^\s*Total(Deposit|Dispense):\s+(\d+)")
_T_PHASE = re.compile(r"^\s*(t\d+[a-z]?):\s+(\d+)\s+")


def parse_times(text: str) -> Dict[str, Any]:
    ops: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, Any]] = None
    incomplete = 0
    timestamps: List[datetime] = []

    for ln in text.splitlines():
        m = _T_INIT.match(ln)
        if m:
            if cur is not None:
                incomplete += 1
            dt = _dt_from_groups(m.groups()[1:])
            if dt:
                timestamps.append(dt)
            cur = {"type": m.group(1).lower(), "ts": _fmt(dt), "phases": {}, "_dt": dt}
            continue
        if cur is None:
            continue
        m = _T_PHASE.match(ln)
        if m:
            cur["phases"][m.group(1)] = cur["phases"].get(m.group(1), 0) + int(m.group(2))
            continue
        m = _T_TOTAL.match(ln)
        if m and m.group(1).lower() == cur["type"]:
            cur["total_ms"] = int(m.group(2))
            ops.append(cur)
            cur = None
    if cur is not None:
        incomplete += 1

    events = []
    for o in ops:
        if o["_dt"] is None:
            continue
        top = sorted(o["phases"].items(), key=lambda kv: kv[1], reverse=True)[:3]
        events.append(_ev(o["_dt"], "times", o["type"], "info",
                          f"{'Depósito' if o['type'] == 'deposit' else 'Dispensa'}: {o['total_ms'] / 1000:.1f} s no total",
                          "fases mais longas: " + ", ".join(f"{k} {v / 1000:.1f} s" for k, v in top) if top else ""))
    result: Dict[str, Any] = {"incomplete": incomplete, "_timestamps": timestamps, "_events": events}
    for kind in ("deposit", "dispense"):
        rows = [o for o in ops if o["type"] == kind]
        totals = [o["total_ms"] for o in rows]
        st = _stats(totals)
        threshold = st["median"] * 3 if st["median"] else None
        slowest = sorted(rows, key=lambda o: o["total_ms"], reverse=True)[:10]
        result[kind] = {
            **st,
            "slow_count": sum(1 for t in totals if threshold and t > threshold),
            "slow_threshold": threshold,
            "slowest": [{"ts": o["ts"], "total_ms": o["total_ms"], "phases": o["phases"]} for o in slowest],
        }
    return result


# ---------------------------------------------------------------------------
# Opos_ResultCodeExtended.log
# ---------------------------------------------------------------------------

_E_HEAD = re.compile(r"^\s+Error:\s+(\d+)\s+\(\s*(\w+)\s*\)\s+" + _TS)
_E_KV = re.compile(r"^\s+(Info|SubCodigo|Producto|Items Adm\.|Items Dev\.|Descuadre):\s*(.*?)\s*$")
_E_KEYS = {"Info": "info", "SubCodigo": "subcode", "Producto": "product",
           "Items Adm.": "items_in", "Items Dev.": "items_out", "Descuadre": "mismatch"}
# o log usa 'ERRO' (pt) em algumas máquinas e 'ERROR' noutras
_E_LEVELS = {"ERRO": "ERROR"}


def parse_errors(text: str) -> Dict[str, Any]:
    events: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, Any]] = None
    timestamps: List[datetime] = []

    for ln in text.splitlines():
        m = _E_HEAD.match(ln)
        if m:
            dt = _dt_from_groups(m.groups()[2:])
            if dt:
                timestamps.append(dt)
            level = m.group(2).upper()
            cur = {"code": int(m.group(1)), "level": _E_LEVELS.get(level, level), "dt": dt,
                   "ts": _fmt(dt), "info": "", "subcode": "", "product": "",
                   "items_in": "", "items_out": "", "mismatch": ""}
            events.append(cur)
            continue
        if cur is None:
            continue
        m = _E_KV.match(ln)
        if m:
            cur[_E_KEYS[m.group(1)]] = m.group(2)

    # descrição por (código, nível), para os eventos cujo Info veio vazio
    info_by_key: Dict[Tuple[int, str], str] = {}
    for e in events:
        if e["info"]:
            info_by_key.setdefault((e["code"], e["level"]), e["info"])

    # Um evento é de "resolução" se o nível é OK ou a descrição começa por "Corrigido"
    # (ex.: 1315 vem em WARNING mas é 'Corrigido-MANUTENÇÃO: Limpeza').
    def is_clear(e: Dict[str, Any]) -> bool:
        return e["level"] == "OK" or (e["info"] or info_by_key.get((e["code"], e["level"]), "")).lower().startswith("corrigido")

    for e in events:
        e["clear"] = is_clear(e)

    # Episódios: aviso/erro -> resolução. O log não diz que aviso cada OK resolve. Nos logs
    # observados o código do OK é o do aviso (1751), +1 (1313/1314, 1187/1188) ou +2 (1130/1132,
    # 1131/1133), por isso um OK fecha o aviso aberto MAIS RECENTE entre N, N-1 e N-2. Um novo
    # aviso do mesmo código substitui o anterior ainda por resolver (não infla a duração).
    open_at: Dict[int, datetime] = {}
    durations: Dict[int, List[float]] = defaultdict(list)
    for e in events:
        if e["dt"] is None:
            continue
        if not e["clear"] and e["level"] in ("WARNING", "ERROR"):
            open_at[e["code"]] = e["dt"]
        elif e["clear"]:
            candidates = [k for k in (e["code"], e["code"] - 1, e["code"] - 2) if k in open_at]
            if candidates:
                key = max(candidates, key=lambda k: open_at[k])
                durations[key].append((e["dt"] - open_at.pop(key)).total_seconds())

    by_code: Dict[Tuple[int, str], Dict[str, Any]] = {}
    for e in events:
        key = (e["code"], e["level"])
        row = by_code.setdefault(key, {
            "code": e["code"], "level": e["level"],
            "info": info_by_key.get(key, ""), "count": 0, "first": e["ts"], "last": e["ts"],
        })
        row["count"] += 1
        row["last"] = e["ts"]

    episodes = []
    for code, secs in sorted(durations.items()):
        episodes.append({
            "code": code,
            "info": info_by_key.get((code, "WARNING")) or info_by_key.get((code, "ERROR"), ""),
            "count": len(secs),
            "total_s": round(sum(secs)),
            "median_s": round(statistics.median(secs), 1),
            "max_s": round(max(secs), 1),
        })

    per_day = Counter(e["ts"][:10] for e in events if e["ts"] and not e["clear"])
    mismatches = [{"ts": e["ts"], "code": e["code"], "value": int(e["mismatch"])}
                  for e in events if re.fullmatch(r"-?\d+", e["mismatch"] or "")]
    # Só faz sentido dizer "por resolver" para códigos que, neste log, chegam a ter resolução;
    # os avisos pontuais (ex.: 1110, 1168) nunca a têm.
    clear_codes = {e["code"] for e in events if e["clear"]}
    still_open = sorted(c for c in open_at if {c, c + 1, c + 2} & clear_codes)
    clean_events = [{k: (info_by_key.get((e["code"], e["level"]), "") if k == "info" and not v else v)
                     for k, v in e.items() if k != "dt"} for e in events[-MAX_EVENTS:]]

    timeline: List[Dict[str, Any]] = []
    for e in events:
        if e["dt"] is None:
            continue
        desc = e["info"] or info_by_key.get((e["code"], e["level"]), "")
        extras = [e["product"]]
        if e["items_in"] and not e["items_in"].startswith("0x0000"):
            extras.append(f"admitidos {e['items_in']}")
        if e["items_out"] and not e["items_out"].startswith("0x0000"):
            extras.append(f"devolvidos {e['items_out']}")
        if e["mismatch"]:
            extras.append(f"Descuadre {e['mismatch']}")
        severity = "ok" if e["clear"] else "error" if e["level"] == "ERROR" else "warning"
        timeline.append(_ev(e["dt"], "errors", "hardware", severity, f"{e['code']} {desc}".strip(),
                            " · ".join(x for x in extras if x)))

    return {
        "_events": timeline,
        "total_events": len(events),
        "by_code": sorted(by_code.values(), key=lambda r: r["count"], reverse=True),
        "episodes": sorted(episodes, key=lambda r: r["count"], reverse=True),
        "still_open": still_open,
        "accounting_mismatches": mismatches[-MAX_EVENTS:],
        "warnings_per_day": [{"day": d, "count": c} for d, c in sorted(per_day.items())],
        "events": clean_events,
        "events_truncated": len(events) > MAX_EVENTS,
        "_timestamps": timestamps,
    }


# ---------------------------------------------------------------------------
# Process_GestorAdminDev.log
# ---------------------------------------------------------------------------

_P_START = re.compile(r"^\s*H500_paga_START\s+" + _TS)
_P_END = re.compile(r"^\s*H500_paga_END\s*(\w*)\s+" + _TS)
_P_ORDER = re.compile(r"APagar=(\d+)")
_P_CTOR = re.compile(r"^\s*Constructor GestorAdminDev\s+" + _TS)
_P_ACCOUNTING = re.compile(r"^\s*Error Read Accounting:\s*(.*?)\s*$")


def parse_payments(text: str) -> Dict[str, Any]:
    payments: List[Dict[str, Any]] = []
    start: Optional[datetime] = None
    apagar: Optional[int] = None
    starts: List[str] = []
    accounting_errors = 0
    accounting_path = ""
    timestamps: List[datetime] = []
    events: List[Dict[str, Any]] = []

    for ln in text.splitlines():
        m = _P_ORDER.search(ln)
        if m:
            apagar = int(m.group(1))
            continue
        m = _P_START.match(ln)
        if m:
            start = _dt_from_groups(m.groups())
            continue
        m = _P_END.match(ln)
        if m:
            end = _dt_from_groups(m.groups()[1:])
            if start and end:
                timestamps.extend([start, end])
                payments.append({
                    "ts": _fmt(start),
                    "result": (m.group(1) or "ok").lower(),
                    "duration_ms": round((end - start).total_seconds() * 1000),
                    "apagar": apagar,
                })
                result = (m.group(1) or "ok").lower()
                events.append(_ev(start, "payments", "payment", "info" if result == "ok" else "warning",
                                  f"Pagamento H500: {result}",
                                  f"{round((end - start).total_seconds() * 1000)} ms" + (f" · APagar {apagar}" if apagar is not None else "")))
            start = None
            apagar = None
            continue
        m = _P_CTOR.match(ln)
        if m:
            ctor_dt = _dt_from_groups(m.groups())
            starts.append(_fmt(ctor_dt) or "")
            if ctor_dt:
                events.append(_ev(ctor_dt, "payments", "start", "info", "Gestor de pagamentos iniciado"))
            continue
        m = _P_ACCOUNTING.match(ln)
        if m:
            accounting_errors += 1
            accounting_path = re.sub(r"\s+" + _TS + r"\s*$", "", m.group(1))
            stamp = re.search(_TS, m.group(1))
            acc_dt = _dt_from_groups(stamp.groups()) if stamp else None
            if acc_dt:
                events.append(_ev(acc_dt, "payments", "accounting", "warning", "Erro a ler Accounting", accounting_path))

    by_result = Counter(p["result"] for p in payments)
    warnings = [p for p in payments if p["result"] != "ok"]
    return {
        "total": len(payments),
        "by_result": dict(by_result),
        "duration_ms": _stats([p["duration_ms"] for p in payments]),
        "warnings": warnings[-MAX_PAYMENT_WARNINGS:],
        "app_starts": len(starts),
        "accounting_read_errors": accounting_errors,
        "accounting_path": accounting_path,
        "_timestamps": timestamps,
        "_events": events,
    }


# ---------------------------------------------------------------------------
# VersionsHistory.log
# ---------------------------------------------------------------------------

_V_SECTION = re.compile(r"^ {5}(\w[\w ]*?)::", re.M)
_V_GENERAL = {
    "serial": r"S\.Number:\s+(\S+)",
    "manufactured": r"Date:\s+(\S+)",
    "mechanical_rev": r"Mechanical Rev\.:\s+(\S+)",
    "firmware": r"Firmware Rev\.:\s+(\S+)",
    "ip": r"IP:\s+(\S+)",
    "mac": r"MAC:\s+(\S+)",
    "teamviewer": r"ID TeamViewer:\s+(\S+)",
    "windows": r"Windows Ver\.:\s+([^;]+)",
}


def _split_change(section: str) -> Tuple[str, str]:
    """Nos blocos 'Changes' cada secção traz '(Previous)' e '(Change)'. Devolve (antes, agora)."""
    if "(Change)" in section:
        prev, cur = section.split("(Change)", 1)
        return prev, cur
    return "", section


def _first(pattern: str, text: str) -> Optional[str]:
    m = re.search(pattern, text)
    return m.group(1).strip() if m else None


def parse_versions(text: str) -> Dict[str, Any]:
    device: Dict[str, str] = {}
    history: List[Dict[str, Any]] = []
    timestamps: List[datetime] = []

    for block in _blocks(text.splitlines()):
        body = "\n".join(block)
        dt = None
        for ln in block:
            m = _TS_LINE.match(ln)
            if m:
                dt = _dt_from_groups(m.groups())
                break
        if dt is None or "Versions" not in body:
            continue
        timestamps.append(dt)

        heads = list(_V_SECTION.finditer(body))
        sections: Dict[str, str] = {}
        for i, h in enumerate(heads):
            end = heads[i + 1].start() if i + 1 < len(heads) else len(body)
            sections[h.group(1).strip()] = body[h.end():end]

        entry: Dict[str, Any] = {"ts": _fmt(dt), "kind": "Changes" if "Changes" in sections else "Initial",
                                 "sections": [s for s in sections if s not in ("Initial", "Changes")],
                                 "changes": []}

        _, general = _split_change(sections.get("GENERAL", ""))
        for key, pattern in _V_GENERAL.items():
            value = _first(pattern, general)
            if value:
                device[key] = value

        # (rótulo, secção, campo em device, regex do valor)
        for label, section, key, pattern in (
            ("DLL", "DLL", "dll_version", r"Version:\s+([\d.]+)"),
            ("Firmware H500", "H500", "h500_firmware", r"Frw\.Version:\s+([^\r\n;]+)"),
        ):
            if section not in sections:
                continue
            prev, cur = _split_change(sections[section])
            new_value, old_value = _first(pattern, cur), _first(pattern, prev)
            if new_value:
                device[key] = new_value
                entry[key] = new_value
                if old_value and old_value != new_value:
                    entry["changes"].append({"label": label, "from": old_value, "to": new_value})
        name = _first(r"Name:\s+(\S+)", _split_change(sections.get("DLL", ""))[1])
        if name:
            device["dll_name"] = name
        history.append(entry)

    return {"device": device, "history": history, "_timestamps": timestamps}


# ---------------------------------------------------------------------------
# Opos_Cashlogy.log
# ---------------------------------------------------------------------------

# Códigos de nível do Cashlogy (manual do CashlogyConnector, comando #GC#).
# 0, 12, 21 e 22 foram confirmados contra o EmptyFullStates do Transactions_Cashlogy.log
# (1296 comparações, 100 % de coincidência); o 11 (EMPTY) vem só do manual.
_LEVEL_CODES = {0: "OK", 11: "EMPTY", 12: "NEAR_EMPTY", 21: "FULL", 22: "NEAR_FULL"}
_LEVEL_LINE = re.compile(r"ReadCashEmptyFullStatus\s*<([^>]*)>")
MAX_TRANSITIONS = 300


def parse_opos(text: str) -> Dict[str, Any]:
    """Níveis por denominação a partir de ReadCashEmptyFullStatus.

    O OPOS só lê o nível quando há operações, por isso o log não permite medir
    durações exatas: devolve-se o estado em cada leitura e as transições entre leituras.
    """
    lines = text.splitlines()
    reads: List[Tuple[datetime, Dict[str, str]]] = []
    for i, ln in enumerate(lines):
        if "ReadCashEmptyFullStatus" not in ln or i + 1 >= len(lines):
            continue
        m = _LEVEL_LINE.search(ln)
        stamp = _TS_LINE.match(lines[i + 1])
        dt = _dt_from_groups(stamp.groups()) if stamp else None
        if not m or dt is None:
            continue
        states: Dict[str, str] = {}
        for part in re.split(r"[,;]", m.group(1)):
            key, _, value = part.partition(":")
            key, value = key.strip(), value.strip()
            if key and value.lstrip("-").isdigit():
                states[key] = _LEVEL_CODES.get(int(value), f"CÓDIGO_{value}")
        if states:
            reads.append((dt, states))

    keys: List[str] = []
    for _, states in reads:
        for k in states:
            if k not in keys:
                keys.append(k)
    keys.sort(key=lambda k: (k == "STACKER", int(k) if k.isdigit() else 0))

    transitions: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []
    rows: List[Dict[str, Any]] = []
    for key in keys:
        seq = [(dt, s[key]) for dt, s in reads if key in s]
        counts = Counter(state for _, state in seq)
        changes = 0
        label = "Stacker" if key == "STACKER" else denom_label(key)
        for (_, before), (dt, after) in zip(seq, seq[1:]):
            if before != after:
                changes += 1
                transitions.append({"ts": _fmt(dt), "key": key, "from": before, "to": after})
                events.append(_ev(dt, "opos", "level", "ok" if after == "OK" else "warning",
                                  f"Nível {label}: {before} → {after}", "detetado entre duas leituras do OPOS"))
        rows.append({
            "key": key,
            "current": seq[-1][1],
            "reads": len(seq),
            "counts": dict(counts),
            "changes": changes,
        })

    transitions.sort(key=lambda t: t["ts"])
    return {
        "reads": len(reads),
        "first": _fmt(reads[0][0]) if reads else None,
        "last": _fmt(reads[-1][0]) if reads else None,
        "levels": rows,
        "transitions": transitions[-MAX_TRANSITIONS:],
        "transitions_truncated": len(transitions) > MAX_TRANSITIONS,
        "_timestamps": [dt for dt, _ in reads],
        "_events": events,
        "_reads": reads,
    }


# ---------------------------------------------------------------------------
# LogTran_*.txt e LogCom_*.txt (CashlogyConnector)
# ---------------------------------------------------------------------------

# Linhas '"dd/mm/aaaa hh:mm:ss.mmm,payload"', em cp1252, com vírgula decimal.
_CONN_LINE = re.compile(r'^"(\d{2})/(\d{2})/(\d{4}) (\d{2}):(\d{2}):(\d{2})\.(\d{3}),(.*)"\s*$')
_TRAN_ITEMS = re.compile(r"(\d+) of (\d+),(\d{2})")
_TRAN_MOVE = re.compile(r"^(IN|OUT):\s*(.*)$")
_TRAN_BACKOFFICE = re.compile(r"^BACKOFFICE - (.+?) - (IN|OUT):\s*(\d+),(\d{2})")
# Respostas do Connector: primeiro campo é o código de erro (manual, secção 6.2): 0, WR:xxx ou ER:xxx.
_COM_RESPONSE = re.compile(r"^#(0|WR:[A-Z_]+|ER:[A-Z_]+)#(.*)$")
_COM_REQUEST = re.compile(r"^#([A-Z0-9?]+)#(.*)$")
_COM_STARTED = re.compile(r"Connector\.Started\(\).*\(v([\d.]+)\)")


def _conn_lines(text: str) -> Iterator[Tuple[datetime, str]]:
    for ln in text.splitlines():
        m = _CONN_LINE.match(ln)
        if not m:
            continue
        dd, mo, yyyy, hh, mi, ss, ms, payload = m.groups()
        try:
            yield datetime(int(yyyy), int(mo), int(dd), int(hh), int(mi), int(ss), int(ms) * 1000), payload
        except ValueError:
            continue


def parse_tran(text: str) -> Dict[str, Any]:
    """Entradas (IN) e saídas (OUT) de dinheiro por denominação; valores em cêntimos.

    As linhas 'BACKOFFICE - ... - IN/OUT: x,xx €' resumem as linhas IN/OUT anteriores,
    por isso não entram nos totais (senão contavam a dobrar).
    """
    moves: List[Dict[str, Any]] = []
    backoffice: List[Dict[str, Any]] = []
    stamps: List[datetime] = []
    events: List[Dict[str, Any]] = []
    for dt, payload in _conn_lines(text):
        stamps.append(dt)
        m = _TRAN_BACKOFFICE.match(payload)
        if m:
            amount = int(m.group(3)) * 100 + int(m.group(4))
            backoffice.append({"ts": _fmt(dt), "action": m.group(1), "dir": m.group(2).lower(), "amount": amount})
            events.append(_ev(dt, "tran", "backoffice", "info",
                              f"Backoffice: {m.group(1)} ({'entrada' if m.group(2) == 'IN' else 'saída'}) {_eur(amount)}"))
            continue
        m = _TRAN_MOVE.match(payload)
        if not m:
            continue
        counts: Counter = Counter()
        for qty, euros, cents in _TRAN_ITEMS.findall(m.group(2)):
            counts[int(euros) * 100 + int(cents)] += int(qty)
        moves.append({"dt": dt, "ts": _fmt(dt), "dir": m.group(1).lower(), "_c": dict(counts),
                      "amount": _counts_value(dict(counts)), "counts": _nonzero(dict(counts))})
        events.append(_ev(dt, "tran", m.group(1).lower(), "info",
                          f"{'Entrada' if m.group(1) == 'IN' else 'Saída'} {_eur(moves[-1]['amount'])}",
                          _counts_text(dict(counts))))

    ins = [x for x in moves if x["dir"] == "in"]
    outs = [x for x in moves if x["dir"] == "out"]
    return {
        "summary": {
            "ins": len(ins), "outs": len(outs),
            "in_total": sum(x["amount"] for x in ins), "out_total": sum(x["amount"] for x in outs),
            "backoffice": len(backoffice),
        },
        "movements": [{k: v for k, v in x.items() if k not in ("dt", "_c")} for x in moves[-MAX_TRANSACTIONS:]],
        "movements_truncated": len(moves) > MAX_TRANSACTIONS,
        "backoffice": backoffice[-MAX_EVENTS:],
        "_moves": [(x["dt"], x["dir"], x["amount"]) for x in moves],
        "_moves_counts": [(x["dt"], x["dir"], x["_c"]) for x in moves],
        "_timestamps": stamps,
        "_events": events,
    }


def _ints(raw: str) -> List[int]:
    raw = raw.strip("#")
    if not raw:
        return []
    return [int(p) if re.fullmatch(r"-?\d+", p.strip()) else 0 for p in raw.split("#")]


def _finish_com(rows: List[Dict[str, Any]], errors: List[Dict[str, Any]], events: List[Dict[str, Any]],
                req: Dict[str, Any], end: datetime, code: str, rest: str) -> None:
    f = _ints(rest)

    def field(i: int) -> int:
        return f[i] if i < len(f) else 0

    cmd = req["cmd"]
    base = {"ts": _fmt(req["dt"]), "cmd": cmd, "result": code,
            "duration_ms": round((end - req["dt"]).total_seconds() * 1000),
            "_start": req["dt"], "_end": end}
    if code.startswith("ER:"):
        errors.append({"ts": base["ts"], "cmd": cmd, "code": code})
        events.append(_ev(req["dt"], "com", "error", "error", f"Connector respondeu {code} ao comando #{cmd}#"))
    if cmd == "C":  # cobrar: #C#op#caixa#valor#... -> #cód#automático#devolvido#manual#adicionado#
        amount = req["args"][2] if len(req["args"]) > 2 else 0
        introduced = field(0) + field(2)
        returned = field(1)
        net = introduced - returned
        cancelled = code == "WR:CANCEL"
        rows.append({**base, "kind": "charge", "amount": amount, "introduced": introduced,
                     "returned": returned, "net": net, "cancelled": cancelled,
                     "ok": cancelled or (not code.startswith("ER:") and net == amount)})
    elif cmd == "G":  # backoffice: #cód#antes#depois#inserido#devolvido#não pago#consolidado#
        rows.append({**base, "kind": "backoffice", "before": field(0), "after": field(1),
                     "introduced": field(2), "returned": field(3)})
    elif cmd == "A":  # adicionar troco: #cód#valor inserido#
        rows.append({**base, "kind": "backoffice", "before": None, "after": None,
                     "introduced": field(0), "returned": 0})


def parse_com(text: str) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    starts: List[Dict[str, str]] = []
    commands: Counter = Counter()
    connections = delayed = orphans = 0
    pending: Optional[Dict[str, Any]] = None
    stamps: List[datetime] = []
    events: List[Dict[str, Any]] = []

    for dt, payload in _conn_lines(text):
        stamps.append(dt)
        payload = payload.strip()
        if payload.startswith(";"):
            if "ConnectionRequest" in payload:
                connections += 1
            elif "Response delayed" in payload:
                delayed += 1
                events.append(_ev(dt, "com", "delayed", "warning", "Resposta atrasada do Winsock"))
            else:
                m = _COM_STARTED.search(payload)
                if m:
                    starts.append({"ts": _fmt(dt), "version": m.group(1)})
                    events.append(_ev(dt, "com", "start", "warning", f"Connector arrancou (v{m.group(1)})"))
            continue
        m = _COM_RESPONSE.match(payload)
        if m:
            if pending is None:
                orphans += 1
            else:
                _finish_com(rows, errors, events, pending, dt, m.group(1), m.group(2))
                pending = None
            continue
        m = _COM_REQUEST.match(payload)
        if m:
            commands[m.group(1)] += 1
            pending = {"cmd": m.group(1), "args": _ints(m.group(2)), "dt": dt}

    charges = [r for r in rows if r["kind"] == "charge"]
    return {
        "summary": {
            "connections": connections, "commands": dict(commands),
            "charges": len(charges), "cancelled": sum(1 for r in charges if r["cancelled"]),
            "not_matching": sum(1 for r in charges if not r["ok"]),
            "level_warnings": sum(1 for r in charges if r["result"] == "WR:LEVEL"),
            "delayed_responses": delayed, "orphan_responses": orphans,
        },
        "duration_ms": _stats([r["duration_ms"] for r in charges if not r["cancelled"]]),
        "operations": rows,
        "errors": errors[-MAX_EVENTS:],
        "starts": starts,
        "_timestamps": stamps,
        "_events": events,
    }


def _crosscheck_com_tran(rows: List[Dict[str, Any]], moves: List[Tuple[datetime, str, int]]) -> Dict[str, Any]:
    """Compara, por operação do LogCom, o que o Connector respondeu (introduzido/devolvido)
    com os movimentos físicos do LogTran na mesma janela de tempo."""
    moves = sorted(moves, key=lambda m: m[0])
    times = [m[0] for m in moves]
    first = times[0] if times else None
    last = times[-1] if times else None
    checked = matched = 0
    mismatches: List[Dict[str, Any]] = []
    for r in rows:
        r["tran_match"] = None
        if first is None or r["_start"] < first - timedelta(minutes=5) or r["_start"] > last + timedelta(minutes=5):
            continue  # fora do período coberto pelo LogTran
        i = bisect.bisect_left(times, r["_start"] - timedelta(milliseconds=500))
        j = bisect.bisect_right(times, r["_end"] + timedelta(seconds=1))
        r["tran_in"] = sum(a for _, d, a in moves[i:j] if d == "in")
        r["tran_out"] = sum(a for _, d, a in moves[i:j] if d == "out")
        r["tran_match"] = r["tran_in"] == r["introduced"] and r["tran_out"] == r["returned"]
        checked += 1
        matched += r["tran_match"]
        if not r["tran_match"]:
            mismatches.append({"ts": r["ts"], "cmd": r["cmd"], "introduced": r["introduced"], "returned": r["returned"],
                               "tran_in": r["tran_in"], "tran_out": r["tran_out"]})
    return {"checked": checked, "matched": matched, "mismatches": mismatches[-MAX_EVENTS:]}


# ---------------------------------------------------------------------------
# LogUsr_*.txt (ações do operador no POS)
# ---------------------------------------------------------------------------

_USR_ITEMS = re.compile(r"Items=([0-9:,;]*)")
_USR_STACKER = re.compile(r"ToStacker=(\d)")
# Eventos sem argumentos que interessam ao operador; os restantes (_Load/_Unload de sub-ecrãs,
# CloseForm, cmdExit_Click, frmCharge2...) são ruído de ecrãs e ficam de fora.
_USR_ACTIONS = {
    "frmCharge._Load": ("charge", "Cobrança (ecrã aberto)"),
    "frmCharge.cmdCancel_Click": ("charge_cancel", "Cobrança cancelada pelo operador"),
    "frmBackOffice._Load": ("backoffice", "Backoffice aberto"),
    "frmAddChange_Load": ("add_change", "Adicionar troco"),
    "frmGiveChange._Load": ("give_change", "Dar troco"),
    "frmGiveChange.cmdAcceptDeposit_Click": ("give_deposit", "Troco: depósito aceite"),
    "frmGiveChange.cmdCancelDeposit_Click": ("give_cancel", "Troco: depósito cancelado"),
    "frmWithdrawCash._Load": ("withdraw", "Retirar dinheiro"),
}
_USR_WITHDRAW_WINDOW = timedelta(seconds=20)


def parse_usr(text: str) -> Dict[str, Any]:
    actions: List[Dict[str, Any]] = []
    stamps: List[datetime] = []
    for dt, payload in _conn_lines(text):
        payload = payload.strip()
        stamps.append(dt)
        row: Dict[str, Any] = {"ts": _fmt(dt), "_dt": dt}
        head = payload.split(" - ", 1)[0]
        if payload in _USR_ACTIONS:
            row["kind"], row["label"] = _USR_ACTIONS[payload]
        elif payload.startswith("frmMsgBox._Load - Text="):
            row.update(kind="message", label="Mensagem ao operador", detail=payload.split("Text=", 1)[1].strip())
        elif payload.startswith("frmDispense._Load"):
            row.update(kind="dispense", label="Dispensa", detail=payload.partition(" - ")[2])
        elif payload.startswith("Users.Initialize()"):
            row.update(kind="start", label="POS iniciado", detail=payload.split(" - ", 1)[-1] if " - " in payload else "")
        elif head in ("frmGiveChange.cmdAcceptReturn_Click", "frmWithdrawCash.cmdWithdrawAll_Click"):
            m = _USR_ITEMS.search(payload)
            if not m:
                continue
            counts = {d: q for d, q in _parse_counts(m.group(1)).items() if q}
            stacker = _USR_STACKER.search(payload)
            to_stacker = bool(stacker and stacker.group(1) == "1")
            if head.startswith("frmGiveChange"):
                row.update(kind="give_return", label="Troco: devolução")
            else:
                row.update(kind="withdraw_all", label="Retirar tudo para o stacker" if to_stacker else "Retirar tudo")
            row.update(items=_nonzero(counts), amount=_counts_value(counts), to_stacker=to_stacker, _items=counts)
        else:
            continue
        actions.append(row)

    by_kind = Counter(a["kind"] for a in actions)
    withdrawals = [a for a in actions if a["kind"] == "withdraw_all"]
    return {
        "summary": {
            "events": len(stamps), "charges": by_kind["charge"], "cancels": by_kind["charge_cancel"],
            "backoffice_sessions": by_kind["backoffice"], "messages": by_kind["message"],
            "starts": by_kind["start"],
            "withdrawn": sum(a["amount"] for a in withdrawals if not a["to_stacker"]),
            "to_stacker": sum(a["amount"] for a in withdrawals if a["to_stacker"]),
            "returned": sum(a["amount"] for a in actions if a["kind"] == "give_return"),
        },
        "actions": actions,
        "_timestamps": stamps,
    }


def _crosscheck_usr_tran(actions: List[Dict[str, Any]],
                         moves: List[Tuple[datetime, str, Dict[int, int]]]) -> Dict[str, Any]:
    """Cada devolução/retirada do operador tem de ter uma SAÍDA no LogTran com as mesmas
    denominações, logo a seguir. As retiradas para o stacker não se verificam: nos logs de exemplo
    o LogTran não regista saída para elas."""
    moves = sorted(moves, key=lambda m: m[0])
    times = [m[0] for m in moves]
    first, last = (times[0], times[-1]) if times else (None, None)
    checked = matched = 0
    mismatches: List[Dict[str, Any]] = []
    for a in actions:
        a["tran_match"] = None
        if "_items" not in a or a["to_stacker"] or not a["_items"] or first is None:
            continue
        if a["_dt"] < first - timedelta(minutes=5) or a["_dt"] > last + timedelta(minutes=5):
            continue  # fora do período coberto pelo LogTran
        i = bisect.bisect_left(times, a["_dt"])
        j = bisect.bisect_right(times, a["_dt"] + _USR_WITHDRAW_WINDOW)
        a["tran_match"] = any(d == "out" and c == a["_items"] for _, d, c in moves[i:j])
        checked += 1
        matched += a["tran_match"]
        if not a["tran_match"]:
            mismatches.append({"ts": a["ts"], "label": a["label"], "amount": a["amount"], "items": a["items"]})
    return {"checked": checked, "matched": matched, "mismatches": mismatches[-MAX_EVENTS:]}


# ---------------------------------------------------------------------------
# Orquestração
# ---------------------------------------------------------------------------

_PARSERS = {
    "transactions": parse_transactions,
    "times": parse_times,
    "errors": parse_errors,
    "payments": parse_payments,
    "versions": parse_versions,
    "opos": parse_opos,
    "tran": parse_tran,
    "com": parse_com,
    "usr": parse_usr,
}


def _build_findings(result: Dict[str, Any]) -> List[Dict[str, str]]:
    """Resumo legível dos pontos que merecem atenção, do mais grave ao menos grave."""
    findings: List[Dict[str, str]] = []

    def add(severity: str, title: str, detail: str = ""):
        findings.append({"severity": severity, "title": title, "detail": detail})

    tx = result.get("transactions")
    if tx:
        s = tx["summary"]
        if s["mismatches"]:
            add("error", f"{s['mismatches']} operação(ões) com stock que não reconcilia",
                "O stock depois da operação não bate com o stock antes ± o movimento registado.")
        failed = [o for o in tx["transactions"] if o["result"] is None or (o["result"] or "").upper() != "OK"]
        if failed:
            add("error", f"{len(failed)} operação(ões) não terminaram em OK")
        partial = [o for o in tx["transactions"] if any(i.startswith("Dispensa parcial") for i in o["issues"])]
        if partial:
            add("error", f"{len(partial)} dispensa(s) parcial(is)", "Valor entregue inferior ao pedido.")
        if s["rejected_bills"] or s["rejected_coins"]:
            add("warning", f"{s['rejected_bills']} nota(s) e {s['rejected_coins']} moeda(s) rejeitadas em depósitos")
        if tx["external_changes"]:
            add("info", f"{len(tx['external_changes'])} alteração(ões) de stock fora de transações",
                "Recargas, esvaziamentos ou correções manuais entre operações.")
        st = tx.get("stock")
        if st and st["devices_with_error"]:
            add("error", "Dispositivos em erro no último estado: " + ", ".join(st["devices_with_error"]))
        if st:
            low = [f"{d['value'] / 100:g} € ({d['state']})" for d in st["denominations"]
                   if d["state"] in ("EMPTY", "NEAR_EMPTY", "FULL", "NEAR_FULL")]
            if low:
                add("warning", "Níveis fora do normal no último estado: " + ", ".join(low))

    er = result.get("errors")
    if er:
        for ep in er["episodes"]:
            if ep["count"] >= 20:
                add("warning", f"Código {ep['code']} repetido {ep['count']} vezes",
                    f"{ep['info']} — oscila entre aviso e normal; mediana {ep['median_s']} s por episódio, "
                    f"{ep['total_s'] / 3600:.1f} h em aviso no total.")
        errors = [r for r in er["by_code"] if r["level"] == "ERROR"]
        if errors:
            total = sum(r["count"] for r in errors)
            add("error", f"{total} erro(s) de hardware em {len(errors)} código(s)",
                "; ".join(f"{r['code']} ×{r['count']}: {r['info'] or 'sem descrição'}" for r in errors[:8]))
        mm = er["accounting_mismatches"]
        if mm:
            last = mm[-3:]
            add("warning", f"{len(mm)} incompatibilidade(s) de contabilidade (Descuadre)",
                "Últimos valores (brutos, do log): " + ", ".join(f"{m['value']} em {m['ts']}" for m in last))
        if er["still_open"]:
            add("warning", "Avisos por resolver no fim do log: códigos " + ", ".join(map(str, er["still_open"])))

    ti = result.get("times")
    if ti:
        for kind, label in (("deposit", "depósitos"), ("dispense", "dispensas")):
            if ti[kind]["slow_count"]:
                add("info", f"{ti[kind]['slow_count']} {label} com duração acima de 3× a mediana",
                    f"Limiar {ti[kind]['slow_threshold']} ms. A duração depende do nº de notas/moedas; "
                    "ver as fases mais demoradas no separador Tempos.")

    op = result.get("opos")
    if op and not tx:  # com Transactions já há um aviso equivalente sobre os níveis
        off = [f"{'Stacker' if r['key'] == 'STACKER' else denom_label(r['key'])} ({r['current']})"
               for r in op["levels"] if r["current"] != "OK"]
        if off:
            add("warning", "Níveis fora do normal na última leitura OPOS: " + ", ".join(off))

    pay = result.get("payments")
    if pay:
        n = sum(c for r, c in pay["by_result"].items() if r != "ok")
        if n:
            add("warning", f"{n} pagamento(s) terminaram sem 'ok' no fluxo do Gestor")
        if pay["accounting_read_errors"]:
            add("warning", f"{pay['accounting_read_errors']} erro(s) a ler Accounting",
                pay["accounting_path"])

    cm = result.get("com")
    if cm:
        bad = [o for o in cm["operations"] if o["kind"] == "charge" and not o["ok"]]
        if bad:
            add("error", f"{len(bad)} cobrança(s) em que entrou − devolvido ≠ valor pedido",
                "; ".join(f"{o['ts']}: pedido {o['amount'] / 100:.2f} €, líquido {o['net'] / 100:.2f} € ({o['result']})"
                          for o in bad[:5]))
        if cm["errors"]:
            codes = Counter(e["code"] for e in cm["errors"])
            add("error", f"{len(cm['errors'])} resposta(s) de erro do Connector",
                ", ".join(f"{c} ×{n}" for c, n in codes.most_common(5)))
        if len(cm["starts"]) >= 2:
            add("warning", f"O Connector arrancou {len(cm['starts'])} vezes",
                ", ".join(s["ts"][11:] for s in cm["starts"][:6]) + f" (v{cm['starts'][0]['version']})")
        if cm["summary"]["cancelled"]:
            add("info", f"{cm['summary']['cancelled']} cobrança(s) cancelada(s) pelo utilizador")
        if cm["summary"]["delayed_responses"]:
            add("info", f"{cm['summary']['delayed_responses']} resposta(s) atrasada(s) do Winsock")
        cc = cm.get("crosscheck")
        if cc and cc["mismatches"]:
            add("error", f"{len(cc['mismatches'])} operação(ões) em que o LogTran não coincide com o LogCom",
                "; ".join(f"{m['ts']} {m['cmd']}: Connector {m['introduced']}/{m['returned']}, "
                          f"movimentos {m['tran_in']}/{m['tran_out']} (cêntimos, entrou/saiu)" for m in cc["mismatches"][:4]))

    us = result.get("usr")
    if us:
        cc = us.get("crosscheck")
        if cc and cc["mismatches"]:
            add("error", f"{len(cc['mismatches'])} ação(ões) do operador sem saída correspondente no LogTran",
                "; ".join(f"{m['ts']} {m['label']} {m['amount'] / 100:.2f} €" for m in cc["mismatches"][:4]))
        msgs = [a for a in us["actions"] if a["kind"] == "message"]
        if msgs:
            add("info", f"{len(msgs)} mensagem(ns) mostrada(s) ao operador",
                "; ".join(f"{a['ts'][11:]} {a['detail'][:90]}" for a in msgs[:3]))
        s = us["summary"]
        if s["to_stacker"]:
            add("info", f"{s['to_stacker'] / 100:.2f} € retirados para o stacker",
                "Retirada com destino stacker: o LogTran não regista saída para estas retiradas.")
        if s["cancels"] and not result.get("com"):
            add("info", f"{s['cancels']} cobrança(s) cancelada(s) no ecrã")
        if s["starts"] >= 2 and not result.get("com"):
            add("warning", f"O POS iniciou {s['starts']} vezes")

    order = {"error": 0, "warning": 1, "info": 2}
    findings.sort(key=lambda f: order.get(f["severity"], 3))
    return findings


def _analyze(files: List[Tuple[str, bytes]], timeline: bool = False):
    """Análise agregada. Com timeline=True devolve também todos os eventos (sem truncar)."""
    result: Dict[str, Any] = {}
    file_rows: List[Dict[str, Any]] = []
    ignored: List[Dict[str, str]] = []
    all_ts: List[datetime] = []
    periods: Dict[str, Tuple[datetime, datetime]] = {}
    private: Dict[Tuple[str, str], Any] = {}

    for name, data in files:
        kind = detect_kind(name)
        if kind is None:
            ignored.append({"name": name, "reason": _unsupported_reason(name)})
            continue
        text = decode_log(data)
        parsed = _PARSERS[kind](text)
        ts = parsed.pop("_timestamps", [])
        all_ts.extend(ts)
        for key in [k for k in parsed if k.startswith("_")]:  # dados internos, não vão na resposta
            private[(kind, key)] = parsed.pop(key)
        result[kind] = parsed
        if ts:
            periods[name] = (min(ts), max(ts))
        file_rows.append({
            "name": name, "kind": kind, "label": SUPPORTED_KINDS[kind],
            "size": len(data), "lines": text.count("\n") + 1,
            "start": _fmt(min(ts)) if ts else None, "end": _fmt(max(ts)) if ts else None,
        })

    if "com" in result and ("tran", "_moves") in private:
        result["com"]["crosscheck"] = _crosscheck_com_tran(result["com"]["operations"], private[("tran", "_moves")])
    if "usr" in result and ("tran", "_moves_counts") in private:
        result["usr"]["crosscheck"] = _crosscheck_usr_tran(result["usr"]["actions"], private[("tran", "_moves_counts")])

    # os eventos da linha do tempo usam campos internos (_start, _dt) e têm de ser recolhidos antes da limpeza
    events = _collect_events(result, private) if timeline else []

    if "com" in result:
        for row in result["com"]["operations"]:
            row.pop("_start", None)
            row.pop("_end", None)
        result["com"]["operations"] = result["com"]["operations"][-MAX_TRANSACTIONS:]
    if "usr" in result:
        for row in result["usr"]["actions"]:
            row.pop("_dt", None)
            row.pop("_items", None)
        result["usr"]["actions"] = result["usr"]["actions"][-MAX_TRANSACTIONS:]

    device: Dict[str, str] = {}
    device.update(result.get("transactions", {}).get("device", {}))
    device.update(result.get("versions", {}).get("device", {}))

    out = {
        "files": file_rows,
        "ignored": ignored,
        "period": {"start": _fmt(min(all_ts)) if all_ts else None,
                   "end": _fmt(max(all_ts)) if all_ts else None},
        "device": device,
        "findings": _build_findings(result),
        **result,
    }
    return out, events, periods, private


def analyze_logs(files: List[Tuple[str, bytes]]) -> Dict[str, Any]:
    """Recebe [(nome, bytes)] e devolve a análise agregada de todos os logs reconhecidos."""
    return _analyze(files)[0]


# ---------------------------------------------------------------------------
# Investigar um incidente: linha do tempo de todos os logs num intervalo
# ---------------------------------------------------------------------------

SOURCE_LABELS = {
    "transactions": "Transações", "times": "Tempos", "errors": "Erros do hardware", "payments": "Pagamentos",
    "opos": "Níveis (OPOS)", "tran": "LogTran", "com": "LogCom", "usr": "LogUsr",
}
MAX_TIMELINE = 1500
_COM_RESULT_LABELS = {"0": "OK", "WR:CANCEL": "cancelada", "WR:LEVEL": "aviso de nível (WR:LEVEL)"}


def _com_event(r: Dict[str, Any]) -> Dict[str, Any]:
    tm = r.get("tran_match")
    tran_note = f" · LogTran: entrou {_eur(r['tran_in'])} / saiu {_eur(r['tran_out'])}" if tm is False else ""
    base = f"introduzido {_eur(r['introduced'])} · devolvido {_eur(r['returned'])}"
    if r["kind"] == "charge":
        label = _COM_RESULT_LABELS.get(r["result"], r["result"])
        bad = not r["ok"] and not r["cancelled"]
        detail = f"{base} · líquido {_eur(r['net'])} · {r['duration_ms'] / 1000:.1f} s"
        if bad:
            detail += " · o líquido não coincide com o valor pedido"
        return _ev(r["_start"], "com", "charge", "error" if bad or tm is False else "info",
                   f"Cobrança {_eur(r['amount'])} → {label}", detail + tran_note)
    title = "Adicionar troco (Connector)" if r["cmd"] == "A" else "Backoffice (Connector)"
    return _ev(r["_start"], "com", "backoffice", "error" if tm is False else "info", title, base + tran_note)


def _usr_event(a: Dict[str, Any]) -> Dict[str, Any]:
    tm = a.get("tran_match")
    parts = []
    if a.get("_items"):
        parts.append(_counts_text(a["_items"]))
    elif a.get("detail"):
        parts.append(a["detail"])
    if tm is False:
        parts.append("sem saída correspondente no LogTran")
    severity = "error" if tm is False else "warning" if a["kind"] == "message" else "info"
    return _ev(a["_dt"], "usr", a["kind"], severity, a["label"], " · ".join(parts))


def _collect_events(result: Dict[str, Any], private: Dict[Tuple[str, str], Any]) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    for kind in SOURCE_LABELS:
        events.extend(private.get((kind, "_events"), []))
    events.extend(_com_event(r) for r in result.get("com", {}).get("operations", []))
    events.extend(_usr_event(a) for a in result.get("usr", {}).get("actions", []))
    return events


def _context_lines(private: Dict[Tuple[str, str], Any], end: datetime) -> List[str]:
    """Estado conhecido mais recente até ao fim do intervalo (níveis e dispositivos em erro)."""
    lines: List[str] = []
    reads = [r for r in private.get(("opos", "_reads"), []) if r[0] <= end]
    if reads:
        dt, states = reads[-1]
        off = [f"{'Stacker' if k == 'STACKER' else denom_label(k)} {v}" for k, v in states.items() if v != "OK"]
        lines.append(f"Níveis na última leitura do OPOS ({_fmt(dt)}): " + (", ".join(off) if off else "todos OK"))
    ops = [(dt, o) for dt, o in private.get(("transactions", "_ops_full"), []) if dt and dt <= end]
    if ops:
        dt, o = ops[-1]
        if not reads and o["levels"]:
            lines.append(f"Níveis no último registo de transações ({_fmt(dt)}): " + ", ".join(o["levels"]))
        if o["device_errors"]:
            lines.append(f"Dispositivos em erro no último registo de transações ({_fmt(dt)}): " + ", ".join(o["device_errors"]))
    return lines


def investigate(files: List[Tuple[str, bytes]], when: datetime, before_min: int = 5, after_min: int = 5) -> Dict[str, Any]:
    """Linha do tempo única de todos os logs recebidos no intervalo [when-before, when+after]."""
    start = when - timedelta(minutes=before_min)
    end = when + timedelta(minutes=after_min)
    out, events, periods, private = _analyze(files, timeline=True)

    inside = sorted((e for e in events if start <= e["dt"] <= end), key=lambda e: e["dt"])

    # Só se descreve o que se sabe: a relação entre os registos do ficheiro e o intervalo. Os logs de
    # eventos só escrevem quando algo acontece, por isso não se sabe até quando o ficheiro "cobre".
    coverage = []
    for f in out["files"]:
        p = periods.get(f["name"])
        relation = "unknown" if not p else "before" if p[1] < start else "after" if p[0] > end else "overlap"
        coverage.append({"name": f["name"], "kind": f["kind"], "label": f["label"],
                         "start": f["start"], "end": f["end"], "relation": relation})
    with_events = {e["source"] for e in inside}
    quiet = [SOURCE_LABELS[c["kind"]] for c in coverage
             if c["kind"] in SOURCE_LABELS and c["relation"] == "overlap" and c["kind"] not in with_events]

    groups: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for e in inside:
        if e["severity"] not in ("error", "warning"):
            continue
        g = groups.setdefault((e["source"], e["title"]), {
            "severity": e["severity"], "source": e["source"], "source_label": SOURCE_LABELS[e["source"]],
            "title": e["title"], "detail": e["detail"], "count": 0, "first": e["dt"], "last": e["dt"]})
        g["count"] += 1
        g["last"] = e["dt"]
        if e["severity"] == "error":
            g["severity"] = "error"
    highlights = sorted(groups.values(), key=lambda g: (0 if g["severity"] == "error" else 1, g["first"]))
    for g in highlights:
        g["first"], g["last"] = _fmt_ms(g["first"]), _fmt_ms(g["last"])

    return {
        "window": {"center": _fmt(when), "start": _fmt(start), "end": _fmt(end),
                   "before_min": before_min, "after_min": after_min},
        "summary": {"events": len(inside),
                    "errors": sum(1 for e in inside if e["severity"] == "error"),
                    "warnings": sum(1 for e in inside if e["severity"] == "warning")},
        "coverage": coverage,
        "ignored": out["ignored"],
        "quiet_sources": quiet,
        "highlights": highlights[:40],
        "context": _context_lines(private, end),
        "events": [{"ts": _fmt_ms(e["dt"]), "source": e["source"], "source_label": SOURCE_LABELS[e["source"]],
                    "kind": e["kind"], "severity": e["severity"], "title": e["title"], "detail": e["detail"]}
                   for e in inside[:MAX_TIMELINE]],
        "events_truncated": len(inside) > MAX_TIMELINE,
    }
