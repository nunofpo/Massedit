import React, { useState } from 'react';
import { X, Upload, Download, RefreshCw, Palette, AlertCircle } from 'lucide-react';

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

const DARK_MODERN_PRESET = { new_color: '#2C2C30', new_color_to: '#1F1F22', new_font_color: '#F2F2F2' };

export const ZSThemeModal: React.FC<ZSThemeModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [groups, setGroups] = useState<ColorGroup[]>([]);
  const [edits, setEdits] = useState<Record<string, GroupEdit>>({});
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [rounding, setRounding] = useState<string>('14');
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

      // Inicializa os editores de cada grupo com os valores atuais (sem alteração até o utilizador mexer)
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

  const applyPresetToGroup = (g: ColorGroup) => {
    setEdits(prev => ({ ...prev, [groupKey(g)]: { ...DARK_MODERN_PRESET } }));
  };

  const applyPresetToAllGeneric = () => {
    // Aplica o preset escuro moderno a todos os grupos com mais do que 1 ocorrência
    // (tipicamente os estilos "genéricos" repetidos, não os botões já com cor própria)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-600 text-white rounded-xl shadow-md shadow-violet-600/20">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Editor de Temas ZSRest</h2>
              <p className="text-xs text-slate-500 font-medium">
                Recolorir e arredondar botões de um ficheiro .zstheme do ZS FrontOffice Designer
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {!file && (
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-10 cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition">
              <Upload className="w-8 h-8 text-slate-400" />
              <span className="text-sm font-bold text-slate-700">Escolher ficheiro .zstheme</span>
              <span className="text-xs text-slate-400">Exportado pelo Zone Soft FrontOffice Designer</span>
              <input
                type="file"
                accept=".zstheme"
                className="hidden"
                onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
              />
            </label>
          )}

          {file && (
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-slate-700 truncate">{file.name}</span>
              <button
                onClick={() => handleFileSelected(null)}
                className="text-xs font-bold text-rose-600 hover:text-rose-800"
              >
                Trocar ficheiro
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              {errorMsg}
            </div>
          )}

          {isAnalyzing && (
            <div className="flex items-center justify-center py-8 text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> A analisar o tema...
            </div>
          )}

          {!isAnalyzing && groups.length > 0 && (
            <>
              {thumbnail && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <img src={`data:image/png;base64,${thumbnail}`} alt="Pré-visualização do tema atual" className="w-full" />
                  <p className="text-[10px] text-slate-400 px-2 py-1">Pré-visualização do tema atual (miniatura guardada no ficheiro)</p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Grupos de cor detetados ({groups.length})
                </h3>
                <button
                  type="button"
                  onClick={applyPresetToAllGeneric}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                >
                  <Palette className="w-3.5 h-3.5" />
                  Aplicar preset "Escuro Moderno" aos grupos repetidos
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
                        <span className="text-[10px] text-slate-500">Fundo</span>
                        <input
                          type="color"
                          value={e.new_color}
                          onChange={(ev) => setEdits(prev => ({ ...prev, [key]: { ...prev[key], new_color: ev.target.value } }))}
                          className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500">Fundo (gradiente)</span>
                        <input
                          type="color"
                          value={e.new_color_to}
                          onChange={(ev) => setEdits(prev => ({ ...prev, [key]: { ...prev[key], new_color_to: ev.target.value } }))}
                          className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500">Texto</span>
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
                  Aplicado só a botões/listas que ainda não têm um valor definido (não mexe nos já circulares).
                </span>
              </div>
            </>
          )}
        </div>

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
