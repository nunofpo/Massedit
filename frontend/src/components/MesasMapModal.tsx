import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, RefreshCw, MapPin, AlertCircle, Sparkles, Check, Upload, Move, Palette } from 'lucide-react';

interface MesasMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

interface ZonaSummary {
  codigo: number;
  descricao: string;
  width: number;
  height: number;
  has_background: boolean;
}

interface ObjetoMesa {
  id: number;
  nome: string;
  posx: number;
  posy: number;
  altura: number;
  largura: number;
  tipoobjecto: number;
  lugares: number;
  cor_hex: string;
  imagem_base64: string | null;
}

interface ZonaDetail {
  available: boolean;
  codigo: number;
  descricao: string;
  width: number;
  height: number;
  background_base64: string | null;
  objetos: ObjetoMesa[];
}

type Tab = 'preset' | 'editor';

export const MesasMapModal: React.FC<MesasMapModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [zonas, setZonas] = useState<ZonaSummary[]>([]);
  const [selectedZona, setSelectedZona] = useState<number | null>(null);
  const [isLoadingZonas, setIsLoadingZonas] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('preset');

  // Preset tab state
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [antes, setAntes] = useState<string | null>(null);
  const [depois, setDepois] = useState<string | null>(null);
  const [objetosCount, setObjetosCount] = useState<number>(0);

  // Editor tab state
  const [zonaDetail, setZonaDetail] = useState<ZonaDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [positions, setPositions] = useState<Record<number, { posx: number; posy: number }>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());
  const [selectedObjId, setSelectedObjId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ lugares: string; cor_hex: string; largura: string; altura: string }>({
    lugares: '', cor_hex: '#8B8578', largura: '', altura: ''
  });
  const [isSavingPositions, setIsSavingPositions] = useState(false);
  const [isSavingObjeto, setIsSavingObjeto] = useState(false);
  const [isUploadingImagem, setIsUploadingImagem] = useState(false);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [tileBg, setTileBg] = useState(false);

  const dragRef = useRef<{ id: number; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setAntes(null);
    setDepois(null);
    setErrorMsg(null);
    setZonaDetail(null);
    setSelectedObjId(null);
    setIsLoadingZonas(true);
    fetch('/api/mesas-map/zonas')
      .then(res => res.json())
      .then((data: ZonaSummary[]) => {
        setZonas(data || []);
        if (data && data.length > 0) setSelectedZona(data[0].codigo);
      })
      .catch(() => setErrorMsg('Falha de rede ao carregar as zonas.'))
      .finally(() => setIsLoadingZonas(false));
  }, [isOpen]);

  const loadZonaDetail = useCallback(async (codigo: number) => {
    setIsLoadingDetail(true);
    setErrorMsg(null);
    setSelectedObjId(null);
    try {
      const res = await fetch(`/api/mesas-map/zona/${codigo}`);
      const data: ZonaDetail = await res.json();
      if (!res.ok || !data.available) {
        setErrorMsg((data as any).detail || (data as any).message || 'Não foi possível carregar esta zona.');
        setZonaDetail(null);
        return;
      }
      setZonaDetail(data);
      const pos: Record<number, { posx: number; posy: number }> = {};
      data.objetos.forEach(o => { pos[o.id] = { posx: o.posx, posy: o.posy }; });
      setPositions(pos);
      setDirtyIds(new Set());
    } catch (err) {
      setErrorMsg('Falha de rede ao carregar a zona.');
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'editor' && selectedZona !== null) {
      loadZonaDetail(selectedZona);
    }
  }, [tab, selectedZona, loadZonaDetail]);

  const handlePreview = async () => {
    if (selectedZona === null) return;
    setIsPreviewing(true);
    setErrorMsg(null);
    setAntes(null);
    setDepois(null);
    try {
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/preview-preset`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.available === false) {
        setErrorMsg(data.detail || data.message || 'Não foi possível gerar a pré-visualização.');
        return;
      }
      setAntes(data.antes_base64);
      setDepois(data.depois_base64);
      setObjetosCount(data.objetos_count || 0);
    } catch (err) {
      setErrorMsg('Falha de rede ao gerar a pré-visualização.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleApplyPreset = async () => {
    if (selectedZona === null) return;
    setIsApplying(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/apply-preset`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.detail || data.message || 'Não foi possível aplicar o preset.');
        return;
      }
      onSuccess(data.message);
      setAntes(null);
      setDepois(null);
    } catch (err) {
      setErrorMsg('Falha de rede ao aplicar o preset.');
    } finally {
      setIsApplying(false);
    }
  };

  // --- Editor visual: arrastar objetos ---
  const handlePointerDown = (obj: ObjetoMesa, e: React.PointerEvent) => {
    e.stopPropagation();
    setSelectedObjId(obj.id);
    setEditForm({
      lugares: String(obj.lugares || ''),
      cor_hex: obj.cor_hex && obj.cor_hex !== '#000000' ? obj.cor_hex : '#8B8578',
      largura: String(obj.largura || ''),
      altura: String(obj.altura || '')
    });
    const pos = positions[obj.id] || { posx: obj.posx, posy: obj.posy };
    dragRef.current = { id: obj.id, startX: e.clientX, startY: e.clientY, origX: pos.posx, origY: pos.posy, moved: false };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handlePointerMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;
    setPositions(prev => ({ ...prev, [d.id]: { posx: d.origX + dx, posy: d.origY + dy } }));
  };

  const handlePointerUp = () => {
    const d = dragRef.current;
    if (d && d.moved) {
      setDirtyIds(prev => new Set(prev).add(d.id));
    }
    dragRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  };

  const handleSavePositions = async () => {
    if (selectedZona === null || dirtyIds.size === 0) return;
    setIsSavingPositions(true);
    setErrorMsg(null);
    try {
      const updates = Array.from(dirtyIds).map(id => ({ id, ...positions[id] }));
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/posicoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.detail || data.message || 'Não foi possível gravar as posições.');
        return;
      }
      onSuccess(data.message);
      setDirtyIds(new Set());
    } catch (err) {
      setErrorMsg('Falha de rede ao gravar as posições.');
    } finally {
      setIsSavingPositions(false);
    }
  };

  const handleSaveObjeto = async () => {
    if (selectedZona === null || selectedObjId === null) return;
    setIsSavingObjeto(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/objeto/${selectedObjId}/props`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lugares: editForm.lugares ? parseInt(editForm.lugares, 10) : null,
          cor_hex: editForm.cor_hex || null,
          largura: editForm.largura ? parseInt(editForm.largura, 10) : null,
          altura: editForm.altura ? parseInt(editForm.altura, 10) : null
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.detail || data.message || 'Não foi possível atualizar a mesa.');
        return;
      }
      onSuccess(data.message);
      if (selectedZona !== null) await loadZonaDetail(selectedZona);
    } catch (err) {
      setErrorMsg('Falha de rede ao atualizar a mesa.');
    } finally {
      setIsSavingObjeto(false);
    }
  };

  const handleUploadObjetoImagem = async (file: File) => {
    if (selectedZona === null || selectedObjId === null) return;
    setIsUploadingImagem(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/objeto/${selectedObjId}/imagem`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.detail || data.message || 'Não foi possível carregar a imagem.');
        return;
      }
      onSuccess(data.message);
      await loadZonaDetail(selectedZona);
    } catch (err) {
      setErrorMsg('Falha de rede ao carregar a imagem.');
    } finally {
      setIsUploadingImagem(false);
    }
  };

  const handleUploadBackground = async (file: File) => {
    if (selectedZona === null) return;
    setIsUploadingBg(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tile', String(tileBg));
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/background`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.detail || data.message || 'Não foi possível carregar o fundo.');
        return;
      }
      onSuccess(data.message);
      await loadZonaDetail(selectedZona);
    } catch (err) {
      setErrorMsg('Falha de rede ao carregar o fundo.');
    } finally {
      setIsUploadingBg(false);
    }
  };

  if (!isOpen) return null;

  const selectedObj = zonaDetail?.objetos.find(o => o.id === selectedObjId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-600/20">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Editor de Mapa de Mesas</h2>
              <p className="text-xs text-slate-500 font-medium">
                dbo.zonas / dbo.mapamesas
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-3 flex items-center gap-3 flex-wrap border-b border-slate-200 bg-white">
          <label className="text-xs font-bold text-slate-700">Zona:</label>
          {isLoadingZonas ? (
            <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
          ) : (
            <select
              value={selectedZona ?? ''}
              onChange={(e) => { setSelectedZona(Number(e.target.value)); setAntes(null); setDepois(null); }}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900"
            >
              {zonas.map(z => (
                <option key={z.codigo} value={z.codigo}>
                  {z.descricao} ({z.width}x{z.height}){!z.has_background ? ' — sem fundo' : ''}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1 ml-4">
            <button
              type="button"
              onClick={() => setTab('preset')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-bold transition ${tab === 'preset' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Aplicar Preset
            </button>
            <button
              type="button"
              onClick={() => setTab('editor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-bold transition ${tab === 'editor' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <Move className="w-3.5 h-3.5" /> Editor Visual
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-3 flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-3 py-2 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            {errorMsg}
          </div>
        )}

        {tab === 'preset' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <button
              type="button"
              onClick={handlePreview}
              disabled={selectedZona === null || isPreviewing}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg shadow-2xs transition text-xs"
            >
              {isPreviewing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Pré-visualizar Preset "Claro Moderno"
            </button>

            {zonas.length === 0 && !isLoadingZonas && !errorMsg && (
              <p className="text-xs text-slate-400">Esta base de dados não tem zonas de mapa de mesas configuradas.</p>
            )}

            {antes && depois && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Antes</div>
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                      <img src={`data:image/png;base64,${antes}`} alt="Mapa de mesas atual" className="w-full" />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Depois</div>
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                      <img src={`data:image/png;base64,${depois}`} alt="Mapa de mesas com o preset novo" className="w-full" />
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">{objetosCount} objeto(s) nesta zona serão atualizados.</p>
              </div>
            )}
          </div>
        )}

        {tab === 'editor' && (
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-auto p-6 bg-slate-100">
              {isLoadingDetail ? (
                <div className="flex items-center justify-center py-10 text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> A carregar...
                </div>
              ) : zonaDetail ? (
                <div
                  className="relative border border-slate-300 shadow-inner"
                  style={{
                    width: zonaDetail.width,
                    height: zonaDetail.height,
                    backgroundImage: zonaDetail.background_base64 ? `url(data:image/bmp;base64,${zonaDetail.background_base64})` : undefined,
                    backgroundRepeat: 'repeat',
                    backgroundColor: '#f3f1ec'
                  }}
                >
                  {zonaDetail.objetos.map(obj => {
                    const pos = positions[obj.id] || { posx: obj.posx, posy: obj.posy };
                    if (pos.posx === 0 && pos.posy === 0) return null;
                    const isSelected = obj.id === selectedObjId;
                    const isDirty = dirtyIds.has(obj.id);
                    return (
                      <div
                        key={obj.id}
                        onPointerDown={(e) => handlePointerDown(obj, e)}
                        className={`absolute cursor-move select-none flex items-center justify-center ${isSelected ? 'ring-2 ring-emerald-500' : isDirty ? 'ring-2 ring-amber-400' : ''}`}
                        style={{ left: pos.posx, top: pos.posy, width: obj.largura || undefined, height: obj.altura || undefined }}
                        title={obj.nome}
                      >
                        {obj.imagem_base64 ? (
                          <img src={`data:image/bmp;base64,${obj.imagem_base64}`} alt={obj.nome} className="w-full h-full pointer-events-none" draggable={false} />
                        ) : (
                          <div className="w-12 h-12 bg-white border border-slate-300 rounded flex items-center justify-center text-[10px] font-bold text-slate-500 pointer-events-none">
                            {obj.nome}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Seleciona uma zona.</p>
              )}
            </div>

            <div className="w-72 shrink-0 border-l border-slate-200 bg-white p-4 overflow-y-auto space-y-4">
              <div>
                <button
                  type="button"
                  onClick={handleSavePositions}
                  disabled={dirtyIds.size === 0 || isSavingPositions}
                  className="w-full flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-bold px-3 py-2 rounded-lg shadow-2xs transition text-xs"
                >
                  {isSavingPositions ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Guardar Posições {dirtyIds.size > 0 ? `(${dirtyIds.size})` : ''}
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fundo da Zona</h4>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <input type="checkbox" checked={tileBg} onChange={(e) => setTileBg(e.target.checked)} />
                  Repetir em mosaico (em vez de esticar)
                </label>
                <label className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2 rounded-lg transition text-xs cursor-pointer">
                  {isUploadingBg ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Carregar Fundo Próprio
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadBackground(f); }} />
                </label>
              </div>

              {selectedObj ? (
                <div className="pt-3 border-t border-slate-100 space-y-2.5">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mesa "{selectedObj.nome}"</h4>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Lugares</label>
                    <input
                      type="number" min={1} max={6}
                      value={editForm.lugares}
                      onChange={(e) => setEditForm(f => ({ ...f, lugares: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Largura</label>
                      <input
                        type="number" min={0}
                        value={editForm.largura}
                        onChange={(e) => setEditForm(f => ({ ...f, largura: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Altura</label>
                      <input
                        type="number" min={0}
                        value={editForm.altura}
                        onChange={(e) => setEditForm(f => ({ ...f, altura: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1 mb-0.5">
                      <Palette className="w-3 h-3" /> Cor
                    </label>
                    <input
                      type="color"
                      value={editForm.cor_hex}
                      onChange={(e) => setEditForm(f => ({ ...f, cor_hex: e.target.value }))}
                      className="w-full h-8 rounded border border-slate-300 cursor-pointer"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveObjeto}
                    disabled={isSavingObjeto}
                    className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg shadow-2xs transition text-xs"
                  >
                    {isSavingObjeto ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Gravar Mesa (gera ícone novo)
                  </button>

                  <label className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2 rounded-lg transition text-xs cursor-pointer">
                    {isUploadingImagem ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    Carregar Imagem Própria
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadObjetoImagem(f); }} />
                  </label>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 pt-3 border-t border-slate-100">
                  Clica numa mesa no mapa para a editar, ou arrasta para a mover.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition">
            Fechar
          </button>
          {tab === 'preset' && (
            <button
              type="button"
              onClick={handleApplyPreset}
              disabled={!antes || !depois || isApplying}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-4 py-1.5 rounded-lg shadow-2xs transition text-xs"
            >
              {isApplying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Aplicar na Base de Dados
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
