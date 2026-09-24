import React from 'react';
import { Search, RotateCcw, FileSpreadsheet, Printer, ArrowUpDown, Upload, FileText } from 'lucide-react';
import { Family, Subfamily, Vat, ProductFilter, ProductionCenterItem } from '../types';

interface FilterBarProps {
  filters: ProductFilter;
  families: Family[];
  subfamilies: Subfamily[];
  vats: Vat[];
  productionCenters?: ProductionCenterItem[];
  activeReportLabel?: string | null;
  onFilterChange: (newFilters: Partial<ProductFilter>) => void;
  onResetFilters: () => void;
  onExportCSV: () => void;
  onImportExcel: () => void;
  onOpenMenuImport?: () => void;
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
  activeReportLabel = null,
  onFilterChange,
  onResetFilters,
  onExportCSV,
  onImportExcel,
  onOpenMenuImport,
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
    <div className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800/90 p-3.5 shadow-xl z-10">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        
        {/* Search Input & Selectors */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search text */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Pesquisar por Nome, Código, Intervalo (ex: 100-250) ou Lista (10, 25, 42)..."
              value={filters.search || ''}
              onChange={(e) => onFilterChange({ search: e.target.value, page: 1 })}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs font-medium text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 shadow-inner transition"
            />
          </div>

          {/* Family Filter */}
          <div className="relative min-w-[140px]">
            <select
              value={filters.familia ?? ''}
              onChange={handleFamilyChange}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition appearance-none shadow-inner cursor-pointer"
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
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition appearance-none shadow-inner cursor-pointer"
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
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition appearance-none shadow-inner cursor-pointer"
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
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition appearance-none shadow-inner cursor-pointer"
            >
              <option value="">Todos os IVAs</option>
              {vats.map((v) => (
                <option key={v.codigo} value={v.factor}>
                  {v.factor % 1 === 0 ? `${Math.floor(v.factor)}%` : `${v.factor}%`}
                </option>
              ))}
            </select>
          </div>

          {/* Sales Filter */}
          <div className="relative min-w-[120px]">
            <select
              value={filters.has_sales === undefined || filters.has_sales === null ? '' : String(filters.has_sales)}
              onChange={(e) => onFilterChange({ has_sales: e.target.value === '' ? undefined : e.target.value === 'true', page: 1 })}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition appearance-none shadow-inner cursor-pointer"
              title="Filtrar por artigos com ou sem vendas"
            >
              <option value="">Vendas: Todos</option>
              <option value="true">Com Vendas</option>
              <option value="false">Sem Vendas</option>
            </select>
          </div>

          {/* Descontinuados / Estado Filter */}
          <div className="relative min-w-[150px]">
            <select
              value={filters.descontinuado !== undefined ? String(filters.descontinuado) : (filters.bloqueado !== undefined ? String(filters.bloqueado) : '')}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : Number(e.target.value);
                onFilterChange({ descontinuado: val, bloqueado: undefined, page: 1 });
              }}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition appearance-none shadow-inner cursor-pointer"
              title="Filtrar por artigos ativos ou descontinuados/bloqueados"
            >
              <option value="">Estado: Todos</option>
              <option value="0">✅ Apenas Ativos</option>
              <option value="1">🚫 Descontinuados / Bloqueados</option>
            </select>
          </div>

          {/* FrontOffice Filter */}
          <div className="relative min-w-[110px]">
            <select
              value={filters.frontoffice ?? ''}
              onChange={(e) => onFilterChange({ frontoffice: e.target.value === '' ? undefined : Number(e.target.value), page: 1 })}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition appearance-none shadow-inner cursor-pointer"
              title="Filtrar por visibilidade no POS"
            >
              <option value="">POS: Todos</option>
              <option value="1">Visíveis no POS</option>
              <option value="0">Ocultos no POS</option>
            </select>
          </div>

          {/* Menu / Composto Filter */}
          <div className="relative min-w-[130px]">
            <select
              value={filters.is_menu === undefined || filters.is_menu === null ? '' : String(filters.is_menu)}
              onChange={(e) => onFilterChange({ is_menu: e.target.value === '' ? undefined : e.target.value === 'true', page: 1 })}
              className={`w-full border rounded-xl px-3 py-1.5 text-xs font-semibold transition appearance-none shadow-inner cursor-pointer ${
                filters.is_menu === true
                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 font-bold'
                  : 'bg-slate-950/80 border-slate-700/80 text-slate-200 focus:outline-none focus:border-indigo-500'
              }`}
              title="Filtrar por Menus / Artigos Compostos (ZSRest)"
            >
              <option value="">Menus: Todos</option>
              <option value="true">🍽️ Apenas Menus</option>
              <option value="false">Sem Menus</option>
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
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 transition appearance-none shadow-inner cursor-pointer"
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
            className="flex items-center gap-1 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-700/80 text-xs font-semibold transition hover:scale-[1.02] active:scale-[0.98]"
            title="Limpar todos os filtros"
          >
            <RotateCcw className="w-3 h-3 text-slate-400" />
            Limpar
          </button>

          {/* Active Report Code Filter Pill */}
          {filters.codes && filters.codes.length > 0 && (
            <div className="flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 px-2.5 py-1 rounded-xl text-xs font-bold shadow-xs">
              <span>Filtro: relatório — {activeReportLabel || `${filters.codes.length} artigos`}</span>
              <button
                onClick={() => onFilterChange({ codes: undefined, page: 1 })}
                className="text-indigo-400 hover:text-white font-black ml-1 px-1 rounded hover:bg-indigo-500/30 cursor-pointer"
                title="Remover filtro do relatório e voltar"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons & Stats */}
        <div className="flex items-center gap-2 justify-end text-xs flex-wrap">
          {/* Import Excel button */}
          <button
            onClick={onImportExcel}
            className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-xl font-semibold transition hover:scale-[1.02] active:scale-[0.98]"
            title="Importar artigos e preços a partir de ficheiro Excel/CSV"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            Importar Excel
          </button>

          {/* Import PDF / Menu button */}
          {onOpenMenuImport && (
            <button
              onClick={onOpenMenuImport}
              className="flex items-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded-xl font-semibold transition hover:scale-[1.02] active:scale-[0.98]"
              title="Importar ementas em PDF, foto ou texto com Assistente IA"
            >
              <FileText className="w-3.5 h-3.5 text-purple-400" />
              Importar Ementa (PDF)
            </button>
          )}

          {/* Export Excel / CSV button */}
          <button
            onClick={onExportCSV}
            className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-xl font-semibold transition hover:scale-[1.02] active:scale-[0.98]"
            title="Exportar artigos para CSV (Microsoft Excel)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Exportar Excel
          </button>

          {/* Print Shelf Labels button */}
          <button
            onClick={onPrintLabels}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-40 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-xl font-semibold transition hover:scale-[1.02] active:scale-[0.98]"
            title="Imprimir etiquetas de prateleira em PDF para os artigos selecionados"
          >
            <Printer className="w-3.5 h-3.5 text-blue-400" />
            Etiquetas PDF ({selectedCount})
          </button>

          {/* Stats counter badge */}
          <div className="flex items-center gap-2 font-mono ml-1">
            <span className="text-slate-400 font-sans text-xs">
              Total: <strong className="text-slate-100 font-bold">{totalItems}</strong>
            </span>
            <span className={`px-2.5 py-1 rounded-xl border font-bold text-xs shadow-sm transition ${
              selectedCount > 0
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 border-indigo-500 text-white shadow-indigo-950/50'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}>
              {selectedCount} sel.
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
