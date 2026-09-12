import React, { useState, useEffect, useRef } from 'react';
import {
  X, QrCode, Globe, Database, Search, Filter, Check, AlertTriangle,
  Upload, Image as ImageIcon, Eye, EyeOff, Star, Sparkles, RefreshCw,
  Copy, Save, ChevronLeft, ChevronRight, ExternalLink, Languages, Trash2,
  Edit3, FileText, Wand2, Plus, ArrowRight
} from 'lucide-react';
import {
  EmentaProductItem, EmentaProductResponse, EmentaLanguage,
  EmentaSchemaInfo, BulkEditPreviewResponse, EmentaDigitalStructureResponse
} from '../types';

interface EmentaDigitalModalProps {
  isOpen: boolean;
  onClose: () => void;
  families: Array<{ codigo: number; descricao: string }>;
  onOpenPreview: (previewData: BulkEditPreviewResponse, onConfirm: () => Promise<void>) => void;
  onSuccess: (message: string) => void;
}

const ALL_SUPPORTED_LANGUAGES: EmentaLanguage[] = [
  { id: 'GB', name: 'Inglês 🇬🇧', code: 'gb' },
  { id: 'ES', name: 'Espanhol 🇪🇸', code: 'es' },
  { id: 'FR', name: 'Francês 🇫🇷', code: 'fr' },
  { id: 'DE', name: 'Alemão 🇩🇪', code: 'de' },
  { id: 'IT', name: 'Italiano 🇮🇹', code: 'it' },
  { id: 'NL', name: 'Holandês 🇳🇱', code: 'nl' },
  { id: 'RU', name: 'Russo 🇷🇺', code: 'ru' }
];

