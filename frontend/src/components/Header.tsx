import React from 'react';
import { Database, ShieldCheck, History, Settings, RefreshCw, Palette, ClipboardCheck, LayoutGrid, Sparkles, Languages, Users, MapPin, ScrollText, HardDrive, Archive, Utensils } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  useMock: boolean;
  connectionMsg: string;
  zsSyncStatus?: { available: boolean; pending: boolean } | null;
  onOpenConfig: () => void;
  onOpenBackups: () => void;
  onOpenFamilyColors: () => void;
  onOpenDataQuality: () => void;
  onOpenPosLayout: () => void;
  onOpenEmentaDigital: () => void;
  onOpenZsTheme: () => void;
  onOpenCashlogyLogs: () => void;
  onOpenMenuImport: () => void;
  onOpenCustomers: () => void;
  onOpenTables?: () => void;
  onOpenHousekeeping: () => void;
  onOpenDeadProducts: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  isConnected,
  useMock,
  connectionMsg,
  zsSyncStatus,
  onOpenConfig,
  onOpenBackups,
  onOpenFamilyColors,
  onOpenDataQuality,
  onOpenPosLayout,
  onOpenEmentaDigital,
  onOpenZsTheme,
  onOpenCashlogyLogs,
  onOpenMenuImport,
  onOpenCustomers,
  onOpenTables,
  onOpenHousekeeping,
  onOpenDeadProducts,
  onRefresh,
  isRefreshing = false
}) => {
  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800/90 px-6 py-3 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-xl z-20">
      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-tr from-indigo-600 to-violet-600 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
          <Database className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            MassEdit
            <span className="text-indigo-400 text-xs px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/30 font-mono font-semibold shadow-inner">
              POS v1.0.1
            </span>
          </h1>
          <p className="text-xs text-slate-400 font-medium">Edição em Massa Segura • Validação de Vendas • Sincronização Cloud</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-end">
        {/* Connection Status Badge */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border backdrop-blur-md transition ${
            isConnected && !useMock
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
          }`}
          title={connectionMsg}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${isConnected && !useMock ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]' : 'bg-amber-400'}`} />
          {isConnected && !useMock ? 'SQL Server Ligado' : 'Modo Demo / Mock Interativo'}
        </div>

        {/* ZoneSoft Cloud Sync Status Badge */}
        {zsSyncStatus && zsSyncStatus.available && (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border backdrop-blur-md transition ${
              zsSyncStatus.pending
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}
            title={zsSyncStatus.pending
              ? 'Há alterações a aguardar sincronização com a cloud do ZoneSoft (dbo.fullsync)'
              : 'Todas as alterações já foram sincronizadas com a cloud do ZoneSoft'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${zsSyncStatus.pending ? 'animate-spin text-amber-400' : 'text-emerald-400'}`} />
            {zsSyncStatus.pending ? 'ZoneSoft: a sincronizar...' : 'ZoneSoft: sincronizado'}
          </div>
        )}

        {/* Action Buttons */}
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-xs font-medium px-3 py-1.5 rounded-xl border border-slate-700/80 transition hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          title="Atualizar lista de artigos"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          Atualizar
        </button>

        <button
          onClick={onOpenFamilyColors}
          className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-amber-500/25 transition hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          title="Gestor de Cores das Famílias"
        >
          <Palette className="w-3.5 h-3.5 text-amber-400" />
          Cores Famílias
        </button>

        <button
          onClick={onOpenPosLayout}
          className="flex items-center gap-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-sky-500/25 transition hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          title="Pré-visualização e Reordenação dos Botões do POS (ZSRest)"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-sky-400" />
          Botões POS
        </button>

        <button
          onClick={onOpenEmentaDigital}
          className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-indigo-500/25 transition hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          title="Assistente de Tradução Multilíngue (ZoneSoft POS & Ementa Digital)"
        >
          <Languages className="w-3.5 h-3.5 text-indigo-400" />
          Traduções
        </button>

        <button
          onClick={onOpenMenuImport}
          className="flex items-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-purple-500/25 transition hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          title="Importar Ementas (PDF, Fotos, Texto) com Assistente de Mapeamento"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          Importar Ementa
        </button>

        <button
          onClick={onOpenZsTheme}
          className="flex items-center gap-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-violet-500/25 transition hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          title="Editor de Temas ZSRest (.zstheme)"
        >
          <Palette className="w-3.5 h-3.5 text-violet-400" />
          Temas ZSRest
        </button>

        <button
          onClick={onOpenCashlogyLogs}
          className="flex items-center gap-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-sky-500/25 transition hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          title="Análise de logs do Cashlogy — transações, stock, alertas, tempos e pagamentos"
        >
          <ScrollText className="w-3.5 h-3.5 text-sky-400" />
          Logs Cashlogy
        </button>

        <button
          onClick={onOpenCustomers}
          className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-emerald-500/25 transition hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          title="Auditoria de Clientes & Consulta NIF.pt"
        >
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          Clientes & NIF
        </button>

        {onOpenTables && (
          <button
            onClick={onOpenTables}
            className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-emerald-500/25 transition hover:scale-[1.02] active:scale-[0.98] shadow-sm"
            title="Gestão e Alteração de Nomes de Mesas / Salas (ZoneSoft POS)"
          >
            <Utensils className="w-3.5 h-3.5 text-emerald-400" />
            Mesas POS
          </button>
        )}

        <button
          onClick={onOpenDeadProducts}
          className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-amber-500/25 transition hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          title="Inativação em Lote de Artigos Mortos (Sem Vendas)"
        >
          <Archive className="w-3.5 h-3.5 text-amber-400" />
          Artigos Mortos
        </button>

        <button
          onClick={onOpenHousekeeping}
          className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-700/80 transition hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          title="Manutenção do SQL Server — Redução de Log (Shrink) e Otimização de Índices"
        >
          <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
          Manutenção BD
        </button>

        <button
          onClick={onOpenDataQuality}
          className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-indigo-500/25 transition hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          title="Relatório de Problemas e Qualidade dos Dados"
        >
          <ClipboardCheck className="w-3.5 h-3.5 text-indigo-400" />
          Relatório
        </button>

        <button
          onClick={onOpenBackups}
          className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-700/80 transition hover:scale-[1.02] active:scale-[0.98] shadow-sm"
        >
          <History className="w-3.5 h-3.5 text-indigo-400" />
          Backups & Undo
        </button>

        <button
          onClick={onOpenConfig}
          className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-lg shadow-indigo-950/50 transition hover:scale-[1.02] active:scale-[0.98] ring-1 ring-indigo-400/30"
        >
          <Settings className="w-3.5 h-3.5" />
          Conexão DB
        </button>
      </div>
    </header>
  );
};
