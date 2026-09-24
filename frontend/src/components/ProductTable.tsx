import React, { useState } from 'react';
import { ProductItem, PriceZonesMap } from '../types';
import { ShieldCheck, ShieldAlert, CheckSquare, Square, ChevronLeft, ChevronRight, Eye, EyeOff, Lock, Layers, ExternalLink, Utensils } from 'lucide-react';

interface ProductTableProps {
  products: ProductItem[];
  selectedCodes: Set<number>;
  priceZones?: PriceZonesMap;
  onToggleSelect: (code: number) => void;
  onSelectAllPage: () => void;
  onDeselectAll: () => void;
  onInvertSelection: () => void;
  onSelectAllFiltered?: () => void;
  isAllFilteredSelected?: boolean;
  isSelectingAllFiltered?: boolean;
  isLoading: boolean;
  currentPage: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onOpenDetail?: (product: ProductItem) => void;
}

export const ProductTable: React.FC<ProductTableProps> = ({
  products,
  selectedCodes,
  priceZones,
  onToggleSelect,
  onSelectAllPage,
  onDeselectAll,
  onInvertSelection,
  onSelectAllFiltered,
  isAllFilteredSelected = false,
  isSelectingAllFiltered = false,
  isLoading,
  currentPage,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  onOpenDetail
}) => {
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const isAllPageSelected = products.length > 0 && products.every(p => selectedCodes.has(p.codigo));
  const [activePvpPopover, setActivePvpPopover] = useState<number | null>(null);
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    return (localStorage.getItem('massedit_table_density') as 'comfortable' | 'compact') || 'compact';
  });

  const toggleDensity = () => {
    setDensity(prev => {
      const next = prev === 'comfortable' ? 'compact' : 'comfortable';
      localStorage.setItem('massedit_table_density', next);
      return next;
    });
  };

  const currencyFormatter = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
  const cellPadding = density === 'compact' ? 'py-1.5 px-3' : 'py-2.5 px-3';

  return (
    <div className="flex-1 flex flex-col bg-slate-950/80 overflow-hidden border-r border-slate-800/80 backdrop-blur-sm">
      
      {/* Selection Control Bar */}
      <div className="bg-slate-900/80 px-4 py-2 border-b border-slate-800/80 flex items-center justify-between gap-2 text-xs flex-wrap shadow-inner">
        <div className="flex items-center gap-2">
          <button
            onClick={onSelectAllPage}
            className="text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1 rounded-xl border border-slate-700/80 font-semibold transition hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            {isAllPageSelected ? 'Desmarcar Página' : 'Marcar Página'}
          </button>
          <button
            onClick={onInvertSelection}
            className="text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1 rounded-xl border border-slate-700/80 font-semibold transition hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            Inverter Seleção
          </button>
          {selectedCodes.size > 0 && (
            <button
              onClick={onDeselectAll}
              className="text-rose-300 hover:text-rose-100 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1 rounded-xl border border-rose-500/30 font-bold transition hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              Limpar Seleção ({selectedCodes.size})
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleDensity}
            className="text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-xl border border-slate-700 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 shadow-xs"
            title="Alternar densidade da tabela (Compacto / Confortável)"
          >
            <span>{density === 'compact' ? '📐 Confortável' : '📏 Compacto'}</span>
          </button>

          <div className="text-slate-400 text-xs font-medium">
            Página <strong className="text-slate-100">{currentPage}</strong> de <strong className="text-slate-100">{totalPages}</strong> ({totalCount} artigos)
          </div>
        </div>
      </div>

      {/* Select All Filtered Banner */}
      {isAllPageSelected && totalCount > pageSize && onSelectAllFiltered && (
        <div className="bg-indigo-950/60 border-b border-indigo-500/30 px-4 py-2 text-xs flex items-center justify-between gap-3 text-indigo-200">
          {isAllFilteredSelected ? (
            <div className="flex items-center justify-between w-full">
              <span>
                Todos os <strong className="font-bold text-white">{totalCount}</strong> artigos do filtro estão selecionados.
              </span>
              <button
                onClick={onDeselectAll}
                className="text-indigo-400 hover:text-white font-bold underline cursor-pointer ml-2"
              >
                Limpar seleção
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <span>
                Os <strong className="font-bold text-white">{products.length}</strong> artigos desta página estão selecionados.
              </span>
              <button
                onClick={onSelectAllFiltered}
                disabled={isSelectingAllFiltered}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1 rounded-xl transition shadow-lg shadow-indigo-950/50 flex items-center gap-1.5 cursor-pointer ml-2"
              >
                {isSelectingAllFiltered ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    A selecionar...
                  </>
                ) : (
                  `Selecionar todos os ${totalCount} artigos do filtro`
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table Content */}
      <div className="flex-1 overflow-auto relative">
        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-10 flex items-center justify-center">
            <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 px-5 py-3 rounded-2xl shadow-2xl">
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-bold text-slate-200">A carregar artigos do SQL Server...</span>
            </div>
          </div>
        )}

        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-900 text-slate-300 border-b border-slate-800 z-10 font-bold tracking-wider uppercase shadow-xs">
            <tr>
              <th className="p-2.5 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllPageSelected}
                  onChange={onSelectAllPage}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                />
              </th>
              <th className="p-2.5 w-16">Cód.</th>
              <th className="p-2.5 w-16">PLU</th>
              <th className="p-2.5 w-28">Cód. Barras</th>
              <th className="p-2.5 min-w-[200px]">Designação / Nome</th>
              <th className="p-2.5 w-32 text-center">Botão POS</th>
              <th className="p-2.5 w-36">Família</th>
              <th className="p-2.5 w-24">IVA</th>
              <th className="p-2.5 w-28 text-right">PVP</th>
              <th className="p-2.5 w-20 text-center">Estado</th>
              <th className="p-2.5 w-20 text-center">POS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 bg-slate-950/40 text-slate-200">
            {products.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-12 text-center text-slate-500 font-medium">
                  Nenhum artigo encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const isSelected = selectedCodes.has(product.codigo);
                const hasDiffShortDesc = product.descricaocurta && product.descricaocurta.trim() !== product.descricao.trim();

                return (
                  <tr
                    key={product.codigo}
                    onClick={() => onToggleSelect(product.codigo)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (onOpenDetail) onOpenDetail(product);
                    }}
                    className={`cursor-pointer transition select-none group ${
                      isSelected ? 'bg-indigo-950/40 border-l-4 border-l-indigo-500 font-medium text-white' : 'hover:bg-slate-900/60'
                    }`}
                    title="Duplo clique para abrir a ficha completa do artigo"
                  >
                    {/* Checkbox */}
                    <td className={`${cellPadding} text-center`} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(product.codigo)}
                        className="rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>

                    {/* Código Interno */}
                    <td className={`${cellPadding} font-mono font-bold text-white whitespace-nowrap`}>
                      <span className="text-slate-300 font-semibold">
                        #{product.codigo}
                      </span>
                    </td>

                    {/* PLU (Teclado/Balança) */}
                    <td className={`${cellPadding} font-mono text-xs whitespace-nowrap`}>
                      {product.plu ? (
                        <span className="font-semibold text-slate-300">
                          #{product.plu}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* Código de Barras */}
                    <td className={`${cellPadding} font-mono text-xs whitespace-nowrap`}>
                      {product.codbarras ? (
                        <span className="text-slate-300 font-semibold">
                          {product.codbarras}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* Designação + Protection Badge */}
                    <td className={`${cellPadding} font-bold text-white max-w-[320px]`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="text-white font-bold truncate max-w-[240px]" title={product.descricao}>
                            {product.descricao}
                          </span>
                          {product.is_menu && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[9.5px] font-extrabold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30"
                              title="Artigo do tipo Menu / Combo (ZSRest)"
                            >
                              <Utensils className="w-2.5 h-2.5" />
                              Menu
                            </span>
                          )}
                          {product.has_sales ? (
                            <span
                              className="inline-flex items-center gap-0.5 text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              title="Artigo com vendas registadas. Nome protegido contra alterações acidentais."
                            >
                              <ShieldAlert className="w-2.5 h-2.5" />
                              Com Vendas
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-0.5 text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              title="Artigo sem vendas. Designação livremente editável."
                            >
                              <ShieldCheck className="w-2.5 h-2.5" />
                              Sem Vendas
                            </span>
                          )}
                        </div>

                        {onOpenDetail && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenDetail(product);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition shrink-0 cursor-pointer"
                            title="Abrir ficha completa deste artigo (duplo clique na linha)"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {hasDiffShortDesc && (
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-[240px]" title={`Descrição Curta: ${product.descricaocurta}`}>
                          Curta: "{product.descricaocurta}"
                        </div>
                      )}
                    </td>

                    {/* Visual POS Button Preview Badge */}
                    <td className={`${cellPadding} text-center`}>
                      <div
                        className="inline-block px-2.5 py-1 rounded-md font-bold text-[11px] shadow-xs border border-slate-700/80 truncate max-w-[120px]"
                        style={{
                          backgroundColor: product.fundo_hex,
                          color: product.letra_hex
                        }}
                        title={`Cor Fundo: ${product.fundo_hex} | Cor Texto: ${product.letra_hex}`}
                      >
                        {product.descricao}
                      </div>
                    </td>

                    {/* Família, Subfamília e Centro de Produção */}
                    <td className={`${cellPadding} text-slate-100 truncate max-w-[140px]`}>
                      <div className="font-semibold text-white truncate">{product.familia_desc || `- (${product.familias})`}</div>
                      {product.centro_prod_desc && (
                        <div
                          className="text-[10px] truncate mt-0.5"
                          title={`Centro de Produção: ${product.centro_prod_desc}`}
                        >
                          <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/40 text-[9.5px] font-semibold inline-flex items-center gap-0.5">
                            🍳 {product.centro_prod_desc}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* IVA 1 e IVA 2 */}
                    <td className={`${cellPadding} font-mono text-xs whitespace-nowrap`}>
                      {product.iva !== undefined && product.iva !== null ? (
                        <div className="flex items-center gap-1 font-semibold text-slate-300">
                          <span>{product.iva % 1 === 0 ? `${Math.floor(product.iva)}%` : `${product.iva}%`}</span>
                          {product.iva2 !== undefined && product.iva2 !== null && product.iva2 !== product.iva && (
                            <span className="text-amber-400 font-bold text-[10px]" title={`IVA 2 (Takeaway): ${product.iva2}%`}>
                              · {product.iva2 % 1 === 0 ? `${Math.floor(product.iva2)}%` : `${product.iva2}%`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* Preço PVP 1 com popover para PVP 1..10 */}
                    <td className={`${cellPadding} text-right whitespace-nowrap`}>
                      <div className="flex items-center justify-end gap-1.5 relative">
                        <div className="flex flex-col items-end">
                          <span className="font-sans font-bold tabular-nums text-white text-xs">
                            {currencyFormatter.format(product.pvp1 || 0)}
                          </span>
                          {product.meiadose === 1 && (
                            <span
                              className="text-[10px] font-sans font-medium text-amber-400 tabular-nums"
                              title={`Meia Dose Ativa (${product.meiadosedesc || '1/2 Dose'}): ${currencyFormatter.format(product.precomeia || 0)}`}
                            >
                              ½ {currencyFormatter.format(product.precomeia || 0)}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePvpPopover(activePvpPopover === product.codigo ? null : product.codigo);
                          }}
                          className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 transition cursor-pointer"
                          title="Inspecionar PVP 1 a 10"
                        >
                          <Layers className="w-3 h-3 text-indigo-400" />
                        </button>
                      </div>

                      {/* Popover PVP 1..10 */}
                      {activePvpPopover === product.codigo && (
                        <div
                          className="absolute right-0 top-full mt-1 z-30 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl min-w-[360px] max-w-[440px] text-left text-xs text-slate-100 backdrop-blur-xl"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="font-bold text-white border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-indigo-400" />
                              Preços por Zona (PVP 1 a 10)
                            </span>
                            <span className="text-[10px] text-indigo-300 font-mono font-bold bg-indigo-500/20 px-1.5 py-0.5 rounded border border-indigo-500/30">#{product.codigo}</span>
                          </div>

                          {((product.precocompra && product.precocompra > 0) || product.meiadose === 1) && (
                            <div className="mb-2 pb-2 border-b border-slate-800 space-y-1 text-[11px] font-mono">
                              {product.precocompra !== undefined && product.precocompra > 0 && (
                                <div className="bg-slate-950 px-2 py-1 rounded-lg flex justify-between text-slate-300 font-semibold border border-slate-800">
                                  <span>Custo s/IVA:</span>
                                  <span className="font-bold text-white">{currencyFormatter.format(product.precocompra)}</span>
                                </div>
                              )}
                              {product.meiadose === 1 && (
                                <div className="bg-amber-500/10 px-2 py-1 rounded-lg flex justify-between text-amber-300 font-semibold border border-amber-500/30">
                                  <span>{product.meiadosedesc || 'Meia Dose'}:</span>
                                  <span className="font-bold">{currencyFormatter.format(product.precomeia || 0)}</span>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((idx) => {
                              const val = (product as any)[`pvp${idx}`] ?? 0;
                              const zoneInfo = priceZones ? priceZones[String(idx)] : null;
                              const hasZones = !!(zoneInfo && zoneInfo.zones && zoneInfo.zones.length > 0);
                              const isPvp1 = idx === 1;

                              return (
                                <div
                                  key={idx}
                                  className={`p-1.5 rounded-lg border flex flex-col justify-between transition ${
                                    isPvp1
                                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                      : hasZones
                                      ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                                      : 'bg-slate-950 border-slate-800 text-slate-300'
                                  }`}
                                >
                                  <div className="flex justify-between items-center w-full">
                                    <span className={`font-bold whitespace-nowrap ${isPvp1 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                      PVP {idx}:
                                    </span>
                                    <span className={`font-black whitespace-nowrap ml-1 ${isPvp1 ? 'text-emerald-300 font-bold' : 'text-slate-100'}`}>
                                      {currencyFormatter.format(Number(val))}
                                    </span>
                                  </div>
                                  {hasZones && (
                                    <div
                                      className="text-[9.5px] font-sans text-indigo-300 truncate mt-0.5 flex items-center gap-1 font-medium"
                                      title={zoneInfo.display}
                                    >
                                      <span className="shrink-0 text-indigo-400">📍</span>
                                      <span className="truncate">{zoneInfo.display}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Estado */}
                    <td className={`${cellPadding} text-center whitespace-nowrap`}>
                      {product.descontinuado === 1 || product.bloqueado === 1 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30" title="Artigo Descontinuado / Bloqueado no POS">
                          <Lock className="w-3 h-3 text-rose-400" />
                          {product.descontinuado === 1 ? 'Descontinuado' : 'Bloqueado'}
                        </span>
                      ) : (
                        <span className="text-emerald-500 font-bold text-xs" title="Artigo Ativo">
                          ● Ativo
                        </span>
                      )}
                    </td>

                    {/* FrontOffice POS & Posição */}
                    <td className={`${cellPadding} text-center whitespace-nowrap`}>
                      {product.descontinuado !== 1 ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-slate-400 text-xs">Visível</span>
                          {product.posicaofront !== undefined && product.posicaofront > 0 && product.posicaofront !== 9999 && (
                            <span className="text-[10px] font-mono text-indigo-300 font-semibold" title={`Posição: #${product.posicaofront}`}>
                              (#{product.posicaofront})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-xs" title="Oculto no POS">
                          Oculto
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

      {/* Pagination Footer */}
      <div className="bg-slate-900/90 px-4 py-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-semibold shadow-inner">
        <div className="flex items-center gap-3 text-slate-400 flex-wrap">
          <span>
            A mostrar {(currentPage - 1) * pageSize + (products.length > 0 ? 1 : 0)} a{' '}
            {Math.min(currentPage * pageSize, totalCount)} de {totalCount} artigos
          </span>

          {/* Page Size Selector */}
          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
            <span className="text-slate-500 font-normal">Apresentar:</span>
            {[50, 100, 250, 500].map((sz) => (
              <button
                key={sz}
                onClick={() => onPageSizeChange?.(sz)}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border transition ${
                  pageSize === sz
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                    : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border-slate-800'
                }`}
              >
                {sz}
              </button>
            ))}
            <button
              onClick={() => onPageSizeChange?.(10000)}
              className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border transition ${
                pageSize >= 10000
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : 'bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 border-indigo-500/30'
              }`}
              title="Apresentar todos os artigos da base de dados numa lista contínua sem paginação"
            >
              Todos ({totalCount})
            </button>
          </div>
        </div>

        {pageSize < 10000 && (
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1 || isLoading}
              onClick={() => onPageChange(currentPage - 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 font-semibold transition hover:scale-[1.02] active:scale-[0.98]"
            >
              <ChevronLeft className="w-4 h-4 text-slate-400" /> Anterior
            </button>
            
            <span className="px-3 py-1 text-slate-200 font-bold">
              {currentPage} / {totalPages}
            </span>

            <button
              disabled={currentPage >= totalPages || isLoading}
              onClick={() => onPageChange(currentPage + 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 font-semibold transition hover:scale-[1.02] active:scale-[0.98]"
            >
              Próxima <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        )}
      </div>

    </div>
  );
};
