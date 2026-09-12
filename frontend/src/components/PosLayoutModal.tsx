import React, { useState, useEffect } from 'react';
import {
  X, LayoutGrid, AlertTriangle, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  RotateCcw, Save, Search, Check, Layers, SlidersHorizontal, Eye, EyeOff
} from 'lucide-react';
import { DetailedFamilyItem, PosLayoutProductItem, PosLayoutApplyRequest, BulkEditPreviewResponse } from '../types';

interface PosLayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPreview: (previewData: BulkEditPreviewResponse, onConfirm: () => Promise<void>) => void;
  onSuccess: (message: string) => void;
}

export const PosLayoutModal: React.FC<PosLayoutModalProps> = ({
  isOpen,
  onClose,
  onOpenPreview,
  onSuccess
}) => {
  const [families, setFamilies] = useState<DetailedFamilyItem[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<number | null>(null);
  const [products, setProducts] = useState<PosLayoutProductItem[]>([]);
  const [initialOrder, setInitialOrder] = useState<number[]>([]);
  
  // Display settings
  const [columns, setColumns] = useState<number>(() => {
    const saved = localStorage.getItem('pos_layout_columns');
    return saved ? parseInt(saved, 10) : 5;
  });
  const [step, setStep] = useState<number>(1);
  const [displayField, setDisplayField] = useState<'descricaocurta' | 'descricao'>('descricaocurta');
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [includeHidden, setIncludeHidden] = useState<boolean>(false);
  const [subfamilyFilter, setSubfamilyFilter] = useState<string>('all');
  const [searchFamily, setSearchFamily] = useState<string>('');
  
  // Loading & Action states
  const [isLoadingFamilies, setIsLoadingFamilies] = useState<boolean>(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Save column preference
  const handleColumnChange = (cols: number) => {
    setColumns(cols);
    localStorage.setItem('pos_layout_columns', cols.toString());
  };

  // Load families on open
  useEffect(() => {
    if (isOpen) {
      loadFamilies();
    }
  }, [isOpen]);

  const loadFamilies = async () => {
    setIsLoadingFamilies(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/pos-layout/families');
      if (res.ok) {
        const data: DetailedFamilyItem[] = await res.json();
        setFamilies(data);
        if (data.length > 0 && selectedFamily === null) {
          setSelectedFamily(data[0].codigo);
        }
      } else {
        setErrorMsg('Falha ao carregar lista de famílias.');
      }
    } catch (e: any) {
      setErrorMsg(`Erro de ligação: ${e.message}`);
    } finally {
      setIsLoadingFamilies(false);
    }
  };

  // Load products when selected family or includeHidden changes
  useEffect(() => {
    if (selectedFamily !== null && isOpen) {
      loadProducts(selectedFamily, includeHidden);
    }
  }, [selectedFamily, includeHidden, isOpen]);

  const loadProducts = async (famId: number, hidden: boolean) => {
    setIsLoadingProducts(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/pos-layout/family/${famId}?include_hidden=${hidden}`);
      if (res.ok) {
        const data: PosLayoutProductItem[] = await res.json();
        setProducts(data);
        setInitialOrder(data.map(p => p.codigo));
      } else {
        setErrorMsg('Falha ao carregar artigos da família.');
      }
    } catch (e: any) {
      setErrorMsg(`Erro de ligação: ${e.message}`);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  // Extract unique subfamilies in loaded products with counts
  const availableSubfamilies = React.useMemo(() => {
    const map = new Map<number, { desc: string; count: number }>();
    products.forEach(p => {
      if (p.subfamilia !== null && p.subfamilia !== undefined) {
        const existing = map.get(p.subfamilia);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(p.subfamilia, {
            desc: p.subfamilia_desc || `Subfamília #${p.subfamilia}`,
            count: 1
          });
        }
      }
    });
    return Array.from(map.entries());
  }, [products]);

  // Filtered products to display (subfamily filter)
  const displayedProducts = React.useMemo(() => {
    if (subfamilyFilter === 'all') return products;
    const sfId = parseInt(subfamilyFilter, 10);
    return products.filter(p => p.subfamilia === sfId);
  }, [products, subfamilyFilter]);

  // Drag-and-drop handlers (works seamlessly both when filtered by subfamily and when showing all)
  const handleDragStart = (e: React.DragEvent, actualIndex: number) => {
    setDraggedIndex(actualIndex);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetActualIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetActualIndex) {
      setDraggedIndex(null);
      return;
    }

    const updated = [...products];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetActualIndex, 0, movedItem);
    setProducts(updated);
    setDraggedIndex(null);
  };

  // Direct reordering button actions (relative to displayed subset if filtered)
  const moveItemInDisplayed = (displayedIndex: number, targetDisplayedIndex: number) => {
    if (targetDisplayedIndex < 0 || targetDisplayedIndex >= displayedProducts.length || displayedIndex === targetDisplayedIndex) return;
    
    const sourceItem = displayedProducts[displayedIndex];
    const targetItem = displayedProducts[targetDisplayedIndex];
    
    const sourceActualIndex = products.findIndex(p => p.codigo === sourceItem.codigo);
    const targetActualIndex = products.findIndex(p => p.codigo === targetItem.codigo);
    
    if (sourceActualIndex === -1 || targetActualIndex === -1) return;

    const updated = [...products];
    const [movedItem] = updated.splice(sourceActualIndex, 1);
    updated.splice(targetActualIndex, 0, movedItem);
    setProducts(updated);
  };

  const moveToPositionPrompt = (displayedIndex: number) => {
    const item = displayedProducts[displayedIndex];
    const isFiltered = subfamilyFilter !== 'all';
    const totalScope = isFiltered ? displayedProducts.length : products.length;
    const currentScopePos = displayedIndex + 1;

    const promptText = isFiltered
      ? `Mover artigo "${item.descricao}" para que posição dentro desta subfamília? (1 a ${totalScope})`
      : `Mover artigo "${item.descricao}" para que posição? (1 a ${totalScope})`;

    const input = window.prompt(promptText, currentScopePos.toString());
    if (input === null) return;
    const targetScopePos = parseInt(input.trim(), 10);
    if (!isNaN(targetScopePos) && targetScopePos >= 1 && targetScopePos <= totalScope) {
      moveItemInDisplayed(displayedIndex, targetScopePos - 1);
    } else {
      alert(`Posição inválida. Escolha um número entre 1 e ${totalScope}.`);
    }
  };

  // Reset order
  const handleResetOrder = () => {
    if (window.confirm('Tem a certeza que deseja repor a ordem original dos botões desta família?')) {
      if (selectedFamily !== null) {
        loadProducts(selectedFamily, includeHidden);
      }
    }
  };

  // Check current order vs initial
  const currentOrder = products.map(p => p.codigo);

  // Simulate & Save
  const handleSimulateAndSave = async () => {
    if (selectedFamily === null) return;
    setIsSimulating(true);
    setErrorMsg(null);

    const payload: PosLayoutApplyRequest = {
      familia: selectedFamily,
      order: currentOrder,
      step: step,
      mark_cloud_sync: true
    };

    try {
      const res = await fetch('/api/pos-layout/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha na simulação de reordenação.');
      }

      const previewData: BulkEditPreviewResponse = await res.json();
      
      if (previewData.total_affected === 0) {
        alert('A ordem atual dos artigos já se encontra gravada na base de dados.');
        setIsSimulating(false);
        return;
      }

      // Open Preview Modal with onConfirm callback
      onOpenPreview(previewData, async () => {
        const applyRes = await fetch('/api/pos-layout/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!applyRes.ok) {
          const applyErr = await applyRes.json();
          throw new Error(applyErr.detail || 'Erro ao gravar reordenação na base de dados.');
        }

        const data = await applyRes.json();
        onSuccess(data.message);
        loadProducts(selectedFamily, includeHidden);
      });

    } catch (e: any) {
      setErrorMsg(`Erro: ${e.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  if (!isOpen) return null;

  const currentFamilyObj = families.find(f => f.codigo === selectedFamily);
  const filteredFamilies = families.filter(f =>
    f.descricao.toLowerCase().includes(searchFamily.toLowerCase()) ||
    f.codigo.toString().includes(searchFamily)
  );

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-7xl h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-900">
        
        {/* Header */}
        <div className="bg-slate-50 px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-sm">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Pré-visualização e Reordenação dos Botões do POS
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                  ZSRest / FrontOffice
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Arraste os botões ou use as setas para definir a ordem exata de apresentação no ecrã tátil.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace: Sidebar + Grid */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Sidebar: Families */}
          <div className="w-72 bg-slate-50/50 border-r border-slate-200 flex flex-col">
            <div className="p-3 border-b border-slate-200">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar família..."
                  value={searchFamily}
                  onChange={(e) => setSearchFamily(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {isLoadingFamilies ? (
                <div className="text-center py-8 text-xs text-slate-400">A carregar famílias...</div>
              ) : (
                filteredFamilies.map(fam => {
                  const isSelected = fam.codigo === selectedFamily;
                  return (
                    <button
                      key={fam.codigo}
                      onClick={() => {
                        setSelectedFamily(fam.codigo);
                        setSubfamilyFilter('all');
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-3.5 h-3.5 rounded-md border border-slate-300 shadow-2xs shrink-0"
                          style={{ backgroundColor: fam.fundo_hex }}
                          title={`Fundo: ${fam.fundo_hex}`}
                        />
                        <span className="truncate">{fam.descricao}</span>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                        isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {fam.products_count}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-100/50">
            
            {/* Top Toolbar: View Options & Controls */}
            <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                
                {/* Column Selector (3 to 10) */}
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <span>Colunas:</span>
                  <select
                    value={columns}
                    onChange={(e) => handleColumnChange(parseInt(e.target.value, 10))}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {[3, 4, 5, 6, 7, 8, 9, 10].map(c => (
                      <option key={c} value={c}>{c} colunas</option>
                    ))}
                  </select>
                </div>

                {/* Step Selector */}
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <span>Passo:</span>
                  <select
                    value={step}
                    onChange={(e) => setStep(parseInt(e.target.value, 10))}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    title="Intervalo entre as posições (ex: 1, 2, 3... ou 5, 10, 15... ou 10, 20, 30...)"
                  >
                    <option value={1}>1 em 1 (1, 2, 3...)</option>
                    <option value={5}>5 em 5 (5, 10, 15...)</option>
                    <option value={10}>10 em 10 (10, 20, 30...)</option>
                  </select>
                </div>

                {/* Text Display Toggle */}
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <span>Texto:</span>
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                    <button
                      onClick={() => setDisplayField('descricaocurta')}
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition ${
                        displayField === 'descricaocurta'
                          ? 'bg-white shadow-2xs text-indigo-700'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Desc. Curta
                    </button>
                    <button
                      onClick={() => setDisplayField('descricao')}
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition ${
                        displayField === 'descricao'
                          ? 'bg-white shadow-2xs text-indigo-700'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Designação
                    </button>
                  </div>
                </div>

                {/* PVP1 Toggle */}
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={(e) => setShowPrice(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                  />
                  <span>Mostrar PVP</span>
                </label>

                {/* Include Hidden/Blocked Toggle */}
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeHidden}
                    onChange={(e) => setIncludeHidden(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                  />
                  <span>Incluir ocultos/bloqueados</span>
                </label>

                {/* Subfamily Filter if applicable */}
                {availableSubfamilies.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-indigo-50/70 border border-indigo-200/80 px-2 py-1 rounded-xl shadow-2xs">
                    <span className="text-indigo-900 font-bold">Subfamília:</span>
                    <select
                      value={subfamilyFilter}
                      onChange={(e) => setSubfamilyFilter(e.target.value)}
                      className="bg-white border border-indigo-200 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="all">Todas as subfamílias ({products.length})</option>
                      {availableSubfamilies.map(([id, item]) => (
                        <option key={id} value={id}>
                          {item.desc} ({item.count})
                        </option>
                      ))}
                    </select>
                    {subfamilyFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setSubfamilyFilter('all')}
                        className="text-indigo-600 hover:text-indigo-900 font-bold px-1 text-xs"
                        title="Limpar filtro de subfamília"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}

              </div>

              {/* Status & Counts */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  {subfamilyFilter !== 'all' ? (
                    <>
                      A mostrar <strong className="text-indigo-700 font-bold">{displayedProducts.length}</strong> de <strong className="text-slate-800 font-bold">{products.length}</strong> artigos
                    </>
                  ) : (
                    <>
                      <strong className="text-slate-800 font-bold">{products.length}</strong> artigos na família
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Error Banner */}
            {errorMsg && (
              <div className="bg-rose-50 border-b border-rose-200 px-6 py-2 text-xs text-rose-800 font-semibold flex items-center justify-between">
                <span>{errorMsg}</span>
                <button onClick={() => setErrorMsg(null)} className="underline hover:opacity-80">Fechar</button>
              </div>
            )}

            {/* Grid Canvas */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingProducts ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-semibold">A carregar artigos e botões do POS...</span>
                </div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                  <LayoutGrid className="w-10 h-10 text-slate-300" />
                  <span className="text-xs font-semibold">Esta família não tem artigos associados.</span>
                </div>
              ) : (
                <div
                  className="grid gap-3 transition-all"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
                  }}
                >
                  {displayedProducts.map((p, dispIndex) => {
                    const actualIndex = products.findIndex(x => x.codigo === p.codigo);
                    const newOrderNum = (actualIndex + 1) * step;
                    const isDragged = draggedIndex === actualIndex;
                    const textContent = (displayField === 'descricaocurta' ? p.descricaocurta : p.descricao) || p.descricao;

                    return (
                      <div
                        key={p.codigo}
                        draggable
                        onDragStart={(e) => handleDragStart(e, actualIndex)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, actualIndex)}
                        className={`group relative rounded-xl border-2 flex flex-col justify-between p-3 h-28 select-none transition shadow-sm cursor-grab active:cursor-grabbing ${
                          isDragged ? 'opacity-30 border-indigo-500 scale-95' : 'hover:shadow-md'
                        } ${
                          p.bloqueado ? 'border-dashed border-rose-300' : 'border-slate-300/80'
                        }`}
                        style={{
                          backgroundColor: p.fundo_hex || '#000000',
                          color: p.letra_hex || '#FFFFFF'
                        }}
                      >
                        {/* Top Badges & Actions */}
                        <div className="flex items-center justify-between gap-1">
                          
                          {/* Position Badge */}
                          <span
                            className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded-md bg-black/40 text-white backdrop-blur-xs border border-white/20"
                            title={`Posição no POS: ${(actualIndex + 1) * step} (atual na DB: ${p.ordem})`}
                          >
                            #{newOrderNum}
                          </span>

                          {/* Quick Controls overlay on hover */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-black/60 backdrop-blur-xs p-0.5 rounded-md text-white">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveItemInDisplayed(dispIndex, dispIndex - 1);
                              }}
                              disabled={dispIndex === 0}
                              className="p-1 hover:bg-white/20 rounded disabled:opacity-30"
                              title="Mover para a esquerda / anterior"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveItemInDisplayed(dispIndex, dispIndex + 1);
                              }}
                              disabled={dispIndex === displayedProducts.length - 1}
                              className="p-1 hover:bg-white/20 rounded disabled:opacity-30"
                              title="Mover para a direita / seguinte"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveToPositionPrompt(dispIndex);
                              }}
                              className="px-1 py-0.5 text-[9px] font-bold hover:bg-white/20 rounded"
                              title="Mover diretamente para a posição..."
                            >
                              Ir...
                            </button>
                          </div>

                          {/* Status Alerts */}
                          <div className="flex items-center gap-1">
                            {p.low_contrast && (
                              <span
                                className="bg-amber-500 text-slate-950 p-0.5 rounded shadow-2xs font-bold"
                                title="Aviso: Baixo contraste (< 3:1) entre a cor de fundo e a cor da letra. Pode ser difícil de ler no POS."
                              >
                                <AlertTriangle className="w-3 h-3" />
                              </span>
                            )}
                            {p.bloqueado === 1 && (
                              <span
                                className="bg-rose-600 text-white text-[9px] px-1 rounded font-bold"
                                title="Artigo Bloqueado na Base de Dados"
                              >
                                Bloqueado
                              </span>
                            )}
                            {p.frontoffice === 0 && (
                              <span
                                className="bg-slate-700 text-white text-[9px] px-1 rounded font-bold"
                                title="Artigo Oculto no POS (FrontOffice = 0)"
                              >
                                Oculto
                              </span>
                            )}
                          </div>

                        </div>

                        {/* Button Main Text */}
                        <div className="my-auto text-center font-bold text-xs tracking-tight line-clamp-2 px-1 leading-snug drop-shadow-xs">
                          {textContent}
                        </div>

                        {/* Button Footer: Price & Code */}
                        <div className="flex items-center justify-between text-[10px] font-semibold opacity-90 border-t border-current/20 pt-1">
                          <span className="font-mono text-[9px] opacity-75">#{p.codigo}</span>
                          {showPrice && (
                            <span className="font-black text-[11px] tracking-tight">
                              {p.pvp1 > 0 ? `${p.pvp1.toFixed(2)} €` : '0.00 €'}
                            </span>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Footer: Notice & Action Bar */}
            <div className="bg-white border-t border-slate-200 px-6 py-3.5 flex items-center justify-between flex-wrap gap-4">
              
              {/* Notice */}
              <div className="flex items-center gap-2 text-xs text-slate-500 max-w-xl">
                <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                <span>
                  <strong>Nota:</strong> A grelha é uma aproximação visual. O número de colunas e o texto final apresentado no ZSRest dependem da resolução e do tema configurado no posto.
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleResetOrder}
                  disabled={isLoadingProducts || isSimulating}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl border border-slate-300 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  Repor Ordem Inicial
                </button>

                <button
                  type="button"
                  onClick={handleSimulateAndSave}
                  disabled={isLoadingProducts || isSimulating || products.length === 0}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSimulating ? 'A calcular simulação...' : 'Simular & Gravar Ordem'}
                </button>
              </div>

            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
