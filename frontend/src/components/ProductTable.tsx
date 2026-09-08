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
    <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden border-r border-slate-800">
      
      {/* Selection Control Bar */}
      <div className="bg-slate-900/90 px-4 py-2 border-b border-slate-800 flex items-center justify-between gap-2 text-xs flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={onSelectAllPage}
            className="text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded border border-slate-700 transition"
          >
            {isAllPageSelected ? 'Desmarcar Página' : 'Marcar Página'}
          </button>
          <button
            onClick={onInvertSelection}
            className="text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded border border-slate-700 transition"
          >
            Inverter Seleção
          </button>
          {selectedCodes.size > 0 && (
            <button
              onClick={onDeselectAll}
              className="text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 px-2.5 py-1 rounded border border-rose-800 transition"
            >
              Limpar Seleção ({selectedCodes.size})
            </button>
          )}
        </div>

        <div className="text-slate-400 text-xs">
          Página {currentPage} de {totalPages} ({totalCount} resultados)
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto relative">
        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 px-4 py-3 rounded-xl shadow-2xl">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-slate-200">A carregar artigos...</span>
            </div>
          </div>
        )}

        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-800 z-5 font-semibold tracking-wider uppercase">
            <tr>
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllPageSelected}
                  onChange={onSelectAllPage}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </th>
              <th className="p-3 w-20">Cód.</th>
              <th className="p-3 w-20">PLU</th>
              <th className="p-3 w-32">Cód. Barras</th>
              <th className="p-3 min-w-[200px]">Designação / Nome</th>
              <th className="p-3 w-40 text-center">Botão POS (Cores)</th>
              <th className="p-3 w-32">Família</th>
              <th className="p-3 w-28">IVA</th>
              <th className="p-3 w-32 text-right">Preço PVP1..10</th>
              <th className="p-3 w-24 text-center">Estado</th>
              <th className="p-3 w-24 text-center">POS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-200">
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
                    className={`cursor-pointer transition hover:bg-slate-800/50 ${
                      isSelected ? 'bg-indigo-950/40 border-l-4 border-l-indigo-500' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(product.codigo)}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>

                    {/* Código Interno */}
                    <td className="p-3 font-mono font-bold text-slate-300">
                      #{product.codigo}
                    </td>

                    {/* PLU (Teclado/Balança) */}
                    <td className="p-3 font-mono text-xs">
                      {product.plu ? (
                        <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60 font-bold">
                          PLU #{product.plu}
                        </span>
                      ) : (
                        <span className="text-slate-600 italic">0</span>
                      )}
                    </td>

                    {/* Código de Barras */}
                    <td className="p-3 font-mono text-xs">
                      {product.codbarras ? (
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-indigo-300 border border-slate-800 font-semibold">
                          {product.codbarras}
                        </span>
                      ) : (
                        <span className="text-slate-600 italic">Sem Cód.Barras</span>
                      )}
                    </td>

                    {/* Designação + Protection Badge */}
                    <td className="p-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-100">{product.descricao}</span>
                        {product.has_sales ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/70"
                            title="Artigo com vendas registadas. A designação/nome principal não pode ser alterada."
                          >
                            <ShieldAlert className="w-3 h-3 text-amber-400" />
                            Com Vendas
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800"
                            title="Artigo sem vendas. Designação editável."
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            Sem Vendas
                          </span>
                        )}
                      </div>
                      {product.descricaocurta && (
                        <div className="text-[10px] text-indigo-300/80 font-mono mt-0.5 truncate max-w-[240px]" title={`Descrição Curta: ${product.descricaocurta}`}>
                          Curta: "{product.descricaocurta}"
                        </div>
                      )}
                    </td>

                    {/* Visual POS Button Preview Badge */}
                    <td className="p-3 text-center">
                      <div
                        className="inline-block px-3 py-1.5 rounded-md font-bold text-xs shadow-md border border-slate-700 truncate max-w-[140px]"
                        style={{
                          backgroundColor: product.fundo_hex,
                          color: product.letra_hex
                        }}
                        title={`Cor Fundo: ${product.fundo_hex} | Cor Texto: ${product.letra_hex}`}
                      >
                        {product.descricao}
                      </div>
                    </td>

                    {/* Família & Subfamília */}
                    <td className="p-3 text-slate-300 truncate max-w-[140px]">
                      <div className="font-semibold text-slate-200">{product.familia_desc || `- (${product.familias})`}</div>
                      {product.subfamilia_desc && (
                        <div className="text-[10px] text-slate-400 truncate">Sub: {product.subfamilia_desc}</div>
                      )}
                    </td>

                    {/* IVA */}
                    <td className="p-3 text-slate-300 truncate max-w-[100px]">
                      {product.iva_desc || `- (${product.iva})`}
                    </td>

                    {/* Preço PVP 1 com popover para PVP 1..10 */}
                    <td className="p-3 text-right relative">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-mono font-bold text-emerald-400 text-sm">
                          {product.pvp1.toFixed(2)} €
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePvpPopover(activePvpPopover === product.codigo ? null : product.codigo);
                          }}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          title="Inspecionar PVP 1 a 10"
                        >
                          <Layers className="w-3.5 h-3.5 text-indigo-400" />
                        </button>
                      </div>

                      {/* Popover PVP 1..10 */}
                      {activePvpPopover === product.codigo && (
                        <div
                          className="absolute right-0 top-full mt-1 z-30 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl min-w-[200px] text-left text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="font-bold text-slate-200 border-b border-slate-800 pb-1 mb-2 flex items-center justify-between">
                            <span>Preços PVP 1 a 10</span>
                            <span className="text-[10px] text-indigo-400 font-mono">#{product.codigo}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                            <div className="bg-emerald-950/40 p-1 rounded border border-emerald-800/40 flex justify-between">
                              <span className="text-emerald-400 font-bold">PVP 1:</span>
                              <span className="text-white font-bold">{product.pvp1.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-950 p-1 rounded flex justify-between">
                              <span className="text-slate-400">PVP 2:</span>
                              <span className="text-slate-200">{product.pvp2.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-950 p-1 rounded flex justify-between">
                              <span className="text-slate-400">PVP 3:</span>
                              <span className="text-slate-200">{product.pvp3.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-950 p-1 rounded flex justify-between">
                              <span className="text-slate-400">PVP 4:</span>
                              <span className="text-slate-200">{product.pvp4.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-950 p-1 rounded flex justify-between">
                              <span className="text-slate-400">PVP 5:</span>
                              <span className="text-slate-200">{product.pvp5.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-950 p-1 rounded flex justify-between">
                              <span className="text-slate-400">PVP 6:</span>
                              <span className="text-slate-200">{product.pvp6.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-950 p-1 rounded flex justify-between">
                              <span className="text-slate-400">PVP 7:</span>
                              <span className="text-slate-200">{product.pvp7.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-950 p-1 rounded flex justify-between">
                              <span className="text-slate-400">PVP 8:</span>
                              <span className="text-slate-200">{product.pvp8.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-950 p-1 rounded flex justify-between">
                              <span className="text-slate-400">PVP 9:</span>
                              <span className="text-slate-200">{product.pvp9.toFixed(2)} €</span>
                            </div>
                            <div className="bg-slate-950 p-1 rounded flex justify-between">
                              <span className="text-slate-400">PVP 10:</span>
                              <span className="text-slate-200">{product.pvp10.toFixed(2)} €</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="p-3 text-center">
                      {product.bloqueado === 1 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800">
                          <Lock className="w-3 h-3 text-rose-400" />
                          Bloqueado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                          Ativo
                        </span>
                      )}
                    </td>

                    {/* FrontOffice POS & Posição */}
                    <td className="p-3 text-center">
                      {product.frontoffice === 1 ? (
                        <div className="flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                            <Eye className="w-3 h-3 text-emerald-400" />
                            Visível
                          </span>
                          {product.posicaofront !== undefined && product.posicaofront > 0 && (
                            <span className="text-[10px] font-mono text-slate-400 mt-0.5">Pos: #{product.posicaofront}</span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          <EyeOff className="w-3 h-3 text-slate-500" />
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
      <div className="bg-slate-900 px-4 py-3 border-t border-slate-800 flex items-center justify-between gap-4 text-xs">
        <div className="text-slate-400">
          A mostrar {(currentPage - 1) * pageSize + (products.length > 0 ? 1 : 0)} a{' '}
          {Math.min(currentPage * pageSize, totalCount)} de {totalCount} artigos
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={currentPage <= 1 || isLoading}
            onClick={() => onPageChange(currentPage - 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 transition"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          
          <span className="px-3 py-1 text-slate-300 font-medium">
            {currentPage} / {totalPages}
          </span>

          <button
            disabled={currentPage >= totalPages || isLoading}
            onClick={() => onPageChange(currentPage + 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 transition"
          >
            Próxima <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

    </div>
  );
};
