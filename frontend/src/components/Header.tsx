import React from 'react';
import {
  Database, RefreshCw, Palette, ClipboardCheck, LayoutGrid, Sparkles,
  Languages, Users, ScrollText, HardDrive, Archive, Utensils,
  Package, Wrench, ChevronRight, Settings, History, Sun, Moon
} from 'lucide-react';

export type ActiveTabSection = 'artigos' | 'clientes' | 'mesas' | 'ementa' | 'ferramentas';

interface HeaderProps {
  activeSection: ActiveTabSection;
  onSelectSection: (section: ActiveTabSection) => void;
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
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeSection,
  onSelectSection,
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
  isRefreshing = false,
  theme = 'light',
  onToggleTheme
}) => {
  const sections = [
    { id: 'artigos' as ActiveTabSection, label: 'Artigos', icon: Package, count: null },
    { id: 'clientes' as ActiveTabSection, label: 'Clientes & NIF', icon: Users, count: null },
    { id: 'mesas' as ActiveTabSection, label: 'Mesas & POS', icon: Utensils, count: null },
    { id: 'ementa' as ActiveTabSection, label: 'Ementa & Tradução', icon: Languages, count: null },
    { id: 'ferramentas' as ActiveTabSection, label: 'Ferramentas & Sistema', icon: Wrench, count: null },
  ];

  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800/90 flex flex-col shadow-xl z-20">
      {/* Level 1: Brand, Section Tabs & Status Badges */}
      <div className="px-6 py-2.5 flex flex-col lg:flex-row justify-between items-center gap-3 border-b border-slate-800/60">
        
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-indigo-600 to-indigo-700 p-2 rounded-xl shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              MassEdit
              <span className="text-slate-400 text-[10px] px-1.5 py-0.5 rounded bg-slate-800/40 border border-slate-700/50 font-mono font-medium">
                POS v1.0.1
              </span>
            </h1>
          </div>
        </div>

        {/* Primary Section Tabs */}
        <nav className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-2xl border border-slate-800/80 shadow-inner overflow-x-auto max-w-full">
          {sections.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => onSelectSection(sec.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50 ring-1 ring-indigo-400/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Status Badges & Theme Toggle */}
        <div className="flex items-center gap-2">
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition cursor-pointer shadow-xs ${
                theme === 'light'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title={theme === 'light' ? 'Mudar para Modo Escuro' : 'Mudar para Modo Claro'}
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-700" />
                  <span>Modo Escuro</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Modo Claro</span>
                </>
              )}
            </button>
          )}

          <div
            className={`flex items-center gap-2 px-2.5 py-1 rounded-xl text-[11px] font-semibold border backdrop-blur-md transition ${
              isConnected && !useMock
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.12)]'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.12)]'
            }`}
            title={connectionMsg}
          >
            <span className={`w-2 h-2 rounded-full ${isConnected && !useMock ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]' : 'bg-amber-400'}`} />
            {isConnected && !useMock ? 'SQL Server' : 'Modo Demo'}
          </div>

          {zsSyncStatus && zsSyncStatus.available && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold border backdrop-blur-md transition ${
                zsSyncStatus.pending
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
              title={zsSyncStatus.pending
                ? 'Sincronização pendente no ZoneSoft'
                : 'Todas as alterações sincronizadas no ZoneSoft'}
            >
              <RefreshCw className={`w-3 h-3 ${zsSyncStatus.pending ? 'animate-spin text-amber-400' : 'text-emerald-400'}`} />
              {zsSyncStatus.pending ? 'ZoneSoft Syncing' : 'ZoneSoft OK'}
            </div>
          )}
        </div>
      </div>

      {/* Level 2: Contextual Section Sub-Toolbar */}
      <div className="px-6 py-2 bg-slate-950/40 flex items-center justify-between gap-3 text-xs flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            Ferramentas da Secção <ChevronRight className="w-3 h-3 text-slate-600" />
          </span>

          {/* Contextual Action Buttons depending on Active Section */}
          {activeSection === 'artigos' && (
            <>
              <button
                onClick={onRefresh}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
                title="Atualizar lista de artigos da base de dados"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                Atualizar Artigos
              </button>

              <button
                onClick={onOpenFamilyColors}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-xl border border-slate-700 text-xs font-semibold transition cursor-pointer shadow-xs"
                title="Gestor de Cores das Famílias"
              >
                <Palette className="w-3.5 h-3.5 text-slate-400" />
                Cores das Famílias
              </button>

              <button
                onClick={onOpenPosLayout}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-xl border border-slate-700 text-xs font-semibold transition cursor-pointer shadow-xs"
                title="Pré-visualização e Reordenação dos Botões do POS (ZSRest)"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                Botões do POS
              </button>

              <button
                onClick={onOpenDeadProducts}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-xl border border-slate-700 text-xs font-semibold transition cursor-pointer shadow-xs"
                title="Inativação em Lote de Artigos Mortos (Sem Vendas)"
              >
                <Archive className="w-3.5 h-3.5 text-slate-400" />
                Artigos Mortos (Sem Vendas)
              </button>
            </>
          )}

          {activeSection === 'clientes' && (
            <>
              <button
                onClick={onOpenCustomers}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1 rounded-xl text-xs font-semibold transition shadow-xs cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                Auditoria de Clientes & Consulta NIF.pt
              </button>
            </>
          )}

          {activeSection === 'mesas' && (
            <>
              {onOpenTables && (
                <button
                  onClick={onOpenTables}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1 rounded-xl text-xs font-semibold transition shadow-xs cursor-pointer"
                  title="Gestão de Nomes de Mesas (dbo.mapamesas -> nomeobjecto & dbo.mesas)"
                >
                  <Utensils className="w-3.5 h-3.5" />
                  Gestão de Mesas (mapamesas.nomeobjecto)
                </button>
              )}

              <button
                onClick={onOpenPosLayout}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-xl border border-slate-700 text-xs font-semibold transition cursor-pointer shadow-xs"
                title="Reordenação visual dos Botões do POS (ZSRest)"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                Layout Botões POS
              </button>

              <button
                onClick={onOpenZsTheme}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-xl border border-slate-700 text-xs font-semibold transition cursor-pointer shadow-xs"
                title="Editor de Temas ZSRest (.zstheme)"
              >
                <Palette className="w-3.5 h-3.5 text-slate-400" />
                Editor de Temas ZSRest
              </button>
            </>
          )}

          {activeSection === 'ementa' && (
            <>
              <button
                onClick={onOpenEmentaDigital}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1 rounded-xl text-xs font-semibold transition shadow-xs cursor-pointer"
                title="Assistente de Tradução Multilíngue (ZoneSoft POS & Ementa Digital)"
              >
                <Languages className="w-3.5 h-3.5" />
                Traduções Multilíngue
              </button>

              <button
                onClick={onOpenMenuImport}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-xl border border-slate-700 text-xs font-semibold transition cursor-pointer shadow-xs"
                title="Importar Ementas (PDF, Fotos, Texto) com Assistente IA"
              >
                <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                Importar Ementa (PDF / Foto)
              </button>
            </>
          )}

          {activeSection === 'ferramentas' && (
            <>
              <button
                onClick={onOpenDataQuality}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-xl text-xs font-semibold transition shadow-xs cursor-pointer"
                title="Relatório de Problemas e Qualidade dos Dados"
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                Relatório de Qualidade
              </button>

              <button
                onClick={onOpenCashlogyLogs}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-xl border border-slate-700 text-xs font-semibold transition cursor-pointer shadow-xs"
                title="Análise de logs do Cashlogy"
              >
                <ScrollText className="w-3.5 h-3.5 text-slate-400" />
                Logs Cashlogy
              </button>

              <button
                onClick={onOpenHousekeeping}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-xl border border-slate-700 text-xs font-semibold transition cursor-pointer shadow-xs"
                title="Manutenção do SQL Server (Shrink Log e Otimização de Índices)"
              >
                <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                Manutenção SQL Server
              </button>

              <button
                onClick={onOpenBackups}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-xl border border-slate-700 text-xs font-semibold transition cursor-pointer shadow-xs"
              >
                <History className="w-3.5 h-3.5 text-slate-400" />
                Backups & Undo
              </button>
            </>
          )}
        </div>

        {/* Global Connection Config Action Button */}
        <button
          onClick={onOpenConfig}
          className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-xl shadow-md shadow-indigo-950/50 transition hover:scale-[1.02] active:scale-[0.98] ring-1 ring-indigo-400/30"
        >
          <Settings className="w-3.5 h-3.5" />
          Conexão SQL
        </button>
      </div>
    </header>
  );
};
