import React, { useState } from 'react';
import {
  X, Upload, RefreshCw, ScrollText, AlertCircle, AlertTriangle, Info, Check,
  ArrowDownToLine, ArrowUpFromLine, FileText,
} from 'lucide-react';

interface CashlogyLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ---- Tipos da resposta de /api/cashlogy/analyze -----------------------------

interface Finding { severity: 'error' | 'warning' | 'info'; title: string; detail: string }
interface LogFile { name: string; kind: string; label: string; size: number; lines: number; start: string | null; end: string | null }
interface Rejected { coins: number; bills: number; detail: Record<string, number> }
interface Operation {
  ts: string; end_ts: string; type: 'deposit' | 'dispense'; subtype: string | null;
  amount: number; requested: number | null; counts: Record<string, number>;
  result: string | null; rejected: Rejected; device_errors: string[]; levels: string[];
  reconciliation: { status: 'ok' | 'mismatch' | 'unknown'; diff: Record<string, number> };
  issues: string[];
}
interface StockRow { value: number; stored: number; stacker: number; state: string }
interface TimingKind {
  count: number; avg: number | null; median: number | null; p95: number | null; min: number | null; max: number | null;
  slow_count: number; slow_threshold: number | null;
  slowest: { ts: string; total_ms: number; phases: Record<string, number> }[];
}
// Opos_ResultCodeExtended e LogErr têm a mesma forma
interface ErrorsReport {
  total_events: number;
  by_code: { code: number; level: string; info: string; count: number; first: string; last: string }[];
  episodes: { code: number; info: string; count: number; total_s: number; median_s: number; max_s: number }[];
  still_open: number[];
  accounting_mismatches: { ts: string; code: number; value: number }[];
  warnings_per_day: { day: string; count: number }[];
  events: { ts: string; code: number; level: string; info: string; subcode: string; product: string; items_in: string; items_out: string; clear: boolean; mismatch: string }[];
  events_truncated: boolean;
}

interface Analysis {
  files: LogFile[];
  ignored: { name: string; reason: string }[];
  period: { start: string | null; end: string | null };
  device: Record<string, string>;
  findings: Finding[];
  transactions?: {
    summary: {
      deposits: number; dispenses: number; deposit_total: number; dispense_total: number;
      rejected_coins: number; rejected_bills: number; with_issues: number;
      reconciled: number; mismatches: number; external_stock_changes: number;
    };
    transactions: Operation[]; transactions_truncated: boolean;
    external_changes: { from: string; to: string; delta: Record<string, number> }[];
    rejections: { codes: string[]; by_day: { day: string; total: number; codes: Record<string, number> }[] };
    stock: { ts: string; denominations: StockRow[]; stacker_state: string; devices_with_error: string[] } | null;
  };
  times?: { incomplete: number; deposit: TimingKind; dispense: TimingKind };
  errors?: ErrorsReport;
  logerr?: ErrorsReport;
  payments?: {
    total: number; by_result: Record<string, number>;
    duration_ms: { count: number; avg: number | null; median: number | null; p95: number | null; max: number | null };
    warnings: { ts: string; result: string; duration_ms: number; apagar: number | null }[];
    app_starts: number; accounting_read_errors: number; accounting_path: string;
  };
  opos?: {
    reads: number; first: string | null; last: string | null;
    levels: { key: string; current: string; reads: number; counts: Record<string, number>; changes: number }[];
    transitions: { ts: string; key: string; from: string; to: string }[];
    transitions_truncated: boolean;
  };
  tran?: {
    summary: { ins: number; outs: number; in_total: number; out_total: number; backoffice: number };
    movements: { ts: string; dir: 'in' | 'out'; amount: number; counts: Record<string, number> }[];
    movements_truncated: boolean;
    backoffice: { ts: string; action: string; dir: 'in' | 'out'; amount: number }[];
  };
  com?: {
    summary: {
      connections: number; commands: Record<string, number>; charges: number; cancelled: number;
      not_matching: number; level_warnings: number; delayed_responses: number; orphan_responses: number;
    };
    duration_ms: { count: number; avg: number | null; median: number | null; p95: number | null; min: number | null; max: number | null };
    operations: {
      ts: string; cmd: string; kind: 'charge' | 'backoffice'; result: string; duration_ms: number;
      amount?: number; introduced: number; returned: number; net?: number; cancelled?: boolean; ok?: boolean;
      tran_in?: number; tran_out?: number; tran_match?: boolean | null;
    }[];
    errors: { ts: string; cmd: string; code: string }[];
    starts: { ts: string; version: string }[];
    crosscheck?: {
      checked: number; matched: number;
      mismatches: { ts: string; cmd: string; introduced: number; returned: number; tran_in: number; tran_out: number }[];
    };
  };
  usr?: {
    summary: {
      events: number; charges: number; cancels: number; backoffice_sessions: number; messages: number;
      starts: number; withdrawn: number; to_stacker: number; returned: number;
    };
    actions: {
      ts: string; kind: string; label: string; detail?: string; items?: Record<string, number>;
      amount?: number; to_stacker?: boolean; tran_match?: boolean | null;
    }[];
    crosscheck?: {
      checked: number; matched: number;
      mismatches: { ts: string; label: string; amount: number; items: Record<string, number> }[];
    };
  };
  versions?: {
    device: Record<string, string>;
    history: { ts: string; kind: string; sections: string[]; changes: { label: string; from: string; to: string }[]; dll_version?: string; h500_firmware?: string }[];
  };
}

type TabId = 'summary' | 'investigate' | 'transactions' | 'alerts' | 'levels' | 'connector' | 'operator' | 'times' | 'payments' | 'device';

// Resposta de /api/cashlogy/investigate
interface InvEvent { ts: string; source: string; source_label: string; kind: string; severity: 'error' | 'warning' | 'info' | 'ok'; title: string; detail: string }
interface Investigation {
  window: { center: string; start: string; end: string; before_min: number; after_min: number };
  summary: { events: number; errors: number; warnings: number };
  coverage: { name: string; kind: string; label: string; start: string | null; end: string | null; relation: 'overlap' | 'before' | 'after' | 'unknown' }[];
  ignored: { name: string; reason: string }[];
  quiet_sources: string[];
  highlights: { severity: 'error' | 'warning'; source: string; source_label: string; title: string; detail: string; count: number; first: string; last: string }[];
  context: string[];
  events: InvEvent[];
  events_truncated: boolean;
  sales: null | {
    requested: boolean; available: boolean; reason: string | null; truncated: boolean;
    sales: number; matched: number; cash_codes: number[]; note: string | null;
  };
}

const SOURCE_STYLE: Record<string, string> = {
  transactions: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  times: 'bg-slate-100 text-slate-700 border-slate-300',
  errors: 'bg-rose-50 text-rose-800 border-rose-200',
  payments: 'bg-violet-50 text-violet-800 border-violet-200',
  opos: 'bg-sky-50 text-sky-800 border-sky-200',
  tran: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  com: 'bg-teal-50 text-teal-800 border-teal-200',
  usr: 'bg-amber-50 text-amber-800 border-amber-200',
  sales: 'bg-lime-50 text-lime-800 border-lime-200',
  logerr: 'bg-rose-50 text-rose-800 border-rose-200',
};

// ---- Formatação --------------------------------------------------------------

