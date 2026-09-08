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
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Modal Header */}
        <div className="bg-slate-800/90 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-400" />
              Configuração de Conexão à Base de Dados SQL Server
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Insira o servidor, porta, utilizador e palavra-passe da base de dados <code className="text-indigo-300">nuno</code>.
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Connection Status Banner */}
        <div className={`p-4 border-b text-xs flex items-center gap-3 ${
          isConnected
            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
            : 'bg-rose-950/60 text-rose-300 border-rose-800'
        }`}>
          {isConnected ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <div>
            <p className="font-bold">{isConnected ? 'Conetado com Sucesso!' : 'Base de Dados Desconetada'}</p>
            <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">{connectionMsg}</p>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          {/* Servidor & Porta */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-slate-300 font-semibold block mb-1 flex items-center gap-1">
                <Server className="w-3.5 h-3.5 text-indigo-400" />
                Servidor / Host SQL Server:
              </label>
              <input
                type="text"
                value={formConfig.server}
                onChange={(e) => setFormConfig({ ...formConfig, server: e.target.value })}
                placeholder="localhost, 127.0.0.1 ou SERVIDOR\SQLEXPRESS"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">Porta SQL:</label>
              <input
                type="number"
                value={formConfig.port}
                onChange={(e) => setFormConfig({ ...formConfig, port: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Nome da Base de Dados */}
          <div>
            <label className="text-slate-300 font-semibold block mb-1 flex items-center gap-1">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              Nome da Base de Dados:
            </label>
            <input
              type="text"
              value={formConfig.database}
              onChange={(e) => setFormConfig({ ...formConfig, database: e.target.value })}
              placeholder="nuno"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono font-bold"
            />
          </div>

          {/* Autenticação Toggle */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
            <label className="flex items-center gap-2 text-slate-200 cursor-pointer font-semibold">
              <input
                type="checkbox"
                checked={formConfig.trusted_connection}
                onChange={(e) => setFormConfig({ ...formConfig, trusted_connection: e.target.checked })}
                className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Autenticação Windows (Windows Auth / Trusted Connection)</span>
            </label>

            {formConfig.trusted_connection && (
              <p className="text-[11px] text-slate-400">
                Utiliza a conta atual do Windows para autenticar no SQL Server. Desmarque esta opção se utilizar utilizador e palavra-passe SQL (ex: <code className="text-indigo-300">sa</code>).
              </p>
            )}
          </div>

          {/* Utilizador & Palavra-passe SQL (SEMPRE VISÍVEIS para fácil configuração) */}
          <div className={`p-4 rounded-xl border space-y-3 transition ${
            !formConfig.trusted_connection
              ? 'bg-slate-950 border-indigo-900/80'
              : 'bg-slate-950/50 border-slate-800 opacity-60'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-amber-400" />
                Credenciais de Autenticação SQL Server
              </span>
              {formConfig.trusted_connection && (
                <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  (Opcional em Windows Auth)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1 flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-400" />
                  Utilizador SQL (UID):
                </label>
                <input
                  type="text"
                  value={formConfig.username || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, username: e.target.value, trusted_connection: false })}
                  placeholder="ex: sa"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1 flex items-center gap-1">
                  <Key className="w-3 h-3 text-slate-400" />
                  Palavra-passe (PWD):
                </label>
                <input
                  type="password"
                  value={formConfig.password || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, password: e.target.value, trusted_connection: false })}
                  placeholder="Palavra-passe da DB..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Driver ODBC */}
          <div>
            <label className="text-slate-300 font-semibold block mb-1">Driver ODBC de Conexão:</label>
            <select
              value={formConfig.driver}
              onChange={(e) => setFormConfig({ ...formConfig, driver: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="ODBC Driver 17 for SQL Server">ODBC Driver 17 for SQL Server (Recomendado)</option>
              <option value="ODBC Driver 18 for SQL Server">ODBC Driver 18 for SQL Server</option>
              <option value="SQL Server Native Client 11.0">SQL Server Native Client 11.0</option>
              <option value="SQL Server">SQL Server (Driver Nativo Padrão)</option>
            </select>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
            >
              Fechar
            </button>

            <button
              type="submit"
              disabled={isTesting}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-600/30"
            >
              {isTesting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>A Testar & Ligando...</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>Testar & Guardar Conexão</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
