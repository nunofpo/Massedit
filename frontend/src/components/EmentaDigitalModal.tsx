import React, { useState, useEffect } from 'react';
import {
  Languages,
  Globe,
  Sparkles,
  Wand2,
  Check,
  RefreshCw,
  Save,
  Search,
  X,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import {
  EmentaProductItem,
  EmentaProductResponse,
  EmentaLanguage,
  Family,
  BulkEditPreviewResponse,
  EmentaDigitalStructureResponse
} from '../types';

interface EmentaDigitalModalProps {
  isOpen: boolean;
  onClose: () => void;
  families: Family[];
  onOpenPreview?: (preview: BulkEditPreviewResponse, onConfirm: () => Promise<void>) => void;
  onSuccess: (msg: string) => void;
}

const ALL_SUPPORTED_LANGUAGES: EmentaLanguage[] = [
  { code: 'GB', name: 'Inglês', is_active: 1 },
  { code: 'ES', name: 'Espanhol', is_active: 1 },
  { code: 'FR', name: 'Francês', is_active: 1 },
  { code: 'DE', name: 'Alemão', is_active: 1 },
  { code: 'IT', name: 'Italiano', is_active: 0 },
  { code: 'NL', name: 'Neerlandês', is_active: 0 },
  { code: 'RU', name: 'Russo', is_active: 0 }
];

export const EmentaDigitalModal: React.FC<EmentaDigitalModalProps> = ({
  isOpen,
  onClose,
  families,
  onSuccess
}) => {
  // Products list & Pagination
  const [products, setProducts] = useState<EmentaProductItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedCodes, setSelectedCodes] = useState<Set<number>>(new Set());

  // Filters (Default to 'with_ementa' so only Ementa Digital items are listed by default)
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [hasEmentaFilter, setHasEmentaFilter] = useState<string>('with_ementa');
  const [selectedFamily, setSelectedFamily] = useState<string>('all');
  const [selectedEmentaFamily, setSelectedEmentaFamily] = useState<string>('all');

  // Digital Menu Structure
  const [digitalStructure, setDigitalStructure] = useState<EmentaDigitalStructureResponse | null>(null);

  // Translation State
  const [selectedProductForTranslation, setSelectedProductForTranslation] = useState<EmentaProductItem | null>(null);
  const [languages, setLanguages] = useState<EmentaLanguage[]>(ALL_SUPPORTED_LANGUAGES);
  const [selectedLangCodes, setSelectedLangCodes] = useState<Set<string>>(new Set(['gb', 'es', 'fr', 'de']));
  const [activeLangTab, setActiveLangTab] = useState<string>('gb');
  const [translationsData, setTranslationsData] = useState<Record<string, { produto: string; descricao: string }>>({});
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isSavingTranslations, setIsSavingTranslations] = useState<boolean>(false);
  const [isAutoGeneralTranslating, setIsAutoGeneralTranslating] = useState<boolean>(false);
  const [isActivatingLangs, setIsActivatingLangs] = useState<boolean>(false);

  // Toggle active language selection
  const toggleLangCode = (code: string) => {
    const lower = code.toLowerCase();
    const next = new Set(selectedLangCodes);
    if (next.has(lower)) {
      if (next.size <= 1) return;
      next.delete(lower);
    } else {
      next.add(lower);
    }
    setSelectedLangCodes(next);
    const activeList = Array.from(next);
    if (!next.has(activeLangTab.toLowerCase()) && activeList.length > 0) {
      setActiveLangTab(activeList[0]);
    }
  };

  // Fetch languages from backend
  const fetchLanguages = async () => {
    try {
      const res = await fetch('/api/ementa-digital/languages');
      if (res.ok) {
        const data: EmentaLanguage[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const combinedMap = new Map<string, EmentaLanguage>();
          ALL_SUPPORTED_LANGUAGES.forEach(l => combinedMap.set(l.code.toUpperCase(), l));
          data.forEach(dl => {
            const codeUpper = dl.code.toUpperCase();
            combinedMap.set(codeUpper, {
              code: codeUpper,
              name: dl.name || combinedMap.get(codeUpper)?.name || codeUpper,
              is_active: dl.is_active ?? 1
            });
          });

          const mergedLangs = Array.from(combinedMap.values());
          setLanguages(mergedLangs);

          const dbActiveCodes = new Set(
            mergedLangs.filter(l => l.is_active === 1).map(l => l.code.toLowerCase())
          );
          if (dbActiveCodes.size > 0) {
            setSelectedLangCodes(dbActiveCodes);
            const activeList = Array.from(dbActiveCodes);
            if (!dbActiveCodes.has(activeLangTab.toLowerCase()) && activeList.length > 0) {
              setActiveLangTab(activeList[0]);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar idiomas da ementa:', err);
    }
  };

  // Fetch digital menu structure (sections/families)
  const fetchDigitalStructure = async () => {
    try {
      const res = await fetch('/api/ementa-digital/structure');
      if (res.ok) {
        const data: EmentaDigitalStructureResponse = await res.json();
        setDigitalStructure(data);
      }
    } catch (err) {
      console.warn('Erro ao carregar estrutura da ementa:', err);
    }
  };

  // Fetch products from backend
  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ementa-digital/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search: searchTerm,
          familia: selectedFamily !== 'all' ? parseInt(selectedFamily, 10) : null,
          ementa_familia: selectedEmentaFamily !== 'all' ? parseInt(selectedEmentaFamily, 10) : null,
          has_ementa_filter: hasEmentaFilter,
          page,
          page_size: 20
        })
      });
      if (res.ok) {
        const data: EmentaProductResponse = await res.json();
        setProducts(data.items);
        setTotalCount(data.total_count);
        setTotalPages(data.total_pages);
        if (data.items.length > 0) {
          handleSelectProductForTranslation(data.items[0]);
        } else {
          setSelectedProductForTranslation(null);
        }
      }
    } catch (err) {
      console.error('Erro ao pesquisar artigos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLanguages();
      fetchDigitalStructure();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchProducts();
    }
  }, [isOpen, page, selectedFamily, selectedEmentaFamily, hasEmentaFilter]);

  // Handle Search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProducts();
  };

  // Toggle single product selection
  const toggleSelectCode = (code: number) => {
    const next = new Set(selectedCodes);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelectedCodes(next);
  };

  // Select all products on current page
  const handleSelectAllOnPage = () => {
    if (products.every(p => selectedCodes.has(p.codigo))) {
      const next = new Set(selectedCodes);
      products.forEach(p => next.delete(p.codigo));
      setSelectedCodes(next);
    } else {
      const next = new Set(selectedCodes);
      products.forEach(p => next.add(p.codigo));
      setSelectedCodes(next);
    }
  };

  // Select product for translation editing
  const handleSelectProductForTranslation = async (prod: EmentaProductItem) => {
    setSelectedProductForTranslation(prod);
    try {
      const res = await fetch(`/api/ementa-digital/translations/${prod.codigo}`);
      if (res.ok) {
        const data = await res.json();
        const formatted: Record<string, { produto: string; descricao: string }> = {};
        Object.entries(data).forEach(([country, fields]: [string, any]) => {
          const cLower = country.toLowerCase();
          formatted[cLower] = {
            produto: fields.produto || fields.nome || '',
            descricao: fields.descricao || ''
          };
        });
        setTranslationsData(formatted);
      } else {
        setTranslationsData({});
      }
    } catch (err) {
      setTranslationsData({});
    }
  };

  // Activate selected languages in Database
  const handleActivateLanguagesInDb = async () => {
    setIsActivatingLangs(true);
    try {
      const activeCountries = Array.from(selectedLangCodes).map(c => c.toUpperCase());
      const res = await fetch('/api/ementa-digital/activate-languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeCountries)
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data.message || `Idiomas (${activeCountries.join(', ')}) ativados com sucesso na ementa digital ZoneSoft!`);
      } else {
        alert(data.detail || data.message || 'Erro ao ativar idiomas no banco de dados.');
      }
    } catch (err) {
      alert('Erro na comunicação ao ativar idiomas.');
    } finally {
      setIsActivatingLangs(false);
    }
  };

  // Auto-populate 82 general system UI terms
  const handleAutoGeneralTranslations = async () => {
    setIsAutoGeneralTranslating(true);
    try {
      const activeCountries = Array.from(selectedLangCodes).map(c => c.toUpperCase());
      const res = await fetch('/api/ementa-digital/auto-general-translations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeCountries)
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data.message || `Traduções gerais do sistema preenchidas com sucesso para ${activeCountries.join(', ')}!`);
      } else {
        alert(data.detail || data.message || 'Erro ao preencher traduções gerais.');
      }
    } catch (err) {
      alert('Erro na comunicação ao preencher traduções gerais.');
    } finally {
      setIsAutoGeneralTranslating(false);
    }
  };

  // AI Auto-Translate single selected product
  const handleAutoTranslate = async () => {
    if (!selectedProductForTranslation) return;
    setIsTranslating(true);
    try {
      const textToTranslate = selectedProductForTranslation.produto || selectedProductForTranslation.pos_descricao;
      const descToTranslate = selectedProductForTranslation.descricao || '';
      const targetLangs = Array.from(selectedLangCodes);

      const texts = [textToTranslate];
      if (descToTranslate.trim()) texts.push(descToTranslate);

      const res = await fetch('/api/ementa-digital/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts,
          target_langs: targetLangs,
          source_lang: 'pt'
        })
      });

      if (res.ok) {
        const data = await res.json();
        const nameMap = data.translations[textToTranslate] || {};
        const descMap = descToTranslate ? (data.translations[descToTranslate] || {}) : {};

        setTranslationsData(prev => {
          const next = { ...prev };
          targetLangs.forEach(lang => {
            const lLower = lang.toLowerCase();
            const translatedName = nameMap[lLower] || nameMap[lang.toUpperCase()] || textToTranslate;
            const translatedDesc = descMap[lLower] || descMap[lang.toUpperCase()] || descToTranslate;
            next[lLower] = {
              produto: translatedName,
              descricao: translatedDesc
            };
          });
          return next;
        });

        onSuccess(`Tradução automática gerada para "${textToTranslate}"! Clique em "Gravar no ZoneSoft".`);
      } else {
        alert('Erro ao obter tradução automática.');
      }
    } catch (err) {
      alert('Falha de rede ao traduzir artigo.');
    } finally {
      setIsTranslating(false);
    }
  };

  // AI Batch Auto-Translate selected products
  const handleBatchAutoTranslate = async () => {
    if (selectedCodes.size === 0) return;
    const targetProds = products.filter(p => selectedCodes.has(p.codigo));
    if (targetProds.length === 0) return;

    setIsTranslating(true);
    let successCount = 0;

    try {
      const targetLangs = Array.from(selectedLangCodes);

      for (const prod of targetProds) {
        const textToTranslate = prod.produto || prod.pos_descricao;
        const descToTranslate = prod.descricao || '';
        const texts = [textToTranslate];
        if (descToTranslate.trim()) texts.push(descToTranslate);

        const res = await fetch('/api/ementa-digital/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts,
            target_langs: targetLangs,
            source_lang: 'pt'
          })
        });

        if (res.ok) {
          const data = await res.json();
          const nameMap = data.translations[textToTranslate] || {};
          const descMap = descToTranslate ? (data.translations[descToTranslate] || {}) : {};

          const trPayload: Record<string, { produto: string; descricao: string }> = {};
          targetLangs.forEach(lang => {
            const cUpper = lang.toUpperCase();
            const lLower = lang.toLowerCase();
            trPayload[cUpper] = {
              produto: nameMap[lLower] || nameMap[cUpper] || textToTranslate,
              descricao: descMap[lLower] || descMap[cUpper] || descToTranslate
            };
          });

          const saveRes = await fetch('/api/ementa-digital/translations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cod_produto: prod.codigo,
              translations: trPayload
            })
          });

          if (saveRes.ok) {
            const saveData = await saveRes.json();
            if (saveData.success) successCount++;
          }
        }
      }

      onSuccess(`${successCount} de ${targetProds.length} artigos traduzidos e gravados com sucesso!`);
      if (selectedProductForTranslation && selectedCodes.has(selectedProductForTranslation.codigo)) {
        handleSelectProductForTranslation(selectedProductForTranslation);
      }
    } catch (err) {
      alert('Erro durante a tradução em lote.');
    } finally {
      setIsTranslating(false);
    }
  };

  // Save current product translations to backend
  const handleSaveTranslations = async () => {
    if (!selectedProductForTranslation) return;
    setIsSavingTranslations(true);
    try {
      const payloadTranslations: Record<string, { produto: string; descricao: string }> = {};
      Object.entries(translationsData).forEach(([lang, fields]) => {
        payloadTranslations[lang.toUpperCase()] = fields;
      });

      const res = await fetch('/api/ementa-digital/translations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cod_produto: selectedProductForTranslation.codigo,
          translations: payloadTranslations
        })
      });

      const data = await res.json();
      if (data.success) {
        onSuccess(`Traduções do artigo #${selectedProductForTranslation.codigo} gravadas no ZoneSoft com sucesso!`);
      } else {
        alert(data.detail || data.message || 'Erro ao gravar traduções.');
      }
    } catch (err) {
      alert('Falha de rede ao gravar traduções.');
    } finally {
      setIsSavingTranslations(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-[1500px] h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-600/20">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Assistente de Tradução Multilíngue
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  ZoneSoft Traduções
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Tradução automática e gestão de idiomas para artigos da ementa digital ZoneSoft POS.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-5 gap-4">
          
          {/* Active Languages Bar & UI Terms Button */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Idiomas Ativos */}
            <div className="lg:col-span-8 bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3 flex-wrap shadow-2xs">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800">Idiomas Ativos no POS:</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {languages.map(l => {
                  const lower = l.code.toLowerCase();
                  const isChecked = selectedLangCodes.has(lower);
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => toggleLangCode(lower)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border select-none ${
                        isChecked
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="rounded text-indigo-600 focus:ring-indigo-500 pointer-events-none w-3.5 h-3.5"
                      />
                      {l.name}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={handleActivateLanguagesInDb}
                  disabled={isActivatingLangs}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg shadow-2xs transition text-xs ml-1"
                  title="Grava e ativa os idiomas selecionados na tabela dbo.ementa_digital_paises do ZoneSoft"
                >
                  {isActivatingLangs ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Ativar no ZoneSoft (QR)
                </button>
              </div>
            </div>

            {/* Banner 82 Termos Gerais UI */}
            <div className="lg:col-span-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-3 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500 text-white rounded-lg shadow-2xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    Termos Gerais da Interface
                    <span className="text-[10px] bg-amber-200 text-amber-900 font-extrabold px-1.5 py-0.2 rounded-full">82 Termos</span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Preencher expressões do sistema ("Resumo", "Finalizar")
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAutoGeneralTranslations}
                disabled={isAutoGeneralTranslating}
                className="flex items-center gap-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg shadow-2xs transition text-xs shrink-0"
              >
                {isAutoGeneralTranslating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                Preencher 1-Clique
              </button>
            </div>
          </div>

          {/* Main Grid: Left Panel (Product List) & Right Panel (Translation Workspace) */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0 overflow-hidden">
            
            {/* LEFT PANEL: Product Table & Filters */}
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col min-h-0 overflow-hidden">
              
              {/* Search & Filters Header */}
              <div className="p-3 border-b border-slate-200 bg-white flex flex-col gap-2.5">
                
                {/* Search Bar */}
                <form onSubmit={handleSearchSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Pesquisar por Código ou Nome..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition"
                  >
                    Pesquisar
                  </button>
                </form>

                {/* Filter Dropdowns Row */}
                <div className="grid grid-cols-2 gap-2">
                  
                  {/* Filter 1: Presença na Ementa */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5 uppercase tracking-wider">
                      Filtro de Artigos
                    </label>
                    <select
                      value={hasEmentaFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHasEmentaFilter(val);
                        if (val === 'without_ementa') setSelectedEmentaFamily('all');
                        setPage(1);
                      }}
                      className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-300 rounded-lg font-bold text-indigo-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">Todos os Artigos (POS + Ementa)</option>
                      <option value="with_ementa">Apenas Com Registo na Ementa Digital</option>
                      <option value="without_ementa">Apenas Sem Registo na Ementa</option>
                    </select>
                  </div>

                  {/* Filter 2: Secção da Ementa / Família POS */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5 uppercase tracking-wider">
                      Secção / Família
                    </label>
                    {digitalStructure?.families && digitalStructure.families.length > 0 ? (
                      <select
                        value={selectedEmentaFamily}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedEmentaFamily(val);
                          setPage(1);
                        }}
                        className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="all">Todas as Secções da Ementa</option>
                        {digitalStructure.families.map(ef => (
                          <option key={ef.codigo} value={ef.codigo}>
                            #{ef.codigo} - {ef.descricao}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={selectedFamily}
                        onChange={(e) => { setSelectedFamily(e.target.value); setPage(1); }}
                        className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="all">Todas as Famílias POS</option>
                        {families.map(f => (
                          <option key={f.codigo} value={f.codigo}>
                            #{f.codigo} - {f.descricao}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-semibold text-slate-500">
                    {selectedCodes.size > 0 ? `${selectedCodes.size} selecionados` : 'Clique para traduzir'}
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectAllOnPage}
                    className="px-2 py-1 text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg transition flex items-center gap-1"
                    title="Selecionar / Desselecionar todos os artigos da página atual"
                  >
                    {products.length > 0 && products.every(p => selectedCodes.has(p.codigo)) ? (
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    Selecionar Página
                  </button>
                </div>

              </div>

              {/* Products Table */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
                {isLoading ? (
                  <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                    A carregar artigos da ementa...
                  </div>
                ) : products.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                    <Filter className="w-6 h-6 text-slate-300" />
                    <p className="font-bold text-slate-600">Nenhum artigo encontrado na Ementa Digital.</p>
                    <p className="text-[11px] text-slate-400">
                      Tente mudar o filtro para &quot;Todos os Artigos (POS + Ementa)&quot; ou alterar a secção selecionada.
                    </p>
                  </div>
                ) : (
                  products.map((prod) => {
                    const isSelectedForEdit = selectedProductForTranslation?.codigo === prod.codigo;
                    const isChecked = selectedCodes.has(prod.codigo);

                    return (
                      <div
                        key={prod.codigo}
                        onClick={() => handleSelectProductForTranslation(prod)}
                        className={`p-3 transition cursor-pointer flex items-center justify-between gap-3 ${
                          isSelectedForEdit
                            ? 'bg-indigo-50/90 border-l-4 border-indigo-600'
                            : 'hover:bg-slate-100/80 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelectCode(prod.codigo);
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-bold text-slate-400">
                                #{prod.codigo}
                              </span>
                              <span className="font-bold text-xs text-slate-900 truncate">
                                {prod.produto || prod.pos_descricao}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium truncate flex items-center gap-2 mt-0.5">
                              <span>{prod.familia_desc || 'Sem Família'}</span>
                              <span>•</span>
                              <span className="font-mono font-bold text-slate-700">{prod.pvp1.toFixed(2)} €</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            Traduzir
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pagination Bar */}
              <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium text-[11px]">
                  Total: <strong>{totalCount}</strong> artigos | Pág. <strong>{page}</strong>/<strong>{totalPages}</strong>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="p-1 rounded-lg border border-slate-300 disabled:opacity-40 hover:bg-slate-100 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="p-1 rounded-lg border border-slate-300 disabled:opacity-40 hover:bg-slate-100 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT PANEL: Translation Workspace */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col min-h-0 overflow-hidden shadow-2xs">
              
              {/* Product Translation Toolbar */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3 flex-wrap mb-4">
                <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                  <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
                    <Languages className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                      Artigo Selecionado
                    </div>
                    <div className="text-xs font-extrabold text-slate-900 truncate">
                      {selectedProductForTranslation
                        ? `#${selectedProductForTranslation.codigo} - ${selectedProductForTranslation.produto || selectedProductForTranslation.pos_descricao}`
                        : 'Nenhum artigo selecionado'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {selectedCodes.size > 0 && (
                    <button
                      type="button"
                      onClick={handleBatchAutoTranslate}
                      disabled={isTranslating}
                      className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg shadow-2xs transition text-xs"
                      title={`Traduzir todos os ${selectedCodes.size} artigos selecionados na lista`}
                    >
                      {isTranslating ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      Traduzir {selectedCodes.size} em Lote
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleAutoTranslate}
                    disabled={!selectedProductForTranslation || isTranslating}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg shadow-2xs transition text-xs"
                  >
                    {isTranslating ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    Traduzir com IA
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveTranslations}
                    disabled={!selectedProductForTranslation || isSavingTranslations}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-3.5 py-1.5 rounded-lg shadow-2xs transition text-xs"
                  >
                    {isSavingTranslations ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Gravar no ZoneSoft
                  </button>
                </div>
              </div>

              {/* Translation Editor Body */}
              {selectedProductForTranslation ? (
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0 overflow-y-auto">
                  
                  {/* Português Original */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3.5">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                        <span>🇵🇹</span> Original (Português)
                      </span>
                      <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-md">
                        Fonte
                      </span>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        Designação / Nome do Prato (POS)
                      </label>
                      <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-bold text-slate-900">
                        {selectedProductForTranslation.produto || selectedProductForTranslation.pos_descricao}
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col">
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        Descrição Detalhada
                      </label>
                      <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 flex-1 whitespace-pre-wrap">
                        {selectedProductForTranslation.descricao || (
                          <span className="text-slate-400 italic">Sem descrição longa registada.</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Target Language Editor */}
                  <div className="bg-white border border-indigo-100 rounded-xl p-4 flex flex-col gap-3.5 shadow-2xs">
                    
                    {/* Active Language Tabs */}
                    <div className="flex items-center gap-1 border-b border-slate-200 pb-2 overflow-x-auto">
                      {languages.filter(l => selectedLangCodes.has(l.code.toLowerCase())).map(l => (
                        <button
                          key={l.code}
                          type="button"
                          onClick={() => setActiveLangTab(l.code.toLowerCase())}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                            activeLangTab.toLowerCase() === l.code.toLowerCase()
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {l.name}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Nome Traduzido ({activeLangTab.toUpperCase()})
                      </label>
                      <input
                        type="text"
                        value={translationsData[activeLangTab]?.produto || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTranslationsData(prev => ({
                            ...prev,
                            [activeLangTab]: {
                              ...(prev[activeLangTab] || { produto: '', descricao: '' }),
                              produto: val
                            }
                          }));
                        }}
                        placeholder="Ex: Sirloin steak with french fries..."
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium text-slate-900"
                      />
                    </div>

                    <div className="flex-1 flex flex-col">
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Descrição Traduzida ({activeLangTab.toUpperCase()})
                      </label>
                      <textarea
                        rows={5}
                        value={translationsData[activeLangTab]?.descricao || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTranslationsData(prev => ({
                            ...prev,
                            [activeLangTab]: {
                              ...(prev[activeLangTab] || { produto: '', descricao: '' }),
                              descricao: val
                            }
                          }));
                        }}
                        placeholder="Descrição detalhada no idioma de destino..."
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 flex-1 text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl p-8">
                  <Languages className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="font-bold text-slate-600 text-xs">
                    Selecione um artigo na lista à esquerda para editar ou gerar as suas traduções
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