const eur = (cents: number) => (cents / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
const denom = (v: number | string) => { const n = Number(v); return n >= 100 ? `${n / 100} €` : `${n} c`; };
const countsText = (c: Record<string, number>) =>
  Object.entries(c).map(([d, q]) => `${q} × ${denom(d)}`).join('   ') || '—';
const signed = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(v)}`;
const ms = (v: number | null | undefined) =>
  v == null ? '—' : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`;
const dt = (ts: string | null) => (ts ? `${ts.slice(8, 10)}/${ts.slice(5, 7)}/${ts.slice(0, 4)} ${ts.slice(11)}` : '—');
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const STATE_STYLE: Record<string, string> = {
  OK: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  NEAR_EMPTY: 'bg-amber-50 text-amber-800 border-amber-200',
  NEAR_FULL: 'bg-amber-50 text-amber-800 border-amber-200',
  EMPTY: 'bg-rose-50 text-rose-800 border-rose-200',
  FULL: 'bg-rose-50 text-rose-800 border-rose-200',
};

const SEVERITY = {
  error: { cls: 'bg-rose-50 border-rose-200 text-rose-900', Icon: AlertCircle, icon: 'text-rose-600' },
  warning: { cls: 'bg-amber-50 border-amber-200 text-amber-900', Icon: AlertTriangle, icon: 'text-amber-600' },
  info: { cls: 'bg-sky-50 border-sky-200 text-sky-900', Icon: Info, icon: 'text-sky-600' },
} as const;

const Card: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }> =
  ({ label, value, sub, tone = 'text-slate-900' }) => (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-xl font-black mt-0.5 ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 font-medium mt-0.5">{sub}</div>}
    </div>
  );

const Th: React.FC<{ children?: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <th className={`px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-200 ${right ? 'text-right' : 'text-left'}`}>{children}</th>
);
const Td: React.FC<{ children?: React.ReactNode; right?: boolean; mono?: boolean }> = ({ children, right, mono }) => (
  <td className={`px-3 py-1.5 text-xs text-slate-800 border-b border-slate-100 ${right ? 'text-right' : ''} ${mono ? 'font-mono' : ''}`}>{children}</td>
);
const TableWrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="border border-slate-200 rounded-xl overflow-auto max-h-[52vh]"><table className="w-full border-collapse">{children}</table></div>
);
const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-xs text-slate-400 font-medium py-8 text-center">{text}</div>
);
const Badge: React.FC<{ cls: string; children: React.ReactNode; title?: string }> = ({ cls, children, title }) => (
  <span title={title} className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{children}</span>
);

// ---- Gráfico "Rejeição de notas KPIs" ------------------------------------------

// Códigos do log (Rejected=...BILLS:n(DB-,FU-,IN-,MI-,OT-)) e os nomes usados no painel do Cashlogy.
const REJECT_STYLE: Record<string, { label: string; color: string }> = {
  DB: { label: 'DB', color: '#8a9a3b' },
  FU: { label: 'FUN', color: '#f0465a' },
  IN: { label: 'INL', color: '#22c38e' },
  MI: { label: 'MIS', color: '#e8a838' },
  OT: { label: 'OTH', color: '#7d7aa0' },
};
const TOTAL_COLOR = '#6c5ce7';

