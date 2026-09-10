import React, { useState, useEffect } from 'react';
import { X, History, RotateCcw, FileText, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { BackupItem } from '../types';

interface BackupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess: () => void;
}

export const BackupsModal: React.FC<BackupsModalProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess
}) => {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchBackups = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/backups');
      if (res.ok) {
        const data = await res.json();
        setBackups(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBackups();
      setStatusMsg(null);
    }
  }, [isOpen]);

  const handleRestore = async (filename: string) => {
    if (!window.confirm(`Tem a certeza de que deseja reverter e restaurar as definições do backup "${filename}"?`)) {
      return;
    }

    setRestoringFile(filename);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatusMsg({ type: 'success', text: data.message });
        onRestoreSuccess();
      } else {
        setStatusMsg({ type: 'error', text: data.detail || data.message || 'Erro ao restaurar backup.' });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: `Falha na ligação: ${e.message}` });
    } finally {
      setRestoringFile(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden text-slate-900">
        
        {/* Modal Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600" />
              Histórico de Cópias de Segurança & Reversão (Undo)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Restaure facilmente qualquer alteração realizada anteriormente na base de dados.
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Notification Banner */}
        {statusMsg && (
          <div className={`p-3.5 mx-6 mt-4 rounded-xl text-xs flex items-center gap-2.5 font-medium ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-rose-50 text-rose-900 border border-rose-200'
          }`}>
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Backup List */}
        <div className="p-6 flex-1 overflow-y-auto max-h-[450px] space-y-3 bg-slate-50/30">
          {isLoading ? (
            <div className="py-12 text-center text-slate-500 text-sm font-semibold">
              A carregar lista de backups...
            </div>
          ) : backups.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm font-medium">
              Nenhuma cópia de segurança encontrada.
            </div>
          ) : (
            backups.map((b) => (
              <div
                key={b.filename}
                className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-xs hover:border-slate-300 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-50 p-2.5 rounded-xl border border-indigo-100 text-indigo-600">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 font-mono">
                      {b.filename}
                    </h3>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 font-medium">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {new Date(b.created_at).toLocaleString('pt-PT')}
                      </span>
                      <span>•</span>
                      <span className="font-semibold text-slate-700">{b.items_count} artigo(s) guardado(s)</span>
                      {b.description && (
                        <>
                          <span>•</span>
                          <span className="text-slate-500 truncate max-w-[150px]">{b.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleRestore(b.filename)}
                  disabled={restoringFile === b.filename}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <RotateCcw className={`w-3.5 h-3.5 text-amber-700 ${restoringFile === b.filename ? 'animate-spin' : ''}`} />
                  {restoringFile === b.filename ? 'A Restaurar...' : 'Reverter para Este'}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition shadow-xs"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
