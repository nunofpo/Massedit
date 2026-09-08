import React from 'react';
import { Database, ShieldCheck, History, Settings, RefreshCw, Palette } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  useMock: boolean;
  connectionMsg: string;
  onOpenConfig: () => void;
  onOpenBackups: () => void;
  onOpenFamilyColors: () => void;
  onRefresh: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isConnected,
  useMock,
  connectionMsg,
  onOpenConfig,
  onOpenBackups,
  onOpenFamilyColors,
  onRefresh
}) => {
  return (
    <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
      <div className="flex items-center gap-3">
        <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-600/30">
          <Database className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
            MassEdit <span className="text-indigo-400 text-xs px-2 py-0.5 rounded-md bg-indigo-950 border border-indigo-700 font-mono">POS v1.0</span>
          </h1>
          <p className="text-xs text-slate-400">Edição em Massa Segura • Validação de Vendas • Sincronização Cloud</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {/* Status Badge */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
            isConnected && !useMock
              ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
              : 'bg-amber-950/60 border-amber-700/60 text-amber-300'
          }`}
          title={connectionMsg}
        >
          <span className={`w-2 h-2 rounded-full ${isConnected && !useMock ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          {isConnected && !useMock ? 'SQL Server Ligado' : 'Modo Demo / Mock Interativo'}
        </div>

        {/* Action Buttons */}
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-600 transition"
          title="Atualizar lista de artigos"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar
        </button>

        <button
          onClick={onOpenFamilyColors}
          className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-500/40 transition"
          title="Gestor de Cores das Famílias"
        >
          <Palette className="w-3.5 h-3.5 text-amber-400" />
          Cores das Famílias
        </button>

        <button
          onClick={onOpenBackups}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-600 transition"
        >
          <History className="w-3.5 h-3.5 text-indigo-400" />
          Backups & Undo
        </button>

        <button
          onClick={onOpenConfig}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg shadow-md transition"
        >
          <Settings className="w-3.5 h-3.5" />
          Conexão DB
        </button>
      </div>
    </header>
  );
};
