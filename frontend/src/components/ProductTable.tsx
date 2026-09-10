import React, { useState } from 'react';
import { ProductItem } from '../types';
import { ShieldCheck, ShieldAlert, CheckSquare, Square, ChevronLeft, ChevronRight, Eye, EyeOff, Lock, Layers } from 'lucide-react';

interface ProductTableProps {
  products: ProductItem[];
  selectedCodes: Set<number>;
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
}

export const ProductTable: React.FC<ProductTableProps> = ({
  products,
  selectedCodes,
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
  onPageChange
}) => {
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const isAllPageSelected = products.length > 0 && products.every(p => selectedCodes.has(p.codigo));
  const [activePvpPopover, setActivePvpPopover] = useState<number | null>(null);

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden border-r border-slate-200">
      
      {/* Selection Control Bar */}
      <div className="bg-white px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-2 text-xs flex-wrap shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={onSelectAllPage}
            className="text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-lg border border-slate-300 font-semibold transition shadow-sm"
          >
            {isAllPageSelected ? 'Desmarcar Página' : 'Marcar Página'}
          </button>
          <button
            onClick={onInvertSelection}
            className="text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-lg border border-slate-300 font-semibold transition shadow-sm"
          >
            Inverter Seleção
          </button>
          {selectedCodes.size > 0 && (
            <button
              onClick={onDeselectAll}
              className="text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-3 py-1 rounded-lg border border-rose-200 font-bold transition shadow-sm"
            >
              Limpar Seleção ({selectedCodes.size})
            </button>
          )}
        </div>

        <div className="text-slate-600 text-xs font-medium">
          Página <strong className="text-slate-900">{currentPage}</strong> de <strong className="text-slate-900">{totalPages}</strong> ({totalCount} resultados)
        </div>
      </div>

      {/* Select All Filtered Banner */}
      {isAllPageSelected && totalCount > pageSize && onSelectAllFiltered && (
        <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-2 text-xs flex items-center justify-between gap-3 text-indigo-950">
          {isAllFilteredSelected ? (
            <div className="flex items-center justify-between w-full">
              <span>
                Todos os <strong className="font-bold">{totalCount}</strong> artigos do filtro estão selecionados.
              </span>
              <button
                onClick={onDeselectAll}
                className="text-indigo-700 hover:text-indigo-900 font-bold underline cursor-pointer ml-2"
              >
                Limpar seleção
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <span>
                Os <strong className="font-bold">{products.length}</strong> artigos desta página estão selecionados.
              </span>
              <button
                onClick={onSelectAllFiltered}
                disabled={isSelectingAllFiltered}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1 rounded-md transition shadow-xs flex items-center gap-1.5 cursor-pointer ml-2"
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
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="flex items-center gap-3 bg-white border border-slate-300 px-5 py-3 rounded-2xl shadow-xl">
              <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-bold text-slate-800">A carregar artigos do SQL Server...</span>
            </div>
          </div>
        )}

        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200 z-5 font-bold tracking-wider uppercase">
            <tr>
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllPageSelected}
                  onChange={onSelectAllPage}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </th>
              <th className="p-3 w-20">Cód.</th>
              <th className="p-3 w-20">PLU</th>
              <th className="p-3 w-32">Cód. Barras</th>
              <th className="p-3 min-w-[200px]">Designação / Nome</th>
              <th className="p-3 w-40 text-center">Botão POS (Cores)</th>
              <th className="p-3 w-36">Família</th>
              <th className="p-3 w-24">IVA</th>
              <th className="p-3 w-32 text-right">Preço PVP1..10</th>
              <th className="p-3 w-24 text-center">Estado</th>
              <th className="p-3 w-24 text-center">POS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/80 bg-white text-slate-800">
            {products.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-12 text-center text-slate-500 font-medium">
                  Nenhum artigo encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const isSelected = selectedCodes.has(product.codigo);

                return (
                  <tr
                    key={product.codigo}
                    onClick={() => onToggleSelect(product.codigo)}
                    className={`cursor-pointer transition ${
                      isSelected ? 'bg-indigo-50/90 border-l-4 border-l-indigo-600 font-medium' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(product.codigo)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>

                    {/* Código Interno */}
                    <td className="p-3 font-mono font-bold text-slate-900">
                      <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                        #{product.codigo}
                      </span>
                    </td>

                    {/* PLU (Teclado/Balança) */}
                    <td className="p-3 font-mono text-xs">
                      {product.plu ? (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 font-bold shadow-xs">
                          PLU #{product.plu}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">0</span>
                      )}
                    </td>

                    {/* Código de Barras */}
                    <td className="p-3 font-mono text-xs">
                      {product.codbarras ? (
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200 font-semibold shadow-xs">
                          {product.codbarras}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Sem Cód.Barras</span>
                      )}
                    </td>

                    {/* Designação + Protection Badge */}
                    <td className="p-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{product.descricao}</span>
                        {product.has_sales ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 shadow-xs"
                            title={product.sales_check_ok === false
                              ? "Não foi possível verificar as vendas deste artigo. A designação fica protegida por segurança."
                              : "Artigo com vendas registadas. A designação/nome principal não pode ser alterada."}
                          >
                            <ShieldAlert className="w-3 h-3 text-amber-600" />
                            {product.sales_check_ok === false ? 'Vendas ?' : 'Com Vendas'}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs"
                            title="Artigo sem vendas. Designação editável."
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            Sem Vendas
                          </span>
                        )}
                      </div>
                      {product.descricaocurta && (
                        <div className="text-[10px] text-indigo-700 font-mono mt-0.5 truncate max-w-[240px]" title={`Descrição Curta: ${product.descricaocurta}`}>
                          Curta: "{product.descricaocurta}"
                        </div>
                      )}
                    </td>

                    {/* Visual POS Button Preview Badge */}
                    <td className="p-3 text-center">
                      <div
                        className="inline-block px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm border border-slate-300 truncate max-w-[140px]"
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
                    <td className="p-3 text-slate-800 truncate max-w-[150px]">
                      <div className="font-bold text-slate-900">{product.familia_desc || `- (${product.familias})`}</div>
                      {product.subfamilia_desc && (
                        <div className="text-[10px] text-slate-500 font-medium truncate">Sub: {product.subfamilia_desc}</div>
                      )}
                      {product.centro_prod_desc && (
                        <div
                          className="text-[10px] text-amber-900 font-semibold truncate flex items-center gap-1 mt-0.5"
                          title={`Centro de Produção: ${product.centro_prod_desc} (${product.centro_prod_info ? 'Informativo' : 'Preparação'})`}
                        >
                          <span className="bg-amber-100 text-amber-950 px-1.5 py-0.5 rounded-md border border-amber-300 flex items-center gap-1 font-bold shadow-xs">
                            🍳 {product.centro_prod_desc}
                            {product.centro_prod_info === 1 && <span className="text-[8px] uppercase tracking-wider text-amber-800 font-extrabold">(Info)</span>}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* IVA */}
                    <td className="p-3 font-mono font-bold text-xs">
                      {product.iva !== undefined && product.iva !== null ? (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-900 border border-slate-300 font-bold shadow-xs">
                          {product.iva % 1 === 0 ? `${Math.floor(product.iva)}%` : `${product.iva}%`}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>

                    {/* Preço PVP 1 com popover para PVP 1..10 */}
                    <td className="p-3 text-right relative">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-mono font-extrabold text-emerald-700 text-sm">
                          {product.pvp1.toFixed(2)} €
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePvpPopover(activePvpPopover === product.codigo ? null : product.codigo);
                          }}
                          className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 transition shadow-xs"
                          title="Inspecionar PVP 1 a 10"
                        >
                          <Layers className="w-3.5 h-3.5 text-indigo-600" />
                        </button>
                      </div>

                      {/* Popover PVP 1..10 */}
                      {activePvpPopover === product.codigo && (
                        <div
                          className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-300 rounded-xl p-3 shadow-2xl min-w-[200px] text-left text-xs text-slate-900"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 mb-2 flex items-center justify-between">
                            <span>Preços PVP 1 a 10</span>
                            <span className="text-[10px] text-indigo-700 font-mono font-bold">#{product.codigo}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                            <div className="bg-emerald-50 p-1.5 rounded border border-emerald-200 flex justify-between">
                              <span className="text-emerald-800 font-bold">PVP 1:</span>
                              <span className="text-emerald-950 font-black">{product.pvp1.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-50 p-1.5 rounded border border-slate-200 flex justify-between">
                              <span className="text-slate-600 font-medium">PVP 2:</span>
                              <span className="text-slate-900 font-bold">{product.pvp2.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-50 p-1.5 rounded border border-slate-200 flex justify-between">
                              <span className="text-slate-600 font-medium">PVP 3:</span>
                              <span className="text-slate-900 font-bold">{product.pvp3.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-50 p-1.5 rounded border border-slate-200 flex justify-between">
                              <span className="text-slate-600 font-medium">PVP 4:</span>
                              <span className="text-slate-900 font-bold">{product.pvp4.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-50 p-1.5 rounded border border-slate-200 flex justify-between">
                              <span className="text-slate-600 font-medium">PVP 5:</span>
                              <span className="text-slate-900 font-bold">{product.pvp5.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-50 p-1.5 rounded border border-slate-200 flex justify-between">
                              <span className="text-slate-600 font-medium">PVP 6:</span>
                              <span className="text-slate-900 font-bold">{product.pvp6.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-50 p-1.5 rounded border border-slate-200 flex justify-between">
                              <span className="text-slate-600 font-medium">PVP 7:</span>
                              <span className="text-slate-900 font-bold">{product.pvp7.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-50 p-1.5 rounded border border-slate-200 flex justify-between">
                              <span className="text-slate-600 font-medium">PVP 8:</span>
                              <span className="text-slate-900 font-bold">{product.pvp8.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-50 p-1.5 rounded border border-slate-200 flex justify-between">
                              <span className="text-slate-600 font-medium">PVP 9:</span>
                              <span className="text-slate-900 font-bold">{product.pvp9.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-50 p-1.5 rounded border border-slate-200 flex justify-between">
                              <span className="text-slate-600 font-medium">PVP 10:</span>
                              <span className="text-slate-900 font-bold">{product.pvp10.toFixed(2)} €</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="p-3 text-center">
                      {product.bloqueado === 1 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300 shadow-xs">
                          <Lock className="w-3 h-3 text-rose-600" />
                          Bloqueado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs">
                          Ativo
                        </span>
                      )}
                    </td>

                    {/* FrontOffice POS & Posição */}
                    <td className="p-3 text-center">
                      {product.frontoffice === 1 ? (
                        <div className="flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs">
                            <Eye className="w-3 h-3 text-emerald-600" />
                            Visível
                          </span>
                          {product.posicaofront !== undefined && product.posicaofront > 0 && (
                            <span className="text-[10px] font-mono text-slate-500 font-semibold mt-0.5">Pos: #{product.posicaofront}</span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-300 shadow-xs">
                          <EyeOff className="w-3 h-3 text-slate-400" />
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
      <div className="bg-white px-4 py-3 border-t border-slate-200 flex items-center justify-between gap-4 text-xs font-semibold shadow-sm">
        <div className="text-slate-600">
          A mostrar {(currentPage - 1) * pageSize + (products.length > 0 ? 1 : 0)} a{' '}
          {Math.min(currentPage * pageSize, totalCount)} de {totalCount} artigos
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={currentPage <= 1 || isLoading}
            onClick={() => onPageChange(currentPage - 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 font-bold transition shadow-sm"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" /> Anterior
          </button>
          
          <span className="px-3 py-1 text-slate-800 font-bold">
            {currentPage} / {totalPages}
          </span>

          <button
            disabled={currentPage >= totalPages || isLoading}
            onClick={() => onPageChange(currentPage + 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 font-bold transition shadow-sm"
          >
            Próxima <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

    </div>
  );
};
