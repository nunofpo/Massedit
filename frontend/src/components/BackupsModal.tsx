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
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Modal Header */}
        <div className="bg-slate-800/90 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-400" />
              Histórico de Cópias de Segurança & Reversão (Undo)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Restaure facilmente qualquer alteração realizada anteriormente na base de dados.
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Notification Banner */}
        {statusMsg && (
          <div className={`p-4 text-xs font-semibold flex items-center gap-2 border-b ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
              : 'bg-rose-950/80 text-rose-300 border-rose-800'
          }`}>
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Backup List */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400 text-xs">A carregar cópias de segurança...</div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              Nenhuma cópia de segurança em ficheiro JSON encontrada até ao momento.
            </div>
          ) : (
            backups.map((b) => (
              <div
                key={b.filename}
                className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4 hover:border-slate-700 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-400" />
                    <span className="font-mono font-bold text-xs text-slate-200">{b.filename}</span>
                    <span className="bg-slate-900 text-indigo-300 border border-indigo-900 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                      {b.items_count} artigos
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">{b.description}</p>
                  
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(b.created_at).toLocaleString('pt-PT')}</span>
                  </div>
                </div>

                <button
                  disabled={restoringFile === b.filename}
                  onClick={() => handleRestore(b.filename)}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition shadow"
                >
                  {restoringFile === b.filename ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  <span>Reverter & Restaurar</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-800/90 px-6 py-3 border-t border-slate-700 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
