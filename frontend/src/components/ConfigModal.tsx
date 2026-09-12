import React, { useState, useEffect } from 'react';
import { X, Settings, Database, CheckCircle2, AlertCircle, Key, User, Server, Radar, Check, Sparkles } from 'lucide-react';
import { DatabaseConfig, PortInfo, PortScanResponse } from '../types';

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
  const [drivers, setDrivers] = useState<string[]>([]);

  // Port Scan states
  const [isScanningPorts, setIsScanningPorts] = useState(false);
  const [portScanResults, setPortScanResults] = useState<PortInfo[] | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  useEffect(() => {
    setFormConfig(config);
    setPortScanResults(null);
    setScanMessage(null);
  }, [config, isOpen]);

  const handleScanPorts = async () => {
    if (!formConfig.server) {
      alert('Introduza primeiro o IP ou nome do Servidor SQL Server.');
      return;
    }
    setIsScanningPorts(true);
    setScanMessage(null);
    try {
      const res = await fetch('/api/scan-ports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: formConfig.server })
      });
      if (res.ok) {
        const data: PortScanResponse = await res.json();
        setPortScanResults(data.results);
        const openPorts = data.results.filter(r => r.open);
        if (openPorts.length > 0) {
          const firstOpen = data.recommended_port || openPorts[0].port;
          setFormConfig(prev => ({ ...prev, port: firstOpen }));
          setScanMessage(`Encontrada(s) ${openPorts.length} porta(s) aberta(s)! Porta ${firstOpen} selecionada automaticamente.`);
        } else {
          setScanMessage('Nenhuma porta SQL Server aberta foi detetada neste IP. Verifique se o SQL Server está iniciado e a firewall permite conexões.');
        }
      } else {
        const err = await res.json();
        setScanMessage(`Erro no scan: ${err.detail || 'Não foi possível verificar portas'}`);
      }
    } catch (e: any) {
      setScanMessage(`Erro de ligação ao scan: ${e.message}`);
    } finally {
      setIsScanningPorts(false);
    }
  };

  // Drivers ODBC instalados neste computador
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/drivers')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: string[]) => setDrivers(Array.isArray(list) ? list : []))
      .catch(() => setDrivers([]));
  }, [isOpen]);

  const driverOptions = Array.from(new Set([
    ...drivers,
    formConfig.driver,
    'ODBC Driver 18 for SQL Server',
    'ODBC Driver 17 for SQL Server'
  ].filter(Boolean)));

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
              Insira o servidor, porta, base de dados e credenciais. A configuração fica guardada no ficheiro <code className="text-indigo-600 font-bold font-mono">config.json</code> ao lado da aplicação.
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
          
          {/* Servidor & Porta com Scan de Portas */}
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-slate-700 font-bold block mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Server className="w-3.5 h-3.5 text-indigo-600" />
                    Servidor / IP SQL Server:
                  </span>
                </label>
                <input
                  type="text"
                  value={formConfig.server}
                  onChange={(e) => setFormConfig({ ...formConfig, server: e.target.value })}
                  placeholder="192.168.1.100, localhost ou SERVIDOR\SQLEXPRESS"
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

            {/* Scan de Portas Button & Results */}
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-slate-600">
                  <span className="font-semibold text-indigo-900">Verificação de Portas:</span> Testar se as portas do SQL Server estão abertas no IP indicado.
                </div>
                <button
                  type="button"
                  onClick={handleScanPorts}
                  disabled={isScanningPorts || !formConfig.server}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition shadow-xs disabled:opacity-50 shrink-0"
                >
                  <Radar className={`w-3.5 h-3.5 ${isScanningPorts ? 'animate-spin' : ''}`} />
                  {isScanningPorts ? 'A verificar portas...' : 'Scan de Portas'}
                </button>
              </div>

              {/* Scan Message feedback */}
              {scanMessage && (
                <p className={`text-[11px] font-medium mt-2 ${
                  portScanResults?.some(r => r.open) ? 'text-emerald-700 font-bold' : 'text-amber-800'
                }`}>
                  {scanMessage}
                </p>
              )}

              {/* Port Badges */}
              {portScanResults && portScanResults.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-indigo-100 flex flex-wrap gap-1.5">
                  {portScanResults.map((p) => {
                    const isSelected = formConfig.port === p.port;
                    return (
                      <button
                        key={p.port}
                        type="button"
                        onClick={() => {
                          setFormConfig({ ...formConfig, port: p.port });
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                          p.open
                            ? isSelected
                              ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-300'
                              : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                            : isSelected
                              ? 'bg-slate-200 text-slate-800 border-slate-400'
                              : 'bg-white/80 text-slate-400 border-slate-200 hover:bg-slate-50'
                        }`}
                        title={`${p.label} - ${p.open ? 'Porta Aberta' : 'Porta Fechada'}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${p.open ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                        <span>Porta {p.port}</span>
                        {p.open && <span className="text-[10px] font-sans font-normal opacity-90">(Aberta)</span>}
                        {p.port === 1433 && <span className="text-[9px] font-sans bg-indigo-100 text-indigo-800 px-1 rounded">Padrão</span>}
                        {p.port === 65432 && <span className="text-[9px] font-sans bg-teal-100 text-teal-800 px-1 rounded">ZoneSoft</span>}
                      </button>
                    );
                  })}
                </div>
              )}
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

          {/* Driver ODBC */}
          <div>
            <label className="text-slate-700 font-bold block mb-1">Driver ODBC:</label>
            <select
              value={formConfig.driver}
              onChange={(e) => setFormConfig({ ...formConfig, driver: e.target.value })}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-indigo-600 font-mono font-semibold"
            >
              {driverOptions.map((d) => (
                <option key={d} value={d}>
                  {d}{drivers.length > 0 && !drivers.includes(d) ? ' (não instalado)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de autenticação */}
          <div>
            <label className="text-slate-700 font-bold block mb-1">Autenticação:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormConfig({ ...formConfig, trusted_connection: false })}
                className={`px-3 py-2 rounded-lg border font-bold transition ${!formConfig.trusted_connection ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'}`}
              >
                Utilizador SQL (sa)
              </button>
              <button
                type="button"
                onClick={() => setFormConfig({ ...formConfig, trusted_connection: true })}
                className={`px-3 py-2 rounded-lg border font-bold transition ${formConfig.trusted_connection ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'}`}
              >
                Autenticação Windows
              </button>
            </div>
          </div>

          {/* Utilizador & Senha */}
          {!formConfig.trusted_connection && (
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
            <label className="col-span-2 flex items-start gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formConfig.save_password}
                onChange={(e) => setFormConfig({ ...formConfig, save_password: e.target.checked })}
                className="mt-0.5 rounded border-slate-300 text-indigo-600"
              />
              <span>
                <strong>Guardar a palavra-passe</strong> no config.json (em texto simples). Deixe desligado se a pen drive puder ser usada por outras pessoas.
              </span>
            </label>
          </div>
          )}

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
