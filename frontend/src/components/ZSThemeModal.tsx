import React, { useState } from 'react';
import {
  X,
  Upload,
  Download,
  RefreshCw,
  Palette,
  AlertCircle,
  Image as ImageIcon,
  PlusCircle,
  Trash2,
  Layers,
  Link as LinkIcon,
  DollarSign,
  Terminal,
  Sparkles,
  Sliders
} from 'lucide-react';

interface ZSThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

interface ColorGroup {
  element_type: string;
  color: string | null;
  color_to: string | null;
  font_color: string | null;
  count: number;
}

interface GroupEdit {
  new_color: string;
  new_color_to: string;
  new_font_color: string;
}

interface ShortcutButtonItem {
  id: string;
  button_type: 'function' | 'discount' | 'link' | 'exe';
  caption: string;
  color: string;
  color_to: string;
  font_color: string;
  function_id?: number;
  function_name?: string;
  parameters?: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const groupKey = (g: { element_type: string; color: string | null; color_to: string | null; font_color: string | null }) =>
  `${g.element_type}|${g.color}|${g.color_to}|${g.font_color}`;

const DARK_MODERN_PRESET = { new_color: '#2C2C30', new_color_to: '#1F1F22', new_font_color: '#F2F2F2' };

const PRESET_FUNCTIONS = [
  { id: 38, name: 'Mais Vendidos' },
  { id: 26, name: 'Abertura de Dia' },
  { id: 28, name: 'Fecho de Sessão' },
  { id: 31, name: 'Abrir Gaveta' },
  { id: 179, name: 'Desconto Directo em Valor' },
  { id: 217, name: 'Abrir Link Externo' },
  { id: 128, name: 'Função Externa' },
];

export const ZSThemeModal: React.FC<ZSThemeModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [activeTab, setActiveTab] = useState<'colors' | 'background' | 'shortcuts' | 'panels'>('colors');
  const [file, setFile] = useState<File | null>(null);
  const [groups, setGroups] = useState<ColorGroup[]>([]);
  const [edits, setEdits] = useState<Record<string, GroupEdit>>({});
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [rounding, setRounding] = useState<string>('14');

  // Fundo
  const [bgColor, setBgColor] = useState<string>('#1E293B');
  const [bgOpacity, setBgOpacity] = useState<number>(100);
  const [bgStretch, setBgStretch] = useState<boolean>(true);
  const [bgImageBase64, setBgImageBase64] = useState<string | null>(null);
  const [bgFileName, setBgFileName] = useState<string | null>(null);

  // Botões de Atalho
  const [shortcuts, setShortcuts] = useState<ShortcutButtonItem[]>([]);

  // Painéis
  const [addRetailPanel, setAddRetailPanel] = useState<boolean>(false);
  const [addFunctionPanel, setAddFunctionPanel] = useState<boolean>(false);
  const [addPaymentPanel, setAddPaymentPanel] = useState<boolean>(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileSelected = async (selected: File | null) => {
    setErrorMsg(null);
    setGroups([]);
    setEdits({});
    setThumbnail(null);
    setFile(selected);
    if (!selected) return;

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', selected);
      const res = await fetch('/api/zstheme/analyze', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || 'Não foi possível ler este ficheiro .zstheme.');
        return;
      }
      const loadedGroups: ColorGroup[] = data.groups || [];
      setGroups(loadedGroups);
      setThumbnail(data.thumbnail_base64 || null);

      if (data.background?.color) {
        setBgColor(data.background.color);
      }
      if (data.background?.opacity !== undefined && data.background.opacity !== null) {
        setBgOpacity(parseInt(data.background.opacity, 10) || 100);
      }

      const initialEdits: Record<string, GroupEdit> = {};
      loadedGroups.forEach(g => {
        initialEdits[groupKey(g)] = {
          new_color: g.color || '#FFFFFF',
          new_color_to: g.color_to || '#FFFFFF',
          new_font_color: g.font_color || '#000000'
        };
      });
      setEdits(initialEdits);
    } catch (err) {
      setErrorMsg('Falha de rede ao analisar o ficheiro.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const imgFile = e.target.files?.[0];
    if (!imgFile) return;
    setBgFileName(imgFile.name);
    const reader = new FileReader();
    reader.onload = () => {
      setBgImageBase64(reader.result as string);
    };
    reader.readAsDataURL(imgFile);
  };

  const addShortcutButton = (type: 'function' | 'discount' | 'link' | 'exe') => {
    let caption = 'Novo Atalho';
    let params = '';
    let funcId: number | undefined = undefined;
    let funcName: string | undefined = undefined;

    if (type === 'discount') {
      caption = 'Desconto 5€';
      params = '5.00';
    } else if (type === 'link') {
      caption = 'Abrir Site';
      params = 'https://';
    } else if (type === 'exe') {
      caption = 'Calculadora';
      params = 'calc.exe';
    } else {
      caption = 'Mais Vendidos';
      funcId = 38;
      funcName = 'Mais Vendidos';
    }

    const newItem: ShortcutButtonItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
      button_type: type,
      caption,
      color: '#334155',
      color_to: '#1E293B',
      font_color: '#FFFFFF',
      function_id: funcId,
      function_name: funcName,
      parameters: params,
      left: 10,
      top: 10 + shortcuts.length * 70,
      width: 140,
      height: 60
    };
    setShortcuts(prev => [...prev, newItem]);
  };

