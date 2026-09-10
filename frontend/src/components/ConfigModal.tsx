import React, { useState, useEffect } from 'react';
import { X, Settings, Database, CheckCircle2, AlertCircle, Key, User, Server } from 'lucide-react';
import { DatabaseConfig } from '../types';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: DatabaseConfig;
  onSaveConfig: (cfg: DatabaseConfig) => Promise<void>;
  connectionMsg: string;
  isConnected: boolean;
  useMock: boolean;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  connectionMsg,
  isConnected,
  useMock
}) => {
  const [formConfig, setFormConfig] = useState<DatabaseConfig>(config);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    setFormConfig(config);
  }, [config, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTesting(true);
    try {
      await onSaveConfig(formConfig);
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden text-slate-900">
        
        {/* Modal Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-600" />
              Configuração de Conexão à Base de Dados SQL Server
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Insira o servidor, porta, utilizador e palavra-passe da base de dados <code className="text-indigo-600 font-bold font-mono">nuno</code>.
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Connection Status Banner */}
        <div className={`p-4 border-b text-xs flex items-center gap-3 font-medium ${
          isConnected
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
            : 'bg-rose-50 text-rose-900 border-rose-200'
        }`}>
          {isConnected ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <div>
            <p className="font-bold">{isConnected ? 'Conetado com Sucesso!' : 'Base de Dados Desconetada'}</p>
            <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">{connectionMsg}</p>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs bg-slate-50/30">
          
          {/* Servidor & Porta */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-slate-700 font-bold block mb-1 flex items-center gap-1">
                <Server className="w-3.5 h-3.5 text-indigo-600" />
                Servidor / Host SQL Server:
              </label>
              <input
                type="text"
                value={formConfig.server}
                onChange={(e) => setFormConfig({ ...formConfig, server: e.target.value })}
                placeholder="localhost, 127.0.0.1 ou SERVIDOR\SQLEXPRESS"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 font-mono font-semibold"
              />
            </div>
            <div>
              <label className="text-slate-700 font-bold block mb-1">
                Porta:
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={formConfig.port}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setFormConfig({ ...formConfig, port: val ? Number(val) : 1433 });
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 font-mono font-semibold"
              />
            </div>
          </div>

          {/* Base de Dados */}
          <div>
            <label className="text-slate-700 font-bold block mb-1 flex items-center gap-1">
              <Database className="w-3.5 h-3.5 text-indigo-600" />
              Nome da Base de Dados SQL:
            </label>
            <input
              type="text"
              value={formConfig.database}
              onChange={(e) => setFormConfig({ ...formConfig, database: e.target.value })}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 font-mono font-semibold"
            />
          </div>

          {/* Utilizador & Senha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 font-bold block mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                Utilizador SQL (sa):
              </label>
              <input
                type="text"
                value={formConfig.username || ''}
                onChange={(e) => setFormConfig({ ...formConfig, username: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 font-mono font-semibold"
              />
            </div>
            <div>
              <label className="text-slate-700 font-bold block mb-1 flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-indigo-600" />
                Palavra-passe:
              </label>
              <input
                type="password"
                value={formConfig.password || ''}
                onChange={(e) => setFormConfig({ ...formConfig, password: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 font-mono font-semibold"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition shadow-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isTesting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-md shadow-indigo-600/10 transition flex items-center gap-2"
            >
              {isTesting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  A testar conexão...
                </>
              ) : (
                'Gravar & Testar Conexão'
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
