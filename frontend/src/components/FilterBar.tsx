import React from 'react';
import { Search, Filter, RotateCcw, Tag, Lock, Eye, ShoppingCart, FileSpreadsheet, Printer, ArrowUpDown, Upload } from 'lucide-react';
import { Family, Subfamily, Vat, ProductFilter } from '../types';

interface FilterBarProps {
  filters: ProductFilter;
  families: Family[];
  subfamilies: Subfamily[];
  vats: Vat[];
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
    <div className="bg-slate-800/80 backdrop-blur border-b border-slate-700 p-4">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        
        {/* Search Input & Selectors */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search text */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar por Código ou Nome..."
              value={filters.search || ''}
              onChange={(e) => onFilterChange({ search: e.target.value, page: 1 })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Family Filter */}
          <div className="relative min-w-[140px]">
            <select
              value={filters.familia ?? ''}
              onChange={handleFamilyChange}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition appearance-none"
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
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition appearance-none"
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

          {/* VAT Filter */}
          <div className="relative min-w-[120px]">
            <select
              value={filters.iva ?? ''}
              onChange={(e) => onFilterChange({ iva: e.target.value === '' ? undefined : Number(e.target.value), page: 1 })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition appearance-none"
            >
              <option value="">Todos os IVAs</option>
              {vats.map((v) => (
                <option key={v.codigo} value={v.factor}>
                  {v.descricao} ({v.factor}%)
                </option>
              ))}
            </select>
          </div>

          {/* Sort By Select */}
          <div className="relative flex items-center gap-1 min-w-[170px]">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <select
              value={`${filters.sort_by || 'codigo'}-${filters.sort_order || 'asc'}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split('-');
                onFilterChange({ sort_by: by, sort_order: order, page: 1 });
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition appearance-none"
            >
              <option value="codigo-asc">Ord: Código (Crescente)</option>
              <option value="codigo-desc">Ord: Código (Decrescente)</option>
              <option value="descricao-asc">Ord: Nome (A - Z)</option>
              <option value="descricao-desc">Ord: Nome (Z - A)</option>
              <option value="precovenda-asc">Ord: Preço PVP1 (Menor primeiro)</option>
              <option value="precovenda-desc">Ord: Preço PVP1 (Maior primeiro)</option>
              <option value="posicaofront-asc">Ord: Posição POS (Frontoffice)</option>
              <option value="familia-asc">Ord: Família</option>
            </select>
          </div>

          {/* Reset Filters button */}
          <button
            onClick={onResetFilters}
            className="flex items-center gap-1 bg-slate-900 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 text-xs transition"
            title="Limpar todos os filtros"
          >
            <RotateCcw className="w-3 h-3" />
            Limpar
          </button>
        </div>

        {/* Action Buttons & Stats */}
        <div className="flex items-center gap-2 justify-end text-xs flex-wrap">
          {/* Import Excel button */}
          <button
            onClick={onImportExcel}
            className="flex items-center gap-1.5 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 px-3 py-1.5 rounded-lg font-semibold transition"
            title="Importar artigos e preços a partir de ficheiro Excel/CSV"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar Excel
          </button>

          {/* Export Excel / CSV button */}
          <button
            onClick={onExportCSV}
            className="flex items-center gap-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 px-3 py-1.5 rounded-lg font-semibold transition"
            title="Exportar artigos para CSV (Microsoft Excel)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Exportar Excel
          </button>

          {/* Print Shelf Labels button */}
          <button
            onClick={onPrintLabels}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 bg-blue-950/80 hover:bg-blue-900 disabled:opacity-40 text-blue-300 border border-blue-700/60 px-3 py-1.5 rounded-lg font-semibold transition"
            title="Imprimir etiquetas de prateleira em PDF para os artigos selecionados"
          >
            <Printer className="w-3.5 h-3.5" />
            Etiquetas PDF ({selectedCount})
          </button>

          {/* Stats counter badge */}
          <div className="flex items-center gap-2 font-mono ml-1">
            <span className="text-slate-400">
              Total: <strong className="text-slate-200 font-sans">{totalItems}</strong>
            </span>
            <span className={`px-2.5 py-1 rounded-md border font-semibold ${
              selectedCount > 0
                ? 'bg-indigo-950 border-indigo-700 text-indigo-300'
                : 'bg-slate-900 border-slate-700 text-slate-500'
            }`}>
              {selectedCount} sel.
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
