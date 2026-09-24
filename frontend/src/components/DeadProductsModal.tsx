import React, { useState, useEffect } from 'react';
import { X, Archive, AlertCircle, CheckCircle2, RefreshCw, Lock, EyeOff, Filter, ShieldCheck } from 'lucide-react';
import { DeadProductsSummary } from '../types';

interface DeadProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFilterInMainTable: (codes: number[], label: string) => void;
  onSuccessInactivate: () => void;
}

export const DeadProductsModal: React.FC<DeadProductsModalProps> = ({
  isOpen,
  onClose,
  onFilterInMainTable,
  onSuccessInactivate
}) => {
  const [summary, setSummary] = useState<DeadProductsSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInactivating, setIsInactivating] = useState<boolean>(false);
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSummary = async () => {
    setIsLoading(true);
    setResultMessage(null);
    try {
      const res = await fetch('/api/products/dead-products/summary');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      } else {
        const err = await res.json();
        setResultMessage({ type: 'error', text: err.detail || 'Erro ao carregar artigos mortos.' });
      }
    } catch (e: any) {
      setResultMessage({ type: 'error', text: `Erro de ligação: ${e.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSummary();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInactivateAll = async () => {
    if (!summary || summary.count === 0) return;
    const confirmed = window.confirm(
      `Tem a certeza de que deseja inativar ${summary.count} artigos sem vendas?\n\n` +
      `Será criada automaticamente uma cópia de segurança antes da alteração.\n` +
      `Os artigos ficarão bloqueados e ocultos no ecrã de vendas do POS.`
    );
    if (!confirmed) return;

    setIsInactivating(true);
    setResultMessage(null);
    try {
      const res = await fetch('/api/products/dead-products/inactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_codes: summary.codes })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResultMessage({
          type: 'success',
          text: `${data.message} Cópia de segurança criada: ${data.backup_file}`
        });
        onSuccessInactivate();
        await fetchSummary();
      } else {
        setResultMessage({ type: 'error', text: data.message || data.detail || 'Erro ao inativar artigos.' });
      }
    } catch (e: any) {
      setResultMessage({ type: 'error', text: `Erro: ${e.message}` });
    } finally {
      setIsInactivating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="bg-amber-600 p-2.5 rounded-xl shadow-md shadow-amber-600/20 text-white">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Inativação em Lote de Artigos "Mortos"
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Artigos ativos ou visíveis no POS que nunca tiveram qualquer movimento de vendas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/30">
          
          {resultMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 shadow-xs ${
                resultMessage.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border border-rose-200 text-rose-900'
              }`}
            >
              {resultMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              )}
              <span>{resultMessage.text}</span>
            </div>
          )}

          {isLoading && !summary ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-600" />
              A cruzar artigos com histórico de vendas no ZoneSoft...
            </div>
          ) : summary ? (
            <>
              {/* Summary Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Artigos Sem Vendas
                  </span>
                  <div className="text-2xl font-black text-amber-700">{summary.count}</div>
                  <span className="text-xs text-slate-500 font-medium">Nunca faturados no POS</span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Famílias Afetadas
                  </span>
                  <div className="text-2xl font-black text-slate-800">{summary.families.length}</div>
                  <span className="text-xs text-slate-500 font-medium">Categorias com artigos inativos</span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Segurança
                  </span>
                  <div className="text-sm font-bold text-emerald-700 flex items-center gap-1.5 mt-1">
                    <ShieldCheck className="w-4 h-4" /> Backup Automático
                  </div>
                  <span className="text-xs text-slate-500 font-medium">Reversível a qualquer momento</span>
                </div>
              </div>

              {summary.count === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <h3 className="text-sm font-bold text-emerald-900">Base de dados limpa!</h3>
                  <p className="text-xs text-emerald-700">
                    Não existem artigos ativos sem vendas na sua base de dados ZoneSoft.
                  </p>
                </div>
              ) : (
                <>
                  {/* Action Banner */}
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
                    <div className="text-xs space-y-1">
                      <p className="font-bold text-amber-950 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-700" />
                        Ação: Bloquear e Ocultar do POS
                      </p>
                      <p className="text-amber-800">
                        Marca <code className="font-mono font-semibold">bloqueado = 1</code> e <code className="font-mono font-semibold">descontinuado = 1</code> para não poluir o ecrã de venda nem as pesquisas.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          onFilterInMainTable(summary.codes, `Artigos Mortos (${summary.count})`);
                          onClose();
                        }}
                        className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
                      >
                        <Filter className="w-3.5 h-3.5" /> Ver na Lista
                      </button>

                      <button
                        onClick={handleInactivateAll}
                        disabled={isInactivating}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                      >
                        {isInactivating ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> A inativar...
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5" /> Inativar {summary.count} Artigos
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Sample Table */}
                  {summary.sample && summary.sample.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">Amostra de artigos sem vendas</span>
                        <span className="text-slate-500 font-medium">A mostrar até 50 artigos</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                            <tr>
                              <th className="px-4 py-2">Código</th>
                              <th className="px-4 py-2">Designação</th>
                              <th className="px-4 py-2">Família</th>
                              <th className="px-4 py-2 text-right">PVP1</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {summary.sample.map((s) => (
                              <tr key={s.codigo} className="hover:bg-slate-50 transition">
                                <td className="px-4 py-1.5 font-mono font-bold text-slate-900">#{s.codigo}</td>
                                <td className="px-4 py-1.5 font-medium text-slate-800">{s.descricao}</td>
                                <td className="px-4 py-1.5 text-slate-600">{s.familia}</td>
                                <td className="px-4 py-1.5 text-right font-semibold text-slate-700">
                                  {s.pvp1.toFixed(2)} €
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : null}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={fetchSummary}
            disabled={isLoading || isInactivating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-200 border border-slate-300 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Recarregar
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-xs"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