const RejectionChart: React.FC<{ rej: NonNullable<Analysis['transactions']>['rejections'] }> = ({ rej }) => {
  const [hidden, setHidden] = useState<string[]>([]);
  const days = rej.by_day;
  const W = 640, H = 240, L = 34, R = 14, T = 14, B = 58;
  const n = days.length;
  const max = Math.max(1, ...days.map(d => d.total));
  const step = Math.max(1, Math.ceil(max / 4));
  const yMax = step * Math.ceil(max / step);
  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += step) ticks.push(v);
  const x = (i: number) => (n === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / yMax);
  const labelEvery = Math.max(1, Math.ceil(n / 12));

  const series = [
    ...rej.codes.map(c => ({
      key: c, label: REJECT_STYLE[c]?.label || c, color: REJECT_STYLE[c]?.color || '#94a3b8',
      values: days.map(d => d.codes[c] || 0), width: 1.6,
    })),
    { key: 'TOTAL', label: 'TOTAL', color: TOTAL_COLOR, values: days.map(d => d.total), width: 2.8 },
  ];
  const visible = series.filter(s => !hidden.includes(s.key));
  const total = series[series.length - 1];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2">
      <div>
        <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Rejeição de notas KPIs</h3>
        <p className="text-[11px] text-slate-500">Notas rejeitadas por dia e por código, a partir dos depósitos do log de transações</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Notas rejeitadas por dia">
        {ticks.map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeDasharray={v === 0 ? undefined : '3 3'} />
            <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#64748b">{v}</text>
          </g>
        ))}
        {!hidden.includes('TOTAL') && n > 1 && (
          <polygon fill={TOTAL_COLOR} fillOpacity="0.08"
            points={`${x(0)},${y(0)} ${total.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} ${x(n - 1)},${y(0)}`} />
        )}
        {visible.map(s => (
          <g key={s.key}>
            {n > 1 && <polyline fill="none" stroke={s.color} strokeWidth={s.width} strokeLinejoin="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />}
            {n <= 31 && s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={s.key === 'TOTAL' ? 3.2 : 2.4} fill={s.color}>
                <title>{`${dt(days[i].day + ' 00:00:00').slice(0, 10)} — ${s.label}: ${v}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {days.map((d, i) => (i % labelEvery === 0 ? (
          <text key={d.day} transform={`translate(${x(i)},${H - B + 14}) rotate(-45)`} textAnchor="end" fontSize="10" fill="#64748b">
            {`${d.day.slice(8)}/${d.day.slice(5, 7)}`}
          </text>
        ) : null))}
      </svg>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {series.map(s => {
          const off = hidden.includes(s.key);
          return (
            <button key={s.key} type="button"
              onClick={() => setHidden(h => (off ? h.filter(k => k !== s.key) : [...h, s.key]))}
              title="Mostrar/ocultar série"
              className={`flex items-center gap-1.5 text-[11px] font-semibold transition ${off ? 'text-slate-300 line-through' : 'text-slate-600 hover:text-slate-900'}`}>
              <span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: off ? '#cbd5e1' : s.color }} />
              {s.label} Rejeições
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ---- Modal -------------------------------------------------------------------

export const CashlogyLogsModal: React.FC<CashlogyLogsModalProps> = ({ isOpen, onClose }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [data, setData] = useState<Analysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [tab, setTab] = useState<TabId>('summary');
  const [txFilter, setTxFilter] = useState<'all' | 'deposit' | 'dispense' | 'issues'>('all');
  const [txLimit, setTxLimit] = useState(200);
  const [invDate, setInvDate] = useState('');
  const [invTime, setInvTime] = useState('');
  const [invBefore, setInvBefore] = useState(5);
  const [invAfter, setInvAfter] = useState(5);
  const [invSales, setInvSales] = useState(false);
  const [inv, setInv] = useState<Investigation | null>(null);
  const [invLoading, setInvLoading] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);
  const [invCopied, setInvCopied] = useState(false);

  const investigate = async () => {
    setInvError(null);
    const day = invDate || (data?.period.end ? data.period.end.slice(0, 10) : '');
    if (!day || !invTime) { setInvError('Indique a data e a hora do incidente.'); return; }
    setInvLoading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      formData.append('when', `${day} ${invTime}`);
      formData.append('before', String(invBefore));
      formData.append('after', String(invAfter));
      formData.append('with_sales', String(invSales));
      const res = await fetch('/api/cashlogy/investigate', { method: 'POST', body: formData });
      const body = await res.json();
      if (!res.ok) { setInvError(typeof body.detail === 'string' ? body.detail : 'Não foi possível investigar o intervalo.'); return; }
      setInv(body);
    } catch {
      setInvError('Falha de rede ao investigar o intervalo.');
    } finally {
      setInvLoading(false);
    }
  };

  const copyInvestigation = async () => {
    if (!inv) return;
    const lines = [
      `Intervalo: ${inv.window.start} → ${inv.window.end} (${inv.summary.events} eventos, ${inv.summary.errors} erros, ${inv.summary.warnings} avisos)`,
      '', 'O que se destaca:',
      ...(inv.highlights.length ? inv.highlights.map(h => `- [${h.severity}] ${h.source_label}: ${h.title}${h.count > 1 ? ` ×${h.count}` : ''}${h.detail ? ` — ${h.detail}` : ''}`) : ['- nada']),
      ...(inv.context.length ? ['', 'Contexto:', ...inv.context.map(c => `- ${c}`)] : []),
      '', 'Linha do tempo:',
      ...inv.events.map(e => `${e.ts.slice(11)}  [${e.source_label}]  ${e.title}${e.detail ? ` — ${e.detail}` : ''}`),
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); setInvCopied(true); setTimeout(() => setInvCopied(false), 2000); }
    catch { setInvError('Não foi possível copiar para a área de transferência.'); }
  };

  const analyze = async (next: File[]) => {
    setFiles(next);
    setInv(null);
    setErrorMsg(null);
    if (next.length === 0) { setData(null); return; }
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      next.forEach(f => formData.append('files', f));
      const res = await fetch('/api/cashlogy/analyze', { method: 'POST', body: formData });
      const body = await res.json();
      if (!res.ok) {
        setErrorMsg(typeof body.detail === 'string' ? body.detail : 'Não foi possível analisar os logs.');
        return;
      }
      setData(body);
      setTxLimit(200);
    } catch {
      setErrorMsg('Falha de rede ao analisar os logs.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addFiles = (incoming: FileList | File[] | null) => {
    if (!incoming || incoming.length === 0) return;
    const merged = new Map(files.map(f => [f.name, f] as [string, File]));
    Array.from(incoming).forEach(f => merged.set(f.name, f));
    analyze(Array.from(merged.values()));
  };

  if (!isOpen) return null;

  const tx = data?.transactions;
  const tabs: { id: TabId; label: string; show: boolean; badge?: number }[] = [
    { id: 'summary', label: 'Resumo', show: true, badge: data?.findings.length },
    { id: 'investigate', label: 'Investigar', show: !!data && data.files.length > 0 },
    { id: 'transactions', label: 'Transações', show: !!tx, badge: tx?.transactions.length },
    { id: 'alerts', label: 'Alertas', show: !!(data?.errors || data?.logerr) },
    { id: 'levels', label: 'Níveis', show: !!data?.opos },
    { id: 'connector', label: 'Connector', show: !!(data?.tran || data?.com) },
    { id: 'operator', label: 'Operador', show: !!data?.usr },
    { id: 'times', label: 'Tempos', show: !!data?.times },
    { id: 'payments', label: 'Pagamentos', show: !!data?.payments },
    { id: 'device', label: 'Equipamento', show: !!data && (Object.keys(data.device).length > 0 || !!data.versions) },
  ];

  // ---- Separadores ----

  const renderSummary = () => {
    if (!data) return null;
    const s = tx?.summary;
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Período" value={<span className="text-sm">{dt(data.period.start).slice(0, 10)} → {dt(data.period.end).slice(0, 10)}</span>}
                sub={`${data.files.length} ficheiro(s) analisado(s)`} />
          {s && <>
            <Card label="Depósitos" value={s.deposits} sub={eur(s.deposit_total)} />
            <Card label="Dispensas" value={s.dispenses} sub={eur(s.dispense_total)} />
            <Card label="Stock reconciliado" value={`${s.reconciled}/${s.deposits + s.dispenses}`}
                  tone={s.mismatches ? 'text-rose-700' : 'text-emerald-700'}
                  sub={s.mismatches ? `${s.mismatches} com diferenças` : 'sem diferenças'} />
          </>}
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Pontos de atenção</h3>
          {data.findings.length === 0 && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold px-3 py-2 rounded-xl">
              <Check className="w-4 h-4" /> Nada a assinalar nos ficheiros analisados.
            </div>
          )}
          {data.findings.map((f, i) => {
            const S = SEVERITY[f.severity];
            return (
              <div key={i} className={`flex gap-2.5 border rounded-xl px-3 py-2 ${S.cls}`}>
                <S.Icon className={`w-4 h-4 mt-0.5 shrink-0 ${S.icon}`} />
                <div className="min-w-0">
                  <div className="text-xs font-bold">{f.title}</div>
                  {f.detail && <div className="text-[11px] opacity-80 break-words">{f.detail}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {tx && tx.rejections.by_day.length > 0 && <RejectionChart rej={tx.rejections} />}

        {tx?.stock && (
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              Stock no último registo <span className="text-slate-400 normal-case font-semibold">({dt(tx.stock.ts)})</span>
            </h3>
            <TableWrap>
              <thead><tr><Th>Denominação</Th><Th right>Recicladora</Th><Th right>Stacker</Th><Th>Nível</Th></tr></thead>
              <tbody>
                {tx.stock.denominations.map(d => (
                  <tr key={d.value}>
                    <Td>{denom(d.value)}</Td><Td right mono>{d.stored}</Td><Td right mono>{d.stacker}</Td>
                    <Td><Badge cls={STATE_STYLE[d.state] || 'bg-slate-50 text-slate-700 border-slate-200'}>{d.state || '—'}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Ficheiros</h3>
          <div className="space-y-1">
            {data.files.map(f => (
              <div key={f.name} className="flex items-center justify-between gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                <span className="flex items-center gap-2 min-w-0"><FileText className="w-3.5 h-3.5 text-sky-600 shrink-0" /><span className="font-bold truncate">{f.name}</span></span>
                <span className="text-slate-500 shrink-0">{f.lines.toLocaleString('pt-PT')} linhas · {kb(f.size)} · {f.start ? `${dt(f.start).slice(0, 10)} → ${dt(f.end).slice(0, 10)}` : 'sem datas'}</span>
              </div>
            ))}
            {data.ignored.map(f => (
              <div key={f.name} className="flex items-center justify-between gap-3 text-xs bg-white border border-dashed border-slate-300 rounded-lg px-3 py-1.5 text-slate-500">
                <span className="truncate">{f.name}</span><span className="shrink-0">ignorado — {f.reason}</span>
              </div>
            ))}
          </div>
          {data.files.length > 1 && (
            <p className="text-[11px] text-slate-400">Os ficheiros podem cobrir períodos diferentes; compare contagens entre separadores com cuidado.</p>
          )}
        </div>
      </div>
    );
  };

  const renderTransactions = () => {
    if (!tx) return null;
    const rows = tx.transactions
      .filter(o => txFilter === 'all' || (txFilter === 'issues' ? o.issues.length > 0 : o.type === txFilter))
      .slice().reverse();
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {([['all', 'Todas'], ['deposit', 'Depósitos'], ['dispense', 'Dispensas'], ['issues', 'Com problemas']] as const).map(([id, label]) => (
            <button key={id} onClick={() => { setTxFilter(id); setTxLimit(200); }}
              className={`text-xs font-bold px-3 py-1 rounded-lg border transition ${txFilter === id ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
          <span className="text-[11px] text-slate-500 ml-auto">
            {rows.length} operação(ões){tx.transactions_truncated ? ' · só as mais recentes' : ''}
          </span>
        </div>
        {rows.length === 0 ? <Empty text="Sem operações para este filtro." /> : (
          <TableWrap>
            <thead><tr><Th>Data/hora</Th><Th>Tipo</Th><Th right>Valor</Th><Th>Denominações</Th><Th>Resultado</Th><Th>Stock</Th><Th>Rejeitadas</Th></tr></thead>
            <tbody>
              {rows.slice(0, txLimit).map((o, i) => (
                <tr key={i} className={o.issues.length ? 'bg-rose-50/40' : ''}>
                  <Td mono>{dt(o.ts)}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1 font-semibold">
                      {o.type === 'deposit' ? <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowUpFromLine className="w-3.5 h-3.5 text-indigo-600" />}
                      {o.type === 'deposit' ? 'Depósito' : o.subtype === 'cash' ? 'Dispensa (cash)' : 'Dispensa (troco)'}
                    </span>
                  </Td>
                  <Td right mono>{eur(o.amount)}{o.requested != null && o.requested !== o.amount ? <span className="text-rose-600"> / {eur(o.requested)}</span> : null}</Td>
                  <Td mono>{countsText(o.counts)}</Td>
                  <Td>{o.result === 'OK' ? <Badge cls="bg-emerald-50 text-emerald-800 border-emerald-200">OK</Badge> : <Badge cls="bg-rose-50 text-rose-800 border-rose-200">{o.result || 'sem fim'}</Badge>}</Td>
                  <Td>
                    {o.reconciliation.status === 'ok' && <Badge cls="bg-emerald-50 text-emerald-800 border-emerald-200">reconcilia</Badge>}
                    {o.reconciliation.status === 'mismatch' && (
                      <Badge cls="bg-rose-50 text-rose-800 border-rose-200" title={Object.entries(o.reconciliation.diff).map(([d, v]) => `${denom(d)}: ${signed(v)}`).join(' · ')}>
                        diferença {Object.entries(o.reconciliation.diff).map(([d, v]) => `${denom(d)}: ${signed(v)}`).join(', ')}
                      </Badge>
                    )}
                    {o.reconciliation.status === 'unknown' && <span className="text-slate-400">—</span>}
                  </Td>
                  <Td>
                    {o.rejected.bills || o.rejected.coins ? (
                      <span title="Códigos de rejeição do Cashlogy (DB, FU, MI, IN, OT)">
                        {o.rejected.bills ? `${o.rejected.bills} nota(s)` : ''}{o.rejected.bills && o.rejected.coins ? ', ' : ''}{o.rejected.coins ? `${o.rejected.coins} moeda(s)` : ''}
                        {Object.keys(o.rejected.detail).length > 0 && <span className="text-slate-400 font-mono"> ({Object.entries(o.rejected.detail).map(([k, v]) => `${k}-${v}`).join(',')})</span>}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {rows.length > txLimit && (
          <button onClick={() => setTxLimit(l => l + 300)} className="text-xs font-bold text-sky-700 hover:text-sky-900">
            Mostrar mais ({rows.length - txLimit} restantes)
          </button>
        )}
        {tx.external_changes.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Alterações de stock fora de transações</h3>
            <TableWrap>
              <thead><tr><Th>Entre</Th><Th>Variação por denominação</Th></tr></thead>
              <tbody>
                {tx.external_changes.map((c, i) => (
                  <tr key={i}><Td mono>{dt(c.from)} → {dt(c.to)}</Td>
                    <Td mono>{Object.entries(c.delta).map(([d, v]) => `${denom(d)}: ${signed(v)}`).join('   ')}</Td></tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}
      </div>
    );
  };

  const renderAlerts = () => {
    const both = !!(data?.errors && data?.logerr);
    return (
      <div className="space-y-8">
        {data?.errors && renderErrorReport(data.errors, both ? 'Opos_ResultCodeExtended' : '', ['Admitido', 'Devolvido'])}
        {data?.logerr && renderErrorReport(data.logerr, both ? 'LogErr (Connector)' : 'LogErr (erros do Connector)', ['Depósito', 'Dispensa'])}
      </div>
    );
  };

  const renderErrorReport = (er: ErrorsReport, title: string, itemHeads: [string, string]) => {
    const maxDay = Math.max(1, ...er.warnings_per_day.map(d => d.count));
    return (
      <div className="space-y-5">
        {title && <h2 className="text-sm font-black text-slate-900 border-b border-slate-200 pb-1">{title}</h2>}
        <div className="space-y-2">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Por código ({er.total_events} eventos)</h3>
          <TableWrap>
            <thead><tr><Th>Código</Th><Th>Nível</Th><Th>Descrição</Th><Th right>Eventos</Th><Th>Primeiro</Th><Th>Último</Th></tr></thead>
            <tbody>
              {er.by_code.map((r, i) => (
                <tr key={i}>
                  <Td mono>{r.code || '—'}</Td>
                  <Td><Badge cls={r.level === 'OK' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : r.level === 'ERROR' ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200'}>{r.level}</Badge></Td>
                  <Td>{r.info || '—'}</Td><Td right mono>{r.count}</Td><Td mono>{dt(r.first)}</Td><Td mono>{dt(r.last)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
        {er.episodes.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Episódios (aviso → normal)</h3>
            <TableWrap>
              <thead><tr><Th>Código</Th><Th>Descrição</Th><Th right>Episódios</Th><Th right>Mediana</Th><Th right>Máximo</Th><Th right>Total em aviso</Th></tr></thead>
              <tbody>
                {er.episodes.map(e => (
                  <tr key={e.code}><Td mono>{e.code}</Td><Td>{e.info}</Td><Td right mono>{e.count}</Td>
                    <Td right mono>{e.median_s} s</Td><Td right mono>{e.max_s} s</Td><Td right mono>{(e.total_s / 3600).toFixed(1)} h</Td></tr>
                ))}
              </tbody>
            </TableWrap>
            {er.still_open.length > 0 && <p className="text-[11px] text-amber-700 font-semibold">Sem regresso a normal no fim do log: {er.still_open.join(', ')}</p>}
          </div>
        )}
        {er.accounting_mismatches.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Incompatibilidades de contabilidade (Descuadre)</h3>
            <TableWrap>
              <thead><tr><Th>Data/hora</Th><Th>Código</Th><Th right>Valor no log</Th></tr></thead>
              <tbody>
                {er.accounting_mismatches.slice().reverse().map((m, i) => (
                  <tr key={i}><Td mono>{dt(m.ts)}</Td><Td mono>{m.code}</Td>
                    <Td right mono>{m.value}</Td></tr>
                ))}
              </tbody>
            </TableWrap>
            <p className="text-[11px] text-slate-400">Valor tal como aparece no log (campo «Descuadre»); a unidade não vem indicada.</p>
          </div>
        )}
        {er.warnings_per_day.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Avisos por dia</h3>
            <div className="space-y-1">
              {er.warnings_per_day.map(d => (
                <div key={d.day} className="flex items-center gap-2 text-xs">
                  <span className="w-20 font-mono text-slate-500">{d.day.slice(8)}/{d.day.slice(5, 7)}</span>
                  <div className="flex-1 bg-slate-100 rounded h-3"><div className="bg-amber-500 h-3 rounded" style={{ width: `${(d.count / maxDay) * 100}%` }} /></div>
                  <span className="w-10 text-right font-mono">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Últimos eventos {er.events_truncated && <span className="text-slate-400 normal-case font-semibold">(só os mais recentes)</span>}</h3>
          <TableWrap>
            <thead><tr><Th>Data/hora</Th><Th>Código</Th><Th>Nível</Th><Th>Descrição</Th><Th>{itemHeads[0]}</Th><Th>{itemHeads[1]}</Th></tr></thead>
            <tbody>
              {er.events.slice(-100).reverse().map((e, i) => (
                <tr key={i}><Td mono>{dt(e.ts)}</Td><Td mono>{e.code || '—'}</Td><Td>{e.level}</Td><Td>{e.info || '—'}</Td><Td mono>{e.items_in || '—'}</Td><Td mono>{e.items_out || '—'}</Td></tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      </div>
    );
  };

  const levelLabel = (key: string) => (key === 'STACKER' ? 'Stacker' : denom(key));
  const levelBadge = (state: string) => (
    <Badge cls={STATE_STYLE[state] || 'bg-slate-50 text-slate-700 border-slate-200'}>{state}</Badge>
  );

  const renderLevels = () => {
    const op = data?.opos;
    if (!op) return null;
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Leituras de nível" value={op.reads} />
          <Card label="Primeira" value={<span className="text-sm">{dt(op.first)}</span>} />
          <Card label="Última" value={<span className="text-sm">{dt(op.last)}</span>} />
          <Card label="Mudanças de estado" value={op.levels.reduce((a, r) => a + r.changes, 0)} />
        </div>
        {op.levels.length === 0 ? <Empty text="Sem leituras de nível (ReadCashEmptyFullStatus) neste ficheiro." /> : (
          <TableWrap>
            <thead><tr><Th>Denominação</Th><Th>Última leitura</Th><Th right>Leituras</Th><Th>Estados observados</Th><Th right>Mudanças</Th></tr></thead>
            <tbody>
              {op.levels.map(r => (
                <tr key={r.key}>
                  <Td><span className="font-bold">{levelLabel(r.key)}</span></Td>
                  <Td>{levelBadge(r.current)}</Td>
                  <Td right mono>{r.reads}</Td>
                  <Td>
                    <span className="inline-flex flex-wrap gap-1">
                      {Object.entries(r.counts).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                        <span key={s} className="inline-flex items-center gap-1">{levelBadge(s)}<span className="font-mono text-slate-500">×{n}</span></span>
                      ))}
                    </span>
                  </Td>
                  <Td right mono>{r.changes}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <div className="space-y-2">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
            Mudanças de nível {op.transitions_truncated && <span className="text-slate-400 normal-case font-semibold">(só as mais recentes)</span>}
          </h3>
          {op.transitions.length === 0 ? <Empty text="O nível não mudou entre leituras." /> : (
            <TableWrap>
              <thead><tr><Th>Detetada em</Th><Th>Denominação</Th><Th>De</Th><Th>Para</Th></tr></thead>
              <tbody>
                {op.transitions.slice().reverse().map((t, i) => (
                  <tr key={i}><Td mono>{dt(t.ts)}</Td><Td>{levelLabel(t.key)}</Td><Td>{levelBadge(t.from)}</Td><Td>{levelBadge(t.to)}</Td></tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
        <p className="text-[11px] text-slate-400">
          O OPOS só lê os níveis durante operações. Cada mudança é a que foi detetada entre duas leituras consecutivas, não o instante exato,
          e não dá para medir há quanto tempo um nível esteve em aviso.
        </p>
      </div>
    );
  };

  const renderInvestigate = () => {
    if (!data) return null;
    const defaultDate = data.period.end ? data.period.end.slice(0, 10) : '';
    const rowTone = (s: InvEvent['severity']) => (s === 'error' ? 'bg-rose-50/60' : s === 'warning' ? 'bg-amber-50/60' : '');
    const relationText = (c: Investigation['coverage'][number]) => {
      if (c.relation === 'overlap') return `registos de ${c.start?.slice(11, 16)} a ${c.end?.slice(11, 16)} (dia ${c.start?.slice(8, 10)}/${c.start?.slice(5, 7)}${c.start?.slice(0, 10) !== c.end?.slice(0, 10) ? ' a ' + c.end?.slice(8, 10) + '/' + c.end?.slice(5, 7) : ''})`;
      if (c.relation === 'before') return `último registo em ${dt(c.end)}, antes do intervalo`;
      if (c.relation === 'after') return `primeiro registo em ${dt(c.start)}, depois do intervalo`;
      return 'sem datas';
    };
    return (
      <div className="space-y-5">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs text-slate-600">
            Indique quando ocorreu o problema. A app junta os eventos de todos os ficheiros carregados numa só linha do tempo, à volta dessa hora.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[11px] font-bold text-slate-600 flex flex-col gap-1">Dia
              <input type="date" value={invDate || defaultDate} onChange={(e) => setInvDate(e.target.value)}
                     className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono bg-white" />
            </label>
            <label className="text-[11px] font-bold text-slate-600 flex flex-col gap-1">Hora
              <input type="time" step={1} value={invTime} onChange={(e) => setInvTime(e.target.value)}
                     className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono bg-white" />
            </label>
            <label className="text-[11px] font-bold text-slate-600 flex flex-col gap-1">Minutos antes
              <input type="number" min={0} max={720} value={invBefore} onChange={(e) => setInvBefore(Math.max(0, Number(e.target.value) || 0))}
                     className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono w-24 bg-white" />
            </label>
            <label className="text-[11px] font-bold text-slate-600 flex flex-col gap-1">Minutos depois
              <input type="number" min={0} max={720} value={invAfter} onChange={(e) => setInvAfter(Math.max(0, Number(e.target.value) || 0))}
                     className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono w-24 bg-white" />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 pb-2 cursor-pointer" title="Consulta, só em leitura, as vendas (dbo.documentos) de uma base ZoneSoft ligada em «Conexão DB». Não se aplica a clientes com outro POS (ex.: WinREST).">
              <input type="checkbox" checked={invSales} onChange={(e) => setInvSales(e.target.checked)} />
              Cruzar com as vendas (só ZoneSoft) da base de dados ligada
            </label>
            <button onClick={investigate} disabled={invLoading}
                    className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition">
              {invLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}Investigar
            </button>
          </div>
          {invError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />{invError}
            </div>
          )}
        </div>

        {inv && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-800">
                {dt(inv.window.start)} → {inv.window.end.slice(11)}
                <span className="ml-2 font-semibold text-slate-500">
                  {inv.summary.events} evento(s) · <span className={inv.summary.errors ? 'text-rose-700' : ''}>{inv.summary.errors} erro(s)</span> · <span className={inv.summary.warnings ? 'text-amber-700' : ''}>{inv.summary.warnings} aviso(s)</span>
                </span>
              </div>
              <button onClick={copyInvestigation} className="text-xs font-bold text-sky-700 hover:text-sky-900">
                {invCopied ? 'Copiado!' : 'Copiar resumo'}
              </button>
            </div>

            {inv.sales && (
              inv.sales.available ? (
                <div className="bg-lime-50 border border-lime-200 rounded-xl px-3 py-2 text-[11px] text-lime-900 space-y-0.5">
                  <div className="font-bold">
                    Vendas no intervalo: {inv.sales.sales} · {inv.sales.matched} coincidem com cobranças do Cashlogy
                    {inv.sales.cash_codes.length > 0 && <span className="font-semibold"> · pagamento identificado como dinheiro (inferido): {inv.sales.cash_codes.join(', ')}</span>}
                  </div>
                  {inv.sales.note && <div className="opacity-80">{inv.sales.note}</div>}
                  {inv.sales.truncated && <div className="text-amber-800 font-semibold">Foram lidas só as primeiras 500 vendas do período; o cruzamento pode estar incompleto.</div>}
                </div>
              ) : (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold px-3 py-2 rounded-xl">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />Vendas não incluídas: {inv.sales.reason}
                </div>
              )
            )}

            <div className="space-y-2">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">O que se destaca</h3>
              {inv.highlights.length === 0 ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold px-3 py-2 rounded-xl">
                  <Check className="w-4 h-4" /> Nenhum erro ou aviso registado neste intervalo, nos ficheiros carregados.
                </div>
              ) : inv.highlights.map((h, i) => {
                const S = SEVERITY[h.severity];
                return (
                  <div key={i} className={`flex gap-2.5 border rounded-xl px-3 py-2 ${S.cls}`}>
                    <S.Icon className={`w-4 h-4 mt-0.5 shrink-0 ${S.icon}`} />
                    <div className="min-w-0">
                      <div className="text-xs font-bold">
                        <span className="opacity-70 font-semibold">{h.source_label} · </span>{h.title}{h.count > 1 ? ` ×${h.count}` : ''}
                      </div>
                      <div className="text-[11px] opacity-80 break-words">
                        {h.first.slice(11)}{h.count > 1 ? ` → ${h.last.slice(11)}` : ''}{h.detail ? ` — ${h.detail}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
              {inv.context.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 space-y-0.5">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Estado conhecido</div>
                  {inv.context.map((c, i) => <div key={i} className="text-[11px] text-slate-700">{c}</div>)}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Linha do tempo</h3>
              {inv.events.length === 0 ? <Empty text="Nenhum evento nos ficheiros carregados neste intervalo." /> : (
                <TableWrap>
                  <thead><tr><Th>Hora</Th><Th>Fonte</Th><Th>Evento</Th><Th>Detalhe</Th></tr></thead>
                  <tbody>
                    {inv.events.map((e, i) => (
                      <tr key={i} className={rowTone(e.severity)}>
                        <Td mono>{e.ts.slice(11)}</Td>
                        <Td><Badge cls={SOURCE_STYLE[e.source] || 'bg-slate-50 text-slate-700 border-slate-200'}>{e.source_label}</Badge></Td>
                        <Td><span className={e.severity === 'error' ? 'font-bold text-rose-800' : e.severity === 'warning' ? 'font-semibold text-amber-800' : e.severity === 'ok' ? 'text-emerald-700' : ''}>{e.title}</span></Td>
                        <Td>{e.detail || <span className="text-slate-300">—</span>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
              {inv.events_truncated && <p className="text-[11px] text-amber-700 font-semibold">Mostrados só os primeiros {inv.events.length} eventos; reduza o intervalo.</p>}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Ficheiros e o intervalo</h3>
              <div className="space-y-1">
                {inv.coverage.map(c => (
                  <div key={c.name} className="flex items-center justify-between gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                    <span className="font-bold truncate">{c.name}</span>
                    <span className={`shrink-0 ${c.relation === 'overlap' ? 'text-slate-500' : 'text-amber-700 font-semibold'}`}>{relationText(c)}</span>
                  </div>
                ))}
                {inv.ignored.length > 0 && (
                  <div className="text-[11px] text-slate-400">Não lidos ({inv.ignored.length}): {inv.ignored.map(f => f.name).join(', ')}</div>
                )}
              </div>
              {inv.quiet_sources.length > 0 && (
                <p className="text-[11px] text-slate-500">Sem eventos neste intervalo: {inv.quiet_sources.join(', ')}.</p>
              )}
              <p className="text-[11px] text-slate-400">
                Os ficheiros de eventos só registam quando algo acontece: um ficheiro cujo último registo é anterior ao intervalo não permite distinguir
                «nada aconteceu» de «ficheiro cortado». A linha do tempo mostra o que foi registado, sem indicar causas.
              </p>
            </div>
          </>
        )}
      </div>
    );
  };

  const resultBadge = (code: string) => {
    if (code === '0') return <Badge cls="bg-emerald-50 text-emerald-800 border-emerald-200">OK</Badge>;
    if (code === 'WR:CANCEL') return <Badge cls="bg-slate-100 text-slate-700 border-slate-300">Cancelada</Badge>;
    if (code.startsWith('ER:')) return <Badge cls="bg-rose-50 text-rose-800 border-rose-200">{code}</Badge>;
    return <Badge cls="bg-amber-50 text-amber-800 border-amber-200" title="Aviso do Connector: algum nível (nota/moeda) fora do limite">{code}</Badge>;
  };

  const renderConnector = () => {
    const tr = data?.tran;
    const cm = data?.com;
    const cc = cm?.crosscheck;
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {tr && <Card label="Entradas (LogTran)" value={eur(tr.summary.in_total)} sub={`${tr.summary.ins} movimentos`} />}
          {tr && <Card label="Saídas (LogTran)" value={eur(tr.summary.out_total)} sub={`${tr.summary.outs} movimentos`} />}
          {cm && <Card label="Cobranças" value={cm.summary.charges}
                       tone={cm.summary.not_matching ? 'text-rose-700' : 'text-slate-900'}
                       sub={`${cm.summary.cancelled} cancelada(s)${cm.summary.not_matching ? ` · ${cm.summary.not_matching} com valor que não bate` : ''}`} />}
          {cm && <Card label="Duração mediana" value={ms(cm.duration_ms.median)} sub={`máx. ${ms(cm.duration_ms.max)} (inclui o tempo do cliente)`} />}
          {cc && <Card label="LogCom × LogTran" value={`${cc.matched}/${cc.checked}`}
                       tone={cc.mismatches.length ? 'text-rose-700' : 'text-emerald-700'}
                       sub={cc.mismatches.length ? `${cc.mismatches.length} sem coincidência` : 'movimentos coincidem'} />}
          {cm && <Card label="Arranques do Connector" value={cm.starts.length}
                       tone={cm.starts.length > 1 ? 'text-amber-700' : 'text-slate-900'}
                       sub={cm.starts.length ? `v${cm.starts[0].version} · ${cm.starts.map(s => s.ts.slice(11, 16)).join(', ')}` : undefined} />}
        </div>

        {cm && (
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Cobranças e operações de backoffice</h3>
            {cm.operations.length === 0 ? <Empty text="Sem operações no LogCom." /> : (
              <TableWrap>
                <thead><tr><Th>Data/hora</Th><Th>Operação</Th><Th right>Pedido</Th><Th right>Introduzido</Th><Th right>Devolvido</Th><Th>Resultado</Th><Th>Movimentos</Th><Th right>Duração</Th></tr></thead>
                <tbody>
                  {cm.operations.slice().reverse().slice(0, 300).map((o, i) => (
                    <tr key={i} className={o.kind === 'charge' && !o.ok ? 'bg-rose-50/40' : ''}>
                      <Td mono>{dt(o.ts)}</Td>
                      <Td>{o.kind === 'charge' ? 'Cobrança' : o.cmd === 'A' ? 'Adicionar troco' : 'Backoffice'}</Td>
                      <Td right mono>{o.amount != null ? eur(o.amount) : '—'}</Td>
                      <Td right mono>{eur(o.introduced)}</Td>
                      <Td right mono>{eur(o.returned)}{o.kind === 'charge' && !o.ok && !o.cancelled ? <span className="text-rose-600"> (líq. {eur(o.net ?? 0)})</span> : null}</Td>
                      <Td>{resultBadge(o.result)}</Td>
                      <Td>
                        {o.tran_match == null ? <span className="text-slate-300">—</span>
                          : o.tran_match ? <Badge cls="bg-emerald-50 text-emerald-800 border-emerald-200">coincide</Badge>
                            : <Badge cls="bg-rose-50 text-rose-800 border-rose-200" title="Entrou / saiu segundo o LogTran">difere: {eur(o.tran_in ?? 0)} / {eur(o.tran_out ?? 0)}</Badge>}
                      </Td>
                      <Td right mono>{ms(o.duration_ms)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}

        {cm && cm.errors.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Respostas de erro do Connector</h3>
            <TableWrap>
              <thead><tr><Th>Data/hora</Th><Th>Comando</Th><Th>Código</Th></tr></thead>
              <tbody>{cm.errors.slice().reverse().map((e, i) => (<tr key={i}><Td mono>{dt(e.ts)}</Td><Td mono>#{e.cmd}#</Td><Td>{resultBadge(e.code)}</Td></tr>))}</tbody>
            </TableWrap>
          </div>
        )}

        {tr && (
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              Movimentos de dinheiro {tr.movements_truncated && <span className="text-slate-400 normal-case font-semibold">(só os mais recentes)</span>}
            </h3>
            <TableWrap>
              <thead><tr><Th>Data/hora</Th><Th>Sentido</Th><Th right>Valor</Th><Th>Denominações</Th></tr></thead>
              <tbody>
                {tr.movements.slice().reverse().slice(0, 300).map((m, i) => (
                  <tr key={i}>
                    <Td mono>{dt(m.ts)}</Td>
                    <Td><span className="inline-flex items-center gap-1 font-semibold">
                      {m.dir === 'in' ? <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowUpFromLine className="w-3.5 h-3.5 text-indigo-600" />}
                      {m.dir === 'in' ? 'Entrada' : 'Saída'}</span></Td>
                    <Td right mono>{eur(m.amount)}</Td>
                    <Td mono>{countsText(m.counts)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            {tr.backoffice.length > 0 && (
              <p className="text-[11px] text-slate-500">
                Backoffice: {tr.backoffice.map(b => `${b.action} ${b.dir === 'in' ? 'entrada' : 'saída'} ${eur(b.amount)} (${b.ts.slice(11, 16)})`).join(' · ')}
              </p>
            )}
          </div>
        )}
        <p className="text-[11px] text-slate-400">
          Cobrança = introduzido − devolvido tem de igualar o valor pedido. «Movimentos» compara o que o Connector respondeu com as entradas e saídas
          registadas no LogTran na mesma janela de tempo (só quando os dois ficheiros do mesmo dia estão presentes).
        </p>
      </div>
    );
  };

  const renderOperator = () => {
    const us = data?.usr;
    if (!us) return null;
    const s = us.summary;
    const cc = us.crosscheck;
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Cobranças" value={s.charges} sub={`${s.cancels} cancelada(s) no ecrã`} />
          <Card label="Sessões de backoffice" value={s.backoffice_sessions} />
          <Card label="Mensagens ao operador" value={s.messages} />
          <Card label="Arranques do POS" value={s.starts} tone={s.starts > 1 ? 'text-amber-700' : 'text-slate-900'} />
          <Card label="Troco devolvido" value={eur(s.returned)} />
          <Card label="Retirado" value={eur(s.withdrawn)} sub={s.to_stacker ? `+ ${eur(s.to_stacker)} para o stacker` : undefined} />
          {cc && <Card label="Operador × LogTran" value={`${cc.matched}/${cc.checked}`}
                       tone={cc.mismatches.length ? 'text-rose-700' : 'text-emerald-700'}
                       sub={cc.mismatches.length ? `${cc.mismatches.length} sem saída correspondente` : 'denominações coincidem'} />}
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Ações do operador</h3>
          {us.actions.length === 0 ? <Empty text="Sem ações no LogUsr." /> : (
            <TableWrap>
              <thead><tr><Th>Data/hora</Th><Th>Ação</Th><Th>Detalhe</Th><Th right>Valor</Th><Th>LogTran</Th></tr></thead>
              <tbody>
                {us.actions.slice().reverse().slice(0, 300).map((a, i) => (
                  <tr key={i} className={a.tran_match === false ? 'bg-rose-50/40' : ''}>
                    <Td mono>{dt(a.ts)}</Td>
                    <Td><span className={a.kind === 'message' ? 'font-bold text-amber-800' : 'font-semibold'}>{a.label}</span></Td>
                    <Td mono>{a.items ? countsText(a.items) : (a.detail || '—')}</Td>
                    <Td right mono>{a.amount != null ? eur(a.amount) : '—'}</Td>
                    <Td>
                      {a.tran_match === true && <Badge cls="bg-emerald-50 text-emerald-800 border-emerald-200">coincide</Badge>}
                      {a.tran_match === false && <Badge cls="bg-rose-50 text-rose-800 border-rose-200">sem saída</Badge>}
                      {a.tran_match == null && (a.to_stacker
                        ? <span className="text-[11px] text-slate-400" title="O LogTran não regista saída para retiradas com destino stacker">stacker</span>
                        : <span className="text-slate-300">—</span>)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
        <p className="text-[11px] text-slate-400">
          Cada devolução ou retirada do operador é comparada com uma saída do LogTran, com as mesmas denominações, até 20 s depois (só com os dois
          ficheiros do mesmo dia). As mensagens mostram o texto apresentado ao operador, sem juízo sobre a causa.
        </p>
      </div>
    );
  };

  const renderTimes = () => {
    const ti = data?.times;
    if (!ti) return null;
    const block = (label: string, k: TimingKind) => (
      <div className="space-y-2">
        <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">{label}</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card label="Operações" value={k.count} />
          <Card label="Mediana" value={ms(k.median)} sub={`média ${ms(k.avg)}`} />
          <Card label="P95" value={ms(k.p95)} />
          <Card label="Máximo" value={ms(k.max)} />
          <Card label={`> 3× mediana`} value={k.slow_count} sub={k.slow_threshold ? `limiar ${ms(k.slow_threshold)}` : undefined} />
        </div>
        {k.slowest.length > 0 && (
          <TableWrap>
            <thead><tr><Th>Data/hora</Th><Th right>Total</Th><Th>Fases mais demoradas</Th></tr></thead>
            <tbody>
              {k.slowest.map((s, i) => (
                <tr key={i}><Td mono>{dt(s.ts)}</Td><Td right mono>{ms(s.total_ms)}</Td>
                  <Td mono>{Object.entries(s.phases).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, v]) => `${p}: ${ms(v)}`).join('   ')}</Td></tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    );
    return (
      <div className="space-y-6">
        {block('Depósitos', ti.deposit)}
        {block('Dispensas', ti.dispense)}
        <p className="text-[11px] text-slate-400">
          A duração de uma operação depende do número de notas/moedas processadas; as fases (t11, t12c, t24c…) mostram onde o tempo foi gasto.
          {ti.incomplete > 0 && ` ${ti.incomplete} operação(ões) sem total no log foram ignoradas.`}
        </p>
      </div>
    );
  };

  const renderPayments = () => {
    const p = data?.payments;
    if (!p) return null;
    const bad = Object.entries(p.by_result).filter(([r]) => r !== 'ok').reduce((a, [, c]) => a + c, 0);
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card label="Pagamentos H500" value={p.total} />
          <Card label="Sem 'ok'" value={bad} tone={bad ? 'text-amber-700' : 'text-emerald-700'}
                sub={Object.entries(p.by_result).map(([r, c]) => `${r}: ${c}`).join(' · ')} />
          <Card label="Duração mediana" value={ms(p.duration_ms.median)} sub={`máx. ${ms(p.duration_ms.max)}`} />
          <Card label="Arranques do Gestor" value={p.app_starts} />
          <Card label="Erros a ler Accounting" value={p.accounting_read_errors} tone={p.accounting_read_errors ? 'text-amber-700' : 'text-slate-900'}
                sub={p.accounting_path ? <span className="break-all">{p.accounting_path}</span> : undefined} />
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Pagamentos sem 'ok'</h3>
          {p.warnings.length === 0 ? <Empty text="Todos os pagamentos terminaram em 'ok'." /> : (
            <TableWrap>
              <thead><tr><Th>Data/hora</Th><Th>Resultado</Th><Th right>Duração</Th><Th right>APagar</Th></tr></thead>
              <tbody>
                {p.warnings.slice().reverse().map((w, i) => (
                  <tr key={i}><Td mono>{dt(w.ts)}</Td><Td><Badge cls="bg-amber-50 text-amber-800 border-amber-200">{w.result}</Badge></Td>
                    <Td right mono>{ms(w.duration_ms)}</Td><Td right mono>{w.apagar ?? '—'}</Td></tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      </div>
    );
  };

  const DEVICE_LABELS: [string, string][] = [
    ['serial', 'Nº de série'], ['manufactured', 'Data de fabrico'], ['mechanical_rev', 'Revisão mecânica'],
    ['firmware', 'Firmware (geral)'], ['h500_firmware', 'Firmware H500'], ['dll_name', 'DLL'], ['dll_version', 'Versão da DLL'],
    ['ip', 'IP'], ['mac', 'MAC'], ['teamviewer', 'ID TeamViewer'], ['windows', 'Windows'], ['com', 'Porta COM'],
    ['dispense_algorithm', 'Algoritmo de dispensa'],
  ];
  const renderDevice = () => {
    if (!data) return null;
    const rows = DEVICE_LABELS.filter(([k]) => data.device[k]);
    const hist = data.versions?.history || [];
    return (
      <div className="space-y-5">
        <TableWrap>
          <tbody>{rows.map(([k, label]) => (<tr key={k}><Td><span className="font-bold text-slate-600">{label}</span></Td><Td mono>{data.device[k]}</Td></tr>))}</tbody>
        </TableWrap>
        {hist.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Histórico de versões</h3>
            <TableWrap>
              <thead><tr><Th>Data/hora</Th><Th>Tipo</Th><Th>Alterações</Th></tr></thead>
              <tbody>
                {hist.map((h, i) => (
                  <tr key={i}><Td mono>{dt(h.ts)}</Td><Td>{h.kind === 'Initial' ? 'Registo inicial' : 'Alteração'}</Td>
                    <Td mono>
                      {h.kind === 'Initial'
                        ? [h.dll_version && `DLL ${h.dll_version}`, h.h500_firmware && `H500 ${h.h500_firmware}`].filter(Boolean).join(' · ') || '—'
                        : h.changes.length ? h.changes.map(c => `${c.label}: ${c.from} → ${c.to}`).join(' · ') : `Secções: ${h.sections.join(', ') || '—'}`}
                    </Td></tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className={`bg-white w-full max-w-5xl max-h-[92vh] ${data ? 'h-[92vh]' : ''} rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200`}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-600 text-white rounded-xl shadow-md shadow-sky-600/20"><ScrollText className="w-5 h-5" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Análise de Logs Cashlogy
                <span className="text-[10px] font-mono uppercase bg-sky-100 text-sky-800 border border-sky-200 px-2 py-0.5 rounded-full font-bold">.log</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">Depósitos, dispensas, reconciliação de stock, alertas do hardware, tempos e pagamentos</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        {data && (
          <div className="px-6 pt-3 border-b border-slate-200 flex items-center gap-1 overflow-x-auto">
            {tabs.filter(t => t.show).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-xs font-bold border-b-2 -mb-px transition whitespace-nowrap ${tab === t.id ? 'border-sky-600 text-sky-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {t.label}{t.badge ? <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5">{t.badge}</span> : null}
              </button>
            ))}
            <button onClick={() => { setTab('summary'); analyze([]); }} className="ml-auto text-xs font-bold text-rose-600 hover:text-rose-800 pb-2 whitespace-nowrap">
              Limpar
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <label
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
            className={`flex ${data ? 'flex-row py-3 px-4 gap-3' : 'flex-col p-12 gap-3'} items-center justify-center border-2 border-dashed rounded-2xl cursor-pointer transition group ${isDragging ? 'border-sky-500 bg-sky-50' : 'border-slate-300 hover:border-sky-500 hover:bg-sky-50/50'}`}
          >
            <div className="p-2.5 bg-sky-50 group-hover:bg-sky-100 rounded-xl text-sky-600 transition"><Upload className={data ? 'w-4 h-4' : 'w-8 h-8'} /></div>
            <div className={data ? 'text-left' : 'text-center'}>
              <span className="text-sm font-bold text-slate-800 block">{data ? 'Adicionar mais ficheiros' : 'Arraste os logs do Cashlogy para aqui ou clique para escolher'}</span>
              {!data && (
                <span className="text-xs text-slate-400 block mt-0.5">
                  Transactions_Cashlogy · Process_Times · Opos_ResultCodeExtended · Process_GestorAdminDev · VersionsHistory
                </span>
              )}
            </div>
            <input type="file" multiple accept=".log,.txt" className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>

          {errorMsg && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-3 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />{errorMsg}
            </div>
          )}

          {isAnalyzing && (
            <div className="flex items-center justify-center py-10 text-slate-400 text-xs gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-sky-600" /> A analisar {files.length} ficheiro(s)...
            </div>
          )}

          {!isAnalyzing && data && data.files.length === 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold px-3 py-2 rounded-xl">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>Nenhum dos ficheiros é de um tipo suportado.
                {data.ignored.map(f => <div key={f.name} className="font-normal opacity-80">{f.name} — {f.reason}</div>)}
              </div>
            </div>
          )}

          {!isAnalyzing && data && data.files.length > 0 && (
            <>
              {tab === 'summary' && renderSummary()}
              {tab === 'investigate' && renderInvestigate()}
              {tab === 'transactions' && renderTransactions()}
              {tab === 'alerts' && renderAlerts()}
              {tab === 'levels' && renderLevels()}
              {tab === 'connector' && renderConnector()}
              {tab === 'operator' && renderOperator()}
              {tab === 'times' && renderTimes()}
              {tab === 'payments' && renderPayments()}
              {tab === 'device' && renderDevice()}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
