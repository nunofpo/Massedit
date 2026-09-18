import React, { useState } from 'react';
import {
  Smartphone, Tablet, Globe, Search, ChevronRight, Info,
  Flame, Leaf, Clock, Users, Sparkles, Check, X, ArrowLeft
} from 'lucide-react';
import {
  EmentaDigitalSection, EmentaDigitalFamily, EmentaProductItem, EmentaDigitalMenu
} from '../types';

interface EmentaSimulatorFrameProps {
  menus?: EmentaDigitalMenu[];
  sections: EmentaDigitalSection[];
  families: EmentaDigitalFamily[];
  products: EmentaProductItem[];
  activeLanguage?: string;
  onLanguageChange?: (lang: string) => void;
  onProductClick?: (product: EmentaProductItem) => void;
}

export const EmentaSimulatorFrame: React.FC<EmentaSimulatorFrameProps> = ({
  menus = [],
  sections = [],
  families = [],
  products = [],
  activeLanguage = 'pt',
  onLanguageChange,
  onProductClick
}) => {
  const [deviceMode, setDeviceMode] = useState<'tablet' | 'mobile'>('tablet');
  const [selectedSectionCode, setSelectedSectionCode] = useState<number | null>(null);
  const [selectedFamilyCode, setSelectedFamilyCode] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeProductDetail, setActiveProductDetail] = useState<EmentaProductItem | null>(null);

  // Active section
  const visibleSections = sections.filter(s => s.visivel === 1);
  const activeSection = selectedSectionCode
    ? visibleSections.find(s => s.codigo === selectedSectionCode) || visibleSections[0]
    : visibleSections[0];

  // Active families for section
  const availableFamilies = activeSection
    ? families.filter(f => f.seccao === activeSection.codigo && f.visivel === 1)
    : [];

  const activeFamily = selectedFamilyCode
    ? availableFamilies.find(f => f.codigo === selectedFamilyCode) || availableFamilies[0]
    : availableFamilies[0];

  // Filter products for simulator view
  const filteredProducts = products.filter(p => {
    if (p.visivel === 0) return false;
    if (activeSection && p.ementa_seccao_desc && activeSection.descricao) {
      if (p.ementa_seccao_desc.toLowerCase() !== activeSection.descricao.toLowerCase()) {
        // also check if family matches
        if (p.ementa_familia) {
          const famObj = families.find(f => f.codigo === p.ementa_familia);
          if (!famObj || famObj.seccao !== activeSection.codigo) return false;
        }
      }
    }
    if (activeFamily && p.ementa_familia) {
      if (p.ementa_familia !== activeFamily.codigo) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.produto.toLowerCase().includes(q) ||
        p.pos_descricao.toLowerCase().includes(q) ||
        p.descricao.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const languages = [
    { code: 'pt', label: 'Português', flag: '🇵🇹' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' }
  ];

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Top Device Bar */}
      <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
            Simulador Live (ZS Kiosk / Mobile)
          </span>
        </div>

        {/* Device Toggle */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
          <button
            onClick={() => setDeviceMode('tablet')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              deviceMode === 'tablet'
                ? 'bg-teal-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tablet className="w-3.5 h-3.5" />
            Kiosk Tablet (10")
          </button>
          <button
            onClick={() => setDeviceMode('mobile')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              deviceMode === 'mobile'
                ? 'bg-teal-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Telemóvel (6.5")
          </button>
        </div>

        {/* Language Switcher */}
        <div className="flex items-center gap-1">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          {languages.map(lang => (
            <button
              key={lang.code}
              onClick={() => onLanguageChange && onLanguageChange(lang.code)}
              className={`px-2 py-0.5 text-xs font-bold rounded-md transition ${
                activeLanguage === lang.code
                  ? 'bg-slate-800 text-teal-300 border border-teal-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={lang.label}
            >
              {lang.flag} <span className="uppercase text-[10px]">{lang.code}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Frame Canvas Wrapper */}
      <div className="flex-1 bg-slate-950 p-4 md:p-6 overflow-y-auto flex items-center justify-center min-h-[480px]">
        {/* Device Container */}
        <div
          className={`transition-all duration-300 bg-white rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 flex flex-col relative ${
            deviceMode === 'tablet'
              ? 'w-full max-w-4xl h-[560px]'
              : 'w-[340px] h-[580px]'
          }`}
        >
          {/* Simulated App Header */}
          <div className="bg-gradient-to-r from-teal-700 via-teal-800 to-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0 shadow-md">
            <div>
              <h3 className="text-sm font-extrabold tracking-wide uppercase">
                {menus.length > 0 ? menus[0].nome : 'Ementa Digital'}
              </h3>
              <p className="text-[10px] text-teal-200 opacity-90">
                {activeSection ? activeSection.descricao : 'Menu Principal'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-300 absolute left-2.5 top-1.5" />
                <input
                  type="text"
                  placeholder="Pesquisar..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-white/10 hover:bg-white/20 focus:bg-white text-white focus:text-slate-900 rounded-full text-xs placeholder-slate-300 focus:outline-none transition w-28 md:w-36"
                />
              </div>
            </div>
          </div>

          {/* Section Category Tabs */}
          {visibleSections.length > 0 && (
            <div className="bg-slate-100 border-b border-slate-200 px-3 py-2 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
              {visibleSections.map(sec => {
                const isActive = activeSection?.codigo === sec.codigo;
                return (
                  <button
                    key={sec.codigo}
                    onClick={() => {
                      setSelectedSectionCode(sec.codigo);
                      setSelectedFamilyCode(null);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 shadow-2xs ${
                      isActive
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {sec.descricao}
                  </button>
                );
              })}
            </div>
          )}

          {/* Family Sub-Tabs */}
          {availableFamilies.length > 0 && (
            <div className="bg-white px-3 py-1.5 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
              {availableFamilies.map(fam => {
                const isActive = activeFamily?.codigo === fam.codigo;
                return (
                  <button
                    key={fam.codigo}
                    onClick={() => setSelectedFamilyCode(fam.codigo)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {fam.descricao}
                  </button>
                );
              })}
            </div>
          )}

          {/* Product Items List / Grid */}
          <div className="flex-1 p-3 md:p-4 overflow-y-auto bg-slate-50">
            {filteredProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                <Info className="w-8 h-8 mb-2 opacity-50 text-slate-500" />
                <p className="text-xs font-bold text-slate-600">Nenhum artigo nesta secção</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Atribua produtos a esta família na lista da Ementa Digital.
                </p>
              </div>
            ) : (
              <div
                className={`grid gap-3 ${
                  deviceMode === 'tablet'
                    ? 'grid-cols-2 md:grid-cols-3'
                    : 'grid-cols-1'
                }`}
              >
                {filteredProducts.map(prod => (
                  <div
                    key={prod.codigo}
                    onClick={() => {
                      setActiveProductDetail(prod);
                      if (onProductClick) onProductClick(prod);
                    }}
                    className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition cursor-pointer flex flex-col group relative"
                  >
                    {/* Highlight Ribbon */}
                    {prod.highlight === 1 && (
                      <div className="absolute top-2 right-2 bg-amber-500 text-white p-1 rounded-full shadow-sm z-10">
                        <Sparkles className="w-3 h-3" />
                      </div>
                    )}

                    {/* Image */}
                    <div className="h-28 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                      {prod.image_url ? (
                        <img
                          src={prod.image_url}
                          alt={prod.produto || prod.pos_descricao}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      ) : (
                        <div className="text-slate-300 font-bold text-xl uppercase tracking-wider">
                          {(prod.produto || prod.pos_descricao || 'P').substring(0, 2)}
                        </div>
                      )}
                    </div>

                    {/* Body */}
                    <div className="p-3 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 group-hover:text-teal-700 transition line-clamp-1">
                          {prod.produto || prod.pos_descricao}
                        </h4>
                        <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                          {prod.descricao || 'Sem descrição cadastrada.'}
                        </p>
                      </div>

                      {/* Allergen & Info Badges */}
                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        {prod.gluten === 1 && (
                          <span title="Contém Glúten" className="px-1 py-0.5 bg-amber-100 text-amber-900 rounded font-bold text-[9px]">
                            🌾 Glúten
                          </span>
                        )}
                        {prod.lactose === 1 && (
                          <span title="Contém Lactose" className="px-1 py-0.5 bg-blue-100 text-blue-900 rounded font-bold text-[9px]">
                            🥛 Lactose
                          </span>
                        )}
                        {prod.picante === 1 && (
                          <span title="Picante" className="px-1 py-0.5 bg-rose-100 text-rose-900 rounded font-bold text-[9px]">
                            🌶️ Picante
                          </span>
                        )}
                        {prod.vegetariano === 1 && (
                          <span title="Vegetariano" className="px-1 py-0.5 bg-emerald-100 text-emerald-900 rounded font-bold text-[9px]">
                            🥗 Vegetariano
                          </span>
                        )}
                      </div>

                      {/* Price Tag */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-slate-400">
                          #{prod.codigo}
                        </span>
                        <span className="text-xs font-extrabold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-lg">
                          {prod.pvp1 ? `${prod.pvp1.toFixed(2)} €` : '0.00 €'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Product Detail Modal Inside Canvas */}
          {activeProductDetail && (
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-2xs z-30 p-4 flex items-center justify-center">
              <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90%] animate-in fade-in zoom-in duration-200">
                {/* Header Image */}
                <div className="h-36 bg-slate-200 relative">
                  {activeProductDetail.image_url ? (
                    <img
                      src={activeProductDetail.image_url}
                      alt={activeProductDetail.produto}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold text-3xl">
                      {activeProductDetail.produto.substring(0, 2)}
                    </div>
                  )}
                  <button
                    onClick={() => setActiveProductDetail(null)}
                    className="absolute top-2 right-2 bg-slate-950/70 hover:bg-slate-950 text-white p-1.5 rounded-full transition shadow-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-extrabold text-slate-900">
                        {activeProductDetail.produto}
                      </h3>
                      <span className="text-sm font-extrabold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-lg border border-teal-200">
                        {activeProductDetail.pvp1
                          ? `${activeProductDetail.pvp1.toFixed(2)} €`
                          : '0.00 €'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {activeProductDetail.descricao || 'Sem descrição.'}
                    </p>
                  </div>

                  {/* Nutri info */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-center text-[10px]">
                    <div>
                      <span className="text-slate-400 block">Dose Pessoas</span>
                      <strong className="text-slate-800 font-bold">{activeProductDetail.pessoas || 1} p.</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Calorias</span>
                      <strong className="text-slate-800 font-bold">{activeProductDetail.calorias || 0} kcal</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Prep. Tempo</span>
                      <strong className="text-slate-800 font-bold">{activeProductDetail.tempo || 0} min</strong>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={() => setActiveProductDetail(null)}
                    className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
