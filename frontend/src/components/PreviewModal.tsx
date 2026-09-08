import React from 'react';
import { X, ShieldCheck, ShieldAlert, CheckCircle2, AlertOctagon, FileCheck, ArrowRight } from 'lucide-react';
import { BulkEditPreviewResponse } from '../types';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmApply: () => void;
  previewData: BulkEditPreviewResponse | null;
  isApplying: boolean;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
  isOpen,
  onClose,
  onConfirmApply,
  previewData,
  isApplying
}) => {
  if (!isOpen || !previewData) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Modal Header */}
        <div className="bg-slate-800/90 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-indigo-400" />
              Simulação de Edição em Massa (Dry-Run Preview)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Verifique a comparação dos valores antes de gravar permanentemente na base de dados.
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Safety Banners & Metrics */}
        <div className="p-6 bg-slate-900/50 border-b border-slate-800 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
              <span className="text-[11px] text-slate-400 block font-medium">Artigos Selecionados</span>
              <span className="text-xl font-extrabold text-slate-100">{previewData.total_selected}</span>
            </div>

            <div className="bg-slate-950 border border-indigo-900/50 p-3 rounded-xl">
              <span className="text-[11px] text-indigo-300 block font-medium">Artigos com Alterações</span>
              <span className="text-xl font-extrabold text-indigo-400">{previewData.total_affected}</span>
            </div>

            <div className="bg-slate-950 border border-amber-900/50 p-3 rounded-xl">
              <span className="text-[11px] text-amber-300 block font-medium">Designações Protegidas (Vendas)</span>
              <span className="text-xl font-extrabold text-amber-400">{previewData.blocked_descriptions_count}</span>
            </div>
          </div>

          {/* Transaction Warning */}
          <div className="bg-indigo-950/40 border border-indigo-800/60 rounded-xl p-3.5 text-xs text-indigo-200 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
            <div>
              <p className="font-semibold text-indigo-300">Garantia de Segurança Atómica (ACID & Backup)</p>
              <p className="text-[11px] text-indigo-200/80 mt-0.5">
                Um snapshot de backup em formato JSON será guardado automaticamente antes da atualização. Todas as instruções SQL serão executadas dentro de uma transação <code className="bg-indigo-950 px-1 py-0.5 rounded font-mono text-indigo-300">BEGIN TRANSACTION</code>.
              </p>
            </div>
          </div>
        </div>

        {/* Diff Table List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {previewData.previews.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              Nenhuma alteração foi detetada com as opções selecionadas.
            </div>
          ) : (
            previewData.previews.map((item) => (
              <div key={item.codigo} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs bg-slate-900 text-slate-300 px-2 py-0.5 rounded border border-slate-800">
                      Cód. {item.codigo}
                    </span>
                    <span className="font-semibold text-sm text-slate-100">{item.descricao}</span>
                  </div>

                  {item.has_sales && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-amber-400" />
                      Nome Protegido (Com Vendas)
                    </span>
                  )}
                </div>

                {/* Field Diff Grid */}
                <div className="grid grid-cols-1 gap-2 text-xs">
                  {item.diffs.map((diff, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-2.5 rounded-lg border ${
                        diff.blocked
                          ? 'bg-amber-950/20 border-amber-800/40 text-amber-300'
                          : 'bg-slate-900/60 border-slate-800 text-slate-200'
                      }`}
                    >
                      <span className="font-medium text-slate-400 w-48">{diff.field_label}:</span>

                      {diff.blocked ? (
                        <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                          <AlertOctagon className="w-4 h-4 shrink-0 text-amber-400" />
                          <span>{diff.reason}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 font-mono font-semibold">
                          <span className="text-slate-400 line-through">{String(diff.old_value)}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="text-emerald-400">{String(diff.new_value)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-800/90 px-6 py-4 border-t border-slate-700 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition"
          >
            Cancelar
          </button>

          <button
            disabled={isApplying || previewData.previews.length === 0}
            onClick={onConfirmApply}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition disabled:opacity-50"
          >
            {isApplying ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>A gravar na Base de Dados...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar & Executar Alterações em Massa ({previewData.total_affected})</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
