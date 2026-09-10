import React, { useState } from 'react';
import {
  X, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight,
  Download, Eye, CheckSquare, RefreshCw, Sparkles, Filter
} from 'lucide-react';
import { DataQualityCheck } from '../types';

interface DataQualityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewArticles: (codes: number[], label: string) => void;
  onSelectArticles: (codes: number[], label: string) => void;
}

export const DataQualityModal: React.FC<DataQualityModalProps> = ({
  isOpen,
  onClose,
  onViewArticles,
  onSelectArticles
}) => {
  const [shortDescMax, setShortDescMax] = useState<number>(20);
  const [isLoading, setIsLoading] = useState(false);
  const [checks, setChecks] = useState<DataQualityCheck[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const handleRunAnalysis = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/reports/data-quality?short_desc_max=${shortDescMax}`);
      if (res.ok) {
        const data: DataQualityCheck[] = await res.json();
        setChecks(data);
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || 'Erro ao processar o relatório de qualidade de dados.');
      }
    } catch (e: any) {
      setErrorMsg(`Erro de ligação: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExportCSV = () => {
    if (!checks) return;
    const rows = ['Verificação;Severidade;Código;Detalhe'];

    checks.forEach(chk => {
      if (!chk.available) return;
      if (chk.groups && chk.groups.length > 0) {
        chk.groups.forEach(g => {
          g.codes.forEach(c => {
            rows.push(`"${chk.title}";"${chk.severity}";${c};"${g.key}"`);
          });
        });
      } else if (chk.codes.length > 0) {
        chk.codes.forEach(c => {
          rows.push(`"${chk.title}";"${chk.severity}";${c};""`);
        });
      } else if (chk.count > 0) {
        rows.push(`"${chk.title}";"${chk.severity}";"N/A";"Contagem: ${chk.count}"`);
      }
    });

    const csvContent = rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_qualidade_dados_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const totalErrors = checks ? checks.filter(c => c.available && c.severity === 'error').reduce((acc, c) => acc + c.count, 0) : 0;
  const totalWarnings = checks ? checks.filter(c => c.available && c.severity === 'warning').reduce((acc, c) => acc + c.count, 0) : 0;
  const totalInfos = checks ? checks.filter(c => c.available && c.severity === 'info').reduce((acc, c) => acc + c.count, 0) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              Relatório de Qualidade dos Dados
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Diagnóstico de inconsistências na base de dados com atalhos para consulta e correção em massa.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleRunAnalysis}
              disabled={isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl transition shadow-xs flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'A Analisar...' : (checks ? 'Voltar a Analisar' : 'Analisar Base de Dados')}
            </button>

            <div className="flex items-center gap-1.5 text-slate-700">
              <label htmlFor="short-desc-max" className="font-semibold">Máx. caracteres descrição curta:</label>
              <input
                id="short-desc-max"
                type="number"
                min="5"
                max="100"
                value={shortDescMax}
                onChange={(e) => setShortDescMax(Math.max(5, parseInt(e.target.value) || 20))}
                className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-center font-bold text-slate-900"
              />
            </div>
          </div>

          {checks && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 font-bold">
                <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded border border-rose-200 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-rose-600" />
                  {totalErrors} erros
                </span>
                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  {totalWarnings} avisos
                </span>
                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                  <Info className="w-3 h-3 text-slate-500" />
                  {totalInfos} info
                </span>
              </div>

              <button
                onClick={handleExportCSV}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl border border-slate-300 transition flex items-center gap-1.5 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs text-rose-900 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!checks && !isLoading && (
            <div className="text-center py-16 space-y-3">
              <Sparkles className="w-10 h-10 text-indigo-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">Pronto para Diagnosticar</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Clique em <strong>"Analisar Base de Dados"</strong> para efetuar 13 verificações de consistência (códigos de barras, PLUs, IVA, famílias, centros de produção e textos).
              </p>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-16 space-y-3">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-bold text-slate-700">A analisar integridade da base de dados SQL Server...</p>
            </div>
          )}

          {checks && !isLoading && (
            <div className="space-y-3">
              {checks.map((chk) => {
                const isError = chk.severity === 'error';
                const isWarning = chk.severity === 'warning';
                const hasIssues = chk.count > 0;
                const isExpanded = !!expandedGroups[chk.id];

                return (
                  <div
                    key={chk.id}
                    className={`rounded-xl border transition shadow-xs ${
                      !chk.available
                        ? 'bg-slate-50 border-slate-200 opacity-60'
                        : hasIssues
                          ? isError
                            ? 'bg-white border-rose-200 hover:border-rose-300'
                            : isWarning
                              ? 'bg-white border-amber-200 hover:border-amber-300'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          : 'bg-white border-slate-200'
                    } p-4`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900">{chk.title}</span>
                          
                          {/* Severity & Count Tag */}
                          {!chk.available ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                              Indisponível
                            </span>
                          ) : hasIssues ? (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                                isError
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : isWarning
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {isError ? <AlertCircle className="w-3 h-3 text-rose-600" /> : isWarning ? <AlertTriangle className="w-3 h-3 text-amber-600" /> : <Info className="w-3 h-3 text-slate-500" />}
                              {chk.count} artigo(s)
                              {chk.truncated && ' (truncado a 5.000)'}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                              ✓ Tudo em ordem
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">{chk.description}</p>
                        {chk.unavailable_reason && (
                          <p className="text-[11px] text-slate-500 italic mt-0.5">{chk.unavailable_reason}</p>
                        )}
                      </div>

                      {/* Actions */}
                      {chk.available && hasIssues && chk.codes.length > 0 && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => onViewArticles(chk.codes, chk.title)}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-lg border border-indigo-200 transition text-xs flex items-center gap-1 shadow-xs"
                            title="Ver e filtrar estes artigos na tabela principal"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Ver artigos
                          </button>
                          <button
                            onClick={() => onSelectArticles(chk.codes, chk.title)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg border border-slate-300 transition text-xs flex items-center gap-1 shadow-xs"
                            title="Juntar estes artigos à seleção de edição em massa"
                          >
                            <CheckSquare className="w-3.5 h-3.5" />
                            Selecionar
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Expandable Group Details */}
                    {chk.available && chk.groups && chk.groups.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <button
                          onClick={() => toggleGroup(chk.id)}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          {isExpanded ? 'Ocultar agrupamentos' : `Ver ${chk.groups.length} grupo(s) de duplicados/famílias`}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 space-y-1.5 pl-2 max-h-48 overflow-y-auto">
                            {chk.groups.map((g, idx) => (
                              <div key={idx} className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs flex items-center justify-between font-mono">
                                <span className="font-bold text-slate-800">{g.key}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500 font-sans text-[11px]">{g.codes.length} artigos:</span>
                                  <span className="text-indigo-700 font-bold">#{g.codes.join(', #')}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition shadow-xs"
          >
            Fechar Relatório
          </button>
        </div>

      </div>
    </div>
  );
};
