import React, { useState, useEffect } from 'react';
import {
  X, Users, Search, CheckCircle2, AlertCircle, RefreshCw,
  Globe, Building2, MapPin, Phone, Mail, Save, AlertTriangle, Sparkles
} from 'lucide-react';
import { CustomerItem, CustomerAuditResponse, NifLookupResponse } from '../types';

interface CustomersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export const CustomersModal: React.FC<CustomersModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [validCount, setValidCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyInvalid, setOnlyInvalid] = useState(false);

  // Lookup state
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<NifLookupResponse | null>(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('nif_pt_api_key') || '');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const q = new URLSearchParams();
      if (search) q.append('search', search);
      if (onlyInvalid) q.append('only_invalid', 'true');
      q.append('limit', '250');

      const res = await fetch(`/api/customers?${q.toString()}`);
      if (res.ok) {
        const data: CustomerAuditResponse = await res.json();
        setCustomers(data.customers);
        setTotalCount(data.total);
        setValidCount(data.valid_count);
        setInvalidCount(data.invalid_count);
      }
    } catch (e) {
      console.error('Falha ao obter clientes', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCustomers();
      setSelectedCustomer(null);
      setLookupResult(null);
    }
  }, [isOpen, onlyInvalid]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadCustomers();
  };

  const handleSelectCustomer = (cust: CustomerItem) => {
    setSelectedCustomer(cust);
    setLookupResult(null);
  };

  const handleLookupNif = async (nifToLookup: string) => {
    if (!nifToLookup || nifToLookup.trim().length < 9) {
      alert('Selecione um cliente ou insira um NIF válido para consultar.');
      return;
    }
    setIsLookingUp(true);
    try {
      const res = await fetch('/api/customers/lookup-nif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nif: nifToLookup, api_key: apiKey })
      });
      if (res.ok) {
        const data: NifLookupResponse = await res.json();
        setLookupResult(data);
      } else {
        const err = await res.json();
        alert(`Erro na consulta NIF: ${err.detail || 'Não foi possível contactar NIF.pt'}`);
      }
    } catch (e: any) {
      alert(`Falha de comunicação: ${e.message}`);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleApplyLookupToCustomer = async () => {
    if (!selectedCustomer || !lookupResult || !lookupResult.is_valid) return;
    setIsSaving(true);
    try {
      const updatePayload = {
        customers: [{
          codigo: selectedCustomer.codigo,
          nome: lookupResult.nome || selectedCustomer.nome,
          nif: lookupResult.nif || selectedCustomer.nif,
          morada: lookupResult.morada || selectedCustomer.morada,
          localidade: lookupResult.localidade || selectedCustomer.localidade,
          codpostal: lookupResult.codpostal || selectedCustomer.codpostal,
          telefone: lookupResult.telefone || selectedCustomer.telefone,
          email: lookupResult.email || selectedCustomer.email,
        }]
      };

      const res = await fetch('/api/customers/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });

      if (res.ok) {
        onSuccess(`Dados do cliente #${selectedCustomer.codigo} atualizados via NIF.pt!`);
        loadCustomers();
        setSelectedCustomer(null);
        setLookupResult(null);
      } else {
        const err = await res.json();
        alert(`Erro ao gravar: ${err.detail || 'Falha no SQL Server'}`);
      }
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveApiKey = (val: string) => {
    setApiKey(val);
    localStorage.setItem('nif_pt_api_key', val);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              Verificação de Clientes & Integração NIF.pt
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Auditoria de NIFs, deteção de dados inválidos e preenchimento automático de empresas via API NIF.pt.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Stats Bar */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap text-xs">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-[280px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Pesquisar por Nome, NIF ou Código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-1.5 rounded-xl shadow-xs transition"
            >
              Pesquisar
            </button>
          </form>

          {/* Filters & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setOnlyInvalid(!onlyInvalid)}
              className={`px-3 py-1.5 rounded-xl font-bold border transition flex items-center gap-1.5 ${
                onlyInvalid
                  ? 'bg-rose-50 text-rose-800 border-rose-300 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <AlertCircle className={`w-3.5 h-3.5 ${onlyInvalid ? 'text-rose-600' : 'text-slate-500'}`} />
              Apenas NIFs Inválidos ({invalidCount})
            </button>

            <button
              type="button"
              onClick={loadCustomers}
              disabled={isLoading}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-xl border border-slate-200 transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>

            <button
              type="button"
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              className="text-slate-500 hover:text-indigo-600 px-2 py-1 text-xs font-semibold underline"
            >
              {apiKey ? '🔑 Chave NIF.pt configurada' : '⚙️ Chave NIF.pt'}
            </button>
          </div>
        </div>

        {/* API Key Banner Config (optional) */}
        {showApiKeyInput && (
          <div className="bg-amber-50 px-6 py-2.5 border-b border-amber-200 flex items-center justify-between text-xs gap-4">
            <div className="flex items-center gap-2 flex-1">
              <span className="font-bold text-amber-900 shrink-0">Chave API NIF.pt (Opcional):</span>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => handleSaveApiKey(e.target.value)}
                placeholder="Insira a sua chave de API do NIF.pt se pretender mais consultas diárias..."
                className="bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs flex-1 font-mono"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowApiKeyInput(false)}
              className="font-bold text-amber-800 underline hover:opacity-80"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Customers Table */}
          <div className="flex-1 overflow-auto border-r border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase tracking-wider z-5">
                <tr>
                  <th className="p-3 w-16">Cód.</th>
                  <th className="p-3">Nome / Designação</th>
                  <th className="p-3 w-32">NIF</th>
                  <th className="p-3 w-32">Estado NIF</th>
                  <th className="p-3 w-28">Localidade</th>
                  <th className="p-3 w-20 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      {isLoading ? 'A carregar clientes...' : 'Nenhum cliente encontrado.'}
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => {
                    const isSelected = selectedCustomer?.codigo === c.codigo;
                    return (
                      <tr
                        key={c.codigo}
                        onClick={() => handleSelectCustomer(c)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-indigo-50 font-medium' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-3 font-mono font-bold text-slate-700">#{c.codigo}</td>
                        <td className="p-3 font-bold text-slate-900 truncate max-w-[200px]" title={c.nome}>
                          {c.nome || <span className="text-slate-400 italic">Sem Nome</span>}
                        </td>
                        <td className="p-3 font-mono font-semibold">
                          {c.nif || <span className="text-rose-500 italic">Sem NIF</span>}
                        </td>
                        <td className="p-3">
                          {c.is_valid_nif ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              {c.nif === '999999990' ? 'Cons. Final' : 'Válido'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200" title={c.nif_validation_message}>
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              Inválido
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-600 truncate max-w-[120px]">{c.localidade || '-'}</td>
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              handleSelectCustomer(c);
                              handleLookupNif(c.nif);
                            }}
                            className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-2 py-1 rounded border border-indigo-200 transition"
                            title="Consultar na API do NIF.pt"
                          >
                            NIF.pt
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Details & NIF.pt Lookup Panel */}
          <div className="w-full md:w-80 bg-slate-50 p-4 flex flex-col justify-between overflow-auto border-t md:border-t-0 border-slate-200">
            {selectedCustomer ? (
              <div className="space-y-4">
                <div className="border-b border-slate-200 pb-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Cliente Selecionado</span>
                  <h3 className="font-bold text-slate-900 text-sm">{selectedCustomer.nome}</h3>
                  <p className="text-xs font-mono text-slate-600">Código #{selectedCustomer.codigo} • NIF: {selectedCustomer.nif || 'N/A'}</p>
                  
                  <div className="mt-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      selectedCustomer.is_valid_nif ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {selectedCustomer.nif_validation_message}
                    </span>
                  </div>
                </div>

                {/* Lookup Button */}
                <button
                  type="button"
                  onClick={() => handleLookupNif(selectedCustomer.nif)}
                  disabled={isLookingUp}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-xl transition shadow-xs flex items-center justify-center gap-2 text-xs disabled:opacity-50"
                >
                  <Sparkles className={`w-4 h-4 ${isLookingUp ? 'animate-spin' : ''}`} />
                  {isLookingUp ? 'A consultar NIF.pt...' : 'Consultar Dados na API NIF.pt'}
                </button>

                {/* Lookup Results */}
                {lookupResult && (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2.5 text-xs animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <strong className="text-slate-900 flex items-center gap-1.5 font-bold">
                        <Building2 className="w-4 h-4 text-indigo-600" />
                        Resultado NIF.pt:
                      </strong>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {lookupResult.validation_message}
                    </p>

                    {lookupResult.nome && (
                      <div className="space-y-1 bg-slate-50 p-2 rounded-lg border border-slate-200">
                        <p className="font-bold text-slate-900">{lookupResult.nome}</p>
                        {lookupResult.morada && <p className="text-slate-600 text-[11px]">{lookupResult.morada}</p>}
                        {(lookupResult.codpostal || lookupResult.localidade) && (
                          <p className="text-slate-600 text-[11px]">{lookupResult.codpostal} {lookupResult.localidade}</p>
                        )}
                        {lookupResult.atividade && (
                          <p className="text-[10px] text-indigo-700 italic">CAE: {lookupResult.atividade}</p>
                        )}
                      </div>
                    )}

                    {lookupResult.nome && (
                      <button
                        type="button"
                        onClick={handleApplyLookupToCustomer}
                        disabled={isSaving}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 text-xs disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'A gravar...' : 'Gravar Dados no ZoneSoft'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <Users className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs">Selecione um cliente na tabela para auditar e obter dados oficiais via NIF.pt.</p>
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 text-[11px] text-slate-500">
              Total: <strong>{totalCount}</strong> • Válidos: <strong className="text-emerald-700">{validCount}</strong> • Inválidos: <strong className="text-rose-700">{invalidCount}</strong>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Validação oficial conforme regras da AT / Ministério das Finanças (Módulo 11).
          </span>
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-2 rounded-xl transition"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
