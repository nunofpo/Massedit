import React, { useState, useEffect } from 'react';
import { X, HardDrive, Database, RefreshCw, Sparkles, CheckCircle2, AlertTriangle, Layers, ArrowDownCircle, Cpu } from 'lucide-react';
import { HousekeepingStatus } from '../types';

interface HousekeepingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HousekeepingModal: React.FC<HousekeepingModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<HousekeepingStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/housekeeping/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.detail || 'Erro ao carregar diagnóstico da base de dados.' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: `Erro de ligação: ${e.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleShrinkLog = async () => {
    if (!window.confirm('Pretende encolher o ficheiro de log de transações (.ldf)? Esta operação liberta espaço em disco com segurança.')) {
      return;
    }
    setActionLoading('shrink');
    setMessage(null);
    try {
      const res = await fetch('/api/housekeeping/shrink-log', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({
          type: 'success',
          text: `Encolhimento concluído! Foram libertados ${data.freed_mb} MB em disco.`
        });
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: data.message || data.detail || 'Falha ao encolher o ficheiro de log.' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: `Erro: ${e.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleOptimizeIndexes = async () => {
    setActionLoading('optimize');
    setMessage(null);
    try {
      const res = await fetch('/api/housekeeping/optimize-indexes', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({
          type: 'success',
          text: `${data.message} (${data.optimized_tables?.join(', ') || ''})`
        });
      } else {
        setMessage({ type: 'error', text: data.message || data.detail || 'Falha ao otimizar índices.' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: `Erro: ${e.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2.5 rounded-xl shadow-md shadow-indigo-600/20 text-white">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Manutenção do SQL Server (Housekeeping)
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Otimização de ficheiros .mdf/.ldf, espaço em disco e desfragmentação de índices ZoneSoft
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
          
          {/* Notification Messages */}
          {message && (
            <div
              className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 shadow-xs ${
                message.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border border-rose-200 text-rose-900'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {isLoading && !status ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-600" />
              A analisar estrutura de ficheiros do SQL Server...
            </div>
          ) : status ? (
            <>
              {/* Storage Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                
                {/* Data File */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ficheiro de Dados (.mdf)</span>
                    <Database className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-xl font-black text-slate-900">{status.data_size_mb} MB</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Usado: <strong className="text-slate-800">{status.data_used_mb} MB</strong> | Livre: <strong className="text-emerald-700">{status.data_free_mb} MB</strong>
                  </div>
                </div>

                {/* Log File */}
                <div className={`bg-white border rounded-xl p-4 shadow-xs ${
                  status.log_bloated ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Log de Transações (.ldf)</span>
                    <HardDrive className={`w-4 h-4 ${status.log_bloated ? 'text-amber-600' : 'text-slate-500'}`} />
                  </div>
                  <div className={`text-xl font-black ${status.log_bloated ? 'text-amber-800' : 'text-slate-900'}`}>
                    {status.log_size_mb} MB
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Usado: <strong className="text-slate-800">{status.log_used_mb} MB</strong> | Livre: <strong className="text-emerald-700">{status.log_free_mb} MB</strong>
                  </div>
                </div>

                {/* Database info */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Base de Dados</span>
                    <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                      {status.recovery_model}
                    </span>
                  </div>
                  <div className="text-base font-bold text-slate-900 truncate" title={status.database_name}>
                    {status.database_name}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Total em disco: <strong className="text-slate-800">{(status.data_size_mb + status.log_size_mb).toFixed(1)} MB</strong>
                  </div>
                </div>

              </div>

              {/* Bloat Alert Banner */}
              {status.log_bloated && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3 text-amber-950">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold">Ficheiro de Log de Transações excessivamente grande!</p>
                    <p className="text-amber-800">
                      O log ocupa {status.log_size_mb} MB, com cerca de {status.log_free_mb} MB de espaço inativo. Encolher o ficheiro liberta este espaço em disco imediatamente sem risco.
                    </p>
                  </div>
                </div>
              )}

              {/* Maintenance Actions Section */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-600" /> Ações de Otimização Rápida
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Action 1: Shrink Log */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <ArrowDownCircle className="w-4 h-4 text-emerald-600" /> Encolher Ficheiro de Log
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Executa um checkpoint e reduz o ficheiro <code className="text-slate-800 font-semibold font-mono">{status.log_file_name || '.ldf'}</code> para o tamanho mínimo seguro.
                      </p>
                    </div>
                    <button
                      onClick={handleShrinkLog}
                      disabled={actionLoading !== null}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-2"
                    >
                      {actionLoading === 'shrink' ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> A encolher...
                        </>
                      ) : (
                        'Encolher Log Agora (DBCC SHRINKFILE)'
                      )}
                    </button>
                  </div>

                  {/* Action 2: Defrag & Reorganize Indexes */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-600" /> Desfragmentar e Otimizar Índices
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Reorganiza os índices de produtos, vendas e movimentos e atualiza as estatísticas do SQL Server, acelerando pesquisas e o fecho de contas no POS.
                      </p>
                    </div>
                    <button
                      onClick={handleOptimizeIndexes}
                      disabled={actionLoading !== null}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-2"
                    >
                      {actionLoading === 'optimize' ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> A otimizar índices...
                        </>
                      ) : (
                        'Otimizar Índices e Tabelas'
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Top Tables Section */}
              {status.top_tables && status.top_tables.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-slate-600" /> Maiores Tabelas na Base de Dados
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">Top {status.top_tables.length} tabelas</span>
                  </div>
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2">Tabela</th>
                        <th className="px-4 py-2 text-right">Nº de Registos</th>
                        <th className="px-4 py-2 text-right">Espaço Usado</th>
                        <th className="px-4 py-2 text-right">Espaço Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {status.top_tables.map((t, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition">
                          <td className="px-4 py-2 font-mono font-semibold text-slate-900">dbo.{t.name}</td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-700">{t.rows.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-slate-600">{t.used_mb} MB</td>
                          <td className="px-4 py-2 text-right font-bold text-indigo-700">{t.total_mb} MB</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={fetchStatus}
            disabled={isLoading || actionLoading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-200 border border-slate-300 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
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
