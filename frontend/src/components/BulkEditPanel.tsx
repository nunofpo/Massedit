import React, { useState, useEffect } from 'react';
import {
  Palette, DollarSign, FolderTree, Percent, Lock, Eye, Cloud, Play,
  ShieldAlert, Sparkles, Copy, Barcode, Hash, Tag, CheckCircle2, Layers, Utensils
} from 'lucide-react';
import { Family, Subfamily, Vat, BulkEditRequest, ProductItem, ProductionCenterItem } from '../types';

interface BulkEditPanelProps {
  selectedProducts: ProductItem[];
  families: Family[];
  subfamilies: Subfamily[];
  vats: Vat[];
  productionCenters?: ProductionCenterItem[];
  onPreview: (request: BulkEditRequest) => void;
  onOpenFamilyColors?: () => void;
}

type SectorTab = 'names' | 'prices' | 'colors' | 'categories' | 'codes' | 'production' | 'status';

const PRESET_COLORS = [
  { name: 'Branco', hex: '#FFFFFF', textHex: '#000000' },
  { name: 'Preto', hex: '#000000', textHex: '#FFFFFF' },
  { name: 'Vermelho', hex: '#EF4444', textHex: '#FFFFFF' },
  { name: 'Verde', hex: '#10B981', textHex: '#FFFFFF' },
  { name: 'Azul', hex: '#3B82F6', textHex: '#FFFFFF' },
  { name: 'Amarelo', hex: '#F59E0B', textHex: '#000000' },
  { name: 'Roxo', hex: '#8B5CF6', textHex: '#FFFFFF' },
  { name: 'Cinza', hex: '#6B7280', textHex: '#FFFFFF' },
];

const PRICE_QUICK_PRESETS = [
  { label: '+0.10 €', mode: 'fixed_add', val: 0.10 },
  { label: '+0.20 €', mode: 'fixed_add', val: 0.20 },
  { label: '+0.50 €', mode: 'fixed_add', val: 0.50 },
  { label: '+1.00 €', mode: 'fixed_add', val: 1.00 },
  { label: '-0.10 €', mode: 'fixed_add', val: -0.10 },
  { label: '+5 %', mode: 'percentage', val: 5.0 },
  { label: '+10 %', mode: 'percentage', val: 10.0 },
];

