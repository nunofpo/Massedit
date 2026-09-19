import React, { useState } from 'react';
import { X, Upload, Download, RefreshCw, Palette, AlertCircle, Sparkles, Sliders, Check, FileCode, Unlock, Key, Copy } from 'lucide-react';

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

const groupKey = (g: { element_type: string; color: string | null; color_to: string | null; font_color: string | null }) =>
  `${g.element_type}|${g.color}|${g.color_to}|${g.font_color}`;

const THEME_PRESETS = [
  { id: 'dark', name: '🌙 Dark Elegant', color: '#1E1E22', color_to: '#2D2D32', font_color: '#FFFFFF' },
  { id: 'teal', name: '🌿 Teal Minimalist', color: '#0F4C5C', color_to: '#1D7082', font_color: '#FFFFFF' },
  { id: 'bistro', name: '☕ Café & Bistro', color: '#3D2612', color_to: '#5C3D2E', font_color: '#F7EBE1' },
  { id: 'night', name: '🍷 Bar & Nightlife', color: '#1A0B2E', color_to: '#2B1B4D', font_color: '#E2D9F3' },
  { id: 'light', name: '☀️ Clean Light', color: '#F8FAFC', color_to: '#E2E8F0', font_color: '#0F172A' },
];

export const ZSThemeModal: React.FC<ZSThemeModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [groups, setGroups] = useState<ColorGroup[]>([]);
  const [edits, setEdits] = useState<Record<string, GroupEdit>>({});
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [rounding, setRounding] = useState<string>('14');
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [xdlDecryptedResult, setXdlDecryptedResult] = useState<{
    filename: string;
    plain_text: string;
    config: { server: string; database: string; username: string; password: string };
    passwords_found: string[];
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const handleDirectXdlDecrypt = async (selected: File | null) => {
    if (!selected) return;
    setIsAnalyzing(true);
    setErrorMsg(null);
    setXdlDecryptedResult(null);
    try {
      const formData = new FormData();
      formData.append('file', selected);
      const res = await fetch('/api/xdl/parse-config', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.detail || 'Erro ao desencriptar o ficheiro .xdl.');
        return;
      }
      const data = await res.json();
      setXdlDecryptedResult(data);

      // Descarregar ficheiro .xml como antes
      const blob = new Blob([data.plain_text], { type: 'application/xml;charset=utf-8' });
      const outName = selected.name.replace(/\.xdl$/i, '') + '.xml';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const foundPwd = data.config?.password || (data.passwords_found && data.passwords_found[0]);
      if (foundPwd) {
        onSuccess(`Ficheiro .xdl desencriptado! Palavra-passe detetada: "${foundPwd}"`);
      } else {
        onSuccess(`Ficheiro .xdl desencriptado e guardado como "${outName}" com sucesso!`);
      }
    } catch (err) {
      setErrorMsg('Falha de rede ao desencriptar o ficheiro .xdl.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileSelected = async (selected: File | null) => {
    setErrorMsg(null);
    setGroups([]);
    setEdits({});
    setThumbnail(null);
    setActivePreset(null);
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

  const applyPresetToAll = (preset: typeof THEME_PRESETS[0]) => {
    setActivePreset(preset.id);
    setEdits(prev => {
      const next = { ...prev };
      groups.forEach(g => {
        next[groupKey(g)] = {
          new_color: preset.color,
          new_color_to: preset.color_to,
          new_font_color: preset.font_color
        };
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

      const formData = new FormData();
      formData.append('file', file);
      formData.append('rules', JSON.stringify({ color_rules: colorRules, rounding: roundingVal }));

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

  // Render Sample Live Preview for a group
  const renderSampleButton = (label: string, edit?: GroupEdit) => {
    const c1 = edit?.new_color || '#2C2C30';
    const c2 = edit?.new_color_to || c1;
    const fontC = edit?.new_font_color || '#FFFFFF';
    const borderRadius = `${parseInt(rounding || '14', 10)}px`;

    return (
      <div
        style={{
          background: `linear-gradient(135deg, ${c1}, ${c2})`,
          color: fontC,
          borderRadius: borderRadius
        }}
        className="px-3 py-2.5 shadow-md flex items-center justify-center text-center font-bold text-xs cursor-default transition-all duration-200 border border-white/10 select-none min-h-[44px]"
      >
        <span>{label}</span>
      </div>
    );
  };

  const sampleGroup = groups[0] ? edits[groupKey(groups[0])] : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-600 text-white rounded-xl shadow-md shadow-violet-600/20">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Editor de Temas ZSRest
                <span className="text-[10px] font-mono uppercase bg-violet-100 text-violet-800 border border-violet-200 px-2 py-0.5 rounded-full font-bold">
                  .zstheme
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Personalização de cores, gradientes, cantos arredondados e presets para o ZoneSoft POS
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!file && (
            <div className="space-y-5">
              <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl p-8 cursor-pointer hover:border-violet-500 hover:bg-violet-50/50 transition group">
                <div className="p-3.5 bg-violet-50 group-hover:bg-violet-100 rounded-2xl text-violet-600 transition">
                  <Upload className="w-7 h-7" />
                </div>
                <div className="text-center">
                  <span className="text-sm font-bold text-slate-800 block">Escolher ficheiro .zstheme / .xdl para editar cores</span>
                  <span className="text-xs text-slate-400 block mt-0.5">Ficheiro de tema ou layout exportado pelo ZoneSoft FrontOffice Designer</span>
                </div>
                <input
                  type="file"
                  accept=".zstheme,.xdl"
                  className="hidden"
                  onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
                />
              </label>

              {/* Painel de Desencriptação Direta de Ficheiros .xdl */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 bg-amber-600 text-white rounded-xl shadow-md shadow-amber-600/20 shrink-0">
                    <FileCode className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      Desencriptar Ficheiro .xdl em 1 Clique
                      <span className="text-[10px] bg-amber-200 text-amber-900 font-mono px-2 py-0.5 rounded-md font-extrabold">Zone Soft Data Link</span>
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Selecione qualquer ficheiro <code className="bg-amber-100/80 px-1 py-0.5 rounded text-amber-900 font-mono text-[11px]">.xdl</code> à sua escolha para obter o XML/texto desencriptado imediatamente.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-md shadow-amber-600/20 transition shrink-0">
                  <Unlock className="w-4 h-4" />
                  Escolher Ficheiro .xdl
                  <input
                    type="file"
                    accept=".xdl"
                    className="hidden"
                    onChange={(e) => handleDirectXdlDecrypt(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              {xdlDecryptedResult && (
                <div className="bg-slate-900 text-white border border-amber-500/40 rounded-2xl p-4 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Key className="w-5 h-5 text-amber-400" />
                      <div>
                        <h4 className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">
                          Resultado da Desencriptação XDL: {xdlDecryptedResult.filename}
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          Ficheiro desencriptado com sucesso. Dados de ligação e texto XML abaixo:
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setXdlDecryptedResult(null)}
                      className="text-xs text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded-lg"
                    >
                      Fechar
                    </button>
                  </div>

                  {(xdlDecryptedResult.config?.password || (xdlDecryptedResult.passwords_found && xdlDecryptedResult.passwords_found.length > 0)) && (
                    <div className="bg-amber-950/80 border border-amber-500/50 rounded-xl p-3 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-amber-300 block">Palavra-passe SQL Desencriptada</span>
                        <code className="text-base font-black text-amber-400 font-mono tracking-wide">
                          {xdlDecryptedResult.config?.password || xdlDecryptedResult.passwords_found[0]}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const pwd = xdlDecryptedResult.config?.password || xdlDecryptedResult.passwords_found[0];
                          navigator.clipboard.writeText(pwd);
                          setCopiedKey(true);
                          setTimeout(() => setCopiedKey(false), 2000);
                        }}
                        className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black px-3 py-1.5 rounded-lg shadow-md transition"
                      >
                        {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKey ? 'Copiado!' : 'Copiar Palavra-passe'}
                      </button>
                    </div>
                  )}

                  {xdlDecryptedResult.config && (xdlDecryptedResult.config.server || xdlDecryptedResult.config.database) && (
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <div><span className="text-slate-500 block text-[10px] font-sans font-bold">Servidor</span><span className="text-slate-200 font-bold">{xdlDecryptedResult.config.server || '-'}</span></div>
                      <div><span className="text-slate-500 block text-[10px] font-sans font-bold">Base de Dados</span><span className="text-slate-200 font-bold">{xdlDecryptedResult.config.database || '-'}</span></div>
                      <div><span className="text-slate-500 block text-[10px] font-sans font-bold">Utilizador</span><span className="text-slate-200 font-bold">{xdlDecryptedResult.config.username || '-'}</span></div>
                    </div>
                  )}

                  <div>
                    <span className="text-[11px] font-bold text-slate-400 block mb-1">Conteúdo XML Completo Desencriptado:</span>
                    <textarea
                      readOnly
                      rows={6}
                      value={xdlDecryptedResult.plain_text}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-300 focus:outline-none leading-relaxed"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {file && (
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-violet-600" />
                <span className="text-xs font-bold text-slate-800 truncate">{file.name}</span>
              </div>
              <button
                onClick={() => handleFileSelected(null)}
                className="text-xs font-bold text-rose-600 hover:text-rose-800"
              >
                Trocar ficheiro
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-3 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          {isAnalyzing && (
            <div className="flex items-center justify-center py-12 text-slate-400 text-xs gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-violet-600" /> A analisar estrutura e grupos de cores do .zstheme...
            </div>
          )}

          {!isAnalyzing && groups.length > 0 && (
            <>
              {/* Theme Presets Row */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Paletas de Cores Pré-definidas (Presets de 1 Clique)
                  </h3>
                  <span className="text-[11px] text-slate-500 font-semibold">
                    Aplica o estilo visual a todos os {groups.length} grupos
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {THEME_PRESETS.map(preset => {
                    const isActive = activePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPresetToAll(preset)}
                        className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between gap-2 relative ${
                          isActive
                            ? 'bg-violet-50 border-violet-500 text-violet-900 shadow-sm ring-2 ring-violet-500/20'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-violet-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-[11px] font-bold flex items-center justify-between">
                          <span>{preset.name}</span>
                          {isActive && <Check className="w-3.5 h-3.5 text-violet-600 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-4 h-4 rounded-full border border-slate-300" style={{ backgroundColor: preset.color }} title="Cor 1" />
                          <div className="w-4 h-4 rounded-full border border-slate-300" style={{ backgroundColor: preset.color_to }} title="Cor 2" />
                          <div className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center font-bold text-[8px]" style={{ backgroundColor: preset.font_color, color: preset.color }} title="Texto">
                            T
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Simulated POS Live Buttons Preview Canvas */}
              <div className="bg-slate-900 text-white border border-slate-800 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <Sliders className="w-4 h-4" />
                    Simulação Interativa em Tempo Real (Botões POS)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Cantos: {rounding || 0}px
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  {renderSampleButton('CANCELAR ARTIGO', sampleGroup)}
                  {renderSampleButton('BEBIDAS / BEER', sampleGroup)}
                  {renderSampleButton('MULTIBANCO (MB)', sampleGroup)}
                  {renderSampleButton('HAFEN BRAU 50CL', sampleGroup)}
                </div>
              </div>

              {/* Cantos Arredondados Global */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex-wrap gap-3">
                <div>
                  <label className="text-xs font-extrabold text-slate-800 block">
                    Arredondamento dos Cantos dos Botões (px)
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Aplica raio suave aos cantos dos botões e lista de produtos do POS.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {[0, 8, 14, 20, 28].map(px => (
                    <button
                      key={px}
                      type="button"
                      onClick={() => setRounding(px.toString())}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition ${
                        rounding === px.toString()
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {px}px
                    </button>
                  ))}
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={rounding}
                    onChange={(e) => setRounding(e.target.value)}
                    className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-center"
                    placeholder="14"
                  />
                </div>
              </div>

              {/* Thumbnail Original (If present) */}
              {thumbnail && (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                  <div className="px-3 py-1.5 border-b border-slate-200 text-[11px] font-bold text-slate-600 flex items-center justify-between">
                    <span>Miniatura Original do Ficheiro .zstheme</span>
                    <span className="text-[10px] text-slate-400 font-mono">__thumbnail.png</span>
                  </div>
                  <img src={`data:image/png;base64,${thumbnail}`} alt="Pré-visualização do tema atual" className="w-full max-h-[160px] object-contain p-2" />
                </div>
              )}

              {/* Detailed Groups Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Detalhamento de Grupos de Cores ({groups.length})
                </h3>

                {groups.map(g => {
                  const key = groupKey(g);
                  const e = edits[key] || {
                    new_color: g.color || '#FFFFFF',
                    new_color_to: g.color_to || '#FFFFFF',
                    new_font_color: g.font_color || '#000000'
                  };
                  return (
                    <div key={key} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3 flex-wrap justify-between shadow-2xs hover:border-slate-300 transition">
                      <div className="w-44 shrink-0">
                        <div className="text-xs font-bold text-slate-900">{g.element_type}</div>
                        <div className="text-[10px] text-slate-400 font-medium">{g.count} elemento(s) neste grupo</div>
                      </div>

                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-600">Cor Fundo:</span>
                          <input
                            type="color"
                            value={e.new_color}
                            onChange={(ev) => {
                              setActivePreset(null);
                              setEdits(prev => ({ ...prev, [key]: { ...prev[key], new_color: ev.target.value } }));
                            }}
                            className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-600">Gradiente:</span>
                          <input
                            type="color"
                            value={e.new_color_to}
                            onChange={(ev) => {
                              setActivePreset(null);
                              setEdits(prev => ({ ...prev, [key]: { ...prev[key], new_color_to: ev.target.value } }));
                            }}
                            className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-600">Cor Texto:</span>
                          <input
                            type="color"
                            value={e.new_font_color}
                            onChange={(ev) => {
                              setActivePreset(null);
                              setEdits(prev => ({ ...prev, [key]: { ...prev[key], new_font_color: ev.target.value } }));
                            }}
                            className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition">
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!file || groups.length === 0 || isGenerating}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl shadow-md shadow-violet-600/20 transition text-xs"
          >
            {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Gerar e Descarregar Ficheiro .zstheme
          </button>
        </div>

      </div>
    </div>
  );
};
