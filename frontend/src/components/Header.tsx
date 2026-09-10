import React from 'react';
import { Database, ShieldCheck, History, Settings, RefreshCw, Palette, ClipboardCheck, LayoutGrid, QrCode, Sparkles } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  useMock: boolean;
  connectionMsg: string;
  onOpenConfig: () => void;
  onOpenBackups: () => void;
  onOpenFamilyColors: () => void;
  onOpenDataQuality: () => void;
  onOpenPosLayout: () => void;
  onOpenEmentaDigital: () => void;
  onOpenMenuImport: () => void;
  onRefresh: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isConnected,
  useMock,
  connectionMsg,
  onOpenConfig,
  onOpenBackups,
  onOpenFamilyColors,
  onOpenDataQuality,
  onOpenPosLayout,
  onOpenEmentaDigital,
  onOpenMenuImport,
  onRefresh
}) => {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="bg-indigo-600 p-2.5 rounded-xl shadow-md shadow-indigo-600/20">
          <Database className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            MassEdit <span className="text-indigo-700 text-xs px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 font-mono font-bold">POS v1.0</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium">Edição em Massa Segura • Validação de Vendas • Sincronização Cloud</p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Status Badge */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border shadow-sm ${
            isConnected && !useMock
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
          title={connectionMsg}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${isConnected && !useMock ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          {isConnected && !useMock ? 'SQL Server Ligado' : 'Modo Demo / Mock Interativo'}
        </div>

        {/* Action Buttons */}
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 transition shadow-sm"
          title="Atualizar lista de artigos"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
          Atualizar
        </button>

        <button
          onClick={onOpenFamilyColors}
          className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-200 transition shadow-sm"
          title="Gestor de Cores das Famílias"
        >
          <Palette className="w-3.5 h-3.5 text-amber-600" />
          Cores das Famílias
        </button>

        <button
          onClick={onOpenPosLayout}
          className="flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 text-sky-900 text-xs font-bold px-3 py-1.5 rounded-lg border border-sky-200 transition shadow-sm"
          title="Pré-visualização e Reordenação dos Botões do POS (ZSRest)"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-sky-600" />
          Botões POS
        </button>

        <button
          onClick={onOpenEmentaDigital}
          className="flex items-center gap-1.5 bg-teal-50 hover:bg-teal-100 text-teal-900 text-xs font-bold px-3 py-1.5 rounded-lg border border-teal-200 transition shadow-sm"
          title="Editor da Ementa Digital (QR Code ZoneSoft)"
        >
          <QrCode className="w-3.5 h-3.5 text-teal-600" />
          Ementa Digital
        </button>

        <button
          onClick={onOpenMenuImport}
          className="flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 text-violet-900 text-xs font-bold px-3 py-1.5 rounded-lg border border-violet-200 transition shadow-sm"
          title="Importar Ementas (PDF, Fotos, Texto) com Assistente de Mapeamento"
        >
          <Sparkles className="w-3.5 h-3.5 text-violet-600" />
          Importar Ementa
        </button>

        <button
          onClick={onOpenDataQuality}
          className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 text-xs font-bold px-3 py-1.5 rounded-lg border border-indigo-200 transition shadow-sm"
          title="Relatório de Problemas e Qualidade dos Dados"
        >
          <ClipboardCheck className="w-3.5 h-3.5 text-indigo-600" />
          Relatório
        </button>

        <button
          onClick={onOpenBackups}
          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 transition shadow-sm"
        >
          <History className="w-3.5 h-3.5 text-indigo-600" />
          Backups & Undo
        </button>

        <button
          onClick={onOpenConfig}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm transition"
        >
          <Settings className="w-3.5 h-3.5" />
          Conexão DB
        </button>
      </div>
    </header>
  );
};