  const removeShortcut = (id: string) => {
    setShortcuts(prev => prev.filter(s => s.id !== id));
  };

  const updateShortcut = (id: string, patch: Partial<ShortcutButtonItem>) => {
    setShortcuts(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  const applyPresetToGroup = (g: ColorGroup) => {
    setEdits(prev => ({ ...prev, [groupKey(g)]: { ...DARK_MODERN_PRESET } }));
  };

  const applyPresetToAllGeneric = () => {
    setEdits(prev => {
      const next = { ...prev };
      groups.filter(g => g.count > 1).forEach(g => {
        next[groupKey(g)] = { ...DARK_MODERN_PRESET };
      });
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!file) return;
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const colorRules = groups.map(g => {
        const e = edits[groupKey(g)];
        return {
          element_type: g.element_type,
          color: g.color,
          color_to: g.color_to,
          font_color: g.font_color,
          new_color: e?.new_color,
          new_color_to: e?.new_color_to,
          new_font_color: e?.new_font_color
        };
      });

      const roundingVal = rounding.trim() === '' ? null : parseInt(rounding, 10);

      const backgroundPayload = {
        color: bgColor,
        opacity: bgOpacity,
        stretch: bgStretch,
        image_base64: bgImageBase64
      };

      const shortcutPayload = shortcuts.map(s => ({
        button_type: s.button_type,
        caption: s.caption,
        color: s.color,
        color_to: s.color_to,
        font_color: s.font_color,
        function_id: s.function_id,
        function_name: s.function_name,
        parameters: s.parameters,
        left: s.left,
        top: s.top,
        width: s.width,
        height: s.height
      }));

      const panelsPayload = {
        add_retail_panel: addRetailPanel,
        add_function_panel: addFunctionPanel,
        add_payment_panel: addPaymentPanel
      };

      const formData = new FormData();
      formData.append('file', file);
      formData.append('rules', JSON.stringify({
        color_rules: colorRules,
        rounding: roundingVal,
        background: backgroundPayload,
        shortcut_buttons: shortcutPayload,
        panels: panelsPayload
      }));

      const res = await fetch('/api/zstheme/transform', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.detail || 'Não foi possível gerar o novo tema.');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const outName = match ? match[1] : (file.name.replace(/\.zstheme$/i, '') + '_novo.zstheme');

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      onSuccess(`Novo tema "${outName}" gerado e transferido com sucesso!`);
    } catch (err) {
      setErrorMsg('Falha de rede ao gerar o novo tema.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-600 text-white rounded-xl shadow-md shadow-violet-600/20">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Editor Avançado de Temas ZSRest (.zstheme)</h2>
              <p className="text-xs text-slate-500 font-medium">
                Personalização completa do FrontOffice Designer da ZoneSoft
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload bar */}
        <div className="px-6 py-3 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between gap-4">
          {!file ? (
            <label className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs rounded-lg cursor-pointer transition shadow-xs">
              <Upload className="w-4 h-4" /> Escolher ficheiro .zstheme
              <input
                type="file"
                accept=".zstheme"
                className="hidden"
                onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
              />
            </label>
          ) : (
            <div className="flex items-center gap-3 w-full justify-between">
              <span className="text-xs font-semibold text-slate-700 truncate bg-white px-3 py-1.5 rounded border border-slate-200 shadow-2xs">
                📄 {file.name}
              </span>
              <button
                onClick={() => handleFileSelected(null)}
                className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-white px-3 py-1.5 rounded border border-rose-200"
              >
                Trocar ficheiro
              </button>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="mx-6 mt-3 flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-3 py-2 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            {errorMsg}
          </div>
        )}

        {isAnalyzing && (
          <div className="flex-1 flex items-center justify-center py-12 text-slate-500 text-xs gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-violet-600" /> A analisar e descompactar o ficheiro .zstheme...
          </div>
        )}

        {!isAnalyzing && !file && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
            <Palette className="w-12 h-12 mb-3 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">Selecione um ficheiro .zstheme para começar</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              Poderá alterar cores, cantos arredondados, fundo personalizado, criar botões de atalho com desconto ou links e adicionar painéis rápidos de pagamento e retalho.
            </p>
          </div>
        )}

        {!isAnalyzing && file && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs Header */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-6 gap-2 pt-2">
              <button
                onClick={() => setActiveTab('colors')}
                className={`flex items-center gap-2 px-4 py-2.5 font-bold text-xs border-b-2 transition ${
                  activeTab === 'colors'
                    ? 'border-violet-600 text-violet-700 bg-white rounded-t-lg'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Palette className="w-4 h-4" /> Cores & Estilos
              </button>
              <button
                onClick={() => setActiveTab('background')}
                className={`flex items-center gap-2 px-4 py-2.5 font-bold text-xs border-b-2 transition ${
                  activeTab === 'background'
                    ? 'border-violet-600 text-violet-700 bg-white rounded-t-lg'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <ImageIcon className="w-4 h-4" /> Fundo da Skin
              </button>
              <button
                onClick={() => setActiveTab('shortcuts')}
                className={`flex items-center gap-2 px-4 py-2.5 font-bold text-xs border-b-2 transition ${
                  activeTab === 'shortcuts'
                    ? 'border-violet-600 text-violet-700 bg-white rounded-t-lg'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-4 h-4" /> Botões & Atalhos ({shortcuts.length})
              </button>
              <button
                onClick={() => setActiveTab('panels')}
                className={`flex items-center gap-2 px-4 py-2.5 font-bold text-xs border-b-2 transition ${
                  activeTab === 'panels'
                    ? 'border-violet-600 text-violet-700 bg-white rounded-t-lg'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-4 h-4" /> Pastas & Painéis
              </button>
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* TAB 1: CORES & ESTILOS */}
              {activeTab === 'colors' && (
                <div className="space-y-5">
                  {thumbnail && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden max-w-sm">
                      <img src={`data:image/png;base64,${thumbnail}`} alt="Pré-visualização" className="w-full" />
                      <p className="text-[10px] text-slate-400 px-2 py-1 bg-slate-50">Miniatura original do tema</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Grupos de cor detetados ({groups.length})
                    </h3>
                    <button
                      type="button"
                      onClick={applyPresetToAllGeneric}
                      className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shadow-xs"
                    >
                      <Palette className="w-3.5 h-3.5" />
                      Preset "Escuro Moderno" em grupos repetidos
                    </button>
                  </div>

                  <div className="space-y-2">
                    {groups.map(g => {
                      const key = groupKey(g);
                      const e = edits[key] || DARK_MODERN_PRESET;
                      return (
                        <div key={key} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-2.5 flex-wrap">
                          <div className="w-36 shrink-0">
                            <div className="text-xs font-bold text-slate-800">{g.element_type}</div>
                            <div className="text-[10px] text-slate-400">{g.count} ocorrência(s)</div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500 font-semibold">Fundo</span>
                            <input
                              type="color"
                              value={e.new_color}
                              onChange={(ev) => setEdits(prev => ({ ...prev, [key]: { ...prev[key], new_color: ev.target.value } }))}
                              className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500 font-semibold">Gradiente</span>
                            <input
                              type="color"
                              value={e.new_color_to}
                              onChange={(ev) => setEdits(prev => ({ ...prev, [key]: { ...prev[key], new_color_to: ev.target.value } }))}
                              className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500 font-semibold">Texto</span>
                            <input
                              type="color"
                              value={e.new_font_color}
                              onChange={(ev) => setEdits(prev => ({ ...prev, [key]: { ...prev[key], new_font_color: ev.target.value } }))}
                              className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => applyPresetToGroup(g)}
                            className="text-[10px] font-bold text-violet-700 hover:text-violet-900 ml-auto"
                          >
                            Usar preset escuro
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <label className="text-xs font-bold text-slate-700">Arredondamento dos cantos (px)</label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={rounding}
                      onChange={(e) => setRounding(e.target.value)}
                      className="w-24 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold"
                      placeholder="ex: 14"
                    />
                    <span className="text-[11px] text-slate-500">
                      Aplica o valor de arredondamento a botões e listas do ecrã.
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 2: FUNDO DA SKIN */}
              {activeTab === 'background' && (
                <div className="space-y-5 max-w-xl">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-violet-600" /> Cor e Opacidade de Fundo
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Cor do Fundo</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={bgColor}
                            onChange={(e) => setBgColor(e.target.value)}
                            className="w-10 h-10 rounded border border-slate-300 cursor-pointer"
                          />
                          <span className="text-xs font-mono font-bold text-slate-700">{bgColor}</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Opacidade ({bgOpacity}%)</label>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={bgOpacity}
                          onChange={(e) => setBgOpacity(parseInt(e.target.value, 10))}
                          className="w-full accent-violet-600 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-violet-600" /> Imagem de Fundo Personalizada
                    </h3>

                    <div>
                      <label className="flex items-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition bg-white">
                        <Upload className="w-5 h-5 text-slate-400" />
                        <span className="text-xs font-bold text-slate-700">
                          {bgFileName ? bgFileName : 'Carregar imagem de fundo (.png, .jpg)'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleBgImageUpload}
                        />
                      </label>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        id="bgStretch"
                        checked={bgStretch}
                        onChange={(e) => setBgStretch(e.target.checked)}
                        className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                      />
                      <label htmlFor="bgStretch" className="text-xs font-bold text-slate-700 cursor-pointer">
                        Esticar imagem para preencher o ecrã completo (BackgroundStretch)
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: BOTÕES & ATALHOS */}
              {activeTab === 'shortcuts' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl p-3">
                    <span className="text-xs font-bold text-violet-900">Adicionar novo botão de atalho parametrizado:</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => addShortcutButton('discount')}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition"
                      >
                        <DollarSign className="w-3.5 h-3.5" /> Desconto € (ID 179)
                      </button>
                      <button
                        type="button"
                        onClick={() => addShortcutButton('link')}
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition"
                      >
                        <LinkIcon className="w-3.5 h-3.5" /> Link Web (ID 217)
                      </button>
                      <button
                        type="button"
                        onClick={() => addShortcutButton('exe')}
                        className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition"
                      >
                        <Terminal className="w-3.5 h-3.5" /> Programa .exe (ID 128)
                      </button>
                      <button
                        type="button"
                        onClick={() => addShortcutButton('function')}
                        className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Função POS
                      </button>
                    </div>
                  </div>

                  {shortcuts.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-300">
                      Nenhum botão de atalho personalizado adicionado. Clique acima para injetar botões especiais de desconto, links web ou funções no tema.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {shortcuts.map(s => (
                        <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-3 shadow-2xs">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                              {s.button_type === 'discount' && 'Atalho: Desconto Direto'}
                              {s.button_type === 'link' && 'Atalho: Link Externo'}
                              {s.button_type === 'exe' && 'Atalho: Programa Externo'}
                              {s.button_type === 'function' && 'Atalho: Função ZoneSoft'}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeShortcut(s.id)}
                              className="text-rose-600 hover:text-rose-800 text-xs font-bold flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Remover
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">Título do Botão</label>
                              <input
                                type="text"
                                value={s.caption}
                                onChange={(e) => updateShortcut(s.id, { caption: e.target.value })}
                                className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold"
                              />
                            </div>

                            {s.button_type === 'function' && (
                              <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Função ZoneSoft</label>
                                <select
                                  value={s.function_id || 38}
                                  onChange={(e) => {
                                    const fid = parseInt(e.target.value, 10);
                                    const found = PRESET_FUNCTIONS.find(p => p.id === fid);
                                    updateShortcut(s.id, {
                                      function_id: fid,
                                      function_name: found?.name || '',
                                      caption: found?.name || s.caption
                                    });
                                  }}
                                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold"
                                >
                                  {PRESET_FUNCTIONS.map(pf => (
                                    <option key={pf.id} value={pf.id}>
                                      {pf.name} (ID {pf.id})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {(s.button_type === 'discount' || s.button_type === 'link' || s.button_type === 'exe') && (
                              <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                  {s.button_type === 'discount' && 'Valor do Desconto em Euros (€)'}
                                  {s.button_type === 'link' && 'URL do Website'}
                                  {s.button_type === 'exe' && 'Caminho do Ficheiro Executável (.exe)'}
                                </label>
                                <input
                                  type="text"
                                  value={s.parameters || ''}
                                  onChange={(e) => updateShortcut(s.id, { parameters: e.target.value })}
                                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold"
                                  placeholder={
                                    s.button_type === 'discount'
                                      ? 'ex: 5.00'
                                      : s.button_type === 'link'
                                      ? 'https://google.com'
                                      : 'C:\\Windows\\System32\\calc.exe'
                                  }
                                />
                              </div>
                            )}

                            <div className="flex items-center gap-2 pt-3">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-500">Cor</span>
                                <input
                                  type="color"
                                  value={s.color}
                                  onChange={(e) => updateShortcut(s.id, { color: e.target.value })}
                                  className="w-6 h-6 rounded border cursor-pointer"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-500">Texto</span>
                                <input
                                  type="color"
                                  value={s.font_color}
                                  onChange={(e) => updateShortcut(s.id, { font_color: e.target.value })}
                                  className="w-6 h-6 rounded border cursor-pointer"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: PASTAS & PAINÉIS */}
              {activeTab === 'panels' && (
                <div className="space-y-4 max-w-xl">
                  <p className="text-xs text-slate-500 font-medium">
                    Selecione quais os painéis funcionais rápidos que pretende que o ZoneSoft FrontOffice injete automaticamente na skin:
                  </p>

                  <div className="space-y-3">
                    <label className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 cursor-pointer hover:bg-slate-100 transition">
                      <input
                        type="checkbox"
                        checked={addRetailPanel}
                        onChange={(e) => setAddRetailPanel(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Painel de Retalho (`ZSRetailPOSPanel`)</span>
                        <span className="text-[11px] text-slate-500">
                          Inclui leitor de código de barras e pesquisa rápida de artigos de retalho.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 cursor-pointer hover:bg-slate-100 transition">
                      <input
                        type="checkbox"
                        checked={addFunctionPanel}
                        onChange={(e) => setAddFunctionPanel(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Painel de Funções Rápidas (`ZSFunctionPanel`)</span>
                        <span className="text-[11px] text-slate-500">
                          Ações frequentes do operador como Abertura de Gaveta, Troca de Operador, etc.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 cursor-pointer hover:bg-slate-100 transition">
                      <input
                        type="checkbox"
                        checked={addPaymentPanel}
                        onChange={(e) => setAddPaymentPanel(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Painel de Pagamentos Instantâneos (`ZSPaymentPanel`)</span>
                        <span className="text-[11px] text-slate-500">
                          Finalização direta de documento (Numerário, Multibanco, MB WAY, Fatura simplificada).
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition">
            Fechar
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!file || groups.length === 0 || isGenerating}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold px-4 py-1.5 rounded-lg shadow-2xs transition text-xs"
          >
            {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Gerar e Transferir Novo Tema
          </button>
        </div>
      </div>
    </div>
  );
};