export const BulkEditPanel: React.FC<BulkEditPanelProps> = ({
  selectedProducts,
  families,
  subfamilies,
  vats,
  productionCenters = [],
  onPreview,
  onOpenFamilyColors
}) => {
  const selectedCount = selectedProducts.length;
  const hasSalesCount = selectedProducts.filter(p => p.has_sales).length;
  const allHaveSales = selectedCount > 0 && hasSalesCount === selectedCount;

  // Active Sector Tab State
  const [activeTab, setActiveTab] = useState<SectorTab>('names');

  // Form State: Nomes & Ortografia
  const [applyDescricao, setApplyDescricao] = useState(false);
  const [newDescricao, setNewDescricao] = useState('');
  const [descricaoMode, setDescricaoMode] = useState<'direct' | 'uppercase' | 'lowercase' | 'titlecase' | 'capitalize' | 'orthography' | 'unaccented_uppercase' | 'unaccented'>('direct');

  const [applyDescricaocurta, setApplyDescricaocurta] = useState(false);
  const [newDescricaocurta, setNewDescricaocurta] = useState('');
  const [descricaocurtaMode, setDescricaocurtaMode] = useState<'direct' | 'uppercase' | 'lowercase' | 'titlecase' | 'capitalize' | 'orthography' | 'unaccented_uppercase' | 'unaccented'>('direct');

  // Form State: PLU, EAN & Ref
  const [applyPlu, setApplyPlu] = useState(false);
  const [pluMode, setPluMode] = useState<'direct' | 'sequence' | 'copy_codigo' | 'clear'>('direct');
  const [newPlu, setNewPlu] = useState<number | undefined>(undefined);
  const [pluSeqStart, setPluSeqStart] = useState<number>(1001);

  const [applyCodbarras, setApplyCodbarras] = useState(false);
  const [codbarrasMode, setCodbarrasMode] = useState<'direct' | 'sequence' | 'clear'>('direct');
  const [newCodbarras, setNewCodbarras] = useState('');
  const [codbarrasSeqStart, setCodbarrasSeqStart] = useState<number>(1001);

  const [applyReferencia, setApplyReferencia] = useState(false);
  const [newReferencia, setNewReferencia] = useState('');

  // Form State: Cores POS
  const [applyFundo, setApplyFundo] = useState(false);
  const [fundoHex, setFundoHex] = useState('#3B82F6');
  
  const [applyLetra, setApplyLetra] = useState(false);
  const [letraHex, setLetraHex] = useState('#FFFFFF');
  
  const [applyCor, setApplyCor] = useState(false);
  const [corHex, setCorHex] = useState('#000000');

  // Form State: Preços & IVA
  const [applyPrice, setApplyPrice] = useState(false);
  const [targetPvp, setTargetPvp] = useState('pvp1'); // pvp1..pvp10, all, copy_pvp1
  const [sourcePvp, setSourcePvp] = useState('pvp1'); // pvp1..pvp10
  const [priceMode, setPriceMode] = useState('fixed_add'); // fixed_add, percentage, fixed_set, copy_pvp
  const [priceValue, setPriceValue] = useState<number | string>(0.10);
  const [priceRounding, setPriceRounding] = useState('none');

  const [applyIva, setApplyIva] = useState(false);
  const [newIva, setNewIva] = useState<number | undefined>(vats[0]?.factor);

  // Form State: Estrutura (Família & Subfamília)
  const [applyFamilia, setApplyFamilia] = useState(false);
  const [newFamilia, setNewFamilia] = useState<number | undefined>(families[0]?.codigo);

  const [applySubfamilia, setApplySubfamilia] = useState(false);
  const [newSubfamilia, setNewSubfamilia] = useState<number | undefined>(undefined);

  // Form State: Centros de Produção
  const [applyCentroProd, setApplyCentroProd] = useState(false);
  const [newCentroProd, setNewCentroProd] = useState<number | null>(null);
  const [centroProdInfo, setCentroProdInfo] = useState<number>(0);

  // Subfamilies belonging to selected newFamilia
  const filteredSubfamilies = newFamilia !== undefined
    ? subfamilies.filter(sf => sf.familia === newFamilia)
    : subfamilies;

  // Form State: Estado & Sync
  const [applyBloqueado, setApplyBloqueado] = useState(false);
  const [newBloqueado, setNewBloqueado] = useState<number>(0);

  const [applyFrontoffice, setApplyFrontoffice] = useState(false);
  const [newFrontoffice, setNewFrontoffice] = useState<number>(1);

  const [applyPosicaofront, setApplyPosicaofront] = useState(false);
  const [newPosicaofront, setNewPosicaofront] = useState<number>(0);

  const [markCloudSync, setMarkCloudSync] = useState(true);

  // Reset form defaults when aux data loads
  useEffect(() => {
    if (families.length > 0 && !newFamilia) setNewFamilia(families[0].codigo);
    if (vats.length > 0 && newIva === undefined) setNewIva(vats[0].factor);
  }, [families, vats]);

  // Compute Active Change Badges per Sector
  const namesCount = (applyDescricao && !allHaveSales ? 1 : 0) + (applyDescricaocurta ? 1 : 0);
  const pricesCount = (applyPrice ? 1 : 0) + (applyIva ? 1 : 0);
  const colorsCount = (applyFundo ? 1 : 0) + (applyLetra ? 1 : 0) + (applyCor ? 1 : 0);
  const categoriesCount = (applyFamilia ? 1 : 0) + (applySubfamilia ? 1 : 0);
  const codesCount = (applyPlu ? 1 : 0) + (applyCodbarras ? 1 : 0) + (applyReferencia ? 1 : 0);
  const productionCount = applyCentroProd ? 1 : 0;
  const statusCount = (applyBloqueado ? 1 : 0) + (applyFrontoffice ? 1 : 0) + (applyPosicaofront ? 1 : 0);

  const totalActiveEdits = namesCount + pricesCount + colorsCount + categoriesCount + codesCount + productionCount + statusCount;

  const handleBuildRequest = (): BulkEditRequest => {
    return {
      product_codes: selectedProducts.map(p => p.codigo),
      apply_descricao: applyDescricao && !allHaveSales,
      new_descricao: newDescricao,
      descricao_mode: descricaoMode,
      apply_descricaocurta: applyDescricaocurta,
      new_descricaocurta: newDescricaocurta,
      descricaocurta_mode: descricaocurtaMode,
      apply_plu: applyPlu,
      new_plu: newPlu,
      plu_mode: pluMode,
      plu_seq_start: pluSeqStart,
      apply_codbarras: applyCodbarras,
      new_codbarras: newCodbarras,
      codbarras_mode: codbarrasMode,
      codbarras_seq_start: codbarrasSeqStart,
      apply_referencia: applyReferencia,
      new_referencia: newReferencia,
      colors: {
        apply_fundo: applyFundo,
        fundo_hex: fundoHex,
        apply_letra: applyLetra,
        letra_hex: letraHex,
        apply_cor: applyCor,
        cor_hex: corHex
      },
      prices: {
        apply_price: applyPrice,
        mode: priceMode,
        value: typeof priceValue === 'number' ? priceValue : (parseFloat(String(priceValue).replace(',', '.')) || 0),
        target_pvp: targetPvp,
        source_pvp: sourcePvp,
        rounding: priceRounding
      },
      apply_familia: applyFamilia,
      new_familia: newFamilia,
      apply_subfamilia: applySubfamilia,
      new_subfamilia: newSubfamilia,
      apply_centro_prod: applyCentroProd,
      new_centro_prod: newCentroProd,
      centro_prod_info: centroProdInfo,
      apply_iva: applyIva,
      new_iva: newIva,
      apply_bloqueado: applyBloqueado,
      new_bloqueado: newBloqueado,
      apply_frontoffice: applyFrontoffice,
      new_frontoffice: newFrontoffice,
      apply_posicaofront: applyPosicaofront,
      new_posicaofront: newPosicaofront,
      mark_cloud_sync: markCloudSync
    };
  };

  const handleRunPreview = () => {
    if (selectedCount === 0) return;
    onPreview(handleBuildRequest());
  };

  return (
    <aside className="w-full lg:w-[460px] bg-white border-l border-slate-200 flex flex-col h-full overflow-hidden shadow-lg">
      
      {/* Header Panel */}
      <div className="p-4 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            Edição em Massa por Setores
          </h2>
          {totalActiveEdits > 0 && (
            <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              {totalActiveEdits} setor(es) configurados
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {selectedCount > 0 ? (
            <span className="text-indigo-600 font-semibold">{selectedCount} artigo(s) selecionados para alterar</span>
          ) : (
            <span className="text-amber-600 font-medium">Selecione artigos na tabela para ativar a edição</span>
          )}
        </p>
      </div>

      {/* Sector Tabs Navigation Bar */}
      <div className="bg-slate-100 p-2 border-b border-slate-200 grid grid-cols-4 gap-1 text-xs">
        {/* Tab 1: Nomes */}
        <button
          type="button"
          onClick={() => setActiveTab('names')}
          className={`py-2 px-2 rounded-lg font-semibold flex items-center justify-between border transition ${
            activeTab === 'names'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-bold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900 font-semibold shadow-xs'
          }`}
        >
          <span className="flex items-center gap-1 truncate text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            Nomes
          </span>
          {namesCount > 0 && (
            <span className="bg-emerald-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shrink-0">
              {namesCount}
            </span>
          )}
        </button>

        {/* Tab 2: Preços */}
        <button
          type="button"
          onClick={() => setActiveTab('prices')}
          className={`py-2 px-2 rounded-lg font-semibold flex items-center justify-between border transition ${
            activeTab === 'prices'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-bold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900 font-semibold shadow-xs'
          }`}
        >
          <span className="flex items-center gap-1 truncate text-[11px]">
            <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            Preços/IVA
          </span>
          {pricesCount > 0 && (
            <span className="bg-emerald-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shrink-0">
              {pricesCount}
            </span>
          )}
        </button>

        {/* Tab 3: Cores */}
        <button
          type="button"
          onClick={() => setActiveTab('colors')}
          className={`py-2 px-2 rounded-lg font-semibold flex items-center justify-between border transition ${
            activeTab === 'colors'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-bold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900 font-semibold shadow-xs'
          }`}
        >
          <span className="flex items-center gap-1 truncate text-[11px]">
            <Palette className="w-3.5 h-3.5 text-pink-500 shrink-0" />
            Cores POS
          </span>
          {colorsCount > 0 && (
            <span className="bg-emerald-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shrink-0">
              {colorsCount}
            </span>
          )}
        </button>

        {/* Tab 4: Categorias */}
        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          className={`py-2 px-2 rounded-lg font-semibold flex items-center justify-between border transition ${
            activeTab === 'categories'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-bold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900 font-semibold shadow-xs'
          }`}
        >
          <span className="flex items-center gap-1 truncate text-[11px]">
            <FolderTree className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            Famílias
          </span>
          {categoriesCount > 0 && (
            <span className="bg-emerald-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shrink-0">
              {categoriesCount}
            </span>
          )}
        </button>

        {/* Tab 5: Códigos & PLU */}
        <button
          type="button"
          onClick={() => setActiveTab('codes')}
          className={`py-2 px-2 rounded-lg font-semibold flex items-center justify-between border transition ${
            activeTab === 'codes'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-bold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900 font-semibold shadow-xs'
          }`}
        >
          <span className="flex items-center gap-1 truncate text-[11px]">
            <Barcode className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            PLU/EAN
          </span>
          {codesCount > 0 && (
            <span className="bg-emerald-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shrink-0">
              {codesCount}
            </span>
          )}
        </button>

        {/* Tab 6: Produção (Cozinha/Bar) */}
        <button
          type="button"
          onClick={() => setActiveTab('production')}
          className={`py-2 px-2 rounded-lg font-semibold flex items-center justify-between border transition ${
            activeTab === 'production'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-bold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900 font-semibold shadow-xs'
          }`}
        >
          <span className="flex items-center gap-1 truncate text-[11px]">
            <Utensils className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            Produção
          </span>
          {productionCount > 0 && (
            <span className="bg-emerald-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shrink-0">
              {productionCount}
            </span>
          )}
        </button>

        {/* Tab 7: Estado & Sync */}
        <button
          type="button"
          onClick={() => setActiveTab('status')}
          className={`col-span-2 py-2 px-2 rounded-lg font-semibold flex items-center justify-between border transition ${
            activeTab === 'status'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-bold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900 font-semibold shadow-xs'
          }`}
        >
          <span className="flex items-center gap-1.5 truncate text-[11px]">
            <Cloud className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            Estado & Nuvem
          </span>
          {statusCount > 0 && (
            <span className="bg-emerald-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shrink-0">
              {statusCount}
            </span>
          )}
        </button>
      </div>

      {/* Main Tab Content Workspace Body */}
      <div className="p-4 space-y-4 flex-1 overflow-y-auto bg-slate-50/50">
        
        {/* Warning Badge for Items with Sales (Always visible if applicable) */}
        {hasSalesCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5 shadow-xs">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900">
                {hasSalesCount} dos artigos selecionados têm vendas registadas.
              </p>
              <p className="mt-0.5 text-[11px] text-amber-800 leading-relaxed">
                A designação fiscal será mantida intacta. Todos os outros campos (preços, cores, famílias, IVA) podem ser alterados normalmente.
              </p>
            </div>
          </div>
        )}

        {/* ------------------- SETOR 1: NOMES & ORTOGRAFIA ------------------- */}
        {activeTab === 'names' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Designação Principal (`descricao`)
              </h3>

              <label className="flex items-center gap-2 font-semibold text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={allHaveSales || selectedCount === 0}
                  checked={applyDescricao}
                  onChange={(e) => setApplyDescricao(e.target.checked)}
                  className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                />
                <span>Ativar Alteração da Designação Principal</span>
              </label>

              {applyDescricao && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setDescricaoMode('direct')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        descricaoMode === 'direct'
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Novo Texto Fixo
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescricaoMode('unaccented_uppercase')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        descricaoMode === 'unaccented_uppercase'
                          ? 'bg-amber-600 text-white border-amber-600 font-bold shadow-xs'
                          : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 font-semibold'
                      }`}
                    >
                      🔤 MAIÚSCULAS SEM ACENTOS
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescricaoMode('orthography')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        descricaoMode === 'orthography'
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 font-semibold'
                      }`}
                    >
                      ✨ Ortografia (PT)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescricaoMode('uppercase')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        descricaoMode === 'uppercase'
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      TUDO MAIÚSCULAS
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescricaoMode('titlecase')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        descricaoMode === 'titlecase'
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Primeiras Maiúsculas
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescricaoMode('unaccented')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        descricaoMode === 'unaccented'
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Sem Acentos
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescricaoMode('lowercase')}
                      className={`col-span-2 py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        descricaoMode === 'lowercase'
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      tudo minúsculas
                    </button>
                  </div>

                  {descricaoMode === 'direct' ? (
                    <input
                      type="text"
                      disabled={allHaveSales || selectedCount === 0}
                      placeholder="Nova designação para artigos sem vendas..."
                      value={newDescricao}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setNewDescricao(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                    />
                  ) : (
                    <p className="text-[10px] text-indigo-900 bg-indigo-50 p-2.5 rounded-lg border border-indigo-100 font-medium leading-relaxed">
                      {descricaoMode === 'unaccented_uppercase' && '🔤 Remove acentos e converte para MAIÚSCULAS (ex: "Bolo de Ananás" ➔ "BOLO DE ANANAS", "MAÇÃ" ➔ "MACA").'}
                      {descricaoMode === 'unaccented' && '💡 Remove todos os acentos mantendo as maiúsculas/minúsculas.'}
                      {descricaoMode === 'orthography' && '✨ Corrige ortografia, espaçamentos duplos, pontuação e preposições em minúsculas.'}
                      {descricaoMode === 'uppercase' && '💡 Converte o nome existente de cada artigo para MAIÚSCULAS.'}
                      {descricaoMode === 'titlecase' && '💡 Capitaliza a primeira letra de cada palavra.'}
                      {descricaoMode === 'lowercase' && '💡 Converte o nome existente para minúsculas.'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Descrição Curta (POS / Cozinha) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                <Tag className="w-4 h-4 text-sky-600" />
                Descrição Curta (`descricaocurta` - Botões POS)
              </h3>

              <label className="flex items-center gap-2 font-semibold text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyDescricaocurta}
                  onChange={(e) => setApplyDescricaocurta(e.target.checked)}
                  className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500"
                />
                <span>Alterar Descrição Curta</span>
              </label>

              {applyDescricaocurta && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setDescricaocurtaMode('direct')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        descricaocurtaMode === 'direct'
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Texto Fixo
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescricaocurtaMode('unaccented_uppercase')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        descricaocurtaMode === 'unaccented_uppercase'
                          ? 'bg-amber-600 text-white border-amber-600 font-bold shadow-xs'
                          : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 font-semibold'
                      }`}
                    >
                      🔤 MAIÚSCULAS SEM ACENTOS
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescricaocurtaMode('orthography')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        descricaocurtaMode === 'orthography'
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 font-semibold'
                      }`}
                    >
                      ✨ Ortografia (PT)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescricaocurtaMode('uppercase')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        descricaocurtaMode === 'uppercase'
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      MAIÚSCULAS
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescricaocurtaMode('titlecase')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        descricaocurtaMode === 'titlecase'
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Primeiras Maiúsculas
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescricaocurtaMode('unaccented')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        descricaocurtaMode === 'unaccented'
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Sem Acentos
                    </button>
                  </div>

                  {descricaocurtaMode === 'direct' && (
                    <input
                      type="text"
                      placeholder="Nova descrição curta (ex: 'Comp. Fruta')..."
                      value={newDescricaocurta}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setNewDescricaocurta(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------- SETOR 2: PREÇOS & IVA ------------------- */}
        {activeTab === 'prices' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 font-bold text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyPrice}
                    onChange={(e) => setApplyPrice(e.target.checked)}
                    className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500"
                  />
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>Alteração de Preços em Lote</span>
                </label>
              </div>

              {applyPrice && (
                <div className="space-y-4 pt-1">
                  {/* Target PVP */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-700 font-semibold block">Preço a Alterar (Destino):</label>
                    <select
                      value={targetPvp}
                      onChange={(e) => setTargetPvp(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                    >
                      <option value="pvp1">PVP 1 (Preço Principal de Venda)</option>
                      <option value="pvp2">PVP 2 (Preço 2 / Esplanada / Cartão)</option>
                      <option value="pvp3">PVP 3</option>
                      <option value="pvp4">PVP 4</option>
                      <option value="pvp5">PVP 5</option>
                      <option value="pvp6">PVP 6</option>
                      <option value="pvp7">PVP 7</option>
                      <option value="pvp8">PVP 8</option>
                      <option value="pvp9">PVP 9</option>
                      <option value="pvp10">PVP 10</option>
                      <option value="all">Todos os Preços (PVP 1 ao PVP 10)</option>
                    </select>
                  </div>

                  {/* Price Mode */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-700 font-semibold block">Modo de Atualização:</label>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setPriceMode('fixed_add')}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                          priceMode === 'fixed_add'
                            ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                            : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        Ajuste Fixo (+/- €)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPriceMode('percentage')}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                          priceMode === 'percentage'
                            ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                            : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        Margem (+/- %)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPriceMode('fixed_set')}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                          priceMode === 'fixed_set'
                            ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                            : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        Definir Preço Fixo
                      </button>
                      <button
                        type="button"
                        onClick={() => setPriceMode('copy_pvp')}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                          priceMode === 'copy_pvp'
                            ? 'bg-amber-600 text-white border-amber-600 font-bold shadow-xs'
                            : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 font-semibold'
                        }`}
                      >
                        Copiar de Outro PVP
                      </button>
                    </div>
                  </div>

                  {/* Copy Source PVP selector */}
                  {priceMode === 'copy_pvp' ? (
                    <div className="space-y-1.5 bg-amber-50 p-3 rounded-lg border border-amber-200">
                      <label className="text-xs text-amber-900 font-bold flex items-center gap-1.5">
                        <Copy className="w-3.5 h-3.5 text-amber-600" />
                        Copiar Valor Origem de:
                      </label>
                      <select
                        value={sourcePvp}
                        onChange={(e) => setSourcePvp(e.target.value)}
                        className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-amber-200 font-semibold"
                      >
                        <option value="pvp1">Copiar do PVP 1</option>
                        <option value="pvp2">Copiar do PVP 2</option>
                        <option value="pvp3">Copiar do PVP 3</option>
                        <option value="pvp4">Copiar do PVP 4</option>
                        <option value="pvp5">Copiar do PVP 5</option>
                        <option value="pvp6">Copiar do PVP 6</option>
                      </select>
                      <p className="text-[10px] text-amber-800 font-medium">
                        O valor do <span className="font-bold uppercase text-amber-950">{sourcePvp}</span> será copiado diretamente para o <span className="font-bold uppercase text-amber-950">{targetPvp}</span>.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-700 font-semibold block">
                        {priceMode === 'percentage' ? 'Percentagem (%):' : 'Valor (€):'}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={priceValue}
                        onFocus={(e) => e.target.select()}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        onChange={(e) => {
                          let raw = e.target.value;
                          // Convert comma from Portuguese numpad or keyboard to dot
                          let val = raw.replace(',', '.');
                          
                          // Handle typing dot when a dot already exists in string
                          const parts = val.split('.');
                          if (parts.length > 2) {
                            val = parts[0] + '.' + parts.slice(1).join('');
                          }

                          // Allow empty, minus, dot, minus-dot, or any valid partial numeric string
                          if (val === '' || val === '-' || val === '.' || val === '-.' || !isNaN(Number(val))) {
                            setPriceValue(val);
                          }
                        }}
                        onBlur={() => {
                          const num = parseFloat(String(priceValue).replace(',', '.'));
                          if (!isNaN(num)) {
                            setPriceValue(num);
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 font-bold shadow-xs"
                      />
                    </div>
                  )}

                  {/* Quick Presets */}
                  {priceMode !== 'copy_pvp' && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-slate-500 font-medium block">Atalhos Rápidos:</span>
                      <div className="flex flex-wrap gap-1">
                        {PRICE_QUICK_PRESETS.map((p, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setPriceMode(p.mode);
                              setPriceValue(p.val);
                            }}
                            className="py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded text-[10px] font-mono font-semibold"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rounding Options */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <label className="text-xs text-slate-700 font-semibold block">Regra de Arredondamento:</label>
                    <select
                      value={priceRounding}
                      onChange={(e) => setPriceRounding(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                    >
                      <option value="none">Sem arredondamento (Exato)</option>
                      <option value="90_cents">Terminar em .90 € (ex: 1.90€)</option>
                      <option value="95_cents">Terminar em .95 € (ex: 1.95€)</option>
                      <option value="00_cents">Arredondar para Euro exato (.00€)</option>
                      <option value="2_decimals">Arredondar para 2 casas decimais</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* IVA */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <label className="flex items-center gap-2 text-xs text-slate-800 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyIva}
                  onChange={(e) => setApplyIva(e.target.checked)}
                  className="rounded border-slate-300 bg-white text-indigo-600"
                />
                <Percent className="w-4 h-4 text-amber-600" />
                <span>Alterar Taxa de IVA (numérico: 23%, 13%, 6%, 0%)</span>
              </label>
              {applyIva && (
                <select
                  value={newIva ?? ''}
                  onChange={(e) => setNewIva(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 font-semibold"
                >
                  {vats.map((v) => (
                    <option key={v.codigo} value={v.factor}>
                      {v.factor % 1 === 0 ? `${Math.floor(v.factor)}%` : `${v.factor}%`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* ------------------- SETOR 3: CORES & BOTÕES POS ------------------- */}
        {activeTab === 'colors' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                  <Palette className="w-4 h-4 text-pink-500" />
                  Personalização de Cores dos Botões POS
                </h3>
                {onOpenFamilyColors && (
                  <button
                    type="button"
                    onClick={onOpenFamilyColors}
                    className="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition shadow-xs"
                  >
                    Gestor por Família ➔
                  </button>
                )}
              </div>

              {/* Presets Rapid0s */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-500 font-medium block">Paleta de Cores Rápida:</span>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_COLORS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setApplyFundo(true);
                        setFundoHex(preset.hex);
                        setApplyLetra(true);
                        setLetraHex(preset.textHex);
                      }}
                      className="py-2 px-1 rounded-lg border border-slate-300 shadow-xs flex items-center justify-center gap-1 transition hover:scale-105"
                      style={{ backgroundColor: preset.hex, color: preset.textHex }}
                      title={`Aplicar ${preset.name}`}
                    >
                      <span className="text-[11px] font-bold">Aa</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fundo Botão */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="flex items-center justify-between text-xs text-slate-800 cursor-pointer font-semibold">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={applyFundo}
                      onChange={(e) => setApplyFundo(e.target.checked)}
                      className="rounded border-slate-300 bg-white text-indigo-600"
                    />
                    Cor de Fundo do Botão (`fundo`)
                  </span>
                  <input
                    type="color"
                    disabled={!applyFundo}
                    value={fundoHex}
                    onChange={(e) => setFundoHex(e.target.value.toUpperCase())}
                    className="w-8 h-8 rounded cursor-pointer border border-slate-300 bg-white disabled:opacity-40"
                  />
                </label>
              </div>

              {/* Texto Botão */}
              <div className="space-y-2">
                <label className="flex items-center justify-between text-xs text-slate-800 cursor-pointer font-semibold">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={applyLetra}
                      onChange={(e) => setApplyLetra(e.target.checked)}
                      className="rounded border-slate-300 bg-white text-indigo-600"
                    />
                    Cor do Texto / Fonte (`letra`)
                  </span>
                  <input
                    type="color"
                    disabled={!applyLetra}
                    value={letraHex}
                    onChange={(e) => setLetraHex(e.target.value.toUpperCase())}
                    className="w-8 h-8 rounded cursor-pointer border border-slate-300 bg-white disabled:opacity-40"
                  />
                </label>
              </div>

              {/* Etiqueta / Tag */}
              <div className="space-y-2">
                <label className="flex items-center justify-between text-xs text-slate-800 cursor-pointer font-semibold">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={applyCor}
                      onChange={(e) => setApplyCor(e.target.checked)}
                      className="rounded border-slate-300 bg-white text-indigo-600"
                    />
                    Etiqueta / Tag Secundária (`cor`)
                  </span>
                  <input
                    type="color"
                    disabled={!applyCor}
                    value={corHex}
                    onChange={(e) => setCorHex(e.target.value.toUpperCase())}
                    className="w-8 h-8 rounded cursor-pointer border border-slate-300 bg-white disabled:opacity-40"
                  />
                </label>
              </div>

              {/* Live Visual Preview */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <span className="text-[10px] text-slate-500 block font-semibold">Simulação em Tempo Real do Botão no POS:</span>
                <div
                  className="w-full py-4 px-4 rounded-xl text-center font-bold text-sm shadow-md border border-slate-300 transition flex flex-col items-center justify-center gap-1"
                  style={{
                    backgroundColor: applyFundo ? fundoHex : '#2563eb',
                    color: applyLetra ? letraHex : '#ffffff'
                  }}
                >
                  <span>{selectedProducts[0]?.descricao || 'Exemplo de Botão POS'}</span>
                  <span className="text-[10px] opacity-90 font-mono font-medium">
                    {selectedProducts[0]?.pvp1 ? `${selectedProducts[0].pvp1.toFixed(2)} €` : '1.50 €'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------- SETOR 4: CATEGORIAS & FAMÍLIAS ------------------- */}
        {activeTab === 'categories' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                <FolderTree className="w-4 h-4 text-sky-600" />
                Estrutura de Categorias (Família ➔ Subfamília)
              </h3>

              {/* Família */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-800 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyFamilia}
                    onChange={(e) => setApplyFamilia(e.target.checked)}
                    className="rounded border-slate-300 bg-white text-indigo-600"
                  />
                  <span>Alterar Família</span>
                </label>
                {applyFamilia && (
                  <select
                    value={newFamilia ?? ''}
                    onChange={(e) => {
                      const fCode = Number(e.target.value);
                      setNewFamilia(fCode);
                      const firstSub = subfamilies.find(sf => sf.familia === fCode);
                      setNewSubfamilia(firstSub ? firstSub.codigo : undefined);
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-indigo-600 font-semibold"
                  >
                    {families.map((f) => (
                      <option key={f.codigo} value={f.codigo}>
                        {f.descricao} (Código: {f.codigo})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Subfamília */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <label className="flex items-center gap-2 text-xs text-slate-800 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applySubfamilia}
                    onChange={(e) => setApplySubfamilia(e.target.checked)}
                    className="rounded border-slate-300 bg-white text-indigo-600"
                  />
                  <span>Alterar Subfamília (Filtrada por Família)</span>
                </label>
                {applySubfamilia && (
                  <select
                    value={newSubfamilia ?? ''}
                    onChange={(e) => setNewSubfamilia(e.target.value === '' ? undefined : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-indigo-600 font-semibold"
                  >
                    <option value="">Nenhuma Subfamília (Vazio)</option>
                    {filteredSubfamilies.map((sf) => (
                      <option key={sf.codigo} value={sf.codigo}>
                        {sf.descricao} (Código: {sf.codigo})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ------------------- SETOR 5: PLU & CÓDIGOS DE IDENTIFICAÇÃO ------------------- */}
        {activeTab === 'codes' && (
          <div className="space-y-4">
            {/* PLU (Teclado / Balança) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 font-bold text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyPlu}
                    onChange={(e) => setApplyPlu(e.target.checked)}
                    className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500"
                  />
                  <Hash className="w-4 h-4 text-amber-600" />
                  <span>Código PLU (Teclado / Balança)</span>
                </label>
              </div>

              {applyPlu && (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setPluMode('direct')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        pluMode === 'direct'
                          ? 'bg-amber-600 text-white border-amber-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Fixo (Número)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPluMode('sequence')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        pluMode === 'sequence'
                          ? 'bg-amber-600 text-white border-amber-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Sequencial
                    </button>
                    <button
                      type="button"
                      onClick={() => setPluMode('copy_codigo')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        pluMode === 'copy_codigo'
                          ? 'bg-amber-600 text-white border-amber-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Copiar Cód. Interno
                    </button>
                    <button
                      type="button"
                      onClick={() => setPluMode('clear')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        pluMode === 'clear'
                          ? 'bg-rose-600 text-white border-rose-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Limpar PLU (0)
                    </button>
                  </div>

                  {pluMode === 'direct' && (
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Novo número de PLU..."
                      value={newPlu ?? ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setNewPlu(val ? Number(val) : undefined);
                      }}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 font-mono focus:bg-white focus:border-amber-600 focus:ring-2 focus:ring-amber-100 font-bold"
                    />
                  )}

                  {pluMode === 'sequence' && (
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-semibold block">PLU Inicial (Balança):</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="1"
                        value={pluSeqStart}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          setPluSeqStart(val ? Number(val) : 1);
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono focus:bg-white focus:border-amber-600 focus:ring-2 focus:ring-amber-100 font-bold"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Código de Barras (EAN) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 font-bold text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyCodbarras}
                    onChange={(e) => setApplyCodbarras(e.target.checked)}
                    className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500"
                  />
                  <Barcode className="w-4 h-4 text-purple-600" />
                  <span>Código de Barras (EAN-13 / UPC)</span>
                </label>
              </div>

              {applyCodbarras && (
                <div className="space-y-3 pt-2">
                  <div className="flex gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setCodbarrasMode('direct')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        codbarrasMode === 'direct'
                          ? 'bg-purple-600 text-white border-purple-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Valor Fixo
                    </button>
                    <button
                      type="button"
                      onClick={() => setCodbarrasMode('sequence')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        codbarrasMode === 'sequence'
                          ? 'bg-purple-600 text-white border-purple-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Sequencial
                    </button>
                    <button
                      type="button"
                      onClick={() => setCodbarrasMode('clear')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                        codbarrasMode === 'clear'
                          ? 'bg-rose-600 text-white border-rose-600 font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Limpar EAN
                    </button>
                  </div>

                  {codbarrasMode === 'direct' && (
                    <input
                      type="text"
                      placeholder="Novo código de barras EAN-13..."
                      value={newCodbarras}
                      onChange={(e) => setNewCodbarras(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono placeholder-slate-400 focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Referência SKU */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <label className="flex items-center gap-2 font-bold text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyReferencia}
                  onChange={(e) => setApplyReferencia(e.target.checked)}
                  className="rounded border-slate-300 bg-white text-indigo-600"
                />
                <span>Alterar Referência de Fornecedor (`referencia`)</span>
              </label>

              {applyReferencia && (
                <input
                  type="text"
                  placeholder="Nova referência SKU / Fornecedor..."
                  value={newReferencia}
                  onChange={(e) => setNewReferencia(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                />
              )}
            </div>
          </div>
        )}

        {/* ------------------- SETOR 6: CENTROS DE PRODUÇÃO ------------------- */}
        {activeTab === 'production' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                <Utensils className="w-4 h-4 text-amber-600" />
                Encaminhamento para Produção (Cozinha/Bar)
              </h3>

              {/* Production Center Checkbox & Selector */}
              <label className="flex items-center gap-2 font-bold text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyCentroProd}
                  onChange={(e) => setApplyCentroProd(e.target.checked)}
                  className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500"
                />
                <span>Alterar Centro de Produção de Destino (`dbo.produtoscentrosprod`)</span>
              </label>

              {applyCentroProd && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div>
                    <label className="text-[11px] text-slate-600 font-semibold block mb-1">
                      Selecionar Centro de Produção:
                    </label>
                    <select
                      value={newCentroProd ?? ''}
                      onChange={(e) => setNewCentroProd(e.target.value === '' ? null : Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-amber-600 focus:ring-2 focus:ring-amber-100 font-semibold"
                    >
                      <option value="">(Remover / Sem Centro de Produção)</option>
                      {productionCenters.map((pc) => (
                        <option key={pc.codigo} value={pc.codigo}>
                          🍳 {pc.descricao} (#{pc.codigo})
                        </option>
                      ))}
                    </select>
                  </div>

                  {newCentroProd !== null && newCentroProd > 0 && (
                    <div>
                      <label className="text-[11px] text-slate-600 font-semibold block mb-1">
                        Tipo de Pedido no POS:
                      </label>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setCentroProdInfo(0)}
                          className={`py-2 px-3 rounded-lg font-semibold border transition text-center ${
                            centroProdInfo === 0
                              ? 'bg-amber-600 text-white border-amber-600 font-bold shadow-xs'
                              : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          🔥 Preparação (Imprime Pedido)
                        </button>
                        <button
                          type="button"
                          onClick={() => setCentroProdInfo(1)}
                          className={`py-2 px-3 rounded-lg font-semibold border transition text-center ${
                            centroProdInfo === 1
                              ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                              : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          ℹ️ Informativo (Apenas Ecrã)
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 space-y-1">
                    <p className="flex items-center gap-1 font-bold text-amber-700">
                      💡 Informação de Sincronização:
                    </p>
                    <p className="leading-relaxed">
                      Ao guardar, a tabela <code className="text-indigo-600 font-mono font-semibold">dbo.produtoscentrosprod</code> é atualizada e os artigos são automaticamente marcados com <code className="text-amber-600 font-mono font-semibold">sync = 1</code> para atualizar os postos POS na cloud.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------- SETOR 7: ESTADO & SINCRONIZAÇÃO CLOUD ------------------- */}
        {activeTab === 'status' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                <Cloud className="w-4 h-4 text-indigo-600" />
                Estado, Visibilidade POS e Sincronização Cloud
              </h3>

              {/* Bloqueado */}
              <label className="flex items-center justify-between text-xs text-slate-800 cursor-pointer font-semibold">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={applyBloqueado}
                    onChange={(e) => setApplyBloqueado(e.target.checked)}
                    className="rounded border-slate-300 bg-white text-indigo-600"
                  />
                  <Lock className="w-4 h-4 text-slate-500" />
                  <span>Estado de Bloqueio do Artigo</span>
                </span>
                {applyBloqueado && (
                  <select
                    value={newBloqueado}
                    onChange={(e) => setNewBloqueado(Number(e.target.value))}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-semibold focus:bg-white focus:border-indigo-600"
                  >
                    <option value={0}>Ativo (Permitir Venda)</option>
                    <option value={1}>Bloqueado (Impedir Venda)</option>
                  </select>
                )}
              </label>

              {/* FrontOffice */}
              <label className="flex items-center justify-between text-xs text-slate-800 cursor-pointer font-semibold pt-3 border-t border-slate-100">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={applyFrontoffice}
                    onChange={(e) => setApplyFrontoffice(e.target.checked)}
                    className="rounded border-slate-300 bg-white text-indigo-600"
                  />
                  <Eye className="w-4 h-4 text-slate-500" />
                  <span>Visibilidade FrontOffice (Botões POS)</span>
                </span>
                {applyFrontoffice && (
                  <select
                    value={newFrontoffice}
                    onChange={(e) => setNewFrontoffice(Number(e.target.value))}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-semibold focus:bg-white focus:border-indigo-600"
                  >
                    <option value={1}>Visível no POS</option>
                    <option value={0}>Oculto no POS</option>
                  </select>
                )}
              </label>

              {/* Posição POS (dbo.produtos.ordem) */}
              <label className="flex items-center justify-between text-xs text-slate-800 cursor-pointer font-semibold pt-3 border-t border-slate-100">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={applyPosicaofront}
                    onChange={(e) => setApplyPosicaofront(e.target.checked)}
                    className="rounded border-slate-300 bg-white text-indigo-600"
                  />
                  <span>Posição do Botão no POS (ordem)</span>
                </span>
                {applyPosicaofront && (
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={newPosicaofront}
                    onChange={(e) => setNewPosicaofront(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className="w-24 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-semibold font-mono focus:bg-white focus:border-indigo-600"
                  />
                )}
              </label>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Se a base de dados não tiver as colunas <code>bloqueado</code>/<code>frontoffice</code>, a simulação indica-o e essas alterações não são gravadas.
              </p>

              {/* Cloud Sync Flag */}
              <div className="pt-3 border-t border-slate-100 space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-emerald-800 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markCloudSync}
                    onChange={(e) => setMarkCloudSync(e.target.checked)}
                    className="rounded border-slate-300 bg-white text-emerald-600 focus:ring-emerald-500"
                  />
                  <Cloud className="w-4 h-4 text-emerald-600" />
                  <span>Ativar Sinalizador de Sincronização Cloud (`sync = 1`)</span>
                </label>
                <p className="text-[10px] text-slate-500 leading-relaxed pl-6">
                  Força a sincronização imediata dos artigos alterados com a nuvem e outros terminais do sistema POS.
                </p>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Action Button Sticky Footer */}
      <div className="p-4 bg-white border-t border-slate-200 space-y-2 sticky bottom-0 shadow-lg">
        <button
          disabled={selectedCount === 0}
          onClick={handleRunPreview}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl shadow-md shadow-indigo-600/10 flex items-center justify-center gap-2 transition"
        >
          <Play className="w-4 h-4 fill-white" />
          Simular & Aplicar Alterações ({selectedCount} Artigos)
        </button>
      </div>

    </aside>
  );
};
