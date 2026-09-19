import React, { useState, useEffect } from 'react';
import { X, Settings, Database, CheckCircle2, AlertCircle, Key, User, Server, Radar, Eye, EyeOff, FileCode, Unlock } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [importedPasswordMsg, setImportedPasswordMsg] = useState<string | null>(null);

  const handleImportXdlConfig = async (file: File | null) => {
    if (!file) return;
    setImportedPasswordMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/xdl/parse-config', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Não foi possível ler o ficheiro .xdl');
        return;
      }
      const data = await res.json();
      const cfg = data.config || {};
      setFormConfig(prev => ({
        ...prev,
        server: cfg.server || prev.server,
        database: cfg.database || prev.database,
        username: cfg.username || prev.username,
        password: cfg.password || prev.password,
        save_password: cfg.password ? true : prev.save_password
      }));

      if (cfg.password || (data.passwords_found && data.passwords_found.length > 0)) {
        const pwd = cfg.password || data.passwords_found[0];
        setImportedPasswordMsg(`Palavra-passe desencriptada do ${data.filename || '.xdl'}: "${pwd}"`);
        setShowPassword(true);
      } else {
        setImportedPasswordMsg(`Ficheiro ${data.filename || '.xdl'} lido com sucesso e campos preenchidos.`);
      }
    } catch (e) {
      alert('Erro de rede ao ler o ficheiro .xdl');
    }
  };

  // Port Scan states
  const [isScanningPorts, setIsScanningPorts] = useState(false);
  const [portScanResults, setPortScanResults] = useState<PortInfo[] | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Connection Profiles State
  const [profiles, setProfiles] = useState<Array<{ name: string; config: DatabaseConfig }>>([]);
  const [newProfileName, setNewProfileName] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('massedit_db_profiles');
      if (saved) {
        setProfiles(JSON.parse(saved));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleSaveCurrentProfile = () => {
    if (!newProfileName.trim()) {
      alert('Introduza um nome para o perfil (ex: Pastelaria Central).');
      return;
    }
    const updated = [...profiles.filter(p => p.name !== newProfileName.trim()), {
      name: newProfileName.trim(),
      config: formConfig
    }];
    setProfiles(updated);
    localStorage.setItem('massedit_db_profiles', JSON.stringify(updated));
    setNewProfileName('');
  };

  const handleSelectProfile = (profName: string) => {
    const found = profiles.find(p => p.name === profName);
    if (found) {
      setFormConfig(found.config);
    }
  };

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
          setScanMessage('Nenhuma porta SQL Server aberta foi detetada neste IP. Verifique se o SQL Server está iniciado.');
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
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-900 my-auto">
        
        {/* Modal Header */}
        <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Configuração de Conexão à Base de Dados SQL Server
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Guardado no ficheiro <code className="text-indigo-600 font-bold font-mono">config.json</code>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Connection Status Banner */}
        <div className={`px-4 py-2.5 border-b text-xs flex items-start gap-2.5 font-medium shrink-0 ${
          isConnected
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
            : 'bg-rose-50 text-rose-900 border-rose-200'
        }`}>
          {isConnected ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-xs">{isConnected ? 'Conetado com Sucesso!' : 'Base de Dados Desconetada'}</p>
            <p className="text-[11px] opacity-90 leading-tight truncate max-h-12 overflow-y-auto font-mono mt-0.5" title={connectionMsg}>
              {connectionMsg}
            </p>
          </div>
        </div>

        {/* Form Body - Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-3 text-xs bg-slate-50/40">
          
          {/* Perfis Guardados (Clientes Frequentes) */}
          <div className="bg-indigo-50/60 p-2.5 rounded-xl border border-indigo-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-900 flex items-center gap-1.5 text-xs">
                <Database className="w-3.5 h-3.5 text-indigo-600" />
                Perfis de Clientes Guardados:
              </span>
              {profiles.length > 0 && (
                <span className="text-[10px] text-indigo-600 font-semibold">{profiles.length} perfil(is)</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {profiles.length > 0 && (
                <select
                  onChange={(e) => {
                    if (e.target.value) handleSelectProfile(e.target.value);
                  }}
                  className="w-full bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                  defaultValue=""
                >
                  <option value="" disabled>Carregar perfil guardado...</option>
                  {profiles.map(p => (
                    <option key={p.name} value={p.name}>
                      🏢 {p.name} ({p.config.server}:{p.config.port})
                    </option>
                  ))}
                </select>
              )}

              <div className="flex gap-1.5 col-span-1 sm:col-span-1">
                <input
                  type="text"
                  placeholder="Nome do cliente (ex: Pastelaria Central)..."
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="flex-1 bg-white border border-indigo-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 font-medium"
                />
                <button
                  type="button"
                  onClick={handleSaveCurrentProfile}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1 rounded-lg text-xs transition shadow-2xs shrink-0"
                >
                  Gravar Perfil
                </button>
              </div>
            </div>
          </div>

          {/* Importar e Desencriptar Ficheiro .xdl do ZoneSoft */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-600 text-white rounded-lg shadow-xs shrink-0">
                <FileCode className="w-4 h-4" />
              </div>
              <div>
                <span className="font-extrabold text-slate-900 text-xs block">Carregar Ficheiro .xdl do ZoneSoft</span>
                <span className="text-[10px] text-slate-600 block">Desencripta o ficheiro de configuração do POS e preenche a palavra-passe SQL</span>
              </div>
            </div>
            <label className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition shrink-0 flex items-center gap-1.5 shadow-xs">
              <Unlock className="w-3.5 h-3.5" />
              Carregar .xdl
              <input
                type="file"
                accept=".xdl"
                className="hidden"
                onChange={(e) => handleImportXdlConfig(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {importedPasswordMsg && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 font-bold text-xs p-2.5 rounded-xl flex items-center justify-between shadow-2xs">
              <span className="flex items-center gap-1.5">
                <Key className="w-4 h-4 text-emerald-600 shrink-0" />
                {importedPasswordMsg}
              </span>
              <button type="button" onClick={() => setImportedPasswordMsg(null)} className="text-emerald-700 hover:text-emerald-950 text-xs font-bold px-1.5">✕</button>
            </div>
          )}

          {/* Servidor & Porta com Scan de Portas */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div className="sm:col-span-2">
                <label className="text-slate-700 font-bold block mb-1 flex items-center gap-1">
                  <Server className="w-3.5 h-3.5 text-indigo-600" />
                  Servidor / IP SQL Server:
                </label>
                <input
                  type="text"
                  value={formConfig.server}
                  onChange={(e) => setFormConfig({ ...formConfig, server: e.target.value })}
                  placeholder="192.168.1.100, localhost ou SERVIDOR\SQLEXPRESS"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100 font-mono font-semibold text-xs"
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100 font-mono font-semibold text-xs"
                />
              </div>

              <div className="flex flex-col justify-end">
                <button
                  type="button"
                  onClick={handleScanPorts}
                  disabled={isScanningPorts || !formConfig.server}
                  className="w-full flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition shadow-2xs disabled:opacity-50"
                >
                  <Radar className={`w-3.5 h-3.5 ${isScanningPorts ? 'animate-spin' : ''}`} />
                  {isScanningPorts ? 'Verificar...' : 'Scan Portas'}
                </button>
              </div>
            </div>

            {/* Scan Message & Port Badges */}
            {(scanMessage || (portScanResults && portScanResults.length > 0)) && (
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-2 space-y-1.5">
                {scanMessage && (
                  <p className={`text-[11px] font-medium ${
                    portScanResults?.some(r => r.open) ? 'text-emerald-700 font-bold' : 'text-amber-800'
                  }`}>
                    {scanMessage}
                  </p>
                )}

                {portScanResults && portScanResults.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-indigo-100">
                    {portScanResults.map((p) => {
                      const isSelected = formConfig.port === p.port;
                      return (
                        <button
                          key={p.port}
                          type="button"
                          onClick={() => setFormConfig({ ...formConfig, port: p.port })}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 border transition ${
                            p.open
                              ? isSelected
                                ? 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-300'
                                : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-white text-slate-400 border-slate-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${p.open ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          Porta {p.port} {p.open ? '(Aberta)' : ''}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Base de Dados & Driver ODBC em 2 Colunas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <label className="text-slate-700 font-bold block mb-1 flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-indigo-600" />
                Base de Dados SQL:
              </label>
              <input
                type="text"
                value={formConfig.database}
                onChange={(e) => setFormConfig({ ...formConfig, database: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:bg-white focus:border-indigo-600 font-mono font-semibold text-xs"
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <label className="text-slate-700 font-bold block mb-1">Driver ODBC:</label>
              <select
                value={formConfig.driver}
                onChange={(e) => setFormConfig({ ...formConfig, driver: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:bg-white focus:border-indigo-600 font-mono font-semibold text-xs"
              >
                {driverOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}{drivers.length > 0 && !drivers.includes(d) ? ' (não instalado)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Autenticação & Credenciais */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-slate-700 font-bold block">Autenticação:</label>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setFormConfig({ ...formConfig, trusted_connection: false })}
                  className={`px-3 py-1 rounded-md font-bold text-xs transition ${!formConfig.trusted_connection ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Utilizador SQL (sa)
                </button>
                <button
                  type="button"
                  onClick={() => setFormConfig({ ...formConfig, trusted_connection: true })}
                  className={`px-3 py-1 rounded-md font-bold text-xs transition ${formConfig.trusted_connection ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Autenticação Windows
                </button>
              </div>
            </div>

            {!formConfig.trusted_connection && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="text-slate-700 font-bold block mb-1 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-indigo-600" />
                    Utilizador SQL (sa):
                  </label>
                  <input
                    type="text"
                    value={formConfig.username || ''}
                    onChange={(e) => setFormConfig({ ...formConfig, username: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:bg-white focus:border-indigo-600 font-mono font-semibold text-xs"
                  />
                </div>
                <div>
                  <label className="text-slate-700 font-bold block mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Key className="w-3.5 h-3.5 text-indigo-600" />
                      Palavra-passe:
                    </span>
                    {formConfig.password_saved && !formConfig.password && (
                      <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                        Guardada
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formConfig.password || ''}
                      onChange={(e) => setFormConfig({ ...formConfig, password: e.target.value })}
                      placeholder={formConfig.password_saved ? '•••••••• (Manter)' : 'Palavra-passe SQL'}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-2.5 pr-8 py-1.5 text-slate-900 focus:bg-white focus:border-indigo-600 font-mono font-semibold text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition"
                      title={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <label className="sm:col-span-2 flex items-center gap-2 text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={!!formConfig.save_password}
                    onChange={(e) => setFormConfig({ ...formConfig, save_password: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-[11px] font-medium">
                    <strong>Guardar a palavra-passe</strong> no config.json em texto simples.
                  </span>
                </label>
              </div>
            )}
          </div>
        </form>

        {/* Modal Footer - Fixed */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition shadow-2xs"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isTesting}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl shadow-md shadow-indigo-600/10 transition flex items-center gap-2 text-xs"
          >
            {isTesting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                A testar conexão...
              </>
            ) : (
              'Gravar & Testar Conexão'
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
