import React from 'react';
import { Search, Filter, RotateCcw, Tag, Lock, Eye, ShoppingCart, FileSpreadsheet, Printer, ArrowUpDown, Upload, Utensils } from 'lucide-react';
import { Family, Subfamily, Vat, ProductFilter, ProductionCenterItem } from '../types';

interface FilterBarProps {
  filters: ProductFilter;
  families: Family[];
  subfamilies: Subfamily[];
  vats: Vat[];
  productionCenters?: ProductionCenterItem[];
  onFilterChange: (newFilters: Partial<ProductFilter>) => void;
  onResetFilters: () => void;
  onExportCSV: () => void;
  onImportExcel: () => void;
  onPrintLabels: () => void;
  totalItems: number;
  selectedCount: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  families,
  subfamilies,
  vats,
  productionCenters = [],
  onFilterChange,
  onResetFilters,
  onExportCSV,
  onImportExcel,
  onPrintLabels,
  totalItems,
  selectedCount
}) => {
  // Filter subfamilies by selected family
  const filteredSubfamilies = (filters.familia !== undefined && filters.familia !== null)
    ? subfamilies.filter(sf => sf.familia === filters.familia)
    : subfamilies;

  const handleFamilyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value === '' ? undefined : Number(e.target.value);
    let nextSubfam = filters.subfamilia;
    if (val !== undefined && nextSubfam !== undefined) {
      const match = subfamilies.find(sf => sf.codigo === nextSubfam && sf.familia === val);
      if (!match) nextSubfam = undefined;
    }
    onFilterChange({
      familia: val,
      subfamilia: nextSubfam,
      page: 1
    });
  };

  const handleSubfamilyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const subfamCode = e.target.value === '' ? undefined : Number(e.target.value);
    if (subfamCode !== undefined) {
      const subfamObj = subfamilies.find(sf => sf.codigo === subfamCode);
      if (subfamObj && subfamObj.familia) {
        onFilterChange({
          familia: subfamObj.familia,
          subfamilia: subfamCode,
          page: 1
        });
        return;
      }
    }
    onFilterChange({ subfamilia: subfamCode, page: 1 });
  };

  return (
    <div className="bg-white border-b border-slate-200 p-3.5 shadow-sm">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        
        {/* Search Input & Selectors */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search text */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar por Código ou Nome..."
              value={filters.search || ''}
              onChange={(e) => onFilterChange({ search: e.target.value, page: 1 })}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition shadow-sm"
            />
          </div>

          {/* Family Filter */}
          <div className="relative min-w-[140px]">
            <select
              value={filters.familia ?? ''}
              onChange={handleFamilyChange}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition appearance-none shadow-sm cursor-pointer"
            >
              <option value="">Todas as Famílias</option>
              {families.map((f) => (
                <option key={f.codigo} value={f.codigo}>
                  {f.descricao} (#{f.codigo})
                </option>
              ))}
            </select>
          </div>

          {/* Subfamily Filter */}
          <div className="relative min-w-[140px]">
            <select
              value={filters.subfamilia ?? ''}
              onChange={handleSubfamilyChange}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition appearance-none shadow-sm cursor-pointer"
            >
              <option value="">
                {filters.familia !== undefined ? 'Subfamílias da Família' : 'Todas as Subfamílias'}
              </option>
              {filteredSubfamilies.map((sf) => (
                <option key={sf.codigo} value={sf.codigo}>
                  {sf.descricao} (#{sf.codigo})
                </option>
              ))}
            </select>
          </div>

          {/* Production Center Filter */}
          <div className="relative min-w-[150px]">
            <select
              value={filters.centro_prod ?? ''}
              onChange={(e) => onFilterChange({ centro_prod: e.target.value === '' ? undefined : Number(e.target.value), page: 1 })}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition appearance-none shadow-sm cursor-pointer"
            >
              <option value="">Todos os Centros Produção</option>
              <option value="0">(Sem Centro de Produção)</option>
              {productionCenters.map((pc) => (
                <option key={pc.codigo} value={pc.codigo}>
                  🍳 {pc.descricao} (#{pc.codigo})
                </option>
              ))}
            </select>
          </div>

          {/* VAT Filter */}
          <div className="relative min-w-[110px]">
            <select
              value={filters.iva ?? ''}
              onChange={(e) => onFilterChange({ iva: e.target.value === '' ? undefined : Number(e.target.value), page: 1 })}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition appearance-none shadow-sm cursor-pointer"
            >
              <option value="">Todos os IVAs</option>
              {vats.map((v) => (
                <option key={v.codigo} value={v.factor}>
                  {v.factor % 1 === 0 ? `${Math.floor(v.factor)}%` : `${v.factor}%`}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By Select */}
          <div className="relative flex items-center gap-1 min-w-[170px]">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-1" />
            <select
              value={`${filters.sort_by || 'codigo'}-${filters.sort_order || 'asc'}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split('-');
                onFilterChange({ sort_by: by, sort_order: order, page: 1 });
              }}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition appearance-none shadow-sm cursor-pointer"
            >
              <option value="codigo-asc">Ord: Código (Crescente)</option>
              <option value="codigo-desc">Ord: Código (Decrescente)</option>
              <option value="descricao-asc">Ord: Nome (A - Z)</option>
              <option value="descricao-desc">Ord: Nome (Z - A)</option>
              <option value="precovenda-asc">Ord: Preço PVP1 (Menor)</option>
              <option value="precovenda-desc">Ord: Preço PVP1 (Maior)</option>
              <option value="posicaofront-asc">Ord: Posição POS</option>
              <option value="familia-asc">Ord: Família</option>
            </select>
          </div>

          {/* Reset Filters button */}
          <button
            onClick={onResetFilters}
            className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold transition shadow-sm"
            title="Limpar todos os filtros"
          >
            <RotateCcw className="w-3 h-3 text-slate-500" />
            Limpar
          </button>
        </div>

        {/* Action Buttons & Stats */}
        <div className="flex items-center gap-2 justify-end text-xs flex-wrap">
          {/* Import Excel button */}
          <button
            onClick={onImportExcel}
            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-xl font-bold transition shadow-sm"
            title="Importar artigos e preços a partir de ficheiro Excel/CSV"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-600" />
            Importar Excel
          </button>

          {/* Export Excel / CSV button */}
          <button
            onClick={onExportCSV}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl font-bold transition shadow-sm"
            title="Exportar artigos para CSV (Microsoft Excel)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Exportar Excel
          </button>

          {/* Print Shelf Labels button */}
          <button
            onClick={onPrintLabels}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 text-blue-900 border border-blue-200 px-3 py-1.5 rounded-xl font-bold transition shadow-sm"
            title="Imprimir etiquetas de prateleira em PDF para os artigos selecionados"
          >
            <Printer className="w-3.5 h-3.5 text-blue-600" />
            Etiquetas PDF ({selectedCount})
          </button>

          {/* Stats counter badge */}
          <div className="flex items-center gap-2 font-mono ml-1">
            <span className="text-slate-500 font-sans text-xs">
              Total: <strong className="text-slate-900 font-bold">{totalItems}</strong>
            </span>
            <span className={`px-2.5 py-1 rounded-lg border font-bold text-xs shadow-sm ${
              selectedCount > 0
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-slate-100 border-slate-300 text-slate-600'
            }`}>
              {selectedCount} sel.
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
