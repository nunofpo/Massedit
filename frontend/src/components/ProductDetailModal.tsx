import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Save, Tag, Layers, DollarSign, Percent, Palette, Lock, CheckCircle2,
  AlertTriangle, Utensils, Barcode, Hash, ShieldAlert, Eye, Archive,
  TrendingUp, FolderTree, RefreshCw, Sparkles, Check
} from 'lucide-react';
import {
  ProductItem, Family, Subfamily, Vat, MotivoIsencao,
  ProductionCenterItem, PriceZonesMap
} from '../types';

interface ProductDetailModalProps {
  product: ProductItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess?: (updated: ProductItem) => void;
  families: Family[];
  subfamilies: Subfamily[];
  vats: Vat[];
  motivosIsencao?: MotivoIsencao[];
  productionCenters?: ProductionCenterItem[];
  priceZones?: PriceZonesMap;
}

type TabType = 'general' | 'prices' | 'pos' | 'rules';

const PRESET_COLORS = [
  { name: 'Branco', hex: '#FFFFFF', textHex: '#000000' },
  { name: 'Preto', hex: '#000000', textHex: '#FFFFFF' },
  { name: 'Vermelho', hex: '#EF4444', textHex: '#FFFFFF' },
  { name: 'Verde', hex: '#10B981', textHex: '#FFFFFF' },
  { name: 'Azul', hex: '#3B82F6', textHex: '#FFFFFF' },
  { name: 'Amarelo', hex: '#F59E0B', textHex: '#000000' },
  { name: 'Roxo', hex: '#8B5CF6', textHex: '#FFFFFF' },
  { name: 'Laranja', hex: '#F97316', textHex: '#FFFFFF' },
  { name: 'Cinzento', hex: '#6B7280', textHex: '#FFFFFF' },
];

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  isOpen,
  onClose,
  onSaveSuccess,
  families,
  subfamilies,
  vats,
  motivosIsencao = [],
  productionCenters = [],
  priceZones = {}
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [descricao, setDescricao] = useState('');
  const [descricaocurta, setDescricaocurta] = useState('');
  const [codbarras, setCodbarras] = useState('');
  const [referencia, setReferencia] = useState('');
  const [plu, setPlu] = useState<number | ''>('');
  const [familia, setFamilia] = useState<number | ''>('');
  const [subfamilia, setSubfamilia] = useState<number | ''>('');
  const [iva, setIva] = useState<number | ''>('');
  const [motivoIsencao, setMotivoIsencao] = useState('');
  const [centroProd, setCentroProd] = useState<number | ''>('');

  // Prices 1..10
  const [pvps, setPvps] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [precocompra, setPrecocompra] = useState<number>(0);

  // Meia dose
  const [meiadose, setMeiadose] = useState<number>(0);
  const [precomeia, setPrecomeia] = useState<number>(0);
  const [meiadosedesc, setMeiadosedesc] = useState('');
  const [dosedesc, setDosedesc] = useState('');

  // POS appearance
  const [frontoffice, setFrontoffice] = useState<number>(1);
  const [posicaofront, setPosicaofront] = useState<number>(0);
  const [fundoHex, setFundoHex] = useState('#FFFFFF');
  const [letraHex, setLetraHex] = useState('#000000');

  // Rules
  const [bloqueado, setBloqueado] = useState<number>(0);
  const [descontinuado, setDescontinuado] = useState<number>(0);
  const [vendersemstock, setVendersemstock] = useState<number>(1);
  const [autoquebra, setAutoquebra] = useState<number>(0);
  const [tiposaft, setTiposaft] = useState<string>('P');

  // Load product data when opened or changed
  useEffect(() => {
    if (product && isOpen) {
      setDescricao(product.descricao || '');
      setDescricaocurta(product.descricaocurta || '');
      setCodbarras(product.codbarras || '');
      setReferencia(product.referencia || '');
      setPlu(product.plu !== undefined && product.plu !== null ? product.plu : '');
      setFamilia(product.familias !== undefined && product.familias !== null ? product.familias : '');
      setSubfamilia(product.subfamilia !== undefined && product.subfamilia !== null ? product.subfamilia : '');
      setIva(product.iva !== undefined && product.iva !== null ? product.iva : '');
      setMotivoIsencao(product.isencao || '');
      setCentroProd(product.centro_prod !== undefined && product.centro_prod !== null ? product.centro_prod : '');

      setPvps([
        product.pvp1 || 0,
        product.pvp2 || 0,
        product.pvp3 || 0,
        product.pvp4 || 0,
        product.pvp5 || 0,
        product.pvp6 || 0,
        product.pvp7 || 0,
        product.pvp8 || 0,
        product.pvp9 || 0,
        product.pvp10 || 0,
      ]);
      setPrecocompra(product.precocompra || 0);

      setMeiadose(product.meiadose || 0);
      setPrecomeia(product.precomeia || 0);
      setMeiadosedesc(product.meiadosedesc || '');
      setDosedesc(product.dosedesc || '');

      setFrontoffice(product.frontoffice !== undefined ? product.frontoffice : 1);
      setPosicaofront(product.posicaofront || 0);
      setFundoHex(product.fundo_hex || '#FFFFFF');
      setLetraHex(product.letra_hex || '#000000');

      setBloqueado(product.bloqueado || 0);
      setDescontinuado(product.descontinuado || 0);
      setVendersemstock(product.vendersemstock !== undefined ? product.vendersemstock : 1);
      setAutoquebra(product.autoquebra || 0);
      setTiposaft(product.tiposaft || 'P');

      setErrorMsg(null);
      setSuccessMsg(null);
      setActiveTab('general');
    }
  }, [product, isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filter subfamilies for currently selected family
  const filteredSubfamilies = useMemo(() => {
    if (!familia) return subfamilies;
    return subfamilies.filter((s) => s.familia === Number(familia));
  }, [subfamilies, familia]);

  // Current VAT rate decimal (e.g. 0.23)
  const currentVatRate = useMemo(() => {
    if (iva === '' || iva === null || isNaN(Number(iva))) return 0;
    return Number(iva) / 100;
  }, [iva]);

  const handlePvpChange = (index: number, valStr: string) => {
    const val = parseFloat(valStr) || 0;
    setPvps((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleSave = async () => {
    if (!product) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload: any = {
        descricao: descricao.trim(),
        descricaocurta: descricaocurta.trim(),
        codbarras: codbarras.trim(),
        referencia: referencia.trim(),
        plu: plu === '' ? 0 : Number(plu),
        familia: familia === '' ? null : Number(familia),
        subfamilia: subfamilia === '' ? null : Number(subfamilia),
        iva: iva === '' ? 0 : Number(iva),
        motivo_isencao: motivoIsencao.trim(),
        centro_prod: centroProd === '' ? 0 : Number(centroProd),
        pvp1: pvps[0],
        pvp2: pvps[1],
        pvp3: pvps[2],
        pvp4: pvps[3],
        pvp5: pvps[4],
        pvp6: pvps[5],
        pvp7: pvps[6],
        pvp8: pvps[7],
        pvp9: pvps[8],
        pvp10: pvps[9],
        precocompra: precocompra,
        meiadose: meiadose,
        precomeia: precomeia,
        meiadosedesc: meiadosedesc.trim(),
        dosedesc: dosedesc.trim(),
        frontoffice: frontoffice,
        posicaofront: posicaofront,
        fundo_hex: fundoHex,
        letra_hex: letraHex,
        bloqueado: bloqueado,
        descontinuado: descontinuado,
        vendersemstock: vendersemstock,
        autoquebra: autoquebra,
        tiposaft: tiposaft
      };

      const res = await fetch(`/api/products/${product.codigo}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Falha ao atualizar o artigo.');
      }

      setSuccessMsg(data.message || 'Artigo atualizado com sucesso no SQL Server.');
      if (onSaveSuccess && data.product) {
        onSaveSuccess(data.product);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro de comunicação ao gravar.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-inner shrink-0 border"
              style={{ backgroundColor: fundoHex, color: letraHex }}
              title="Miniatura do Botão POS"
            >
              #{product.codigo}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold truncate text-white">
                  {product.descricao}
                </h2>
                <span className="text-xs bg-slate-800 border border-slate-700 text-indigo-300 font-mono px-2 py-0.5 rounded font-bold">
                  Artigo #{product.codigo}
                </span>
                {product.plu ? (
                  <span className="text-xs bg-slate-800 border border-slate-700 text-amber-300 font-mono px-2 py-0.5 rounded">
                    PLU: {product.plu}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                {product.has_sales ? (
                  <span className="inline-flex items-center gap-1 text-amber-300 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                    <Lock className="w-2.5 h-2.5" />
                    Com Vendas SAF-T
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Sem Vendas (Editável)
                  </span>
                )}
                {product.descontinuado === 1 ? (
                  <span className="text-rose-400 bg-rose-950/60 border border-rose-800/80 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                    Descontinuado
                  </span>
                ) : (
                  <span className="text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                    Ativo
                  </span>
                )}
                {product.tiposaft === 'S' && (
                  <span className="text-sky-300 bg-sky-950/60 border border-sky-800/80 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                    Serviço
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'general'
                ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            Identificação & Códigos
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('prices')}
            className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'prices'
                ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Preços, Zonas & IVA
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pos')}
            className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'pos'
                ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            Ecrã POS & Visual
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'rules'
                ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Stock & Regras
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Notifications */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2 animate-shake">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Não foi possível gravar:</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="font-semibold">{successMsg}</p>
            </div>
          )}

          {/* TAB 1: IDENTIFICAÇÃO */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Descrição Principal */}
                <div className="md:col-span-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Descrição Completa:</label>
                    {product.has_sales ? (
                      <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1" title="Proteção fiscal SAF-T: artigos com vendas já comunicadas à AT não podem ter o nome alterado">
                        <Lock className="w-3 h-3 text-amber-600" />
                        Bloqueada por vendas (SAF-T)
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500">Máx. 50 caracteres</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    disabled={product.has_sales}
                    maxLength={50}
                    className={`w-full text-xs font-semibold px-3 py-2 rounded-lg border transition ${
                      product.has_sales
                        ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                        : 'bg-white text-slate-900 border-slate-300 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600'
                    }`}
                    placeholder="Nome completo do artigo..."
                  />
                </div>

                {/* Descrição Curta */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Descrição Curta (Ecrã Tátil / Cozinha):</label>
                    <span className="text-[10px] text-slate-400">Máx. 20 car.</span>
                  </div>
                  <input
                    type="text"
                    value={descricaocurta}
                    onChange={(e) => setDescricaocurta(e.target.value)}
                    maxLength={20}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                    placeholder="Nome abreviado para o botão..."
                  />
                </div>

                {/* PLU / Código Alternativo */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Código PLU / Teclado Rápido:</label>
                  <input
                    type="number"
                    value={plu}
                    onChange={(e) => setPlu(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                    placeholder="Ex: 101"
                  />
                </div>

                {/* Código de Barras */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Barcode className="w-3.5 h-3.5 text-slate-500" />
                    Código de Barras (EAN):
                  </label>
                  <input
                    type="text"
                    value={codbarras}
                    onChange={(e) => setCodbarras(e.target.value)}
                    maxLength={30}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                    placeholder="560..."
                  />
                </div>

                {/* Referência */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5 text-slate-500" />
                    Referência Interna / Fornecedor:
                  </label>
                  <input
                    type="text"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    maxLength={30}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                    placeholder="REF-..."
                  />
                </div>

                {/* Família */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <FolderTree className="w-3.5 h-3.5 text-slate-500" />
                    Família:
                  </label>
                  <select
                    value={familia}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : Number(e.target.value);
                      setFamilia(val);
                      setSubfamilia('');
                    }}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                  >
                    <option value="">(Sem Família)</option>
                    {families.map((f) => (
                      <option key={f.codigo} value={f.codigo}>
                        {f.codigo} - {f.descricao}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subfamília */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <FolderTree className="w-3.5 h-3.5 text-slate-500" />
                    Subfamília:
                  </label>
                  <select
                    value={subfamilia}
                    onChange={(e) => setSubfamilia(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                  >
                    <option value="">(Sem Subfamília)</option>
                    {filteredSubfamilies.map((sf) => (
                      <option key={sf.codigo} value={sf.codigo}>
                        {sf.codigo} - {sf.descricao}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Centro de Produção */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Utensils className="w-3.5 h-3.5 text-slate-500" />
                    Centro de Produção / Cozinha:
                  </label>
                  <select
                    value={centroProd}
                    onChange={(e) => setCentroProd(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                  >
                    <option value="">(Nenhum / Não imprime)</option>
                    {productionCenters.map((cp) => (
                      <option key={cp.codigo} value={cp.codigo}>
                        {cp.codigo} - {cp.descricao}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tipo SAF-T */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Classificação Fiscal SAF-T:</label>
                  <select
                    value={tiposaft}
                    onChange={(e) => setTiposaft(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                  >
                    <option value="P">P - Produto / Mercadoria</option>
                    <option value="S">S - Serviço</option>
                    <option value="O">O - Outro (Encargos, etc.)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PREÇOS, ZONAS & IVA */}
          {activeTab === 'prices' && (
            <div className="space-y-6">
              {/* Custos & Taxas de IVA */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                    Preço de Custo (Compra s/IVA):
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={precocompra}
                      onChange={(e) => setPrecocompra(parseFloat(e.target.value) || 0)}
                      className="w-full text-xs font-mono font-bold px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 pr-7"
                    />
                    <span className="absolute right-2.5 top-2 text-xs text-slate-400 font-bold">€</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5 text-slate-500" />
                    Taxa de IVA:
                  </label>
                  <select
                    value={iva}
                    onChange={(e) => setIva(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                  >
                    <option value="">(Sem Taxa)</option>
                    {vats.map((v) => (
                      <option key={v.codigo} value={v.factor}>
                        {v.descricao} ({v.factor}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Motivo de Isenção (se 0%):</label>
                  <select
                    value={motivoIsencao}
                    onChange={(e) => setMotivoIsencao(e.target.value)}
                    disabled={Number(iva) > 0}
                    className={`w-full text-xs px-3 py-2 rounded-lg border transition ${
                      Number(iva) > 0
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-white text-slate-900 border-slate-300 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600'
                    }`}
                  >
                    <option value="">(Nenhum motivo selecionado)</option>
                    {motivosIsencao.map((m) => (
                      <option key={m.codigo} value={m.codigo}>
                        {m.codigo} - {m.descricao}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tabela de Preços PVP 1 a 10 com Zonas e Margens */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    Tabelas de Preços por Zona de Consumo (PVP 1 a 10)
                  </h3>
                  <span className="text-[11px] text-slate-400">Preços c/IVA e cálculo automático de margem</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((idx) => {
                    const priceIndex = idx - 1;
                    const pvpVal = pvps[priceIndex] || 0;
                    const zoneInfo = priceZones[String(idx)];
                    const hasZone = !!(zoneInfo && zoneInfo.zones && zoneInfo.zones.length > 0);
                    const isPvp1 = idx === 1;

                    // Cálculos s/IVA e Margem
                    const priceNoVat = currentVatRate > 0 ? pvpVal / (1 + currentVatRate) : pvpVal;
                    const profitEuro = precocompra > 0 ? priceNoVat - precocompra : null;
                    const marginPercent = precocompra > 0 && priceNoVat > 0 ? (profitEuro! / priceNoVat) * 100 : null;

                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border transition ${
                          isPvp1
                            ? 'bg-emerald-50/70 border-emerald-300 shadow-xs'
                            : hasZone
                            ? 'bg-indigo-50/30 border-indigo-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div>
                            <span className={`text-xs font-black font-mono ${isPvp1 ? 'text-emerald-900' : 'text-slate-800'}`}>
                              PVP {idx}
                            </span>
                            {hasZone && (
                              <span
                                className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-semibold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.5 rounded"
                                title={zoneInfo.display}
                              >
                                📍 {zoneInfo.display}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            s/IVA: {priceNoVat.toFixed(2)} €
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="relative flex-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={pvpVal || ''}
                              onChange={(e) => handlePvpChange(priceIndex, e.target.value)}
                              className={`w-full text-sm font-bold font-mono px-3 py-1.5 rounded-lg border pr-7 transition ${
                                isPvp1
                                  ? 'bg-white border-emerald-400 text-emerald-950 focus:ring-2 focus:ring-emerald-200'
                                  : 'bg-white border-slate-300 text-slate-900 focus:ring-2 focus:ring-indigo-100'
                              }`}
                              placeholder="0.00"
                            />
                            <span className="absolute right-2.5 top-2 text-xs text-slate-400 font-bold">€</span>
                          </div>

                          {/* Margem Badge */}
                          {profitEuro !== null && (
                            <div
                              className={`px-2 py-1 rounded text-right shrink-0 border ${
                                profitEuro >= 0
                                  ? 'bg-emerald-100/70 text-emerald-900 border-emerald-300'
                                  : 'bg-rose-100/70 text-rose-900 border-rose-300'
                              }`}
                              title={`Lucro s/IVA: ${profitEuro >= 0 ? '+' : ''}${profitEuro.toFixed(2)} €`}
                            >
                              <div className="text-[10px] font-bold">
                                {profitEuro >= 0 ? '+' : ''}{profitEuro.toFixed(2)} €
                              </div>
                              {marginPercent !== null && (
                                <div className="text-[9px] font-mono">
                                  {marginPercent.toFixed(1)}%
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Meia Dose (ZSRest) */}
              <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-900 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={meiadose === 1}
                      onChange={(e) => setMeiadose(e.target.checked ? 1 : 0)}
                      className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                    />
                    <span>Ativar Opção de Meia Dose (ZSRest)</span>
                  </label>
                  <span className="text-[10px] text-amber-700 font-mono">dbo.produtos.meiadose</span>
                </div>

                {meiadose === 1 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-amber-200/60 animate-fade-in">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-amber-900">Preço Meia Dose (€):</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={precomeia}
                        onChange={(e) => setPrecomeia(parseFloat(e.target.value) || 0)}
                        className="w-full text-xs font-mono font-bold px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-slate-900 focus:ring-2 focus:ring-amber-200"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-amber-900">Designação Meia Dose:</label>
                      <input
                        type="text"
                        value={meiadosedesc}
                        onChange={(e) => setMeiadosedesc(e.target.value)}
                        className="w-full text-xs px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-slate-900 focus:ring-2 focus:ring-amber-200"
                        placeholder="Ex: 1/2 Dose"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-amber-900">Designação Dose Inteira:</label>
                      <input
                        type="text"
                        value={dosedesc}
                        onChange={(e) => setDosedesc(e.target.value)}
                        className="w-full text-xs px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-slate-900 focus:ring-2 focus:ring-amber-200"
                        placeholder="Ex: 1 Dose"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: POS FRONTOFFICE & VISUAL */}
          {activeTab === 'pos' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Opções de Visibilidade e Posição */}
                <div className="space-y-4">
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Visibilidade no POS
                    </h3>
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition cursor-pointer">
                      <input
                        type="checkbox"
                        checked={frontoffice === 1}
                        onChange={(e) => setFrontoffice(e.target.checked ? 1 : 0)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Visível no Frontoffice (POS)</div>
                        <div className="text-[11px] text-slate-500">Apresenta o botão no ecrã de registo de pedidos</div>
                      </div>
                    </label>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Posição / Ordem no Ecrã:</label>
                    <input
                      type="number"
                      value={posicaofront}
                      onChange={(e) => setPosicaofront(parseInt(e.target.value) || 0)}
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-100"
                      placeholder="0"
                    />
                    <span className="text-[10px] text-slate-400">Menor número aparece primeiro no teclado tátil.</span>
                  </div>

                  {/* Cores predefinidas */}
                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-bold text-slate-700 block">Paleta Rápida de Cores:</label>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => {
                            setFundoHex(c.hex);
                            setLetraHex(c.textHex);
                          }}
                          className="w-7 h-7 rounded-lg border border-slate-300 shadow-xs flex items-center justify-center transition hover:scale-110"
                          style={{ backgroundColor: c.hex }}
                          title={`${c.name} (${c.hex})`}
                        >
                          {fundoHex.toUpperCase() === c.hex.toUpperCase() && (
                            <Check className="w-4 h-4" style={{ color: c.textHex }} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Seletores customizados de cor */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Cor de Fundo:</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={fundoHex}
                          onChange={(e) => setFundoHex(e.target.value)}
                          className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0.5 bg-white"
                        />
                        <input
                          type="text"
                          value={fundoHex}
                          onChange={(e) => setFundoHex(e.target.value)}
                          maxLength={7}
                          className="w-full text-xs font-mono uppercase px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Cor do Texto:</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={letraHex}
                          onChange={(e) => setLetraHex(e.target.value)}
                          className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0.5 bg-white"
                        />
                        <input
                          type="text"
                          value={letraHex}
                          onChange={(e) => setLetraHex(e.target.value)}
                          maxLength={7}
                          className="w-full text-xs font-mono uppercase px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Preview do Botão no POS */}
                <div className="space-y-3 flex flex-col items-center justify-center bg-slate-50 p-6 rounded-2xl border border-slate-200">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-indigo-600" />
                    Pré-visualização do Botão no POS
                  </div>

                  {/* O botão real como se comporta no ecrã tátil do ZoneSoft */}
                  <div
                    className="w-48 h-32 rounded-2xl p-3 flex flex-col justify-between shadow-lg border transition duration-200 select-none cursor-pointer transform hover:scale-102"
                    style={{
                      backgroundColor: fundoHex,
                      color: letraHex,
                      borderColor: 'rgba(0,0,0,0.15)'
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-mono font-bold opacity-75">#{product.codigo}</span>
                      {plu ? <span className="text-[10px] font-mono opacity-75">PLU {plu}</span> : null}
                    </div>

                    <div className="text-center font-bold text-sm leading-snug px-1 line-clamp-3">
                      {descricaocurta || descricao || 'Nome do Artigo'}
                    </div>

                    <div className="text-right font-black font-mono text-sm tracking-tight">
                      {(pvps[0] || 0).toFixed(2)} €
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 text-center max-w-xs mt-2">
                    Esta miniatura reflete exatamente a cor de fundo, contraste do texto e preço de venda configurados para o terminal.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: REGRAS & STOCK */}
          {activeTab === 'rules' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Descontinuado */}
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition cursor-pointer">
                  <input
                    type="checkbox"
                    checked={descontinuado === 1}
                    onChange={(e) => setDescontinuado(e.target.checked ? 1 : 0)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-800">Artigo Descontinuado</div>
                    <div className="text-[11px] text-slate-500">Oculta o artigo do sistema para não ser vendido ou faturado</div>
                  </div>
                </label>

                {/* Bloqueado no POS */}
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bloqueado === 1}
                    onChange={(e) => setBloqueado(e.target.checked ? 1 : 0)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-800">Bloqueado no POS</div>
                    <div className="text-[11px] text-slate-500">Impede a seleção ou venda do artigo temporariamente</div>
                  </div>
                </label>

                {/* Vender sem stock */}
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vendersemstock === 1}
                    onChange={(e) => setVendersemstock(e.target.checked ? 1 : 0)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-800">Permitir Venda Sem Stock</div>
                    <div className="text-[11px] text-slate-500">Se desmarcado, o POS bloqueia o registo quando a quantidade em stock for 0</div>
                  </div>
                </label>

                {/* Autoquebra */}
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoquebra === 1}
                    onChange={(e) => setAutoquebra(e.target.checked ? 1 : 0)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-800">Autoquebra na Venda</div>
                    <div className="text-[11px] text-slate-500">Abate automaticamente a composição/matérias-primas associadas ao artigo</div>
                  </div>
                </label>
              </div>

              {/* Informação sobre Histórico e Segurança */}
              <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 mt-4 text-xs text-slate-600 space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-indigo-600" />
                  Garantias de Segurança MassEdit
                </div>
                <p>
                  Todas as alterações individuais efetuadas através desta ficha criam automaticamente uma cópia de segurança (snapshot de backup), registam o histórico de alterações no SQL Server e mantêm a sincronização ativada com os postos de venda.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Pressione <kbd className="bg-white border px-1.5 py-0.5 rounded text-[10px] font-mono shadow-xs">Esc</kbd> para fechar
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition shadow-xs"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>A gravar...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Guardar Alterações</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
