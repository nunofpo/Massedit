import React, { useState, useEffect } from 'react';
import { Palette, DollarSign, FolderTree, Percent, Lock, Eye, Cloud, Play, AlertTriangle, ShieldAlert, Sparkles, Plus, Copy, Barcode, Hash } from 'lucide-react';
import { Family, Subfamily, Vat, BulkEditRequest, ProductItem } from '../types';

interface BulkEditPanelProps {
  selectedProducts: ProductItem[];
  families: Family[];
  subfamilies: Subfamily[];
  vats: Vat[];
  onPreview: (request: BulkEditRequest) => void;
}

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
  onPreview
}) => {
  const selectedCount = selectedProducts.length;
  const hasSalesCount = selectedProducts.filter(p => p.has_sales).length;
  const allHaveSales = selectedCount > 0 && hasSalesCount === selectedCount;

  // Form State
  const [applyDescricao, setApplyDescricao] = useState(false);
  const [newDescricao, setNewDescricao] = useState('');
  const [descricaoMode, setDescricaoMode] = useState<'direct' | 'uppercase' | 'lowercase' | 'titlecase' | 'capitalize' | 'orthography' | 'unaccented_uppercase' | 'unaccented'>('direct');

  const [applyDescricaocurta, setApplyDescricaocurta] = useState(false);
  const [newDescricaocurta, setNewDescricaocurta] = useState('');
  const [descricaocurtaMode, setDescricaocurtaMode] = useState<'direct' | 'uppercase' | 'lowercase' | 'titlecase' | 'capitalize' | 'orthography' | 'unaccented_uppercase' | 'unaccented'>('direct');

  // PLU (Teclado / Balança - dbo.produtos.codigo_alf)
  const [applyPlu, setApplyPlu] = useState(false);
  const [pluMode, setPluMode] = useState<'direct' | 'sequence' | 'copy_codigo' | 'clear'>('direct');
  const [newPlu, setNewPlu] = useState<number | undefined>(undefined);
  const [pluSeqStart, setPluSeqStart] = useState<number>(1001);

  // Código de Barras & Referência
  const [applyCodbarras, setApplyCodbarras] = useState(false);
  const [codbarrasMode, setCodbarrasMode] = useState<'direct' | 'sequence' | 'clear'>('direct');
  const [newCodbarras, setNewCodbarras] = useState('');
  const [codbarrasSeqStart, setCodbarrasSeqStart] = useState<number>(1001);

  const [applyReferencia, setApplyReferencia] = useState(false);
  const [newReferencia, setNewReferencia] = useState('');

  // Colors
  const [applyFundo, setApplyFundo] = useState(false);
  const [fundoHex, setFundoHex] = useState('#3B82F6');
  
  const [applyLetra, setApplyLetra] = useState(false);
  const [letraHex, setLetraHex] = useState('#FFFFFF');
  
  const [applyCor, setApplyCor] = useState(false);
  const [corHex, setCorHex] = useState('#000000');

  // Prices PVP 1 a 10
  const [applyPrice, setApplyPrice] = useState(false);
  const [targetPvp, setTargetPvp] = useState('pvp2'); // pvp1..pvp10, all, copy_pvp1
  const [sourcePvp, setSourcePvp] = useState('pvp1'); // pvp1..pvp10
  const [priceMode, setPriceMode] = useState('fixed_add'); // fixed_add, percentage, fixed_set, copy_pvp
  const [priceValue, setPriceValue] = useState<number>(0.10);
  const [priceRounding, setPriceRounding] = useState('none');

  // Structure (Family & Subfamily)
  const [applyFamilia, setApplyFamilia] = useState(false);
  const [newFamilia, setNewFamilia] = useState<number | undefined>(families[0]?.codigo);

  const [applySubfamilia, setApplySubfamilia] = useState(false);
  const [newSubfamilia, setNewSubfamilia] = useState<number | undefined>(undefined);

  // Subfamilies belonging to selected newFamilia
  const filteredSubfamilies = newFamilia !== undefined
    ? subfamilies.filter(sf => sf.familia === newFamilia)
    : subfamilies;

  // VAT
  const [applyIva, setApplyIva] = useState(false);
  const [newIva, setNewIva] = useState<number | undefined>(vats[0]?.codigo);

  // Status
  const [applyBloqueado, setApplyBloqueado] = useState(false);
  const [newBloqueado, setNewBloqueado] = useState<number>(0);

  // FrontOffice
  const [applyFrontoffice, setApplyFrontoffice] = useState(false);
  const [newFrontoffice, setNewFrontoffice] = useState<number>(1);

  // Cloud Sync
  const [markCloudSync, setMarkCloudSync] = useState(true);

  // Reset form when selection changes or defaults
  useEffect(() => {
    if (families.length > 0 && !newFamilia) setNewFamilia(families[0].codigo);
    if (vats.length > 0 && !newIva) setNewIva(vats[0].codigo);
  }, [families, vats]);

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
        value: priceValue,
        target_pvp: targetPvp,
        source_pvp: sourcePvp,
        rounding: priceRounding
      },
      apply_familia: applyFamilia,
      new_familia: newFamilia,
      apply_subfamilia: applySubfamilia,
      new_subfamilia: newSubfamilia,
      apply_iva: applyIva,
      new_iva: newIva,
      apply_bloqueado: applyBloqueado,
      new_bloqueado: newBloqueado,
      apply_frontoffice: applyFrontoffice,
      new_frontoffice: newFrontoffice,
      mark_cloud_sync: markCloudSync
    };
  };

  const handleRunPreview = () => {
    if (selectedCount === 0) return;
    onPreview(handleBuildRequest());
  };

  return (
    <aside className="w-full lg:w-[420px] bg-slate-900 border-l border-slate-800 flex flex-col h-full overflow-y-auto">
      
      {/* Header Panel */}
      <div className="p-4 bg-slate-900/90 border-b border-slate-800 sticky top-0 z-10 backdrop-blur">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          Painel de Edição em Massa
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          {selectedCount > 0 ? (
            <span className="text-indigo-300 font-semibold">{selectedCount} artigos selecionados para alterar</span>
          ) : (
            <span className="text-amber-400">Selecione artigos na tabela ao lado para editar</span>
          )}
        </p>
      </div>

      <div className="p-4 space-y-6 flex-1">
        
        {/* Warning Badge for Items with Sales */}
        {hasSalesCount > 0 && (
          <div className="bg-amber-950/60 border border-amber-800/80 rounded-xl p-3.5 text-xs text-amber-200 flex items-start gap-3 shadow-inner">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300">
                {hasSalesCount} dos artigos selecionados têm vendas registadas.
              </p>
              <p className="mt-1 text-[11px] text-amber-200/80 leading-relaxed">
                Por regras fiscais e integridade, a <strong>designação/nome</strong> destes artigos será mantida intacta. Todos os outros campos (preços PVP1..10, cores, famílias, IVA) podem ser alterados normalmente.
              </p>
            </div>
          </div>
        )}

        {/* 1. Nome / Designação & Descrição Curta */}
        <section className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <label className="flex items-center gap-2 font-semibold text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              disabled={allHaveSales || selectedCount === 0}
              checked={applyDescricao}
              onChange={(e) => setApplyDescricao(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
            />
            <span>Alterar Nome / Designação Principal</span>
          </label>

          {applyDescricao && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setDescricaoMode('direct')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    descricaoMode === 'direct'
                      ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  Novo Texto Fixo
                </button>
                <button
                  type="button"
                  onClick={() => setDescricaoMode('unaccented_uppercase')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    descricaoMode === 'unaccented_uppercase'
                      ? 'bg-amber-600 text-white border-amber-500 font-bold shadow'
                      : 'bg-slate-900 text-amber-300 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  🔤 MAIÚSCULAS SEM ACENTOS
                </button>
                <button
                  type="button"
                  onClick={() => setDescricaoMode('orthography')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    descricaoMode === 'orthography'
                      ? 'bg-emerald-600 text-white border-emerald-500 font-bold shadow'
                      : 'bg-slate-900 text-emerald-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  ✨ Ortografia (PT)
                </button>
                <button
                  type="button"
                  onClick={() => setDescricaoMode('uppercase')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    descricaoMode === 'uppercase'
                      ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  TUDO MAIÚSCULAS
                </button>
                <button
                  type="button"
                  onClick={() => setDescricaoMode('titlecase')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    descricaoMode === 'titlecase'
                      ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  Primeiras Maiúsculas
                </button>
                <button
                  type="button"
                  onClick={() => setDescricaoMode('unaccented')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    descricaoMode === 'unaccented'
                      ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  Sem Acentos
                </button>
                <button
                  type="button"
                  onClick={() => setDescricaoMode('lowercase')}
                  className={`col-span-2 py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    descricaoMode === 'lowercase'
                      ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
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
                  onChange={(e) => setNewDescricao(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              ) : (
                <p className="text-[10px] text-indigo-300 bg-indigo-950/40 p-2 rounded border border-indigo-800/60 font-mono">
                  {descricaoMode === 'unaccented_uppercase' && '🔤 Remove acentos e converte para MAIÚSCULAS (ex: "Bolo de Ananás" ➔ "BOLO DE ANANAS", "MAÇÃ" ➔ "MACA").'}
                  {descricaoMode === 'unaccented' && '💡 Remove todos os acentos e diacríticos mantendo o texto original (ex: "Ananás" ➔ "Ananas", "Çapa" ➔ "Capa").'}
                  {descricaoMode === 'orthography' && '✨ Corrige ortografia, espaçamentos duplos, pontuação e preposições (de, do, da, c/, s/, com, sem, kg, cl) em minúsculas (ex: "BOLO   DE  ANANAS C/ LARANJA" ➔ "Bolo de Ananás c/ Laranja").'}
                  {descricaoMode === 'uppercase' && '💡 Converte o nome existente de cada artigo para MAIÚSCULAS (ex: "cafe com leite" ➔ "CAFE COM LEITE").'}
                  {descricaoMode === 'titlecase' && '💡 Capitaliza a primeira letra de cada palavra (ex: "cafe com leite" ➔ "Cafe Com Leite").'}
                  {descricaoMode === 'lowercase' && '💡 Converte o nome existente de cada artigo para minúsculas (ex: "CAFE" ➔ "cafe").'}
                </p>
              )}

              {allHaveSales && (
                <p className="text-[10px] text-amber-400">
                  Bloqueado: Todos os artigos selecionados possuem histórico de vendas.
                </p>
              )}
            </div>
          )}

          {/* Descrição Curta (POS) */}
          <div className="pt-2 border-t border-slate-800/80">
            <label className="flex items-center gap-2 font-semibold text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={applyDescricaocurta}
                onChange={(e) => setApplyDescricaocurta(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Alterar Descrição Curta (Botões POS / Cozinha)</span>
            </label>

            {applyDescricaocurta && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setDescricaocurtaMode('direct')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                      descricaocurtaMode === 'direct'
                        ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    Texto Fixo
                  </button>
                  <button
                    type="button"
                    onClick={() => setDescricaocurtaMode('unaccented_uppercase')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                      descricaocurtaMode === 'unaccented_uppercase'
                        ? 'bg-amber-600 text-white border-amber-500 font-bold shadow'
                        : 'bg-slate-900 text-amber-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    🔤 MAIÚSCULAS SEM ACENTOS
                  </button>
                  <button
                    type="button"
                    onClick={() => setDescricaocurtaMode('orthography')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                      descricaocurtaMode === 'orthography'
                        ? 'bg-emerald-600 text-white border-emerald-500 font-bold shadow'
                        : 'bg-slate-900 text-emerald-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    ✨ Ortografia (PT)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDescricaocurtaMode('uppercase')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                      descricaocurtaMode === 'uppercase'
                        ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    MAIÚSCULAS
                  </button>
                  <button
                    type="button"
                    onClick={() => setDescricaocurtaMode('titlecase')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                      descricaocurtaMode === 'titlecase'
                        ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    Primeiras Maiúsculas
                  </button>
                  <button
                    type="button"
                    onClick={() => setDescricaocurtaMode('unaccented')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                      descricaocurtaMode === 'unaccented'
                        ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    Sem Acentos
                  </button>
                  <button
                    type="button"
                    onClick={() => setDescricaocurtaMode('lowercase')}
                    className={`col-span-2 py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                      descricaocurtaMode === 'lowercase'
                        ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    minúsculas
                  </button>
                </div>

                {descricaocurtaMode === 'direct' ? (
                  <input
                    type="text"
                    placeholder="Nova descrição curta (ex: 'Comp. Fruta')..."
                    value={newDescricaocurta}
                    onChange={(e) => setNewDescricaocurta(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                ) : (
                  <p className="text-[10px] text-indigo-300 bg-indigo-950/40 p-2 rounded border border-indigo-800/60 font-mono">
                    {descricaocurtaMode === 'unaccented_uppercase' && '🔤 Remove acentos e converte a descrição curta para MAIÚSCULAS.'}
                    {descricaocurtaMode === 'unaccented' && '💡 Remove os acentos da descrição curta mantendo as maiúsculas/minúsculas.'}
                    {descricaocurtaMode === 'orthography' && '✨ Corrige ortografia, pontuação, c/ s/ e maiúsculas na descrição curta.'}
                    {descricaocurtaMode === 'uppercase' && '💡 Converte a descrição curta de cada artigo para MAIÚSCULAS.'}
                    {descricaocurtaMode === 'titlecase' && '💡 Capitaliza a primeira letra de cada palavra da descrição curta.'}
                    {descricaocurtaMode === 'lowercase' && '💡 Converte a descrição curta para minúsculas.'}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 1.4 Código PLU (Balança / Teclado) */}
        <section className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 font-bold text-xs text-slate-100 cursor-pointer">
              <input
                type="checkbox"
                checked={applyPlu}
                onChange={(e) => setApplyPlu(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
              />
              <Hash className="w-4 h-4 text-amber-400" />
              <span>Alterar Código PLU (Teclado / Balança)</span>
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
                      ? 'bg-amber-600 text-white border-amber-500 font-bold shadow'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  Fixo (Número)
                </button>
                <button
                  type="button"
                  onClick={() => setPluMode('sequence')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    pluMode === 'sequence'
                      ? 'bg-amber-600 text-white border-amber-500 font-bold shadow'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  Sequencial
                </button>
                <button
                  type="button"
                  onClick={() => setPluMode('copy_codigo')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    pluMode === 'copy_codigo'
                      ? 'bg-amber-600 text-white border-amber-500 font-bold shadow'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  Copiar Cód. Interno
                </button>
                <button
                  type="button"
                  onClick={() => setPluMode('clear')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    pluMode === 'clear'
                      ? 'bg-rose-950 text-rose-300 border-rose-800 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  Limpar PLU (0)
                </button>
              </div>

              {pluMode === 'direct' && (
                <input
                  type="number"
                  placeholder="Novo número de PLU..."
                  value={newPlu ?? ''}
                  onChange={(e) => setNewPlu(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500"
                />
              )}

              {pluMode === 'sequence' && (
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-semibold block">PLU Inicial (Balança):</label>
                  <input
                    type="number"
                    placeholder="1"
                    value={pluSeqStart}
                    onChange={(e) => setPluSeqStart(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-slate-400">
                    Os artigos receberão PLUs sequenciais: <span className="font-mono text-amber-300">{pluSeqStart}, {pluSeqStart + 1}, {pluSeqStart + 2}...</span>
                  </p>
                </div>
              )}

              {pluMode === 'copy_codigo' && (
                <p className="text-[10px] text-amber-300 bg-amber-950/40 p-2 rounded border border-amber-800/60">
                  O PLU de cada artigo passará a ter o mesmo valor do seu Código Interno (#código).
                </p>
              )}

              {pluMode === 'clear' && (
                <p className="text-[10px] text-rose-400 bg-rose-950/40 p-2 rounded border border-rose-900/60">
                  O PLU será reposto para 0 em todos os artigos selecionados.
                </p>
              )}
            </div>
          )}
        </section>

        {/* 1.5 Código de Barras & Referência (Sem alterar código interno) */}
        <section className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 font-bold text-xs text-slate-100 cursor-pointer">
              <input
                type="checkbox"
                checked={applyCodbarras}
                onChange={(e) => setApplyCodbarras(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
              />
              <Barcode className="w-4 h-4 text-indigo-400" />
              <span>Alterar Código de Barras</span>
            </label>
            <span className="text-[10px] text-slate-500 font-mono">EAN / GS1</span>
          </div>

          {applyCodbarras && (
            <div className="space-y-3 pt-2">
              <div className="flex gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setCodbarrasMode('direct')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    codbarrasMode === 'direct'
                      ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  Valor Fixo
                </button>
                <button
                  type="button"
                  onClick={() => setCodbarrasMode('sequence')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    codbarrasMode === 'sequence'
                      ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  Sequencial
                </button>
                <button
                  type="button"
                  onClick={() => setCodbarrasMode('clear')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    codbarrasMode === 'clear'
                      ? 'bg-rose-950 text-rose-300 border-rose-800 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  Limpar Barras
                </button>
              </div>

              {codbarrasMode === 'direct' && (
                <input
                  type="text"
                  placeholder="Novo Código de Barras (EAN)..."
                  value={newCodbarras}
                  onChange={(e) => setNewCodbarras(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                />
              )}

              {codbarrasMode === 'sequence' && (
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-semibold block">Número Inicial:</label>
                  <input
                    type="number"
                    placeholder="5601001000001"
                    value={codbarrasSeqStart}
                    onChange={(e) => setCodbarrasSeqStart(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400">
                    Os artigos receberão Códigos de Barras sequenciais: <span className="font-mono text-indigo-300">{codbarrasSeqStart}, {codbarrasSeqStart + 1}...</span>
                  </p>
                </div>
              )}

              {codbarrasMode === 'clear' && (
                <p className="text-[10px] text-rose-400 bg-rose-950/40 p-2 rounded border border-rose-900/60">
                  O código de barras será removido dos artigos selecionados.
                </p>
              )}
            </div>
          )}

          {/* Referência */}
          <div className="pt-2 border-t border-slate-800/80">
            <label className="flex items-center gap-2 font-semibold text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={applyReferencia}
                onChange={(e) => setApplyReferencia(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Alterar Referência</span>
            </label>

            {applyReferencia && (
              <input
                type="text"
                placeholder="Nova referência..."
                value={newReferencia}
                onChange={(e) => setNewReferencia(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 mt-2 focus:outline-none focus:border-indigo-500"
              />
            )}
          </div>
        </section>

        {/* 2. Alteração de Preços PVP 1 a PVP 10 (Somar +0.10€, %, etc.) */}
        <section className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
          <label className="flex items-center gap-2 font-bold text-xs text-slate-100 cursor-pointer">
            <input
              type="checkbox"
              checked={applyPrice}
              onChange={(e) => setApplyPrice(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
            />
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>Alterar Preços (PVP 1 a PVP 10)</span>
          </label>

          {applyPrice && (
            <div className="space-y-3.5 pt-2">
              
              {/* Modo de Operação de Preço */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1 font-semibold">Modo de Operação de Preço:</label>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPriceMode('fixed_add')}
                    className={`py-1.5 px-1.5 rounded-lg text-[11px] font-medium border transition text-center ${
                      priceMode === 'fixed_add'
                        ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    Somar (+/- €)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceMode('percentage')}
                    className={`py-1.5 px-1.5 rounded-lg text-[11px] font-medium border transition text-center ${
                      priceMode === 'percentage'
                        ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    % Percent
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceMode('fixed_set')}
                    className={`py-1.5 px-1.5 rounded-lg text-[11px] font-medium border transition text-center ${
                      priceMode === 'fixed_set'
                        ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    Fixo (= €)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceMode('copy_pvp')}
                    className={`py-1.5 px-1.5 rounded-lg text-[11px] font-medium border transition text-center ${
                      priceMode === 'copy_pvp'
                        ? 'bg-amber-600 text-white border-amber-500 font-bold shadow'
                        : 'bg-slate-900 text-amber-400 border-amber-900/60 hover:bg-slate-800'
                    }`}
                  >
                    📋 Copiar
                  </button>
                </div>
              </div>

              {/* Se for Modo Copiar Preço */}
              {priceMode === 'copy_pvp' ? (
                <div className="bg-amber-950/40 p-3 rounded-xl border border-amber-800/60 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs text-amber-300 font-bold">
                    <span>Cópia de Preços entre Patamares (PVP):</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {/* Origem */}
                    <div>
                      <label className="text-[10px] text-amber-200/80 block mb-1 font-semibold">1. Copiar de (Origem):</label>
                      <select
                        value={sourcePvp}
                        onChange={(e) => setSourcePvp(e.target.value)}
                        className="w-full bg-slate-900 border border-amber-700/60 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-amber-500"
                      >
                        <option value="pvp1">Preço PVP 1</option>
                        <option value="pvp2">Preço PVP 2</option>
                        <option value="pvp3">Preço PVP 3</option>
                        <option value="pvp4">Preço PVP 4</option>
                        <option value="pvp5">Preço PVP 5</option>
                        <option value="pvp6">Preço PVP 6</option>
                        <option value="pvp7">Preço PVP 7</option>
                        <option value="pvp8">Preço PVP 8</option>
                        <option value="pvp9">Preço PVP 9</option>
                        <option value="pvp10">Preço PVP 10</option>
                      </select>
                    </div>

                    {/* Destino */}
                    <div>
                      <label className="text-[10px] text-amber-200/80 block mb-1 font-semibold">2. Copiar para (Destino):</label>
                      <select
                        value={targetPvp}
                        onChange={(e) => setTargetPvp(e.target.value)}
                        className="w-full bg-slate-900 border border-amber-700/60 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-amber-500"
                      >
                        <option value="pvp1">Preço PVP 1</option>
                        <option value="pvp2">Preço PVP 2</option>
                        <option value="pvp3">Preço PVP 3</option>
                        <option value="pvp4">Preço PVP 4</option>
                        <option value="pvp5">Preço PVP 5</option>
                        <option value="pvp6">Preço PVP 6</option>
                        <option value="pvp7">Preço PVP 7</option>
                        <option value="pvp8">Preço PVP 8</option>
                        <option value="pvp9">Preço PVP 9</option>
                        <option value="pvp10">Preço PVP 10</option>
                        <option value="all">⚡ Todos os outros PVPs</option>
                      </select>
                    </div>
                  </div>

                  <p className="text-[10px] text-amber-200/70 italic">
                    Exemplo: O valor de <strong>{sourcePvp.toUpperCase()}</strong> será copiado exatamente para o <strong>{targetPvp === 'all' ? 'todos os outros PVPs' : targetPvp.toUpperCase()}</strong> nos artigos selecionados.
                  </p>
                </div>
              ) : (
                <>
                  {/* Seleção do PVP Target */}
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1 font-semibold">Patamar de Preço a Alterar:</label>
                    <select
                      value={targetPvp}
                      onChange={(e) => setTargetPvp(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-indigo-500"
                    >
                      <option value="pvp1">Preço PVP 1 (Padrão)</option>
                      <option value="pvp2">Preço PVP 2</option>
                      <option value="pvp3">Preço PVP 3</option>
                      <option value="pvp4">Preço PVP 4</option>
                      <option value="pvp5">Preço PVP 5</option>
                      <option value="pvp6">Preço PVP 6</option>
                      <option value="pvp7">Preço PVP 7</option>
                      <option value="pvp8">Preço PVP 8</option>
                      <option value="pvp9">Preço PVP 9</option>
                      <option value="pvp10">Preço PVP 10</option>
                      <option value="all">⚡ Todos os PVPs (PVP 1 a PVP 10)</option>
                    </select>
                  </div>

                  {/* Botões Rápidos de Acréscimo (+0.10€, +0.20€, +0.50€, etc.) */}
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">Acréscimos Rápidos em Massa:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {PRICE_QUICK_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setPriceMode(preset.mode);
                            setPriceValue(preset.val);
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition ${
                            priceMode === preset.mode && priceValue === preset.val
                              ? 'bg-emerald-600 text-white border-emerald-500 shadow'
                              : 'bg-slate-900 text-emerald-400 hover:bg-slate-800 border-slate-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Valor de Entrada */}
              {targetPvp !== 'copy_pvp1' && (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    {priceMode === 'fixed_add' && 'Valor a Somar / Subtrair em Euros (ex: 0.10 para +0.10€):'}
                    {priceMode === 'percentage' && 'Percentagem de Ajuste (ex: 10 para +10%, -5 para -5%):'}
                    {priceMode === 'fixed_set' && 'Novo Valor Fixo em Euros (ex: 2.50):'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={priceValue}
                      onChange={(e) => setPriceValue(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 font-bold text-base focus:outline-none focus:border-indigo-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      {priceMode === 'percentage' ? '%' : '€'}
                    </span>
                  </div>
                </div>
              )}

              {/* Arredondamentos */}
              {targetPvp !== 'copy_pvp1' && (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Regra de Arredondamento:</label>
                  <select
                    value={priceRounding}
                    onChange={(e) => setPriceRounding(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                  >
                    <option value="none">Sem arredondamento especial</option>
                    <option value="90_cents">Terminar em .90 € (ex: 12.90 €)</option>
                    <option value="95_cents">Terminar em .95 € (ex: 12.95 €)</option>
                    <option value="00_cents">Arredondar a Euros inteiros .00 €</option>
                    <option value="2_decimals">Arredondar a 2 casas decimais</option>
                  </select>
                </div>
              )}

            </div>
          )}
        </section>

        {/* 3. Aparência & Cores (Botões POS) */}
        <section className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Palette className="w-4 h-4 text-indigo-400" />
            Cores de Botões & POS
          </h3>

          {/* Color Presets */}
          <div>
            <span className="text-[11px] text-slate-400 block mb-2 font-medium">Paleta de Cores Rápidas:</span>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setApplyFundo(true);
                    setFundoHex(preset.hex);
                    setApplyLetra(true);
                    setLetraHex(preset.textHex);
                  }}
                  className="w-7 h-7 rounded-lg border border-slate-700 shadow flex items-center justify-center transition hover:scale-105"
                  style={{ backgroundColor: preset.hex, color: preset.textHex }}
                  title={`Aplicar ${preset.name}`}
                >
                  <span className="text-[10px] font-bold">Aa</span>
                </button>
              ))}
            </div>
          </div>

          {/* Fundo Botão */}
          <div className="space-y-2 pt-2 border-t border-slate-900">
            <label className="flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={applyFundo}
                  onChange={(e) => setApplyFundo(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-600"
                />
                Cor de Fundo do Botão
              </span>
              <input
                type="color"
                disabled={!applyFundo}
                value={fundoHex}
                onChange={(e) => setFundoHex(e.target.value.toUpperCase())}
                className="w-8 h-8 rounded cursor-pointer border border-slate-700 bg-slate-900 disabled:opacity-40"
              />
            </label>
          </div>

          {/* Texto Botão */}
          <div className="space-y-2">
            <label className="flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={applyLetra}
                  onChange={(e) => setApplyLetra(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-600"
                />
                Cor do Texto (Fonte)
              </span>
              <input
                type="color"
                disabled={!applyLetra}
                value={letraHex}
                onChange={(e) => setLetraHex(e.target.value.toUpperCase())}
                className="w-8 h-8 rounded cursor-pointer border border-slate-700 bg-slate-900 disabled:opacity-40"
              />
            </label>
          </div>

          {/* Visual POS Live Preview */}
          <div className="pt-3 border-t border-slate-900">
            <span className="text-[10px] text-slate-400 block mb-1.5 font-medium">Simulação Visual do Botão no POS:</span>
            <div
              className="w-full py-3 px-4 rounded-xl text-center font-bold text-sm shadow-xl border border-slate-700 transition"
              style={{
                backgroundColor: applyFundo ? fundoHex : '#1e293b',
                color: applyLetra ? letraHex : '#f8fafc'
              }}
            >
              {selectedProducts[0]?.descricao || 'Exemplo de Botão POS'}
            </div>
          </div>
        </section>

        {/* 4. Estrutura (Família & Subfamília) & IVA */}
        <section className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
          {/* Família */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={applyFamilia}
                onChange={(e) => setApplyFamilia(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-indigo-600"
              />
              <FolderTree className="w-4 h-4 text-indigo-400" />
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
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {families.map((f) => (
                  <option key={f.codigo} value={f.codigo}>
                    {f.descricao} (Código: {f.codigo})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Subfamília (Lógica ligada à Família selecionada) */}
          <div className="space-y-2 pt-2 border-t border-slate-900">
            <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={applySubfamilia}
                onChange={(e) => setApplySubfamilia(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-indigo-600"
              />
              <span>Alterar Subfamília</span>
            </label>
            {applySubfamilia && (
              <select
                value={newSubfamilia ?? ''}
                onChange={(e) => setNewSubfamilia(e.target.value === '' ? undefined : Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
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

          {/* IVA */}
          <div className="space-y-2 pt-3 border-t border-slate-900">
            <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={applyIva}
                onChange={(e) => setApplyIva(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-indigo-600"
              />
              <Percent className="w-4 h-4 text-amber-400" />
              <span>Alterar Taxa de IVA</span>
            </label>
            {applyIva && (
              <select
                value={newIva ?? ''}
                onChange={(e) => setNewIva(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {vats.map((v) => (
                  <option key={v.codigo} value={v.factor}>
                    {v.descricao} ({v.factor}%)
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {/* 5. Estado, Visibilidade & Cloud Sync */}
        <section className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          {/* Bloqueado */}
          <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={applyBloqueado}
                onChange={(e) => setApplyBloqueado(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-indigo-600"
              />
              <Lock className="w-4 h-4 text-slate-400" />
              <span>Estado do Artigo</span>
            </span>
            {applyBloqueado && (
              <select
                value={newBloqueado}
                onChange={(e) => setNewBloqueado(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
              >
                <option value={0}>Ativo</option>
                <option value={1}>Bloqueado</option>
              </select>
            )}
          </label>

          {/* FrontOffice */}
          <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer pt-2 border-t border-slate-900">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={applyFrontoffice}
                onChange={(e) => setApplyFrontoffice(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-indigo-600"
              />
              <Eye className="w-4 h-4 text-slate-400" />
              <span>Visibilidade FrontOffice (POS)</span>
            </span>
            {applyFrontoffice && (
              <select
                value={newFrontoffice}
                onChange={(e) => setNewFrontoffice(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
              >
                <option value={1}>Visível</option>
                <option value={0}>Oculto</option>
              </select>
            )}
          </label>

          {/* Cloud Sync */}
          <label className="flex items-center gap-2 text-xs text-emerald-400 pt-2 border-t border-slate-900 font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={markCloudSync}
              onChange={(e) => setMarkCloudSync(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-emerald-600"
            />
            <Cloud className="w-4 h-4 text-emerald-400" />
            <span>Sincronizar Cloud (`sync = 1`)</span>
          </label>
        </section>

      </div>

      {/* Action Button Footer */}
      <div className="p-4 bg-slate-900 border-t border-slate-800 sticky bottom-0">
        <button
          disabled={selectedCount === 0}
          onClick={handleRunPreview}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2 transition"
        >
          <Play className="w-4 h-4 fill-white" />
          Simular & Pré-visualizar Alterações ({selectedCount})
        </button>
      </div>

    </aside>
  );
};