export const EmentaDigitalModal: React.FC<EmentaDigitalModalProps> = ({
  isOpen,
  onClose,
  families,
  onOpenPreview,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'products' | 'translations' | 'schema'>('products');

  // Products tab state
  const [products, setProducts] = useState<EmentaProductItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedCodes, setSelectedCodes] = useState<Set<number>>(new Set());

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedFamily, setSelectedFamily] = useState<string>('all');
  const [selectedEmentaFamily, setSelectedEmentaFamily] = useState<string>('all');
  const [visivelFilter, setVisivelFilter] = useState<string>('all');
  const [hasEmentaFilter, setHasEmentaFilter] = useState<string>('with_ementa');

  // Digital Menu Structure
  const [digitalStructure, setDigitalStructure] = useState<EmentaDigitalStructureResponse | null>(null);

  // Bulk Actions
  const [bulkVisivel, setBulkVisivel] = useState<string>('');
  const [bulkHighlight, setBulkHighlight] = useState<string>('');
  const [bulkCase, setBulkCase] = useState<string>('');
  const [bulkDescMode, setBulkDescMode] = useState<string>('');
  const [bulkDescText, setBulkDescText] = useState<string>('');
  const [bulkDiet, setBulkDiet] = useState<{
    gluten?: number;
    lactose?: number;
    vegetariano?: number;
    picante?: number;
  }>({});

  // Single Product Edit Modal
  const [editModalProduct, setEditModalProduct] = useState<EmentaProductItem | null>(null);
  const [editForm, setEditForm] = useState({
    produto: '',
    descricao: '',
    visivel: 1,
    highlight: 0,
    gluten: 0,
    lactose: 0,
    vegetariano: 0,
    picante: 0
  });
  const [isSavingProduct, setIsSavingProduct] = useState<boolean>(false);
  const [isSuggestingDesc, setIsSuggestingDesc] = useState<boolean>(false);

  // Image Upload Modal
  const [imageModalProduct, setImageModalProduct] = useState<EmentaProductItem | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState<string>('');
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importMode, setImportMode] = useState<'pos' | 'csv'>('pos');
  const [csvInput, setCsvInput] = useState<string>('');
  const [csvStartCode, setCsvStartCode] = useState<string>('700001');
  const [importFamily, setImportFamily] = useState<string>('all');
  const [importEmentaFamily, setImportEmentaFamily] = useState<string>('default');
  const [importOverwrite, setImportOverwrite] = useState<boolean>(false);
  const [importStorePreset, setImportStorePreset] = useState<string>('7');
  const [importMinCode, setImportMinCode] = useState<string>('700001');
  const [importMaxCode, setImportMaxCode] = useState<string>('799999');
  const [isImporting, setIsImporting] = useState<boolean>(false);

  const handleStorePresetChange = (preset: string) => {
    setImportStorePreset(preset);
    if (preset === '7') {
      setImportMinCode('700001');
      setImportMaxCode('799999');
    } else if (preset === '1') {
      setImportMinCode('100001');
      setImportMaxCode('199999');
    } else if (preset === 'all') {
      setImportMinCode('');
      setImportMaxCode('');
    }
  };

  // Translation tab state
  const [selectedProductForTranslation, setSelectedProductForTranslation] = useState<EmentaProductItem | null>(null);
  const [languages, setLanguages] = useState<EmentaLanguage[]>(ALL_SUPPORTED_LANGUAGES);
  const [selectedLangCodes, setSelectedLangCodes] = useState<Set<string>>(new Set(['gb']));
  const [activeLangTab, setActiveLangTab] = useState<string>('gb');
  const [translationsData, setTranslationsData] = useState<Record<string, { produto: string; descricao: string }>>({});
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isSavingTranslations, setIsSavingTranslations] = useState<boolean>(false);
  const [isAutoGeneralTranslating, setIsAutoGeneralTranslating] = useState<boolean>(false);

  const toggleLangCode = (code: string) => {
    const lower = code.toLowerCase();
    const next = new Set(selectedLangCodes);
    if (next.has(lower)) {
      if (next.size <= 1) return; // Garante pelo menos 1 idioma ativo
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

  const [isActivatingLangs, setIsActivatingLangs] = useState<boolean>(false);

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
      alert('Erro ao comunicar com o servidor.');
    } finally {
      setIsAutoGeneralTranslating(false);
    }
  };

  // Schema tab state
  const [schemaInfo, setSchemaInfo] = useState<EmentaSchemaInfo | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState<boolean>(false);

  // Load products when filters or page change
  useEffect(() => {
    if (isOpen) {
      loadProducts();
      loadLanguages();
      loadSchemaInfo();
      loadDigitalStructure();
    }
  }, [isOpen, page, selectedFamily, selectedEmentaFamily, visivelFilter, hasEmentaFilter]);

  const loadDigitalStructure = async () => {
    try {
      const res = await fetch('/api/ementa-digital/structure');
      if (res.ok) {
        const data: EmentaDigitalStructureResponse = await res.json();
        setDigitalStructure(data);
      }
    } catch (err) {
      console.error('Erro ao carregar estrutura da ementa:', err);
    }
  };

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ementa-digital/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search: searchTerm || null,
          familia: selectedFamily !== 'all' ? parseInt(selectedFamily, 10) : null,
          ementa_familia: selectedEmentaFamily !== 'all' ? parseInt(selectedEmentaFamily, 10) : null,
          visivel_filter: visivelFilter,
          has_ementa_filter: hasEmentaFilter,
          page: page,
          page_size: 50
        })
      });
      if (res.ok) {
        const data: EmentaProductResponse = await res.json();
        setProducts(data.items);
        setTotalCount(data.total_count);
        setTotalPages(data.total_pages);
      }
    } catch (err) {
      console.error('Erro ao carregar artigos da ementa:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLanguages = async () => {
    try {
      const res = await fetch('/api/ementa-digital/languages');
      if (res.ok) {
        const data: Array<{ id: string; name: string; code: string; visivel?: number }> = await res.json();
        const combinedMap = new Map<string, EmentaLanguage>();
        ALL_SUPPORTED_LANGUAGES.forEach(l => combinedMap.set(l.code.toLowerCase(), l));
        data.forEach(l => {
          const lower = l.code.toLowerCase();
          const existing = combinedMap.get(lower);
          combinedMap.set(lower, {
            id: l.id || lower.toUpperCase(),
            name: l.name || existing?.name || lower.toUpperCase(),
            code: lower
          });
        });
        const mergedList = Array.from(combinedMap.values());
        setLanguages(mergedList);

        const activeFromDb = data.filter(l => (l.visivel === undefined || l.visivel === 1)).map(l => l.code.toLowerCase());
        if (activeFromDb.length > 0) {
          setSelectedLangCodes(new Set(activeFromDb));
          setActiveLangTab(activeFromDb[0]);
        } else {
          setSelectedLangCodes(new Set(['gb']));
          setActiveLangTab('gb');
        }
      }
    } catch (err) {
      console.error('Erro ao carregar idiomas:', err);
    }
  };

  const loadSchemaInfo = async () => {
    setIsLoadingSchema(true);
    try {
      const res = await fetch('/api/ementa-digital/schema');
      if (res.ok) {
        const data: EmentaSchemaInfo = await res.json();
        setSchemaInfo(data);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do esquema:', err);
    } finally {
      setIsLoadingSchema(false);
    }
  };

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedCodes.size === products.length && products.length > 0) {
      setSelectedCodes(new Set());
    } else {
      setSelectedCodes(new Set(products.map(p => p.codigo)));
    }
  };

  const toggleSelect = (codigo: number) => {
    const next = new Set(selectedCodes);
    if (next.has(codigo)) {
      next.delete(codigo);
    } else {
      next.add(codigo);
    }
    setSelectedCodes(next);
  };

  // Open Edit Modal for Single Article
  const handleOpenEditModal = (prod: EmentaProductItem) => {
    setEditModalProduct(prod);
    setEditForm({
      produto: prod.produto || prod.pos_descricao,
      descricao: prod.descricao || '',
      visivel: prod.visivel,
      highlight: prod.highlight,
      gluten: prod.gluten,
      lactose: prod.lactose,
      vegetariano: prod.vegetariano,
      picante: prod.picante
    });
  };

  // Suggest description from culinary assistant
  const handleSuggestDescription = async () => {
    if (!editModalProduct) return;
    setIsSuggestingDesc(true);
    try {
      const res = await fetch('/api/ementa-digital/suggest-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: editModalProduct.codigo,
          nome: editForm.produto || editModalProduct.pos_descricao
        })
      });
      if (res.ok) {
        const data = await res.json();
        setEditForm(prev => ({ ...prev, descricao: data.suggestion }));
      }
    } catch (err) {
      console.error('Erro ao sugerir descrição:', err);
    } finally {
      setIsSuggestingDesc(false);
    }
  };

  // Save single article details
  const handleSaveSingleProduct = async () => {
    if (!editModalProduct) return;
    setIsSavingProduct(true);
    try {
      const res = await fetch(`/api/ementa-digital/product/${editModalProduct.codigo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data.message || 'Artigo atualizado com sucesso!');
        setEditModalProduct(null);
        loadProducts();
      } else {
        alert(data.detail || data.message || 'Erro ao gravar artigo.');
      }
    } catch (err) {
      alert('Falha na comunicação ao gravar artigo.');
    } finally {
      setIsSavingProduct(false);
    }
  };

  // Import from POS
  const handleImportFromPos = async () => {
    setIsImporting(true);
    try {
      const res = await fetch('/api/ementa-digital/import-from-pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codes: selectedCodes.size > 0 ? Array.from(selectedCodes) : null,
          familia: importFamily !== 'all' ? parseInt(importFamily, 10) : null,
          ementa_familia: importEmentaFamily !== 'default' ? parseInt(importEmentaFamily, 10) : null,
          min_code: importMinCode ? parseInt(importMinCode, 10) : null,
          max_code: importMaxCode ? parseInt(importMaxCode, 10) : null,
          all_missing: selectedCodes.size === 0 && importFamily === 'all',
          overwrite: importOverwrite,
          default_visivel: 1
        })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data.message);
        setIsImportModalOpen(false);
        loadProducts();
      } else {
        alert(data.message || 'Falha ao importar artigos.');
      }
    } catch (err) {
      alert('Erro de comunicação ao importar artigos.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportCsv = async () => {
    if (!csvInput.trim()) {
      alert('Por favor introduza ou cole o conteúdo do CSV (Família, Artigo, Descrição, Preço).');
      return;
    }
    setIsImporting(true);
    try {
      const res = await fetch('/api/ementa-digital/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv_text: csvInput,
          start_code: csvStartCode ? parseInt(csvStartCode, 10) : 700001,
          overwrite: true
        })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data.message);
        setIsImportModalOpen(false);
        loadProducts();
      } else {
        alert(data.message || 'Falha ao importar CSV.');
      }
    } catch (err) {
      alert('Erro de comunicação ao importar CSV.');
    } finally {
      setIsImporting(false);
    }
  };

  // Bulk Edit Preview & Apply
  const handleSimulateBulkEdit = async () => {
    if (selectedCodes.size === 0) {
      alert('Selecione pelo menos um artigo para aplicar alterações.');
      return;
    }

    const actions: any = {};
    if (bulkVisivel === '1') actions.set_visivel = 1;
    if (bulkVisivel === '0') actions.set_visivel = 0;
    if (bulkHighlight === '1') actions.set_highlight = 1;
    if (bulkHighlight === '0') actions.set_highlight = 0;
    if (bulkCase) actions.text_case_name = bulkCase;

    // Descrições em massa
    if (bulkDescMode === 'copy_pos_short') {
      actions.copy_pos_short_desc = true;
    } else if (bulkDescMode === 'set_text' && bulkDescText.trim()) {
      actions.set_descricao = bulkDescText.trim();
    } else if (bulkDescMode === 'append_text' && bulkDescText.trim()) {
      actions.append_descricao = bulkDescText.trim();
    }

    if (bulkDiet.gluten !== undefined) actions.set_gluten = bulkDiet.gluten;
    if (bulkDiet.lactose !== undefined) actions.set_lactose = bulkDiet.lactose;
    if (bulkDiet.vegetariano !== undefined) actions.set_vegetariano = bulkDiet.vegetariano;
    if (bulkDiet.picante !== undefined) actions.set_picante = bulkDiet.picante;

    const payload = {
      codes: Array.from(selectedCodes),
      actions: actions
    };

    try {
      const res = await fetch('/api/ementa-digital/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error('Falha ao simular alterações.');
      }
      const previewData: BulkEditPreviewResponse = await res.json();

      onOpenPreview(previewData, async () => {
        const applyRes = await fetch('/api/ementa-digital/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const applyData = await applyRes.json();
        if (!applyRes.ok) {
          throw new Error(applyData.detail || 'Erro ao aplicar alterações.');
        }
        onSuccess(applyData.message || 'Ementa Digital atualizada com sucesso!');
        loadProducts();
      });
    } catch (err: any) {
      alert(err.message || 'Erro ao simular alterações.');
    }
  };

  // Image Upload
  const handleOpenImageModal = (prod: EmentaProductItem) => {
    setImageModalProduct(prod);
    setImageUrlInput(prod.image_url || '');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!imageModalProduct || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    setIsUploadingImage(true);
    try {
      const res = await fetch(`/api/ementa-digital/upload-image/${imageModalProduct.codigo}`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        onSuccess('Imagem associada com sucesso!');
        setImageModalProduct(null);
        loadProducts();
      } else {
        alert(data.detail || data.message || 'Erro ao carregar imagem.');
      }
    } catch (err) {
      alert('Falha ao enviar imagem.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSaveImageUrl = async () => {
    if (!imageModalProduct) return;
    setIsUploadingImage(true);
    try {
      const res = await fetch(`/api/ementa-digital/set-image-url/${imageModalProduct.codigo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrlInput })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess('URL da imagem atualizado!');
        setImageModalProduct(null);
        loadProducts();
      } else {
        alert(data.detail || 'Erro ao gravar URL.');
      }
    } catch (err) {
      alert('Falha na comunicação.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!imageModalProduct) return;
    if (!confirm(`Tem a certeza que deseja remover a imagem do artigo #${imageModalProduct.codigo}?`)) return;
    setIsUploadingImage(true);
    try {
      const res = await fetch(`/api/ementa-digital/delete-image/${imageModalProduct.codigo}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onSuccess('Imagem removida com sucesso!');
        setImageModalProduct(null);
        loadProducts();
      } else {
        alert(data.detail || data.message || 'Erro ao remover imagem.');
      }
    } catch (err) {
      alert('Falha na comunicação ao remover imagem.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Translations
  const handleSelectProductForTranslation = async (prod: EmentaProductItem) => {
    setSelectedProductForTranslation(prod);
    try {
      const res = await fetch(`/api/ementa-digital/translations/${prod.codigo}`);
      if (res.ok) {
        const data = await res.json();
        const initData: Record<string, { produto: string; descricao: string }> = {};
        languages.forEach(l => {
          const lCode = l.code.toUpperCase();
          initData[l.code] = {
            produto: data[lCode]?.produto || '',
            descricao: data[lCode]?.descricao || ''
          };
        });
        setTranslationsData(initData);
      }
    } catch (err) {
      console.error('Erro ao ler traduções:', err);
    }
  };

  const handleAutoTranslate = async () => {
    if (!selectedProductForTranslation) return;
    const ptName = selectedProductForTranslation.produto || selectedProductForTranslation.pos_descricao;
    const ptDesc = selectedProductForTranslation.descricao || '';
    const textsToTranslate = [ptName];
    if (ptDesc) textsToTranslate.push(ptDesc);

    setIsTranslating(true);
    try {
      const res = await fetch('/api/ementa-digital/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: textsToTranslate,
          target_langs: languages.map(l => l.code),
          source_lang: 'pt'
        })
      });
      if (res.ok) {
        const data = await res.json();
        const trs = data.translations || {};
        const descs = data.descriptions || {};
        const updated = { ...translationsData };

        languages.forEach(l => {
          const c = l.code;
          const translatedName = trs[ptName]?.[c] || ptName;
          let translatedDesc = ptDesc ? (trs[ptDesc]?.[c] || ptDesc) : '';
          
          if ((!translatedDesc || translatedDesc === ptDesc) && descs[ptName]?.[c]) {
            translatedDesc = descs[ptName][c];
          }

          updated[c] = {
            produto: translatedName,
            descricao: translatedDesc
          };
        });

        setTranslationsData(updated);
        onSuccess('Traduções gastronómicas geradas pelo assistente!');
      }
    } catch (err) {
      alert('Erro ao traduzir.');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleBatchAutoTranslate = async () => {
    const selectedProds = products.filter(p => selectedCodes.has(p.codigo));
    if (selectedProds.length === 0) return;

    if (!confirm(`Deseja traduzir automaticamente os ${selectedProds.length} artigos selecionados para Inglês, Espanhol, Francês e Alemão com o assistente culinário?`)) return;

    setIsTranslating(true);
    let successCount = 0;
    try {
      for (const prod of selectedProds) {
        const ptName = prod.produto || prod.pos_descricao;
        const ptDesc = prod.descricao || '';
        const textsToTranslate = [ptName];
        if (ptDesc) textsToTranslate.push(ptDesc);

        const res = await fetch('/api/ementa-digital/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts: textsToTranslate,
            target_langs: languages.map(l => l.code),
            source_lang: 'pt'
          })
        });

        if (res.ok) {
          const data = await res.json();
          const trs = data.translations || {};
          const descs = data.descriptions || {};
          const savePayload: Record<string, Record<string, string>> = {};

          languages.forEach(l => {
            const c = l.code;
            const country = l.code.toUpperCase();
            const translatedName = trs[ptName]?.[c] || ptName;
            let translatedDesc = ptDesc ? (trs[ptDesc]?.[c] || ptDesc) : '';

            if ((!translatedDesc || translatedDesc === ptDesc) && descs[ptName]?.[c]) {
              translatedDesc = descs[ptName][c];
            }

            savePayload[country] = {
              produto: translatedName,
              descricao: translatedDesc
            };
          });

          const saveRes = await fetch('/api/ementa-digital/translations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cod_produto: prod.codigo,
              translations: savePayload
            })
          });

          if (saveRes.ok) successCount++;
        }
      }

      onSuccess(`Tradução em lote concluída com sucesso para ${successCount} artigo(s)!`);
      if (selectedProductForTranslation) {
        handleSelectProductForTranslation(selectedProductForTranslation);
      }
    } catch (err) {
      alert('Erro durante a tradução em lote.');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSaveTranslations = async () => {
    if (!selectedProductForTranslation) return;
    setIsSavingTranslations(true);
    try {
      const formatted: Record<string, Record<string, string>> = {};
      Object.entries(translationsData).forEach(([lang, fields]) => {
        formatted[lang.toUpperCase()] = {
          produto: fields.produto,
          descricao: fields.descricao
        };
      });

      const res = await fetch('/api/ementa-digital/translations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cod_produto: selectedProductForTranslation.codigo,
          translations: formatted
        })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess('Traduções gravadas na base de dados!');
      } else {
        alert(data.detail || data.message || 'Erro ao gravar traduções.');
      }
    } catch (err) {
      alert('Falha na gravação.');
    } finally {
      setIsSavingTranslations(false);
    }
  };

  const handleSwitchToTranslationsTab = () => {
    setActiveTab('translations');
    if (selectedCodes.size > 0) {
      const firstSelected = products.find(p => selectedCodes.has(p.codigo));
      if (firstSelected) {
        handleSelectProductForTranslation(firstSelected);
        return;
      }
    }
    if (!selectedProductForTranslation && products.length > 0) {
      handleSelectProductForTranslation(products[0]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-600 text-white rounded-xl shadow-md shadow-teal-600/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Editor da Ementa Digital & Traduções
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-teal-100 text-teal-800 border border-teal-200">
                  ZoneSoft QR
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Gestão de descrições detalhadas, imagens, alergénios e traduções multilíngues para a ementa online.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tabs */}
            <div className="flex bg-slate-200/70 p-1 rounded-xl text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => setActiveTab('products')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                  activeTab === 'products' ? 'bg-white text-teal-900 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                <QrCode className="w-3.5 h-3.5 text-teal-600" />
                Artigos & Descrições
              </button>
              <button
                type="button"
                onClick={handleSwitchToTranslationsTab}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                  activeTab === 'translations' ? 'bg-white text-indigo-900 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                <Languages className="w-3.5 h-3.5 text-indigo-600" />
                Assistente de Tradução
                {selectedCodes.size > 0 && (
                  <span className="ml-1 bg-indigo-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                    {selectedCodes.size}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('schema')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                  activeTab === 'schema' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                <Database className="w-3.5 h-3.5 text-slate-500" />
                Diagnóstico BD
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TAB 1: Artigos & Imagens */}
        {activeTab === 'products' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-6 gap-4">
            {/* Filter Bar & Top Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadProducts()}
                    placeholder="Pesquisar por código, designação ou descrição..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={loadProducts}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition"
                >
                  Filtrar
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                {/* Família POS */}
                <select
                  value={selectedFamily}
                  onChange={(e) => { setSelectedFamily(e.target.value); setPage(1); }}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-700"
                >
                  <option value="all">Todas as Famílias POS</option>
                  {families.map(f => (
                    <option key={f.codigo} value={f.codigo}>{f.descricao} (#{f.codigo})</option>
                  ))}
                </select>

                {/* Família Ementa Digital */}
                {digitalStructure?.available && digitalStructure.families.length > 0 && (
                  <select
                    value={selectedEmentaFamily}
                    onChange={(e) => { setSelectedEmentaFamily(e.target.value); setPage(1); }}
                    className="px-2.5 py-1.5 bg-teal-50 border border-teal-300 rounded-lg font-semibold text-teal-900"
                  >
                    <option value="all">Todas as Secções da Ementa</option>
                    {digitalStructure.families.map(ef => {
                      const sec = digitalStructure.sections.find(s => s.codigo === ef.seccao);
                      return (
                        <option key={ef.codigo} value={ef.codigo}>
                          {sec ? `${sec.descricao} > ` : ''}{ef.descricao}
                        </option>
                      );
                    })}
                  </select>
                )}

                {/* Presença na Ementa */}
                <select
                  value={hasEmentaFilter}
                  onChange={(e) => { setHasEmentaFilter(e.target.value); setPage(1); }}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-700"
                >
                  <option value="with_ementa">Apenas Artigos da Ementa Digital</option>
                  <option value="all">Todos os Artigos (POS + Ementa)</option>
                  <option value="without_ementa">Apenas Sem Registo na Ementa</option>
                </select>

                {/* Visibilidade */}
                <select
                  value={visivelFilter}
                  onChange={(e) => { setVisivelFilter(e.target.value); setPage(1); }}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-700"
                >
                  <option value="all">Todas as Visibilidades</option>
                  <option value="visible">Apenas Visíveis</option>
                  <option value="hidden">Apenas Ocultos</option>
                </select>

                {/* Importar do POS */}
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Importar do ZoneSoft
                </button>
              </div>
            </div>

            {/* Bulk Action Bar (when selected) */}
            {selectedCodes.size > 0 && (
              <div className="bg-teal-50 border border-teal-200 p-3 rounded-xl flex items-center justify-between flex-wrap gap-3 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="bg-teal-600 text-white font-mono font-bold text-xs px-2 py-0.5 rounded-md">
                    {selectedCodes.size} selecionado(s)
                  </span>
                  <span className="text-xs text-teal-900 font-semibold">Ações em massa:</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {/* Visibilidade */}
                  <select
                    value={bulkVisivel}
                    onChange={(e) => setBulkVisivel(e.target.value)}
                    className="bg-white border border-teal-300 rounded-lg px-2 py-1 text-slate-700"
                  >
                    <option value="">Visibilidade...</option>
                    <option value="1">Marcar Visível</option>
                    <option value="0">Marcar Oculto</option>
                  </select>

                  {/* Destaque */}
                  <select
                    value={bulkHighlight}
                    onChange={(e) => setBulkHighlight(e.target.value)}
                    className="bg-white border border-teal-300 rounded-lg px-2 py-1 text-slate-700"
                  >
                    <option value="">Destaque...</option>
                    <option value="1">Definir como Destaque</option>
                    <option value="0">Retirar Destaque</option>
                  </select>

                  {/* Ação de Descrição */}
                  <select
                    value={bulkDescMode}
                    onChange={(e) => setBulkDescMode(e.target.value)}
                    className="bg-white border border-teal-300 rounded-lg px-2 py-1 text-slate-700"
                  >
                    <option value="">Descrições...</option>
                    <option value="copy_pos_short">Copiar descrição curta do POS</option>
                    <option value="set_text">Definir texto fixo na descrição</option>
                    <option value="append_text">Acrescentar texto à descrição</option>
                  </select>

                  {(bulkDescMode === 'set_text' || bulkDescMode === 'append_text') && (
                    <input
                      type="text"
                      value={bulkDescText}
                      onChange={(e) => setBulkDescText(e.target.value)}
                      placeholder="Texto para a descrição..."
                      className="bg-white border border-teal-300 rounded-lg px-2.5 py-1 text-slate-700 w-48 text-xs"
                    />
                  )}

                  <button
                    type="button"
                    onClick={handleSimulateBulkEdit}
                    className="bg-teal-700 hover:bg-teal-800 text-white font-bold px-3 py-1 rounded-lg transition flex items-center gap-1.5 shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Simular & Gravar
                  </button>
                </div>
              </div>
            )}

            {/* Products Table */}
            <div className="flex-1 border border-slate-200 rounded-xl overflow-auto bg-white shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedCodes.size === products.length && products.length > 0}
                        onChange={handleSelectAll}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                    </th>
                    <th className="p-3 w-16 text-center">Imagem</th>
                    <th className="p-3 w-16">Cód</th>
                    <th className="p-3">Artigo no POS</th>
                    <th className="p-3">Nome na Ementa</th>
                    <th className="p-3">Descrição Detalhada</th>
                    <th className="p-3 text-center">Alergénios</th>
                    <th className="p-3 text-center">Destaque</th>
                    <th className="p-3 text-center">Visível</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
                        A carregar artigos da ementa digital...
                      </td>
                    </tr>
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        Nenhum artigo encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    products.map((p) => {
                      const isSelected = selectedCodes.has(p.codigo);
                      return (
                        <tr
                          key={p.codigo}
                          className={`hover:bg-teal-50/40 transition ${isSelected ? 'bg-teal-50/70' : ''}`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(p.codigo)}
                              className="rounded text-teal-600 focus:ring-teal-500"
                            />
                          </td>

                          {/* Imagem Thumbnail */}
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleOpenImageModal(p)}
                              className="relative group w-11 h-11 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center hover:border-teal-500 transition shadow-2xs"
                              title="Clique para ver ou alterar imagem"
                            >
                              {p.has_image_bytes ? (
                                <img
                                  src={`/api/ementa-digital/image/${p.codigo}`}
                                  alt={p.produto || p.pos_descricao}
                                  className="w-full h-full object-cover"
                                />
                              ) : p.image_url ? (
                                <img
                                  src={p.image_url}
                                  alt={p.produto || p.pos_descricao}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                              ) : (
                                <ImageIcon className="w-5 h-5 text-slate-300 group-hover:text-teal-600 transition" />
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                <Upload className="w-3.5 h-3.5" />
                              </div>
                            </button>
                          </td>

                          <td className="p-3 font-mono font-bold text-slate-800">
                            #{p.codigo}
                          </td>

                          <td className="p-3">
                            <div className="font-semibold text-slate-900">{p.pos_descricao}</div>
                            <div className="text-[10px] text-slate-400 flex items-center flex-wrap gap-1 mt-0.5">
                              <span>{p.familia_desc || 'Sem Família POS'} • {p.pvp1.toFixed(2)}€</span>
                              {p.ementa_familia_desc && (
                                <span className="px-1.5 py-0.5 bg-teal-50 text-teal-800 border border-teal-200 rounded font-semibold text-[9px] inline-flex items-center gap-0.5">
                                  {p.ementa_seccao_desc ? `${p.ementa_seccao_desc} > ` : ''}{p.ementa_familia_desc}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="p-3 font-medium text-slate-800">
                            {p.exists_in_ementa ? (
                              <span>{p.produto || <span className="italic text-slate-300">Sem nome específico</span>}</span>
                            ) : (
                              <span className="text-amber-600 italic text-[11px]">Sem registo na ementa</span>
                            )}
                          </td>

                          {/* Descrição Detalhada Clicável */}
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(p)}
                              className="text-left w-full max-w-xs group flex items-center justify-between gap-1.5 hover:bg-slate-100 p-1 rounded-md transition"
                              title="Clique para editar a descrição deste artigo"
                            >
                              <span className="truncate text-slate-600 text-[11px]">
                                {p.descricao ? p.descricao : <span className="text-amber-600 font-semibold italic flex items-center gap-1">+ Adicionar descrição</span>}
                              </span>
                              <Edit3 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition shrink-0" />
                            </button>
                          </td>

                          {/* Alergénios */}
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {p.gluten === 1 && <span title="Glúten" className="px-1 py-0.5 bg-amber-100 text-amber-900 rounded font-bold text-[9px]">🌾</span>}
                              {p.lactose === 1 && <span title="Lactose" className="px-1 py-0.5 bg-blue-100 text-blue-900 rounded font-bold text-[9px]">🥛</span>}
                              {p.vegetariano === 1 && <span title="Vegetariano" className="px-1 py-0.5 bg-emerald-100 text-emerald-900 rounded font-bold text-[9px]">🥗</span>}
                              {p.picante === 1 && <span title="Picante" className="px-1 py-0.5 bg-rose-100 text-rose-900 rounded font-bold text-[9px]">🌶️</span>}
                              {!p.gluten && !p.lactose && !p.vegetariano && !p.picante && (
                                <span className="text-slate-300 text-[11px]">-</span>
                              )}
                            </div>
                          </td>

                          {/* Destaque */}
                          <td className="p-3 text-center">
                            {p.highlight === 1 ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded font-bold text-[10px]">
                                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                Sim
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>

                          {/* Visível */}
                          <td className="p-3 text-center">
                            {p.exists_in_ementa ? (
                              p.visivel === 1 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full font-bold text-[10px]">
                                  <Eye className="w-3 h-3 text-emerald-600" />
                                  Visível
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-bold text-[10px]">
                                  <EyeOff className="w-3 h-3 text-slate-400" />
                                  Oculto
                                </span>
                              )
                            ) : (
                              <span className="text-slate-300 italic text-[11px]">-</span>
                            )}
                          </td>

                          {/* Ações Rápidas */}
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(p)}
                                className="p-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-lg text-xs font-bold border border-teal-200 transition"
                                title="Editar descrição e detalhes do prato"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectProductForTranslation(p);
                                  setActiveTab('translations');
                                }}
                                className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-200 transition"
                                title="Traduzir prato"
                              >
                                <Languages className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination & Status Footer */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
              <div>
                A mostrar {products.length} de {totalCount} artigos
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1 rounded-md border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-semibold text-slate-700">Página {page} de {totalPages}</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-1 rounded-md border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Assistente de Tradução */}
        {activeTab === 'translations' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-6 gap-6">
            {/* Seletor de Idiomas Ativos */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-4 flex-wrap shadow-2xs">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800">Idiomas Ativos para Tradução:</span>
                <span className="text-[11px] text-slate-500 font-medium">(Marque os idiomas a utilizar na ementa)</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {languages.map(l => {
                    const lower = l.code.toLowerCase();
                    const isChecked = selectedLangCodes.has(lower);
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => toggleLangCode(lower)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border select-none ${
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
                </div>

                <button
                  type="button"
                  onClick={handleActivateLanguagesInDb}
                  disabled={isActivatingLangs}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-3.5 py-1.5 rounded-xl shadow-xs transition text-xs"
                  title="Grava e ativa os idiomas selecionados na tabela dbo.ementa_digital_paises do ZoneSoft"
                >
                  {isActivatingLangs ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Ativar no ZoneSoft (QR)
                </button>
              </div>
            </div>

            {/* Banner Traduções Gerais do Sistema */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-4 rounded-xl flex items-center justify-between gap-4 flex-wrap shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-sm">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    Traduções Gerais da Interface ZoneSoft
                    <span className="text-[10px] bg-amber-200 text-amber-900 font-extrabold px-2 py-0.5 rounded-full">82 Termos</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Preencha automaticamente todas as expressões do sistema (<i>"Sugestões", "Resumo de Pedido", "Sem glúten", "Finalizar"</i>, etc.) em Inglês, Espanhol, Francês e Alemão com 1 clique!
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAutoGeneralTranslations}
                disabled={isAutoGeneralTranslating}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl shadow-sm transition text-xs shrink-0"
              >
                {isAutoGeneralTranslating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                Preencher 82 Termos Gerais (1-Clique)
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
                  <Languages className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-2">
                    Artigo Selecionado para Tradução
                    {selectedCodes.size > 0 && (
                      <span className="bg-teal-100 text-teal-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {selectedCodes.size} selecionado(s) na tabela
                      </span>
                    )}
                  </div>

                  <select
                    value={selectedProductForTranslation?.codigo || ''}
                    onChange={(e) => {
                      const code = parseInt(e.target.value, 10);
                      const targetProd = products.find(p => p.codigo === code);
                      if (targetProd) handleSelectProductForTranslation(targetProd);
                    }}
                    className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    {!selectedProductForTranslation && <option value="">Nenhum artigo selecionado</option>}
                    {selectedCodes.size > 0 ? (
                      products.filter(p => selectedCodes.has(p.codigo)).map(p => (
                        <option key={p.codigo} value={p.codigo}>
                          #{p.codigo} - {p.produto || p.pos_descricao} ({p.pvp1.toFixed(2)}€)
                        </option>
                      ))
                    ) : (
                      products.map(p => (
                        <option key={p.codigo} value={p.codigo}>
                          #{p.codigo} - {p.produto || p.pos_descricao} ({p.pvp1.toFixed(2)}€)
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {selectedCodes.size > 1 && (
                  <button
                    type="button"
                    onClick={handleBatchAutoTranslate}
                    disabled={isTranslating}
                    className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl shadow-sm transition text-xs"
                    title={`Traduzir todos os ${selectedCodes.size} artigos selecionados em lote`}
                  >
                    {isTranslating ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    Traduzir {selectedCodes.size} Selecionados em Lote
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAutoTranslate}
                  disabled={!selectedProductForTranslation || isTranslating}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl shadow-sm transition text-xs"
                >
                  {isTranslating ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Traduzir com Assistente Culinário
                </button>

                <button
                  type="button"
                  onClick={handleSaveTranslations}
                  disabled={!selectedProductForTranslation || isSavingTranslations}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl shadow-sm transition text-xs"
                >
                  {isSavingTranslations ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Gravar Tradução
                </button>
              </div>
            </div>

            {/* Translation Workspace */}
            {selectedProductForTranslation ? (
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0 overflow-y-auto">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <span className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <span>🇵🇹</span> Original (Português)
                    </span>
                    <span className="text-xs bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-md">
                      Fonte
                    </span>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">Designação / Nome do Prato</label>
                    <div className="bg-white border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-900">
                      {selectedProductForTranslation.produto || selectedProductForTranslation.pos_descricao}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col">
                    <label className="text-xs font-bold text-slate-600 block mb-1">Descrição Detalhada</label>
                    <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700 flex-1 whitespace-pre-wrap">
                      {selectedProductForTranslation.descricao || <span className="text-slate-300 italic">Sem descrição longa registada.</span>}
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-indigo-100 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
                  <div className="flex items-center gap-1 border-b border-slate-200 pb-2 overflow-x-auto">
                    {languages.filter(l => selectedLangCodes.has(l.code.toLowerCase())).map(l => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => setActiveLangTab(l.code.toLowerCase())}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                          activeLangTab.toLowerCase() === l.code.toLowerCase()
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {l.name}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
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
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
                    />
                  </div>

                  <div className="flex-1 flex flex-col">
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Descrição Traduzida ({activeLangTab.toUpperCase()})
                    </label>
                    <textarea
                      rows={4}
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
                      placeholder="Descrição no idioma de destino..."
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 flex-1"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-2xl p-12">
                <Languages className="w-12 h-12 text-slate-300 mb-3" />
                <p className="font-bold text-slate-600 text-sm">Selecione um artigo na tabela para editar as suas traduções</p>
                <p className="text-xs text-slate-400 mt-1">
                  Pode voltar ao separador &quot;Artigos & Descrições&quot; e clicar no botão de tradução.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('products')}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-indigo-700 transition"
                >
                  Voltar à Lista de Artigos
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Diagnóstico da Base de Dados */}
        {activeTab === 'schema' && (
          <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Estado do Esquema SQL da Ementa Digital</h3>
                <p className="text-xs text-slate-500">
                  Deteção automática de tabelas ZoneSoft no SQL Server.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(schemaInfo, null, 2));
                  onSuccess('Estrutura copiada para a área de transferência!');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar Estrutura (JSON)
              </button>
            </div>

            {schemaInfo && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(schemaInfo.tables).map(([tableName, info]: any) => (
                  <div key={tableName} className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono font-bold text-slate-900 text-xs">dbo.{tableName}</span>
                      {info.exists ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                          Presente ({info.row_count} registos)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-bold text-[10px]">
                          Não encontrada
                        </span>
                      )}
                    </div>
                    {info.columns && (
                      <div className="max-h-52 overflow-y-auto text-[11px] font-mono border-t border-slate-100 pt-2 divide-y divide-slate-50">
                        {info.columns.map((c: any) => (
                          <div key={c.name} className="py-1 flex justify-between text-slate-600">
                            <span>{c.name}</span>
                            <span className="text-indigo-600">{c.type}({c.max_length})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MODAL DE EDIÇÃO INDIVIDUAL DE ARTIGO (NOME, DESCRIÇÃO, ALERGÉNIOS) */}
        {editModalProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl p-6 flex flex-col gap-4 border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-teal-100 text-teal-800 rounded-lg">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      Editar Artigo #{editModalProduct.codigo}
                    </h3>
                    <div className="text-xs text-slate-400">
                      POS: {editModalProduct.pos_descricao}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditModalProduct(null)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Nome na Ementa */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nome na Ementa Digital</label>
                <input
                  type="text"
                  value={editForm.produto}
                  onChange={(e) => setEditForm(prev => ({ ...prev, produto: e.target.value }))}
                  placeholder="Nome do prato na ementa..."
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Descrição Detalhada */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Descrição Detalhada / Ingredientes</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSuggestDescription}
                      disabled={isSuggestingDesc}
                      className="text-[11px] font-bold text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-0.5 rounded-md flex items-center gap-1 transition"
                      title="Gera uma sugestão com base no tipo de prato"
                    >
                      <Wand2 className="w-3 h-3" />
                      {isSuggestingDesc ? 'A gerar...' : 'Sugerir Descrição'}
                    </button>
                  </div>
                </div>

                <textarea
                  rows={4}
                  value={editForm.descricao}
                  onChange={(e) => setEditForm(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Escreva os ingredientes, modo de confeção e acompanhamentos (ex: Grelhado no carvão, servido com batata frita e salada)..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 leading-relaxed"
                />

                {/* Quick Snippets */}
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  <span className="text-[10px] text-slate-400 font-semibold">Atalhos:</span>
                  {[
                    'Grelhado na brasa',
                    'Acompanha batata frita e arroz',
                    'Servido com legumes salteados',
                    'Ideal para partilhar',
                    'Receita tradicional da casa'
                  ].map(snippet => (
                    <button
                      key={snippet}
                      type="button"
                      onClick={() => setEditForm(prev => ({
                        ...prev,
                        descricao: prev.descricao ? `${prev.descricao.trim()} • ${snippet}` : snippet
                      }))}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-medium transition"
                    >
                      + {snippet}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alergénios & Dietas */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Alergénios & Dietas</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <label className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium cursor-pointer transition select-none ${
                    editForm.gluten === 1 ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    <input
                      type="checkbox"
                      checked={editForm.gluten === 1}
                      onChange={(e) => setEditForm(prev => ({ ...prev, gluten: e.target.checked ? 1 : 0 }))}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    🌾 Glúten
                  </label>

                  <label className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium cursor-pointer transition select-none ${
                    editForm.lactose === 1 ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    <input
                      type="checkbox"
                      checked={editForm.lactose === 1}
                      onChange={(e) => setEditForm(prev => ({ ...prev, lactose: e.target.checked ? 1 : 0 }))}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    🥛 Lactose
                  </label>

                  <label className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium cursor-pointer transition select-none ${
                    editForm.vegetariano === 1 ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    <input
                      type="checkbox"
                      checked={editForm.vegetariano === 1}
                      onChange={(e) => setEditForm(prev => ({ ...prev, vegetariano: e.target.checked ? 1 : 0 }))}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    🥗 Vegetariano
                  </label>

                  <label className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium cursor-pointer transition select-none ${
                    editForm.picante === 1 ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    <input
                      type="checkbox"
                      checked={editForm.picante === 1}
                      onChange={(e) => setEditForm(prev => ({ ...prev, picante: e.target.checked ? 1 : 0 }))}
                      className="rounded text-rose-600 focus:ring-rose-500"
                    />
                    🌶️ Picante
                  </label>
                </div>
              </div>

              {/* Visível & Destaque */}
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editForm.visivel === 1}
                    onChange={(e) => setEditForm(prev => ({ ...prev, visivel: e.target.checked ? 1 : 0 }))}
                    className="rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span className="font-bold text-slate-800">Visível na Ementa Digital</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editForm.highlight === 1}
                    onChange={(e) => setEditForm(prev => ({ ...prev, highlight: e.target.checked ? 1 : 0 }))}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    Destacar este Artigo
                  </span>
                </label>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalProduct(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveSingleProduct}
                  disabled={isSavingProduct}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
                >
                  {isSavingProduct ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Guardar Artigo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Image Management Popup Modal */}
        {imageModalProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 flex flex-col gap-4 border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-teal-600" />
                  Imagem do Artigo #{imageModalProduct.codigo}
                </h3>
                <button
                  type="button"
                  onClick={() => setImageModalProduct(null)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Current Preview */}
              <div className="relative w-full h-44 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center group">
                {imageModalProduct.has_image_bytes ? (
                  <img
                    src={`/api/ementa-digital/image/${imageModalProduct.codigo}`}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : imageModalProduct.image_url ? (
                  <img
                    src={imageModalProduct.image_url}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-slate-400 text-xs">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1 text-slate-300" />
                    Sem imagem associada
                  </div>
                )}

                {(imageModalProduct.has_image_bytes || imageModalProduct.image_url) && (
                  <button
                    type="button"
                    onClick={handleDeleteImage}
                    disabled={isUploadingImage}
                    className="absolute top-2 right-2 bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-lg shadow-md transition flex items-center gap-1 text-xs font-bold"
                    title="Remover Imagem"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remover Imagem
                  </button>
                )}
              </div>

              {/* Upload New File */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Carregar ficheiro (JPG, PNG, WebP)</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className="w-full py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold rounded-xl border border-teal-200 text-xs flex items-center justify-center gap-2 transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isUploadingImage ? 'A carregar...' : 'Selecionar Imagem do Computador'}
                </button>
              </div>

              <div className="flex items-center gap-2 my-1">
                <div className="h-px bg-slate-200 flex-1" />
                <span className="text-[10px] text-slate-400 uppercase font-bold">ou link externo</span>
                <div className="h-px bg-slate-200 flex-1" />
              </div>

              {/* External Image URL */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">URL da Imagem</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="https://exemplo.com/foto.jpg"
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveImageUrl}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg transition"
                  >
                    Gravar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Import from POS Popup Modal */}
        {isImportModalOpen && (() => {
          const minCodeVal = importMinCode ? parseInt(importMinCode, 10) : null;
          const maxCodeVal = importMaxCode ? parseInt(importMaxCode, 10) : null;

          const importList = products.filter(p => {
            if (minCodeVal !== null && !isNaN(minCodeVal) && p.codigo < minCodeVal) return false;
            if (maxCodeVal !== null && !isNaN(maxCodeVal) && p.codigo > maxCodeVal) return false;
            if (selectedCodes.size > 0 && !selectedCodes.has(p.codigo)) return false;
            if (importFamily !== 'all' && p.familia !== parseInt(importFamily, 10)) return false;
            if (!importOverwrite && p.exists_in_ementa) return false;
            return true;
          });

          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl p-6 flex flex-col gap-4 border border-slate-200 max-h-[90vh] animate-in fade-in">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <Upload className="w-4 h-4 text-teal-600" />
                      Importar Artigos para a Ementa Digital
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Importe artigos a partir do catálogo ZoneSoft ou diretamente através de texto/ficheiro CSV.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(false)}
                    className="text-slate-400 hover:text-slate-700 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 gap-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => setImportMode('pos')}
                    className={`pb-2 text-xs font-bold border-b-2 transition-colors ${importMode === 'pos' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    Do Catálogo ZoneSoft (POS)
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('csv')}
                    className={`pb-2 text-xs font-bold border-b-2 transition-colors ${importMode === 'csv' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    Importar Ficheiro / Texto CSV
                  </button>
                </div>

                {importMode === 'pos' ? (
                  <>
                {/* Filters grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Filtrar por Família do POS</label>
                    <select
                      value={importFamily}
                      onChange={(e) => setImportFamily(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-medium"
                    >
                      <option value="all">Todas as Famílias POS</option>
                      {families.map(f => (
                        <option key={f.codigo} value={f.codigo}>{f.descricao} (#{f.codigo})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-teal-800 block mb-1">Filtro de Loja (BD Partilhada)</label>
                    <select
                      value={importStorePreset}
                      onChange={(e) => handleStorePresetChange(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-teal-50 border border-teal-300 rounded-lg font-bold text-teal-900"
                    >
                      <option value="7">Loja 7 (Códigos 700001 - 799999)</option>
                      <option value="1">Loja 1 (Códigos 100001 - 199999)</option>
                      <option value="all">Todas as Lojas (Sem filtro)</option>
                      <option value="custom">Personalizado</option>
                    </select>
                  </div>

                  {digitalStructure?.available && digitalStructure.families.length > 0 ? (
                    <div>
                      <label className="text-xs font-bold text-teal-900 block mb-1">Atribuir à Secção/Família Ementa</label>
                      <select
                        value={importEmentaFamily}
                        onChange={(e) => setImportEmentaFamily(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-medium text-slate-800"
                      >
                        <option value="default">Primeira Família Disponível (Automático)</option>
                        {digitalStructure.families.map(ef => {
                          const sec = digitalStructure.sections.find(s => s.codigo === ef.seccao);
                          return (
                            <option key={ef.codigo} value={ef.codigo}>
                              {sec ? `${sec.descricao} > ` : ''}{ef.descricao}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  ) : <div />}

                  {/* Range inputs */}
                  <div className="md:col-span-3 grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Código Mínimo Artigo</label>
                      <input
                        type="number"
                        value={importMinCode}
                        onChange={(e) => {
                          setImportMinCode(e.target.value);
                          setImportStorePreset('custom');
                        }}
                        placeholder="Ex: 700001"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Código Máximo Artigo</label>
                      <input
                        type="number"
                        value={importMaxCode}
                        onChange={(e) => {
                          setImportMaxCode(e.target.value);
                          setImportStorePreset('custom');
                        }}
                        placeholder="Ex: 799999"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-3 flex items-center gap-2 pt-1 border-t border-slate-200">
                    <input
                      type="checkbox"
                      id="importOverwrite"
                      checked={importOverwrite}
                      onChange={(e) => setImportOverwrite(e.target.checked)}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <label htmlFor="importOverwrite" className="text-xs font-medium text-slate-700 select-none">
                      Substituir artigos que já existam na ementa digital
                    </label>
                  </div>
                </div>

                {/* Table Preview */}
                <div className="flex-1 min-h-0 flex flex-col border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span>📋</span> Pré-visualização ({importList.length} artigos para importar)
                    </span>
                    {selectedCodes.size > 0 && (
                      <span className="text-[10px] bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded-full">
                        {selectedCodes.size} selecionados manualmente
                      </span>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {importList.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400 italic">
                        Nenhum artigo encontrado com os filtros selecionados para importar.
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                          <tr>
                            <th className="p-2.5 pl-4">Código</th>
                            <th className="p-2.5">Família POS</th>
                            <th className="p-2.5">Artigo / Designação</th>
                            <th className="p-2.5 text-right">Preço (PVP1)</th>
                            <th className="p-2.5 pr-4 text-center">Estado Ementa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {importList.map(item => (
                            <tr key={item.codigo} className="hover:bg-teal-50/50 transition">
                              <td className="p-2.5 pl-4 font-mono font-bold text-slate-500">#{item.codigo}</td>
                              <td className="p-2.5 font-medium text-slate-600">
                                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px]">
                                  {item.familia_desc || `Família #${item.familia || 0}`}
                                </span>
                              </td>
                              <td className="p-2.5 font-semibold text-slate-900">
                                {item.produto || item.pos_descricao}
                              </td>
                              <td className="p-2.5 text-right font-bold text-emerald-700 whitespace-nowrap">
                                {item.pvp1.toFixed(2)}€
                              </td>
                              <td className="p-2.5 pr-4 text-center whitespace-nowrap">
                                {item.exists_in_ementa ? (
                                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    Já Existente
                                  </span>
                                ) : (
                                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    Novo Artigo
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
                  <span className="text-xs text-slate-500">
                    Total: <strong className="text-slate-800">{importList.length}</strong> artigos a importar
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsImportModalOpen(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleImportFromPos}
                      disabled={isImporting || importList.length === 0}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
                    >
                      {isImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Importar {importList.length} Artigos
                    </button>
                  </div>
                </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <label className="text-xs font-bold text-slate-800 block">Código Inicial dos Artigos</label>
                          <span className="text-[11px] text-slate-500">Ex: 700001 para Loja 7, 100001 para Loja 1</span>
                        </div>
                        <input
                          type="number"
                          value={csvStartCode}
                          onChange={(e) => setCsvStartCode(e.target.value)}
                          className="w-36 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-[220px]">
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Colar CSV (Colunas: Família, Artigo, Descrição, Preço)
                      </label>
                      <textarea
                        value={csvInput}
                        onChange={(e) => setCsvInput(e.target.value)}
                        placeholder={`Família,Artigo,Descrição,Preço\nBrunch Menu,Brunch Alice,"Ovos Benedict...",25,50 €`}
                        className="w-full flex-1 p-3 text-xs font-mono border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
                      <span className="text-xs text-slate-500">
                        Os artigos serão registados em <strong className="text-slate-800">dbo.produtos</strong> e na <strong className="text-slate-800">Ementa Digital</strong>.
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsImportModalOpen(false)}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleImportCsv}
                          disabled={isImporting || !csvInput.trim()}
                          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
                        >
                          {isImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                          Importar do CSV
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
};
