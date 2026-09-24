import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Users, Search, CheckCircle2, AlertCircle, RefreshCw,
  Building2, MapPin, Phone, Mail, Save, AlertTriangle, Sparkles,
  Lock, RotateCcw, Globe, Percent, CreditCard, FileText, User,
  Check, Smartphone, Eye, Trash2
} from 'lucide-react';
import { CustomerItem, CustomerAuditResponse, NifLookupResponse } from '../types';

interface CustomersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  embedded?: boolean;
}

interface CustomerFormData {
  codigo: number;
  nome: string;
  nif: string;
  morada: string;
  localidade: string;
  codpostal: string;
  codpostal1: string;
  pais: string;
  telefone: string;
  telemovel: string;
  email: string;
  web: string;
  fax: string;
  nomecontacto: string;
  desconto: number;
  limitecredito: number;
  obs: string;
  obsaviso: string;
  bloqueado: number;
}

export const CustomersModal: React.FC<CustomersModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  embedded = false
}) => {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [validCount, setValidCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyInvalid, setOnlyInvalid] = useState(false);

  // Selected customer & edit form state
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [formData, setFormData] = useState<CustomerFormData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'comercial' | 'nif_lookup'>('dados');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // NIF.pt lookup state
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<NifLookupResponse | null>(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('nif_pt_api_key') || '');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const q = new URLSearchParams();
      if (search) q.append('search', search);
      if (onlyInvalid) q.append('only_invalid', 'true');
      q.append('limit', '300');

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
    if (isOpen || embedded) {
      loadCustomers();
      setSelectedCustomer(null);
      setFormData(null);
      setLookupResult(null);
    }
  }, [isOpen, embedded, onlyInvalid]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadCustomers();
  };

  const handleSelectCustomer = (cust: CustomerItem) => {
    setSelectedCustomer(cust);
    setFormData({
      codigo: cust.codigo,
      nome: cust.nome || '',
      nif: cust.nif || '',
      morada: cust.morada || '',
      localidade: cust.localidade || '',
      codpostal: cust.codpostal || '',
      codpostal1: cust.codpostal1 || '',
      pais: cust.pais || 'PT',
      telefone: cust.telefone || '',
      telemovel: cust.telemovel || '',
      email: cust.email || '',
      web: cust.web || '',
      fax: cust.fax || '',
      nomecontacto: cust.nomecontacto || '',
      desconto: cust.desconto !== undefined ? Number(cust.desconto) : 0,
      limitecredito: cust.limitecredito !== undefined ? Number(cust.limitecredito) : 0,
      obs: cust.obs || '',
      obsaviso: cust.obsaviso || '',
      bloqueado: cust.bloqueado ? 1 : 0,
    });
    setLookupResult(null);
    setActiveTab('dados');
  };

  const handleFieldChange = <K extends keyof CustomerFormData>(key: K, value: CustomerFormData[K]) => {
    setFormData(prev => prev ? ({ ...prev, [key]: value }) : null);
  };

  // Track unsaved modifications
  const isDirty = useMemo(() => {
    if (!selectedCustomer || !formData) return false;
    return (
      formData.nome !== (selectedCustomer.nome || '') ||
      formData.morada !== (selectedCustomer.morada || '') ||
      formData.localidade !== (selectedCustomer.localidade || '') ||
      formData.codpostal !== (selectedCustomer.codpostal || '') ||
      formData.codpostal1 !== (selectedCustomer.codpostal1 || '') ||
      formData.pais !== (selectedCustomer.pais || 'PT') ||
      formData.telefone !== (selectedCustomer.telefone || '') ||
      formData.telemovel !== (selectedCustomer.telemovel || '') ||
      formData.email !== (selectedCustomer.email || '') ||
      formData.web !== (selectedCustomer.web || '') ||
      formData.fax !== (selectedCustomer.fax || '') ||
      formData.nomecontacto !== (selectedCustomer.nomecontacto || '') ||
      Number(formData.desconto) !== Number(selectedCustomer.desconto || 0) ||
      Number(formData.limitecredito) !== Number(selectedCustomer.limitecredito || 0) ||
      formData.obs !== (selectedCustomer.obs || '') ||
      formData.obsaviso !== (selectedCustomer.obsaviso || '') ||
      Number(formData.bloqueado) !== Number(selectedCustomer.bloqueado ? 1 : 0)
    );
  }, [selectedCustomer, formData]);

  const handleLookupNif = async (nifToLookup: string) => {
    if (!nifToLookup || nifToLookup.trim().length < 9) {
      alert('Selecione um cliente com NIF válido para consultar.');
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
        setActiveTab('nif_lookup');
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

  const handleApplyLookupToForm = () => {
    if (!lookupResult || !formData) return;
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        nome: lookupResult.nome || prev.nome,
        morada: lookupResult.morada || prev.morada,
        localidade: lookupResult.localidade || prev.localidade,
        codpostal: lookupResult.codpostal || prev.codpostal,
        telefone: lookupResult.telefone || prev.telefone,
        email: lookupResult.email || prev.email,
      };
    });
    setActiveTab('dados');
  };

  const handleSaveCustomer = async () => {
    if (!selectedCustomer || !formData) return;
    setIsSaving(true);
    try {
      const payload = {
        codigo: selectedCustomer.codigo,
        nome: formData.nome,
        // NIF is protected and NOT editable
        morada: formData.morada,
        localidade: formData.localidade,
        codpostal: formData.codpostal,
        codpostal1: formData.codpostal1,
        pais: formData.pais,
        telefone: formData.telefone,
        telemovel: formData.telemovel,
        email: formData.email,
        web: formData.web,
        fax: formData.fax,
        nomecontacto: formData.nomecontacto,
        desconto: Number(formData.desconto) || 0,
        limitecredito: Number(formData.limitecredito) || 0,
        obs: formData.obs,
        obsaviso: formData.obsaviso,
        bloqueado: Number(formData.bloqueado) || 0,
      };

      const res = await fetch(`/api/customers/${selectedCustomer.codigo}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const updated: CustomerItem = {
          ...selectedCustomer,
          ...formData
        };
        setSelectedCustomer(updated);
        setCustomers(prev => prev.map(c => c.codigo === updated.codigo ? updated : c));
        onSuccess(`Ficha do cliente #${selectedCustomer.codigo} atualizada com sucesso!`);
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

  const handleRevert = () => {
    if (selectedCustomer) {
      handleSelectCustomer(selectedCustomer);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!selectedCustomer) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/customers/${selectedCustomer.codigo}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Erro ao eliminar cliente');
      }
      setShowDeleteConfirm(false);
      const deletedCode = selectedCustomer.codigo;
      setSelectedCustomer(null);
      setFormData(null);
      onSuccess(data.message || `Cliente #${deletedCode} eliminado com sucesso.`);
      loadCustomers();
    } catch (err: any) {
      alert(err.message || 'Erro ao eliminar cliente');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveApiKey = (val: string) => {
    setApiKey(val);
    localStorage.setItem('nif_pt_api_key', val);
  };

  if (!isOpen && !embedded) return null;

  const modalContent = (
    <>
      <div className={`bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-800 ${
        embedded ? 'w-full h-full border-0 rounded-none shadow-none bg-slate-950 text-slate-100' : 'w-full max-w-7xl max-h-[94vh]'
      }`}>
        
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              Gestão e Fichas de Clientes (ZoneSoft)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Consulta detalhada na janela da direita, edição completa de dados e validação de NIF conforme as regras fiscais da AT.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Filter Bar */}
        <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap text-xs">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-[280px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Pesquisar por Nome, NIF, Código, Telefone ou Telemóvel..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-1.5 rounded-xl shadow-xs transition cursor-pointer"
            >
              Pesquisar
            </button>
          </form>

          {/* Filters & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setOnlyInvalid(!onlyInvalid)}
              className={`px-3 py-1.5 rounded-xl font-bold border transition flex items-center gap-1.5 cursor-pointer ${
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
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-xl border border-slate-200 transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>

            <button
              type="button"
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              className="text-slate-500 hover:text-indigo-600 px-2 py-1 text-xs font-semibold underline cursor-pointer"
            >
              {apiKey ? '🔑 Chave NIF.pt ativa' : '⚙️ Chave NIF.pt'}
            </button>
          </div>
        </div>

        {/* API Key Banner Config */}
        {showApiKeyInput && (
          <div className="bg-amber-50 px-6 py-2 border-b border-amber-200 flex items-center justify-between text-xs gap-4">
            <div className="flex items-center gap-2 flex-1">
              <span className="font-bold text-amber-900 shrink-0">Chave API NIF.pt (Opcional):</span>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => handleSaveApiKey(e.target.value)}
                placeholder="Insira a sua chave do NIF.pt para mais pedidos diários..."
                className="bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs flex-1 font-mono"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowApiKeyInput(false)}
              className="font-bold text-amber-800 underline hover:opacity-80 cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Main Content Area: Split View */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Left Table: Customers List */}
          <div className="flex-1 overflow-auto border-r border-slate-200 bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase tracking-wider z-5">
                <tr>
                  <th className="p-2.5 w-16">Cód.</th>
                  <th className="p-2.5">Nome / Designação</th>
                  <th className="p-2.5 w-28">NIF</th>
                  <th className="p-2.5 w-28">Estado NIF</th>
                  <th className="p-2.5 w-24 text-center">Vendas</th>
                  <th className="p-2.5 w-28">Contacto</th>
                  <th className="p-2.5 w-28">Localidade</th>
                  <th className="p-2.5 w-20 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      {isLoading ? 'A carregar clientes...' : 'Nenhum cliente encontrado.'}
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => {
                    const isSelected = selectedCustomer?.codigo === c.codigo;
                    const contact = c.telemovel || c.telefone || '-';
                    const isBlocked = !!c.bloqueado;
                    const salesCount = c.sales_count ?? 0;
                    return (
                      <tr
                        key={c.codigo}
                        onClick={() => handleSelectCustomer(c)}
                        className={`cursor-pointer transition select-none ${
                          isSelected
                            ? 'bg-indigo-50/90 font-medium border-l-4 border-indigo-600'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-2.5 font-mono font-bold text-slate-700">#{c.codigo}</td>
                        <td className="p-2.5 font-bold text-slate-900 truncate max-w-[200px]" title={c.nome}>
                          {c.nome || <span className="text-slate-400 italic">Sem Nome</span>}
                        </td>
                        <td className="p-2.5 font-mono font-semibold">
                          {c.nif || <span className="text-rose-500 italic">Sem NIF</span>}
                        </td>
                        <td className="p-2.5">
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
                        <td className="p-2.5 text-center">
                          {salesCount > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200" title={`${salesCount} documento(s) de venda emitidos (SAF-T)`}>
                              {salesCount} doc{salesCount > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200" title="Sem vendas registadas (pode ser apagado)">
                              0 vendas
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-600 font-mono text-[11px] truncate max-w-[120px]">{contact}</td>
                        <td className="p-2.5 text-slate-600 truncate max-w-[120px]">{c.localidade || '-'}</td>
                        <td className="p-2.5 text-center">
                          {isBlocked ? (
                            <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                              Bloqueado
                            </span>
                          ) : (
                            <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                              Ativo
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Right Panel: Complete Customer Data & Edit Form */}
          <div className="w-full md:w-[480px] lg:w-[520px] shrink-0 bg-slate-50 flex flex-col justify-between overflow-hidden border-t md:border-t-0 border-slate-200">
            {selectedCustomer && formData ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                
                {/* Right Panel Header */}
                <div className="p-4 bg-white border-b border-slate-200 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          #{formData.codigo}
                        </span>
                        <h3 className="font-bold text-slate-900 text-sm truncate max-w-[280px]" title={formData.nome}>
                          {formData.nome || 'Cliente Sem Nome'}
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {formData.nomecontacto ? `Contacto: ${formData.nomecontacto}` : 'Ficha completa do cliente'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {(selectedCustomer.sales_count ?? 0) > 0 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200" title={`${selectedCustomer.sales_count} documentos de venda emitidos`}>
                          {selectedCustomer.sales_count} Venda(s)
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200" title="Sem vendas registadas no histórico">
                          0 Vendas
                        </span>
                      )}
                      {formData.bloqueado ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                          Bloqueado
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Ativo no POS
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex items-center gap-1 border-b border-slate-200 pt-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveTab('dados')}
                      className={`pb-2 px-3 font-bold border-b-2 transition cursor-pointer ${
                        activeTab === 'dados'
                          ? 'border-indigo-600 text-indigo-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Identificação & Contactos
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('comercial')}
                      className={`pb-2 px-3 font-bold border-b-2 transition cursor-pointer ${
                        activeTab === 'comercial'
                          ? 'border-indigo-600 text-indigo-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Comercial & POS
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('nif_lookup')}
                      className={`pb-2 px-3 font-bold border-b-2 transition flex items-center gap-1 cursor-pointer ${
                        activeTab === 'nif_lookup'
                          ? 'border-indigo-600 text-indigo-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                      Consulta NIF.pt
                    </button>
                  </div>
                </div>

                {/* Form Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">

                  {/* TAB 1: IDENTIFICAÇÃO E CONTACTOS */}
                  {activeTab === 'dados' && (
                    <div className="space-y-4 text-xs">

                      {/* NIF & Validation Box */}
                      <div className="bg-slate-100/70 p-3 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-slate-500" />
                            <span>NIF / N.º de Contribuinte (Protegido)</span>
                          </label>
                          <span className="text-[10px] text-slate-500 italic">Não editável (SAF-T)</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={formData.nif}
                              readOnly
                              disabled
                              className="w-full bg-slate-200/70 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-700 cursor-not-allowed select-all"
                              title="O NIF do cliente não pode ser alterado para garantir a integridade fiscal e histórico SAF-T."
                            />
                            <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                          </div>

                          <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border whitespace-nowrap ${
                            selectedCustomer.is_valid_nif
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border-rose-300'
                          }`}>
                            {selectedCustomer.nif_validation_message || (selectedCustomer.is_valid_nif ? 'Válido' : 'Inválido')}
                          </span>
                        </div>

                        {selectedCustomer.is_valid_nif && selectedCustomer.nif !== '999999990' && (
                          <button
                            type="button"
                            onClick={() => handleLookupNif(formData.nif)}
                            disabled={isLookingUp}
                            className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-1.5 px-3 rounded-lg border border-indigo-200 transition flex items-center justify-center gap-1.5 text-xs cursor-pointer disabled:opacity-50"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${isLookingUp ? 'animate-spin' : ''}`} />
                            {isLookingUp ? 'A consultar NIF.pt...' : 'Preencher dados oficiais via NIF.pt'}
                          </button>
                        )}
                      </div>

                      {/* Nome / Razão Social */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-indigo-600" />
                          Nome / Razão Social *
                        </label>
                        <input
                          type="text"
                          value={formData.nome}
                          onChange={(e) => handleFieldChange('nome', e.target.value)}
                          placeholder="Nome da empresa ou cliente..."
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200"
                        />
                      </div>

                      {/* Nome de Contacto */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700">Pessoa de Contacto / Responsável</label>
                        <input
                          type="text"
                          value={formData.nomecontacto}
                          onChange={(e) => handleFieldChange('nomecontacto', e.target.value)}
                          placeholder="Ex: Dr. Silva / Maria Santos"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200"
                        />
                      </div>

                      {/* Morada */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                          Morada
                        </label>
                        <input
                          type="text"
                          value={formData.morada}
                          onChange={(e) => handleFieldChange('morada', e.target.value)}
                          placeholder="Rua, Avenida, Número, Andar..."
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200"
                        />
                      </div>

                      {/* Código Postal & Localidade */}
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-5 space-y-1">
                          <label className="text-[11px] font-bold text-slate-700">Cód. Postal</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={formData.codpostal}
                              onChange={(e) => handleFieldChange('codpostal', e.target.value)}
                              placeholder="4000"
                              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-center font-mono text-slate-800"
                            />
                            <span className="text-slate-400 font-bold">-</span>
                            <input
                              type="text"
                              value={formData.codpostal1}
                              onChange={(e) => handleFieldChange('codpostal1', e.target.value)}
                              placeholder="001"
                              className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-center font-mono text-slate-800"
                            />
                          </div>
                        </div>

                        <div className="col-span-5 space-y-1">
                          <label className="text-[11px] font-bold text-slate-700">Localidade</label>
                          <input
                            type="text"
                            value={formData.localidade}
                            onChange={(e) => handleFieldChange('localidade', e.target.value)}
                            placeholder="Porto"
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                          />
                        </div>

                        <div className="col-span-2 space-y-1">
                          <label className="text-[11px] font-bold text-slate-700">País</label>
                          <input
                            type="text"
                            value={formData.pais}
                            onChange={(e) => handleFieldChange('pais', e.target.value.toUpperCase())}
                            maxLength={3}
                            placeholder="PT"
                            className="w-full bg-white border border-slate-300 rounded-lg px-1 py-1.5 text-xs text-center uppercase font-mono font-bold text-slate-800"
                          />
                        </div>
                      </div>

                      {/* Contactos: Telefone & Telemóvel */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-indigo-600" />
                            Telefone Fixo
                          </label>
                          <input
                            type="text"
                            value={formData.telefone}
                            onChange={(e) => handleFieldChange('telefone', e.target.value)}
                            placeholder="220 000 000"
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                            <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                            Telemóvel
                          </label>
                          <input
                            type="text"
                            value={formData.telemovel}
                            onChange={(e) => handleFieldChange('telemovel', e.target.value)}
                            placeholder="910 000 000"
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800"
                          />
                        </div>
                      </div>

                      {/* Email & Website */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-indigo-600" />
                            Email
                          </label>
                          <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => handleFieldChange('email', e.target.value)}
                            placeholder="cliente@exemplo.pt"
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                            <Globe className="w-3.5 h-3.5 text-indigo-600" />
                            Website
                          </label>
                          <input
                            type="text"
                            value={formData.web}
                            onChange={(e) => handleFieldChange('web', e.target.value)}
                            placeholder="www.exemplo.pt"
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                          />
                        </div>
                      </div>

                    </div>
                  )}

                  {/* TAB 2: COMERCIAL E POS */}
                  {activeTab === 'comercial' && (
                    <div className="space-y-4 text-xs">

                      {/* Desconto e Limite de Crédito */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                            <Percent className="w-3.5 h-3.5 text-indigo-600" />
                            Desconto Comercial (%)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={formData.desconto}
                            onChange={(e) => handleFieldChange('desconto', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 text-right"
                          />
                          <p className="text-[10px] text-slate-500">Desconto atribuído por defeito ao cliente no POS.</p>
                        </div>

                        <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                            <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                            Limite de Crédito (€)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="10"
                            value={formData.limitecredito}
                            onChange={(e) => handleFieldChange('limitecredito', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 text-right"
                          />
                          <p className="text-[10px] text-slate-500">Plafond máximo de conta corrente a crédito.</p>
                        </div>
                      </div>

                      {/* Saldo / Dívida Atual (Informativo) */}
                      <div className="bg-slate-100/70 p-3 rounded-xl border border-slate-200 grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400">Saldo Atual:</span>
                          <p className="text-sm font-mono font-bold text-slate-800">
                            {Number(selectedCustomer.saldo || 0).toFixed(2)} €
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400">Valor em Dívida:</span>
                          <p className={`text-sm font-mono font-bold ${
                            Number(selectedCustomer.valordivida || 0) > 0 ? 'text-rose-600' : 'text-slate-800'
                          }`}>
                            {Number(selectedCustomer.valordivida || 0).toFixed(2)} €
                          </p>
                        </div>
                      </div>

                      {/* Bloqueado no POS Toggle */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-900 block">Bloquear Cliente no POS</span>
                          <span className="text-[11px] text-slate-500">Impede a emissão de novos documentos de venda a este cliente.</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!formData.bloqueado}
                            onChange={(e) => handleFieldChange('bloqueado', e.target.checked ? 1 : 0)}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                        </label>
                      </div>

                      {/* Aviso no POS (obsaviso) */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1 text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          Aviso no POS ao Selecionar Cliente (Pop-up ZSRest)
                        </label>
                        <input
                          type="text"
                          value={formData.obsaviso}
                          onChange={(e) => handleFieldChange('obsaviso', e.target.value)}
                          placeholder="Ex: Pedir confirmação de matrícula / Cliente VIP..."
                          className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                        />
                      </div>

                      {/* Observações Internas (obs) */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-indigo-600" />
                          Observações Internas
                        </label>
                        <textarea
                          rows={3}
                          value={formData.obs}
                          onChange={(e) => handleFieldChange('obs', e.target.value)}
                          placeholder="Notas administrativas sobre o cliente..."
                          className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200"
                        />
                      </div>

                      {selectedCustomer.datacriacao && (
                        <div className="text-[10px] text-slate-400 italic">
                          Cliente criado no sistema em: {selectedCustomer.datacriacao}
                        </div>
                      )}

                    </div>
                  )}

                  {/* TAB 3: CONSULTA NIF.PT */}
                  {activeTab === 'nif_lookup' && (
                    <div className="space-y-3 text-xs">
                      <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl text-indigo-900">
                        <p className="font-bold flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-indigo-600" />
                          Integração com a API Oficial do NIF.pt
                        </p>
                        <p className="text-[11px] text-indigo-800 mt-0.5">
                          Permite obter a razão social oficial da empresa, morada fiscal, código postal e CAE diretamente da base de dados do NIF.pt.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleLookupNif(formData.nif)}
                        disabled={isLookingUp}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-xl transition shadow-xs flex items-center justify-center gap-2 text-xs disabled:opacity-50 cursor-pointer"
                      >
                        <Sparkles className={`w-4 h-4 ${isLookingUp ? 'animate-spin' : ''}`} />
                        {isLookingUp ? 'A consultar NIF.pt...' : `Consultar NIF ${formData.nif}`}
                      </button>

                      {lookupResult && (
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-3 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="font-bold text-slate-900">Resultado Oficial Obtido:</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              lookupResult.is_valid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {lookupResult.validation_message}
                            </span>
                          </div>

                          {lookupResult.nome && (
                            <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                              <div>
                                <span className="text-[10px] text-slate-400 uppercase font-bold">Designação Oficial:</span>
                                <p className="font-bold text-slate-900">{lookupResult.nome}</p>
                              </div>
                              {lookupResult.morada && (
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase font-bold">Morada Fiscal:</span>
                                  <p className="text-slate-700">{lookupResult.morada}</p>
                                </div>
                              )}
                              {(lookupResult.codpostal || lookupResult.localidade) && (
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase font-bold">Localidade:</span>
                                  <p className="text-slate-700">{lookupResult.codpostal} {lookupResult.localidade}</p>
                                </div>
                              )}
                              {lookupResult.atividade && (
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase font-bold">CAE / Atividade:</span>
                                  <p className="text-indigo-700 italic">{lookupResult.atividade}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {lookupResult.nome && (
                            <button
                              type="button"
                              onClick={handleApplyLookupToForm}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 text-xs cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                              Aplicar estes dados no formulário
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                </div>

                {/* Right Panel Footer: Actions */}
                <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {selectedCustomer.can_delete ? (
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isDeleting || isSaving}
                        className="px-2.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Eliminar este cliente da base de dados (0 vendas registadas)"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        Apagar Cliente
                      </button>
                    ) : selectedCustomer.has_sales ? (
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1 cursor-default" title="Cliente com vendas registadas. A lei fiscal impede a sua eliminação para preservar o ficheiro SAF-T.">
                        <Lock className="w-3 h-3 text-slate-400" />
                        Com vendas (SAF-T)
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1 cursor-default" title="Cliente de sistema não eliminável">
                        <Lock className="w-3 h-3 text-slate-400" />
                        Cliente de sistema
                      </span>
                    )}

                    {isDirty && (
                      <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 animate-pulse">
                        Alterações pendentes
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isDirty && (
                      <button
                        type="button"
                        onClick={handleRevert}
                        disabled={isSaving}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition flex items-center gap-1 cursor-pointer"
                        title="Reverter alterações e repor dados originais"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reverter
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleSaveCustomer}
                      disabled={isSaving || !isDirty}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-1.5 rounded-xl shadow-xs transition flex items-center gap-1.5 text-xs disabled:opacity-40 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSaving ? 'A guardar...' : 'Guardar Alterações'}
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex-1 p-8 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 border border-slate-200">
                  <Users className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-700">Nenhum cliente selecionado</h4>
                  <p className="text-xs max-w-xs leading-relaxed text-slate-500">
                    Selecione um cliente na tabela à esquerda para visualizar e editar os dados completos da ficha.
                  </p>
                </div>
              </div>
            )}

            {/* Global Stats Footer */}
            <div className="p-3 bg-slate-100/90 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
              <div>
                Total: <strong>{totalCount}</strong> • Válidos: <strong className="text-emerald-700">{validCount}</strong> • Inválidos: <strong className="text-rose-700">{invalidCount}</strong>
              </div>
              <div className="text-[10px] text-slate-400">
                🔒 NIF protegido contra edição (SAF-T)
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Validação oficial conforme regras da AT / Ministério das Finanças (Módulo 11). Atualização sincronizada com ZoneSoft POS (<code className="font-mono text-[11px]">sync=1</code>).
          </span>
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-1.5 rounded-xl transition cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>

      {/* Delete Customer Confirmation Modal */}
      {showDeleteConfirm && selectedCustomer && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-slate-900 text-sm">Eliminar Cliente #{selectedCustomer.codigo}?</h4>
                <p className="text-xs text-slate-600 mt-1 break-words">
                  Tem a certeza que deseja eliminar o cliente <strong className="text-slate-900 font-bold">&ldquo;{selectedCustomer.nome}&rdquo;</strong>?
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold flex items-center gap-1.5 text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Operação Segura com Salvaguarda Fiscal:
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Este cliente possui <strong>0 vendas registadas</strong>. Será criado automaticamente um snapshot de cópia de segurança antes da eliminação no SQL Server e registo em <code className="font-mono bg-amber-100/80 px-1 rounded">dbo.clientes_apagar</code> para sincronização.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteCustomer}
                disabled={isDeleting}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-1.5 rounded-xl shadow-xs text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeleting ? 'A eliminar...' : 'Sim, Eliminar Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );

  if (embedded) {
    return modalContent;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      {modalContent}
    </div>
  );
};
