import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, RefreshCw, MapPin, AlertCircle, Sparkles, Check, Upload, Move, Palette,
  Plus, Copy, Trash2, Grid, ZoomIn, ZoomOut, Settings, Layers, Square, Circle,
  LayoutGrid, Armchair, TreePine, Store, ShieldAlert
} from 'lucide-react';

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
  precozona?: number;
  tabelaiva?: number;
  centroproducao?: number;
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

const THEME_OPTIONS = [
  { key: 'claro', name: 'Claro Moderno', desc: 'Tom creme neutro com padrão de pontos subtil', icon: '🌿' },
  { key: 'escuro', name: 'Escuro Lounge / VIP', desc: 'Fundo carvão/slate com mesas em tons dourados/âmbar', icon: '🌙' },
  { key: 'rustico', name: 'Rústico Madeira', desc: 'Fundo tom madeira quente com mesas em carvalho/nogueira', icon: '🪵' },
  { key: 'minimalista', name: 'Minimalista Monocromático', desc: 'Fundo cinza claro clean com linhas pretas definidoras', icon: '🎨' },
];

const COLOR_PRESETS = [
  '#8B8578', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#64748B', '#1E293B', '#D4AF37'
];

export const MesasMapModal: React.FC<MesasMapModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [zonas, setZonas] = useState<ZonaSummary[]>([]);
  const [selectedZona, setSelectedZona] = useState<number | null>(null);
  const [isLoadingZonas, setIsLoadingZonas] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('preset');

  // Modal de Criar/Editar Zona
  const [showZonaModal, setShowZonaModal] = useState(false);
  const [zonaForm, setZonaForm] = useState({ descricao: '', width: 800, height: 600, precozona: 1, tabelaiva: 1, centroproducao: 0 });
  const [isSavingZona, setIsSavingZona] = useState(false);

  // Modal de Criar Mesa/Decorativo
  const [showCreateObjModal, setShowCreateObjModal] = useState(false);
  const [createObjForm, setCreateObjForm] = useState({
    nome: '', tipoobjecto: 0, lugares: 4, forma: 'round', largura: 100, altura: 100, cor_hex: '#8B8578'
  });
  const [isCreatingObj, setIsCreatingObj] = useState(false);

  // Preset tab state
  const [selectedTheme, setSelectedTheme] = useState('claro');
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
  const [editForm, setEditForm] = useState<{ lugares: string; cor_hex: string; largura: string; altura: string; forma: string }>({
    lugares: '', cor_hex: '#8B8578', largura: '', altura: '', forma: 'round'
  });
  
  // Snap to Grid & Zoom
  const [snapGrid, setSnapGrid] = useState<number>(0); // 0 (Off), 10, 20, 50
  const [zoomLevel, setZoomLevel] = useState<number>(100); // 50, 75, 100, 125, 150

  const [isSavingPositions, setIsSavingPositions] = useState(false);
  const [isSavingObjeto, setIsSavingObjeto] = useState(false);
  const [isUploadingImagem, setIsUploadingImagem] = useState(false);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [tileBg, setTileBg] = useState(false);

  const dragRef = useRef<{ id: number; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  const loadZonasList = useCallback(async () => {
    setIsLoadingZonas(true);
    try {
      const res = await fetch('/api/mesas-map/zonas');
      const data: ZonaSummary[] = await res.json();
      setZonas(data || []);
      if (data && data.length > 0 && selectedZona === null) {
        setSelectedZona(data[0].codigo);
      }
    } catch {
      setErrorMsg('Falha de rede ao carregar as zonas.');
    } finally {
      setIsLoadingZonas(false);
    }
  }, [selectedZona]);

  useEffect(() => {
    if (!isOpen) return;
    setAntes(null);
    setDepois(null);
    setErrorMsg(null);
    setZonaDetail(null);
    setSelectedObjId(null);
    loadZonasList();
  }, [isOpen, loadZonasList]);

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
    } catch {
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

  // Handler de Criar Nova Zona
  const handleCreateZona = async () => {
    if (!zonaForm.descricao.trim()) {
      setErrorMsg('O nome da zona é obrigatório.');
      return;
    }
    setIsSavingZona(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/mesas-map/zonas/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zonaForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.detail || data.message || 'Falha ao criar zona.');
        return;
      }
      onSuccess(data.message);
      setShowZonaModal(false);
      await loadZonasList();
      if (data.codigo) setSelectedZona(data.codigo);
    } catch {
      setErrorMsg('Falha de rede ao criar zona.');
    } finally {
      setIsSavingZona(false);
    }
  };

  // Handler de Eliminar Zona
  const handleDeleteZona = async () => {
    if (selectedZona === null) return;
    if (!window.confirm('Tem a certeza que pretende eliminar esta zona e todas as suas mesas?')) return;
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.detail || data.message || 'Falha ao eliminar zona.');
        return;
      }
      onSuccess(data.message);
      setSelectedZona(null);
      await loadZonasList();
    } catch {
      setErrorMsg('Falha de rede ao eliminar zona.');
    }
  };

  // Handler de Criar Novo Objeto / Mesa
  const handleCreateObject = async () => {
    if (selectedZona === null) return;
    setIsCreatingObj(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/objeto/criar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createObjForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.detail || data.message || 'Falha ao criar objeto.');
        return;
      }
      onSuccess(data.message);
      setShowCreateObjModal(false);
      await loadZonaDetail(selectedZona);
    } catch {
      setErrorMsg('Falha de rede ao criar objeto.');
    } finally {
      setIsCreatingObj(false);
    }
  };

  // Handler de Duplicar Objeto Selecionado
  const handleDuplicateSelected = async () => {
    if (selectedZona === null || selectedObjId === null) return;
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/objeto/${selectedObjId}/duplicar`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.detail || data.message || 'Falha ao duplicar mesa.');
        return;
      }
      onSuccess(data.message);
      await loadZonaDetail(selectedZona);
      if (data.id) setSelectedObjId(data.id);
    } catch {
      setErrorMsg('Falha de rede ao duplicar mesa.');
    }
  };

  // Handler de Eliminar Objeto Selecionado
  const handleDeleteSelected = async () => {
    if (selectedZona === null || selectedObjId === null) return;
    if (!window.confirm('Tem a certeza que pretende eliminar esta mesa/objeto?')) return;
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/objeto/${selectedObjId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.detail || data.message || 'Falha ao eliminar mesa.');
        return;
      }
      onSuccess(data.message);
      setSelectedObjId(null);
      await loadZonaDetail(selectedZona);
    } catch {
      setErrorMsg('Falha de rede ao eliminar mesa.');
    }
  };

  // Handler de Pré-visualização de Tema
  const handlePreview = async () => {
    if (selectedZona === null) return;
    setIsPreviewing(true);
    setErrorMsg(null);
    setAntes(null);
    setDepois(null);
    try {
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/preview-preset?theme_key=${selectedTheme}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.available === false) {
        setErrorMsg(data.detail || data.message || 'Não foi possível gerar a pré-visualização.');
        return;
      }
      setAntes(data.antes_base64);
      setDepois(data.depois_base64);
      setObjetosCount(data.objetos_count || 0);
    } catch {
      setErrorMsg('Falha de rede ao gerar a pré-visualização.');
    } finally {
      setIsPreviewing(false);
    }
  };

  // Handler de Aplicar Tema
  const handleApplyPreset = async () => {
    if (selectedZona === null) return;
    setIsApplying(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/apply-preset?theme_key=${selectedTheme}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.detail || data.message || 'Não foi possível aplicar o preset.');
        return;
      }
      onSuccess(data.message);
      setAntes(null);
      setDepois(null);
    } catch {
      setErrorMsg('Falha de rede ao aplicar o preset.');
    } finally {
      setIsApplying(false);
    }
  };

  // --- Editor visual: arrastar objetos com Snap to Grid ---
  const handlePointerDown = (obj: ObjetoMesa, e: React.PointerEvent) => {
    e.stopPropagation();
    setSelectedObjId(obj.id);
    setEditForm({
      lugares: String(obj.lugares || ''),
      cor_hex: obj.cor_hex && obj.cor_hex !== '#000000' ? obj.cor_hex : '#8B8578',
      largura: String(obj.largura || ''),
      altura: String(obj.altura || ''),
      forma: obj.largura !== obj.altura && Math.abs(obj.largura - obj.altura) > 30 ? 'rectangle' : 'round'
    });
    const pos = positions[obj.id] || { posx: obj.posx, posy: obj.posy };
    dragRef.current = { id: obj.id, startX: e.clientX, startY: e.clientY, origX: pos.posx, origY: pos.posy, moved: false };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handlePointerMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const scale = zoomLevel / 100;
    let dx = (e.clientX - d.startX) / scale;
    let dy = (e.clientY - d.startY) / scale;
    
    let newX = d.origX + dx;
    let newY = d.origY + dy;

    if (snapGrid > 0) {
      newX = Math.round(newX / snapGrid) * snapGrid;
      newY = Math.round(newY / snapGrid) * snapGrid;
    }

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;
    setPositions(prev => ({ ...prev, [d.id]: { posx: Math.max(0, newX), posy: Math.max(0, newY) } }));
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
    } catch {
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
          altura: editForm.altura ? parseInt(editForm.altura, 10) : null,
          forma: editForm.forma
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.detail || data.message || 'Não foi possível atualizar a mesa.');
        return;
      }
      onSuccess(data.message);
      if (selectedZona !== null) await loadZonaDetail(selectedZona);
    } catch {
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
    } catch {
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
    } catch {
      setErrorMsg('Falha de rede ao carregar o fundo.');
    } finally {
      setIsUploadingBg(false);
    }
  };

  if (!isOpen) return null;

  const currentZona = zonas.find(z => z.codigo === selectedZona);
  const selectedObj = zonaDetail?.objetos.find(o => o.id === selectedObjId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-7xl max-h-[94vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-600/20">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Gestor Avançado de Mapa de Mesas</h2>
              <p className="text-xs text-slate-500 font-medium">
                dbo.zonas / dbo.mapamesas — ZoneSoft ZSRest
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra Superior de Seleção de Zona e Modos */}
        <div className="px-6 py-2.5 flex items-center justify-between border-b border-slate-200 bg-white flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700">Zona / Sala:</label>
              {isLoadingZonas ? (
                <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
              ) : (
                <select
                  value={selectedZona ?? ''}
                  onChange={(e) => { setSelectedZona(Number(e.target.value)); setAntes(null); setDepois(null); }}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {zonas.map(z => (
                    <option key={z.codigo} value={z.codigo}>
                      {z.descricao} ({z.width}x{z.height}){!z.has_background ? ' — sem fundo' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setZonaForm({ descricao: '', width: 800, height: 600, precozona: 1, tabelaiva: 1, centroproducao: 0 });
                setShowZonaModal(true);
              }}
              className="flex items-center gap-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg text-xs font-bold transition"
            >
              <Plus className="w-3.5 h-3.5" /> Nova Zona
            </button>

            {selectedZona !== null && (
              <button
                type="button"
                onClick={handleDeleteZona}
                className="flex items-center gap-1 text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg text-xs font-semibold transition"
                title="Eliminar Zona"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar Zona
              </button>
            )}

            <div className="flex items-center gap-1 ml-4 border-l border-slate-200 pl-4">
              <button
                type="button"
                onClick={() => setTab('preset')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${tab === 'preset' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <Sparkles className="w-3.5 h-3.5" /> Presets de Temas
              </button>
              <button
                type="button"
                onClick={() => setTab('editor')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${tab === 'editor' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <Move className="w-3.5 h-3.5" /> Editor Visual do Mapa
              </button>
            </div>
          </div>

          {tab === 'editor' && (
            <div className="flex items-center gap-3">
              {/* Controlo de Snap Grid */}
              <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 text-xs">
                <Grid className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-semibold text-slate-600 text-[11px]">Grelha:</span>
                <select
                  value={snapGrid}
                  onChange={(e) => setSnapGrid(Number(e.target.value))}
                  className="bg-transparent font-bold text-slate-800 text-[11px] border-none focus:outline-none"
                >
                  <option value={0}>Desativada</option>
                  <option value={10}>10 px</option>
                  <option value={20}>20 px</option>
                  <option value={50}>50 px</option>
                </select>
              </div>

              {/* Controlo de Zoom */}
              <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.max(50, prev - 25))}
                  className="p-0.5 hover:bg-slate-200 rounded text-slate-600"
                  title="Reduzir Zoom"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-bold text-slate-800 text-[11px] min-w-[42px] text-center">{zoomLevel}%</span>
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.min(150, prev + 25))}
                  className="p-0.5 hover:bg-slate-200 rounded text-slate-600"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {dirtyIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleSavePositions}
                  disabled={isSavingPositions}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-xs transition text-xs animate-pulse"
                >
                  {isSavingPositions ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Gravar Posições ({dirtyIds.size})
                </button>
              )}
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="mx-6 mt-3 flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-3 py-2 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Aba de Presets de Temas */}
        {tab === 'preset' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">Escolhe um Tema Visual para a Sala</h3>
              <p className="text-xs text-slate-500 mb-4">
                Aplica um estilo moderno de alta definição às mesas e fundo da zona de uma só vez, mantendo total compatibilidade com o ZoneSoft.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {THEME_OPTIONS.map(theme => (
                  <div
                    key={theme.key}
                    onClick={() => setSelectedTheme(theme.key)}
                    className={`cursor-pointer p-4 rounded-xl border transition flex flex-col justify-between ${selectedTheme === theme.key ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-500/20 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                  >
                    <div>
                      <div className="text-2xl mb-2">{theme.icon}</div>
                      <div className="font-bold text-slate-900 text-sm mb-1">{theme.name}</div>
                      <p className="text-xs text-slate-500 font-medium">{theme.desc}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                      {selectedTheme === theme.key ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Selecionado
                        </>
                      ) : (
                        <span className="text-slate-400">Clique para escolher</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePreview}
                disabled={selectedZona === null || isPreviewing}
                className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl shadow-xs transition text-xs"
              >
                {isPreviewing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Pré-visualizar Tema "{THEME_OPTIONS.find(t => t.key === selectedTheme)?.name}"
              </button>

              {antes && depois && (
                <button
                  type="button"
                  onClick={handleApplyPreset}
                  disabled={isApplying}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl shadow-md transition text-xs"
                >
                  {isApplying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Confirmar e Aplicar Tema à Zona
                </button>
              )}
            </div>

            {antes && depois && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Antes (Atual)</div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 shadow-inner">
                      <img src={`data:image/png;base64,${antes}`} alt="Mapa de mesas atual" className="w-full" />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Depois (Com Novo Tema)</div>
                    <div className="border border-emerald-300 rounded-xl overflow-hidden bg-slate-50 shadow-inner ring-2 ring-emerald-500/10">
                      <img src={`data:image/png;base64,${depois}`} alt="Mapa de mesas com o preset novo" className="w-full" />
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">{objetosCount} objeto(s) nesta zona serão atualizados com o novo estilo visual.</p>
              </div>
            )}
          </div>
        )}

        {/* Aba do Editor Visual */}
        {tab === 'editor' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Canvas Interativo do Mapa de Mesas */}
            <div className="flex-1 flex flex-col bg-slate-100 overflow-hidden relative">
              {/* Toolbar Secundária do Canvas */}
              <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap shadow-2xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateObjForm({ nome: `Mesa ${zonaDetail?.objetos.length ? zonaDetail.objetos.length + 1 : 1}`, tipoobjecto: 0, lugares: 4, forma: 'round', largura: 100, altura: 100, cor_hex: '#8B8578' });
                      setShowCreateObjModal(true);
                    }}
                    className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Mesa
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCreateObjForm({ nome: 'Planta Decorativa', tipoobjecto: 1, lugares: 0, forma: 'plant', largura: 80, altura: 80, cor_hex: '#8B8578' });
                      setShowCreateObjModal(true);
                    }}
                    className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-lg text-xs transition border border-slate-200"
                  >
                    <TreePine className="w-3.5 h-3.5" /> Decorativo / Planta
                  </button>
                </div>

                {selectedObjId !== null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">Mesa Selecionada (#{selectedObj?.nome}):</span>
                    <button
                      type="button"
                      onClick={handleDuplicateSelected}
                      className="flex items-center gap-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-bold transition"
                    >
                      <Copy className="w-3.5 h-3.5" /> Duplicar
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className="flex items-center gap-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg text-xs font-bold transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </button>
                  </div>
                )}
              </div>

              {/* Área do Canvas com Scroll e Zoom */}
              <div className="flex-1 overflow-auto p-8 flex items-center justify-center bg-slate-200/60">
                {isLoadingDetail ? (
                  <div className="flex items-center justify-center py-10 text-slate-400 text-xs gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> A carregar planta da zona...
                  </div>
                ) : zonaDetail ? (
                  <div
                    className="relative border border-slate-400 shadow-xl transition-transform origin-top-left"
                    style={{
                      width: zonaDetail.width,
                      height: zonaDetail.height,
                      transform: `scale(${zoomLevel / 100})`,
                      backgroundImage: zonaDetail.background_base64 ? `url(data:image/bmp;base64,${zonaDetail.background_base64})` : undefined,
                      backgroundRepeat: 'repeat',
                      backgroundColor: '#f3f1ec'
                    }}
                  >
                    {/* Visual da Grelha Magnética */}
                    {snapGrid > 0 && (
                      <div
                        className="absolute inset-0 pointer-events-none opacity-25"
                        style={{
                          backgroundImage: `radial-gradient(circle, #000 1px, transparent 1px)`,
                          backgroundSize: `${snapGrid}px ${snapGrid}px`
                        }}
                      />
                    )}

                    {zonaDetail.objetos.map(obj => {
                      const pos = positions[obj.id] || { posx: obj.posx, posy: obj.posy };
                      if (pos.posx === 0 && pos.posy === 0) return null;
                      const isSelected = obj.id === selectedObjId;
                      const isDirty = dirtyIds.has(obj.id);
                      return (
                        <div
                          key={obj.id}
                          onPointerDown={(e) => handlePointerDown(obj, e)}
                          className={`absolute cursor-move select-none flex items-center justify-center transition-shadow ${isSelected ? 'ring-4 ring-emerald-500 z-10 shadow-lg' : isDirty ? 'ring-2 ring-amber-400 z-5' : 'hover:ring-2 hover:ring-slate-400'}`}
                          style={{
                            left: pos.posx,
                            top: pos.posy,
                            width: obj.largura || 100,
                            height: obj.altura || 100
                          }}
                          title={`Mesa ${obj.nome} (${obj.lugares} lugares)`}
                        >
                          {obj.imagem_base64 ? (
                            <img src={`data:image/bmp;base64,${obj.imagem_base64}`} alt={obj.nome} className="w-full h-full pointer-events-none" draggable={false} />
                          ) : (
                            <div className="w-full h-full bg-white border border-slate-300 rounded-lg flex flex-col items-center justify-center text-xs font-bold text-slate-700 pointer-events-none p-1 text-center shadow-xs">
                              <span>{obj.nome}</span>
                              {obj.lugares > 0 && <span className="text-[10px] text-slate-400 font-normal">{obj.lugares} lug.</span>}
                            </div>
                          )}
                          <span className="absolute -top-2 -left-2 bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                            {obj.nome}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Seleciona uma zona para editar.</p>
                )}
              </div>
            </div>

            {/* Painel Lateral de Editar Propriedades da Mesa Selecionada */}
            <div className="w-80 border-l border-slate-200 bg-white p-5 overflow-y-auto space-y-6">
              {selectedObj ? (
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <h3 className="text-sm font-bold text-slate-900">Editar Objeto #{selectedObj.nome}</h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">ID #{selectedObj.id}</span>
                  </div>

                  {/* Forma da Mesa / Objeto */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700">Forma Visual:</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditForm(prev => ({ ...prev, forma: 'round' }))}
                        className={`flex items-center gap-1.5 p-2 rounded-lg border text-xs font-semibold transition ${editForm.forma === 'round' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        <Circle className="w-3.5 h-3.5" /> Redonda
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm(prev => ({ ...prev, forma: 'square' }))}
                        className={`flex items-center gap-1.5 p-2 rounded-lg border text-xs font-semibold transition ${editForm.forma === 'square' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        <Square className="w-3.5 h-3.5" /> Quadrada
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm(prev => ({ ...prev, forma: 'rectangle' }))}
                        className={`flex items-center gap-1.5 p-2 rounded-lg border text-xs font-semibold transition ${editForm.forma === 'rectangle' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" /> Retangular
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm(prev => ({ ...prev, forma: 'bench' }))}
                        className={`flex items-center gap-1.5 p-2 rounded-lg border text-xs font-semibold transition ${editForm.forma === 'bench' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        <Armchair className="w-3.5 h-3.5" /> Bancada
                      </button>
                    </div>
                  </div>

                  {/* Número de Lugares */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Nº de Lugares (Assentos):</label>
                    <select
                      value={editForm.lugares}
                      onChange={(e) => setEditForm(prev => ({ ...prev, lugares: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900"
                    >
                      <option value="1">1 Lugar</option>
                      <option value="2">2 Lugares</option>
                      <option value="4">4 Lugares</option>
                      <option value="6">6 Lugares</option>
                      <option value="8">8 Lugares</option>
                    </select>
                  </div>

                  {/* Cor do Grupo / Mesa */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700">Cor Personalizada:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editForm.cor_hex}
                        onChange={(e) => setEditForm(prev => ({ ...prev, cor_hex: e.target.value }))}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-slate-300 p-0.5"
                      />
                      <input
                        type="text"
                        value={editForm.cor_hex}
                        onChange={(e) => setEditForm(prev => ({ ...prev, cor_hex: e.target.value }))}
                        className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono font-semibold"
                      />
                    </div>
                    {/* Paleta rápida */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {COLOR_PRESETS.map(hex => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setEditForm(prev => ({ ...prev, cor_hex: hex }))}
                          className="w-5 h-5 rounded-full border border-slate-300 shadow-2xs transition hover:scale-110"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Dimensões Largura x Altura */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">Largura (px):</label>
                      <input
                        type="number"
                        value={editForm.largura}
                        onChange={(e) => setEditForm(prev => ({ ...prev, largura: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">Altura (px):</label>
                      <input
                        type="number"
                        value={editForm.altura}
                        onChange={(e) => setEditForm(prev => ({ ...prev, altura: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveObjeto}
                    disabled={isSavingObjeto}
                    className="w-full flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs transition shadow-xs"
                  >
                    {isSavingObjeto ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Atualizar Mesa & Regenerar Ícone
                  </button>

                  <div className="border-t border-slate-200 pt-4 space-y-2">
                    <label className="text-xs font-bold text-slate-700">Ou carregar Imagem Própria (PNG/BMP):</label>
                    <label className="flex items-center justify-center gap-1.5 border border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/30 text-slate-600 font-semibold p-2.5 rounded-xl cursor-pointer text-xs transition">
                      <Upload className="w-3.5 h-3.5" />
                      {isUploadingImagem ? 'A carregar...' : 'Escolher Ficheiro'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadObjetoImagem(file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 space-y-3">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                    <Move className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Nenhum Objeto Selecionado</h4>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Clica numa mesa no canvas para arrastar, duplicar, eliminar ou alterar a forma e cores.
                    </p>
                  </div>

                  <div className="border-t border-slate-200 pt-4 space-y-3 text-left">
                    <h4 className="text-xs font-bold text-slate-800">Fundo da Zona (Sala)</h4>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tileBg}
                        onChange={(e) => setTileBg(e.target.checked)}
                        className="rounded text-emerald-600"
                      />
                      Repetir em ladrilho (tile)
                    </label>
                    <label className="flex items-center justify-center gap-1.5 border border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/30 text-slate-600 font-semibold p-2.5 rounded-xl cursor-pointer text-xs transition">
                      <Upload className="w-3.5 h-3.5" />
                      {isUploadingBg ? 'A carregar...' : 'Carregar Imagem de Fundo'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadBackground(file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal de Criar Nova Zona */}
      {showZonaModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Criar Nova Zona (Sala)</h3>
              <button onClick={() => setShowZonaModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nome da Zona / Sala:</label>
                <input
                  type="text"
                  placeholder="Ex: Esplanada Traseira"
                  value={zonaForm.descricao}
                  onChange={(e) => setZonaForm(prev => ({ ...prev, descricao: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Largura Canvas (px):</label>
                  <input
                    type="number"
                    value={zonaForm.width}
                    onChange={(e) => setZonaForm(prev => ({ ...prev, width: Number(e.target.value) }))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Altura Canvas (px):</label>
                  <input
                    type="number"
                    value={zonaForm.height}
                    onChange={(e) => setZonaForm(prev => ({ ...prev, height: Number(e.target.value) }))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowZonaModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateZona}
                disabled={isSavingZona}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                {isSavingZona ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Criar Zona
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criar Nova Mesa / Objeto */}
      {showCreateObjModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {createObjForm.tipoobjecto === 0 ? 'Adicionar Nova Mesa' : 'Adicionar Elemento Decorativo'}
              </h3>
              <button onClick={() => setShowCreateObjModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nome / Número:</label>
                <input
                  type="text"
                  placeholder="Ex: Mesa 12 ou Planta"
                  value={createObjForm.nome}
                  onChange={(e) => setCreateObjForm(prev => ({ ...prev, nome: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold"
                />
              </div>

              {createObjForm.tipoobjecto === 0 && (
                <>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Forma Visual:</label>
                    <select
                      value={createObjForm.forma}
                      onChange={(e) => setCreateObjForm(prev => ({ ...prev, forma: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold"
                    >
                      <option value="round">Mesa Redonda</option>
                      <option value="square">Mesa Quadrada</option>
                      <option value="rectangle">Mesa Retangular</option>
                      <option value="bench">Bancada / Bar</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Nº de Lugares:</label>
                    <select
                      value={createObjForm.lugares}
                      onChange={(e) => setCreateObjForm(prev => ({ ...prev, lugares: Number(e.target.value) }))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold"
                    >
                      <option value={1}>1 Lugar</option>
                      <option value={2}>2 Lugares</option>
                      <option value={4}>4 Lugares</option>
                      <option value={6}>6 Lugares</option>
                      <option value={8}>8 Lugares</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateObjModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateObject}
                disabled={isCreatingObj}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                {isCreatingObj ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Criar no Mapa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
