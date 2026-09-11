import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { ProductTable } from './components/ProductTable';
import { BulkEditPanel } from './components/BulkEditPanel';
import { PreviewModal } from './components/PreviewModal';
import { BackupsModal } from './components/BackupsModal';
import { ConfigModal } from './components/ConfigModal';
import { FamilyColorsModal } from './components/FamilyColorsModal';
import { ImportExcelModal } from './components/ImportExcelModal';
import { DataQualityModal } from './components/DataQualityModal';
import { PosLayoutModal } from './components/PosLayoutModal';
import { EmentaDigitalModal } from './components/EmentaDigitalModal';
import { MenuImportWizardModal } from './components/MenuImportWizardModal';
import {
  ProductItem, Family, Subfamily, Vat, ProductFilter, BulkEditRequest,
  BulkEditPreviewResponse, DatabaseConfig, ProductionCenterItem, ProductCodesResponse
} from './types';

export const App: React.FC = () => {
  // DB Config State
  const [dbConfig, setDbConfig] = useState<DatabaseConfig>({
    server: 'localhost',
    port: 1433,
    database: 'nuno',
    trusted_connection: false,
    driver: 'ODBC Driver 17 for SQL Server',
    save_password: false
  });
  const [isConnected, setIsConnected] = useState(false);
  const [useMock, setUseMock] = useState(false);
  const [connectionMsg, setConnectionMsg] = useState('');

  // Auxiliary Data
  const [families, setFamilies] = useState<Family[]>([]);
  const [subfamilies, setSubfamilies] = useState<Subfamily[]>([]);
  const [vats, setVats] = useState<Vat[]>([]);
  const [productionCenters, setProductionCenters] = useState<ProductionCenterItem[]>([]);

  // Filter & List State
  const [filters, setFilters] = useState<ProductFilter>({
    search: '',
    page: 1,
    page_size: 50
  });
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Selection State
  const [selectedCodes, setSelectedCodes] = useState<Set<number>>(new Set());

  // Modal Visibility
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isBackupsOpen, setIsBackupsOpen] = useState(false);
  const [isFamilyColorsOpen, setIsFamilyColorsOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDataQualityOpen, setIsDataQualityOpen] = useState(false);
  const [isPosLayoutOpen, setIsPosLayoutOpen] = useState(false);
  const [isEmentaDigitalOpen, setIsEmentaDigitalOpen] = useState(false);
  const [isMenuImportOpen, setIsMenuImportOpen] = useState(false);
  const [activeReportLabel, setActiveReportLabel] = useState<string | null>(null);

  // Dry-Run & Apply State
  const [currentRequest, setCurrentRequest] = useState<BulkEditRequest | null>(null);
  const [customConfirmAction, setCustomConfirmAction] = useState<(() => Promise<void>) | null>(null);
  const [previewData, setPreviewData] = useState<BulkEditPreviewResponse | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch Connection Config & Aux Lists
  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setDbConfig(data.config);
        setIsConnected(data.is_connected);
        setUseMock(data.use_mock);
        setConnectionMsg(data.message);
        
        // Se não estiver conetado à base de dados, abre automaticamente o modal para introduzir a password/credenciais
        if (!data.is_connected) {
          setIsConfigOpen(true);
        }
      }
    } catch (e) {
      console.error('Erro ao consultar /api/config', e);
    }
  };

  const fetchAuxData = async () => {
    try {
      const [fRes, sfRes, vRes, pcRes] = await Promise.all([
        fetch('/api/families'),
        fetch('/api/subfamilies'),
        fetch('/api/vats'),
        fetch('/api/production-centers')
      ]);
      if (fRes.ok) setFamilies(await fRes.json());
      if (sfRes.ok) setSubfamilies(await sfRes.json());
      if (vRes.ok) setVats(await vRes.json());
      if (pcRes.ok) setProductionCenters(await pcRes.json());
    } catch (e) {
      console.error('Erro ao obter famílias, subfamílias, IVAs e centros de produção', e);
    }
  };

  // Export CSV
  const handleExportCSV = async () => {
    try {
      const selectedList = selectedCodes.size > 0 ? Array.from(selectedCodes) : null;
      const res = await fetch('/api/products/export-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, selected_codes: selectedList })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `artigos_massedit_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        alert('Falha ao exportar ficheiro CSV.');
      }
    } catch (e: any) {
      alert(`Erro na exportação: ${e.message}`);
    }
  };

  // Print Shelf Labels (PDF/HTML)
  const handlePrintLabels = async () => {
    if (selectedCodes.size === 0) {
      alert('Selecione pelo menos 1 artigo para imprimir etiquetas.');
      return;
    }
    if (selectedCodes.size > 300) {
      if (!window.confirm(`Tem ${selectedCodes.size} artigos selecionados para impressão de etiquetas. Gerar mais de 300 etiquetas de uma só vez pode tornar o navegador lento. Deseja continuar?`)) {
        return;
      }
    }
    try {
      const res = await fetch('/api/products/print-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Array.from(selectedCodes))
      });
      if (res.ok) {
        const html = await res.text();
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
        }
      } else {
        alert('Falha ao gerar etiquetas de prateleira.');
      }
    } catch (e: any) {
      alert(`Erro de impressão: ${e.message}`);
    }
  };

  // Search Products
  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const res = await fetch('/api/products/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters)
      });
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items);
        setTotalProducts(data.total);
        setUseMock(data.use_mock);
      }
    } catch (e) {
      console.error('Erro ao pesquisar produtos', e);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchConfig();
    fetchAuxData();
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Selection Handlers
  const handleToggleSelect = (code: number) => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const handleSelectAllPage = () => {
    const allPageSelected = products.every(p => selectedCodes.has(p.codigo));
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        products.forEach(p => next.delete(p.codigo));
      } else {
        products.forEach(p => next.add(p.codigo));
      }
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedCodes(new Set());
  };

  const handleInvertSelection = () => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      products.forEach(p => {
        if (next.has(p.codigo)) {
          next.delete(p.codigo);
        } else {
          next.add(p.codigo);
        }
      });
      return next;
    });
  };

  const [isSelectingAllFiltered, setIsSelectingAllFiltered] = useState(false);

  const handleSelectAllFiltered = async () => {
    setIsSelectingAllFiltered(true);
    try {
      const res = await fetch('/api/products/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters)
      });
      if (res.ok) {
        const data: ProductCodesResponse = await res.json();
        setSelectedCodes(prev => {
          const next = new Set(prev);
          data.codes.forEach(c => next.add(c));
          return next;
        });
        if (data.truncated) {
          setNotification({
            type: 'error',
            text: `Foram selecionados os primeiros 20.000 artigos devido ao limite de segurança (${data.total} encontrados no filtro).`
          });
        } else {
          setNotification({
            type: 'success',
            text: `Todos os ${data.codes.length} artigos do filtro foram selecionados.`
          });
        }
      } else {
        alert('Falha ao obter os códigos de artigos do filtro.');
      }
    } catch (e: any) {
      alert(`Erro ao selecionar artigos: ${e.message}`);
    } finally {
      setIsSelectingAllFiltered(false);
    }
  };

  const handleFilterChange = (newFilters: Partial<ProductFilter>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setActiveReportLabel(null);
    setFilters({
      search: '',
      codes: undefined,
      page: 1,
      page_size: 50
    });
  };

  const handleViewReportArticles = (codes: number[], label: string) => {
    setActiveReportLabel(label);
    setFilters(prev => ({ ...prev, codes, page: 1 }));
    setIsDataQualityOpen(false);
  };

  const handleSelectReportArticles = (codes: number[], label: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      codes.forEach(c => next.add(c));
      return next;
    });
    setNotification({
      type: 'success',
      text: `${codes.length} artigo(s) da verificação "${label}" adicionados à seleção.`
    });
  };

  // Dry-Run Preview
  const handleOpenPreview = async (req: BulkEditRequest) => {
    if (req.product_codes.length === 0) return;
    setCurrentRequest(req);
    setCustomConfirmAction(null);
    setNotification(null);

    try {
      const res = await fetch('/api/products/preview-bulk-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });

      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
        setIsPreviewOpen(true);
      } else {
        const err = await res.json();
        alert(`Erro na simulação: ${err.detail || 'Falha ao processar.'}`);
      }
    } catch (e: any) {
      alert(`Falha ao contactar servidor: ${e.message}`);
    }
  };

  // Preview helper for external modals (like PosLayoutModal)
  const handleOpenCustomPreview = (preview: BulkEditPreviewResponse, onConfirm: () => Promise<void>) => {
    setCurrentRequest(null);
    setCustomConfirmAction(() => onConfirm);
    setPreviewData(preview);
    setIsPreviewOpen(true);
  };

  // Apply Bulk Edit Execution
  const handleConfirmApply = async () => {
    setIsApplying(true);
    try {
      if (customConfirmAction) {
        await customConfirmAction();
        setIsPreviewOpen(false);
        setPreviewData(null);
        setCustomConfirmAction(null);
        loadProducts();
        return;
      }

      if (!currentRequest) return;
      const res = await fetch('/api/products/apply-bulk-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentRequest)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setNotification({ type: 'success', text: data.message });
        setIsPreviewOpen(false);
        setPreviewData(null);
        setSelectedCodes(new Set());
        loadProducts();
      } else {
        alert(`Erro ao aplicar edição em massa: ${data.detail || data.message || 'Falha na gravação.'}`);
      }
    } catch (e: any) {
      alert(`Falha de comunicação: ${e.message}`);
    } finally {
      setIsApplying(false);
    }
  };

  // Save DB Config
  const handleSaveConfig = async (newCfg: DatabaseConfig) => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCfg)
      });
      if (res.ok) {
        const data = await res.json();
        setDbConfig(data.config);
        setIsConnected(data.is_connected);
        setUseMock(data.use_mock);
        setConnectionMsg(data.message);
        if (data.is_connected) {
          setIsConfigOpen(false);
          fetchAuxData();
          loadProducts();
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100 text-slate-900 font-sans">
      
      {/* Top Navbar */}
      <Header
        isConnected={isConnected}
        useMock={useMock}
        connectionMsg={connectionMsg}
        onOpenConfig={() => setIsConfigOpen(true)}
        onOpenBackups={() => setIsBackupsOpen(true)}
        onOpenFamilyColors={() => setIsFamilyColorsOpen(true)}
        onOpenPosLayout={() => setIsPosLayoutOpen(true)}
        onOpenEmentaDigital={() => setIsEmentaDigitalOpen(true)}
        onOpenMenuImport={() => setIsMenuImportOpen(true)}
        onOpenDataQuality={() => setIsDataQualityOpen(true)}
        onRefresh={() => {
          fetchAuxData();
          loadProducts();
        }}
      />

      {/* Global Notification Banner */}
      {notification && (
        <div className={`px-6 py-2.5 text-xs font-semibold flex items-center justify-between border-b shadow-sm ${
          notification.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-rose-50 text-rose-900 border-rose-200'
        }`}>
          <span className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {notification.text}
          </span>
          <button onClick={() => setNotification(null)} className="text-xs font-bold underline hover:opacity-80">Fechar</button>
        </div>
      )}

      {/* Top Filter Bar */}
      <FilterBar
        filters={filters}
        families={families}
        subfamilies={subfamilies}
        vats={vats}
        productionCenters={productionCenters}
        activeReportLabel={activeReportLabel}
        onFilterChange={handleFilterChange}
        onResetFilters={handleResetFilters}
        onExportCSV={handleExportCSV}
        onImportExcel={() => setIsImportOpen(true)}
        onOpenMenuImport={() => setIsMenuImportOpen(true)}
        onPrintLabels={handlePrintLabels}
        totalItems={totalProducts}
        selectedCount={selectedCodes.size}
      />

      {/* Main Workspace Body */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Interactive Table */}
        <ProductTable
          products={products}
          selectedCodes={selectedCodes}
          onToggleSelect={handleToggleSelect}
          onSelectAllPage={handleSelectAllPage}
          onDeselectAll={handleDeselectAll}
          onInvertSelection={handleInvertSelection}
          onSelectAllFiltered={handleSelectAllFiltered}
          isAllFilteredSelected={selectedCodes.size >= totalProducts && totalProducts > 0}
          isSelectingAllFiltered={isSelectingAllFiltered}
          isLoading={isLoadingProducts}
          currentPage={filters.page}
          pageSize={filters.page_size}
          totalCount={totalProducts}
          onPageChange={(page) => handleFilterChange({ page })}
        />

        {/* Right Bulk Edit Form Panel */}
        <BulkEditPanel
          selectedCodes={Array.from(selectedCodes)}
          pageProductCodes={new Set(products.map(p => p.codigo))}
          families={families}
          subfamilies={subfamilies}
          vats={vats}
          productionCenters={productionCenters}
          onPreview={handleOpenPreview}
          onOpenFamilyColors={() => setIsFamilyColorsOpen(true)}
        />

      </main>

      {/* Modals */}
      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        onConfirmApply={handleConfirmApply}
        previewData={previewData}
        isApplying={isApplying}
      />

      <BackupsModal
        isOpen={isBackupsOpen}
        onClose={() => setIsBackupsOpen(false)}
        onRestoreSuccess={() => {
          loadProducts();
          setNotification({ type: 'success', text: 'Estado dos artigos restaurado com sucesso a partir do backup.' });
        }}
      />

      <ConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        config={dbConfig}
        onSaveConfig={handleSaveConfig}
        connectionMsg={connectionMsg}
        isConnected={isConnected}
        useMock={useMock}
      />

      <FamilyColorsModal
        isOpen={isFamilyColorsOpen}
        onClose={() => setIsFamilyColorsOpen(false)}
        onSuccess={(msg) => {
          fetchAuxData();
          loadProducts();
          setNotification({ type: 'success', text: msg });
        }}
      />

      <ImportExcelModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={(msg) => {
          fetchAuxData();
          loadProducts();
          setNotification({ type: 'success', text: msg });
        }}
      />

      <DataQualityModal
        isOpen={isDataQualityOpen}
        onClose={() => setIsDataQualityOpen(false)}
        onViewArticles={handleViewReportArticles}
        onSelectArticles={handleSelectReportArticles}
      />

      <PosLayoutModal
        isOpen={isPosLayoutOpen}
        onClose={() => setIsPosLayoutOpen(false)}
        onOpenPreview={handleOpenCustomPreview}
        onSuccess={(msg) => {
          loadProducts();
          setNotification({ type: 'success', text: msg });
        }}
      />

      <EmentaDigitalModal
        isOpen={isEmentaDigitalOpen}
        onClose={() => setIsEmentaDigitalOpen(false)}
      />

      <MenuImportWizardModal
        isOpen={isMenuImportOpen}
        onClose={() => setIsMenuImportOpen(false)}
        families={families}
        subfamilies={subfamilies}
        vats={vats}
        onOpenPreview={handleOpenCustomPreview}
        onSuccess={(msg) => {
          loadProducts();
          setNotification({ type: 'success', text: msg });
        }}
      />

    </div>
  );
};

export default App;
