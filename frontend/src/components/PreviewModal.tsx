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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-900">
        
        {/* Modal Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-indigo-600" />
              Simulação de Edição em Massa (Dry-Run Preview)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verifique a comparação dos valores antes de gravar permanentemente na base de dados.
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Safety Banners & Metrics */}
        <div className="p-6 bg-slate-50/50 border-b border-slate-200 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-xs">
              <span className="text-[11px] text-slate-500 block font-semibold">Artigos Selecionados</span>
              <span className="text-xl font-black text-slate-900">{previewData.total_selected}</span>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl shadow-xs">
              <span className="text-[11px] text-indigo-800 block font-semibold">Artigos com Alterações</span>
              <span className="text-xl font-black text-indigo-700">{previewData.total_affected}</span>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl shadow-xs">
              <span className="text-[11px] text-amber-800 block font-semibold">Alterações Bloqueadas</span>
              <span className="text-xl font-black text-amber-700">{previewData.blocked_descriptions_count}</span>
            </div>
          </div>

          {/* Transaction Warning */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 text-xs text-indigo-900 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
            <div>
              <p className="font-bold text-indigo-950">Garantia de Segurança Atómica (ACID & Backup)</p>
              <p className="text-[11px] text-indigo-800 mt-0.5 leading-relaxed">
                Um snapshot de backup em formato JSON será guardado automaticamente antes da atualização. Todas as instruções SQL serão executadas dentro de uma transação <code className="bg-indigo-100 px-1.5 py-0.5 rounded font-mono font-bold text-indigo-900">BEGIN TRANSACTION</code>.
              </p>
            </div>
          </div>
        </div>

        {/* Diff Table List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
          {previewData.previews.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm font-semibold">
              Nenhuma alteração foi detetada com as opções selecionadas.
            </div>
          ) : (
            previewData.previews.map((item) => (
              <div key={item.codigo} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                      Cód. {item.codigo}
                    </span>
                    <span className="font-bold text-sm text-slate-900">{item.descricao}</span>
                  </div>

                  {item.has_sales && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-amber-600" />
                      Nome Protegido (Com Vendas)
                    </span>
                  )}
                </div>

                {/* Diff items */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {item.diffs.map((diff) => (
                    diff.blocked ? (
                      <div key={diff.field_name} className="bg-amber-50 p-2.5 rounded-lg border border-amber-300 font-mono text-[11px] space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-amber-900 flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-amber-600" />
                            {diff.field_label}: NÃO SERÁ ALTERADO
                          </span>
                          <span className="text-amber-700">{String(diff.old_value)}</span>
                        </div>
                        {diff.reason && <p className="font-sans text-amber-800 leading-snug">{diff.reason}</p>}
                      </div>
                    ) : (
                      <div key={diff.field_name} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center justify-between font-mono text-[11px]">
                        <span className="font-bold text-slate-700">{diff.field_label}:</span>
                        <div className="flex items-center gap-2">
                          <span className="line-through text-slate-400">{String(diff.old_value)}</span>
                          <ArrowRight className="w-3 h-3 text-indigo-500" />
                          <span className="font-extrabold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">{String(diff.new_value)}</span>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={isApplying}
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition shadow-xs"
          >
            Voltar & Editar
          </button>

          <button
            onClick={onConfirmApply}
            disabled={isApplying || previewData.total_affected === 0}
            className="px-6 py-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-md shadow-indigo-600/10 transition flex items-center gap-2"
          >
            {isApplying ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                A Gravar Alterações no SQL Server...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Confirmar & Gravar na Base de Dados ({previewData.total_affected} Artigos)
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
