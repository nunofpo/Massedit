import React, { useState, useRef, useEffect } from 'react';
import { Search, RotateCcw, FileSpreadsheet, Printer, ArrowUpDown, Upload, FileText, Filter, HelpCircle, ChevronDown, X } from 'lucide-react';
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
  const [showSecondaryDropdown, setShowSecondaryDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSecondaryDropdown(false);
      }
    };
    if (showSecondaryDropdown) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showSecondaryDropdown]);

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

  // Count active secondary filters
  const activeSecondaryCount = [
    filters.centro_prod !== undefined && filters.centro_prod !== null,
    filters.iva !== undefined && filters.iva !== null,
    filters.has_sales !== undefined && filters.has_sales !== null,
    filters.descontinuado !== undefined || filters.bloqueado !== undefined,
    filters.is_menu !== undefined && filters.is_menu !== null,
    Boolean(filters.sort_by && (filters.sort_by !== 'codigo' || filters.sort_order !== 'asc'))
  ].filter(Boolean).length;

  return (
    <div className="bg-slate-900 border-b border-slate-800 p-2.5 shadow-sm z-20">
      <div className="flex flex-col xl:flex-row gap-2.5 items-stretch xl:items-center justify-between">
        
        {/* Main Clean Row: Search + Family + Subfamily + Filtros Dropdown Button */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search text with hint button */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar nome, código..."
              value={filters.search || ''}
              onChange={(e) => onFilterChange({ search: e.target.value, page: 1 })}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-8 pr-14 py-1.5 text-xs font-medium text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {filters.search && (
                <button
                  type="button"
                  onClick={() => onFilterChange({ search: '', page: 1 })}
                  className="text-slate-400 hover:text-slate-200 p-0.5 rounded transition"
                  title="Limpar pesquisa"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <span
                title="Dica: Pesquise por nome, código exato, intervalo (ex.: 100-250) ou lista separada por vírgula (ex.: 10, 25, 42)"
                className="text-slate-400 hover:text-indigo-400 p-0.5 cursor-help transition"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* Family Filter */}
          <div className="relative min-w-[150px]">
            <select
              value={filters.familia ?? ''}
              onChange={handleFamilyChange}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:border-indigo-500 transition appearance-none cursor-pointer"
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
          <div className="relative min-w-[150px]">
            <select
              value={filters.subfamilia ?? ''}
              onChange={handleSubfamilyChange}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:border-indigo-500 transition appearance-none cursor-pointer"
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

          {/* Secondary Filters Dropdown Toggle */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowSecondaryDropdown(!showSecondaryDropdown)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                activeSecondaryCount > 0
                  ? 'bg-indigo-600/20 border-indigo-500/60 text-indigo-300 font-semibold'
                  : 'bg-slate-950 hover:bg-slate-800 border-slate-700/80 text-slate-300'
              }`}
            >
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              <span>Filtros</span>
              {activeSecondaryCount > 0 && (
                <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {activeSecondaryCount}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${showSecondaryDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Popover */}
            {showSecondaryDropdown && (
              <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 z-50 space-y-3.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-indigo-400" /> Filtros Avançados
                  </span>
                  {activeSecondaryCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onFilterChange({
                          centro_prod: undefined,
                          iva: undefined,
                          has_sales: undefined,
                          descontinuado: undefined,
                          bloqueado: undefined,
                          is_menu: undefined,
                          sort_by: 'codigo',
                          sort_order: 'asc',
                          page: 1
                        });
                      }}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 transition"
                    >
                      Limpar secundários
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Centro Produção */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Centro de Produção</label>
                    <select
                      value={filters.centro_prod ?? ''}
                      onChange={(e) => onFilterChange({ centro_prod: e.target.value === '' ? undefined : Number(e.target.value), page: 1 })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Todos</option>
                      <option value="0">(Sem Centro)</option>
                      {productionCenters.map((pc) => (
                        <option key={pc.codigo} value={pc.codigo}>
                          🍳 {pc.descricao}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* VAT */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Taxa de IVA</label>
                    <select
                      value={filters.iva ?? ''}
                      onChange={(e) => onFilterChange({ iva: e.target.value === '' ? undefined : Number(e.target.value), page: 1 })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Todas as taxas</option>
                      {vats.map((v) => (
                        <option key={v.codigo} value={v.factor}>
                          {v.factor % 1 === 0 ? `${Math.floor(v.factor)}%` : `${v.factor}%`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Has Sales */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Histórico de Vendas</label>
                    <select
                      value={filters.has_sales === undefined || filters.has_sales === null ? '' : String(filters.has_sales)}
                      onChange={(e) => onFilterChange({ has_sales: e.target.value === '' ? undefined : e.target.value === 'true', page: 1 })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Todos os artigos</option>
                      <option value="true">Com Vendas</option>
                      <option value="false">Sem Vendas</option>
                    </select>
                  </div>

                  {/* Estado / Descontinuado */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Estado POS</label>
                    <select
                      value={filters.descontinuado !== undefined ? String(filters.descontinuado) : (filters.bloqueado !== undefined ? String(filters.bloqueado) : '')}
                      onChange={(e) => {
                        const val = e.target.value === '' ? undefined : Number(e.target.value);
                        onFilterChange({ descontinuado: val, bloqueado: undefined, page: 1 });
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Todos</option>
                      <option value="0">✅ Apenas Ativos</option>
                      <option value="1">🚫 Descontinuados</option>
                    </select>
                  </div>

                  {/* Menus / Compostos */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Artigos Compostos</label>
                    <select
                      value={filters.is_menu === undefined || filters.is_menu === null ? '' : String(filters.is_menu)}
                      onChange={(e) => onFilterChange({ is_menu: e.target.value === '' ? undefined : e.target.value === 'true', page: 1 })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Todos</option>
                      <option value="true">🍽️ Apenas Menus</option>
                      <option value="false">Sem Menus</option>
                    </select>
                  </div>

                  {/* Ordenação */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Ordenação</label>
                    <select
                      value={`${filters.sort_by || 'codigo'}-${filters.sort_order || 'asc'}`}
                      onChange={(e) => {
                        const [by, order] = e.target.value.split('-');
                        onFilterChange({ sort_by: by, sort_order: order, page: 1 });
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="codigo-asc">Código (Cresc.)</option>
                      <option value="codigo-desc">Código (Decresc.)</option>
                      <option value="descricao-asc">Nome (A - Z)</option>
                      <option value="descricao-desc">Nome (Z - A)</option>
                      <option value="precovenda-asc">Preço (Menor)</option>
                      <option value="precovenda-desc">Preço (Maior)</option>
                      <option value="posicaofront-asc">Posição POS</option>
                      <option value="familia-asc">Família</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowSecondaryDropdown(false)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs px-3 py-1.5 rounded-lg transition"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Reset Filters button */}
          <button
            onClick={onResetFilters}
            className="flex items-center gap-1 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700/80 text-xs font-medium transition cursor-pointer"
            title="Limpar todos os filtros"
          >
            <RotateCcw className="w-3 h-3 text-slate-400" />
            Limpar
          </button>

          {/* Active Report Code Filter Pill */}
          {filters.codes && filters.codes.length > 0 && (
            <div className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 px-2.5 py-1 rounded-lg text-xs font-medium">
              <span>Filtro relatório: {activeReportLabel || `${filters.codes.length} artigos`}</span>
              <button
                onClick={() => onFilterChange({ codes: undefined, page: 1 })}
                className="text-indigo-400 hover:text-white font-bold ml-1 px-1 rounded transition cursor-pointer"
                title="Remover filtro"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons & Counter with standardized neutral secondary style */}
        <div className="flex items-center gap-2 justify-end text-xs flex-wrap">
          {/* Import Excel button */}
          <button
            onClick={onImportExcel}
            className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-700/80 px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer"
            title="Importar artigos e preços a partir de ficheiro Excel/CSV"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            Importar Excel
          </button>

          {/* Import PDF / Menu button */}
          {onOpenMenuImport && (
            <button
              onClick={onOpenMenuImport}
              className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-700/80 px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer"
              title="Importar ementas em PDF, foto ou texto com Assistente IA"
            >
              <FileText className="w-3.5 h-3.5 text-purple-400" />
              Importar Ementa
            </button>
          )}

          {/* Export Excel / CSV button */}
          <button
            onClick={onExportCSV}
            className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-700/80 px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer"
            title="Exportar artigos para CSV (Microsoft Excel)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Exportar Excel
          </button>

          {/* Print Shelf Labels button */}
          <button
            onClick={onPrintLabels}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 disabled:opacity-40 text-slate-300 border border-slate-700/80 px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer"
            title="Imprimir etiquetas de prateleira em PDF para os artigos selecionados"
          >
            <Printer className="w-3.5 h-3.5 text-blue-400" />
            Etiquetas ({selectedCount})
          </button>

          {/* Stats counter badge */}
          <div className="flex items-center gap-2 font-mono ml-1">
            <span className="text-slate-400 font-sans text-xs">
              Total: <strong className="text-slate-200 font-bold">{totalItems}</strong>
            </span>
            <span className={`px-2 py-0.5 rounded-lg border font-semibold text-xs transition ${
              selectedCount > 0
                ? 'bg-indigo-600 border-indigo-500 text-white'
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

