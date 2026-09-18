"""
Análise de logs do Cashlogy (recicladora H500 / driver OPOS).

Ficheiros suportados (identificados pelo nome):
  - Transactions_Cashlogy.log       depósitos, dispensas, stock antes/depois, rejeições
  - Process_Times.log               tempos (ms) de cada fase de depósito/dispensa
  - Opos_ResultCodeExtended.log     avisos e erros do hardware (códigos 1313, 1751, ...)
  - Process_GestorAdminDev.log      fluxo de pagamento (H500_paga_START/END ok|warning)
  - VersionsHistory.log             ficha do equipamento e histórico de versões

Todos os valores monetários são inteiros em cêntimos (denominação 200 = 2,00 €).
Os ficheiros são lidos em memória; não há acesso à base de dados.
"""
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
}

_UNSUPPORTED_HINTS = {
    "sensores": "Séries de sensores sem cabeçalhos de coluna — ainda não suportado",
    "admissiondata": "Dados de admissão sem cabeçalhos de coluna — ainda não suportado",
    "opos_cashlogy": "Rasto de chamadas OPOS (polling) — ainda não suportado",
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

        for o, b, a in block_ops:
            ops.append(_finish_op(o, b, a, start, end))
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
    truncated = len(ops) > MAX_TRANSACTIONS
    return {
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
            cur = {"type": m.group(1).lower(), "ts": _fmt(dt), "phases": {}}
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

    result: Dict[str, Any] = {"incomplete": incomplete, "_timestamps": timestamps}
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
_E_KV = re.compile(r"^\s+(Info|SubCodigo|Producto|Items Adm\.|Items Dev\.):\s*(.*?)\s*$")
_E_KEYS = {"Info": "info", "SubCodigo": "subcode", "Producto": "product",
           "Items Adm.": "items_in", "Items Dev.": "items_out"}


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
            cur = {"code": int(m.group(1)), "level": m.group(2).upper(), "dt": dt,
                   "ts": _fmt(dt), "info": "", "subcode": "", "product": "",
                   "items_in": "", "items_out": ""}
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

    # Episódios: WARNING -> OK. O log usa código N para o aviso e N+1 para o
    # regresso ao normal (1313/1314); para os restantes, o mesmo código (1751).
    open_at: Dict[int, datetime] = {}
    durations: Dict[int, List[float]] = defaultdict(list)
    for e in events:
        if e["dt"] is None:
            continue
        if e["level"] == "WARNING" or e["level"] == "ERROR":
            open_at.setdefault(e["code"], e["dt"])
        elif e["level"] == "OK":
            for key in (e["code"], e["code"] - 1):
                if key in open_at:
                    durations[key].append((e["dt"] - open_at.pop(key)).total_seconds())
                    break

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
            "info": info_by_key.get((code, "WARNING"), ""),
            "count": len(secs),
            "total_s": round(sum(secs)),
            "median_s": round(statistics.median(secs), 1),
            "max_s": round(max(secs), 1),
        })

    per_day = Counter(e["ts"][:10] for e in events if e["ts"] and e["level"] != "OK")
    clean_events = [{k: (info_by_key.get((e["code"], e["level"]), "") if k == "info" and not v else v)
                     for k, v in e.items() if k != "dt"} for e in events[-MAX_EVENTS:]]

    return {
        "total_events": len(events),
        "by_code": sorted(by_code.values(), key=lambda r: r["count"], reverse=True),
        "episodes": sorted(episodes, key=lambda r: r["count"], reverse=True),
        "still_open": sorted(open_at),
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
            start = None
            apagar = None
            continue
        m = _P_CTOR.match(ln)
        if m:
            starts.append(_fmt(_dt_from_groups(m.groups())) or "")
            continue
        m = _P_ACCOUNTING.match(ln)
        if m:
            accounting_errors += 1
            accounting_path = re.sub(r"\s+" + _TS + r"\s*$", "", m.group(1))

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
# Orquestração
# ---------------------------------------------------------------------------

_PARSERS = {
    "transactions": parse_transactions,
    "times": parse_times,
    "errors": parse_errors,
    "payments": parse_payments,
    "versions": parse_versions,
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
        if er["still_open"]:
            add("warning", "Avisos por resolver no fim do log: códigos " + ", ".join(map(str, er["still_open"])))

    ti = result.get("times")
    if ti:
        for kind, label in (("deposit", "depósitos"), ("dispense", "dispensas")):
            if ti[kind]["slow_count"]:
                add("info", f"{ti[kind]['slow_count']} {label} com duração acima de 3× a mediana",
                    f"Limiar {ti[kind]['slow_threshold']} ms. A duração depende do nº de notas/moedas; "
                    "ver as fases mais demoradas no separador Tempos.")

    pay = result.get("payments")
    if pay:
        n = sum(c for r, c in pay["by_result"].items() if r != "ok")
        if n:
            add("warning", f"{n} pagamento(s) terminaram sem 'ok' no fluxo do Gestor")
        if pay["accounting_read_errors"]:
            add("warning", f"{pay['accounting_read_errors']} erro(s) a ler Accounting",
                pay["accounting_path"])

    order = {"error": 0, "warning": 1, "info": 2}
    findings.sort(key=lambda f: order.get(f["severity"], 3))
    return findings


def analyze_logs(files: List[Tuple[str, bytes]]) -> Dict[str, Any]:
    """Recebe [(nome, bytes)] e devolve a análise agregada de todos os logs reconhecidos."""
    result: Dict[str, Any] = {}
    file_rows: List[Dict[str, Any]] = []
    ignored: List[Dict[str, str]] = []
    all_ts: List[datetime] = []

    for name, data in files:
        kind = detect_kind(name)
        if kind is None:
            ignored.append({"name": name, "reason": _unsupported_reason(name)})
            continue
        text = decode_log(data)
        parsed = _PARSERS[kind](text)
        ts = parsed.pop("_timestamps", [])
        all_ts.extend(ts)
        result[kind] = parsed
        file_rows.append({
            "name": name, "kind": kind, "label": SUPPORTED_KINDS[kind],
            "size": len(data), "lines": text.count("\n") + 1,
            "start": _fmt(min(ts)) if ts else None, "end": _fmt(max(ts)) if ts else None,
        })

    device: Dict[str, str] = {}
    device.update(result.get("transactions", {}).get("device", {}))
    device.update(result.get("versions", {}).get("device", {}))

    return {
        "files": file_rows,
        "ignored": ignored,
        "period": {"start": _fmt(min(all_ts)) if all_ts else None,
                   "end": _fmt(max(all_ts)) if all_ts else None},
        "device": device,
        "findings": _build_findings(result),
        **result,
    }
