import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, RefreshCw, MapPin, AlertCircle, Sparkles, Check, Upload, Move, Palette,
  Plus, Copy, Trash2, Grid, ZoomIn, ZoomOut, Settings, Layers, Square, Circle,
  LayoutGrid, Armchair, TreePine, Store, AlignLeft, AlignCenter, AlignRight,
  MousePointer, Hand, ShieldAlert, Sparkle, Maximize2, Compass
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
type ToolMode = 'pointer' | 'lasso' | 'pan';

const THEME_OPTIONS = [
  { key: 'claro', name: 'Claro Moderno', desc: 'Tom creme neutro com padrão de pontos subtil', icon: '🌿' },
  { key: 'escuro', name: 'Cyber Lounge / Neon VIP', desc: 'Ardósia escura com LEDs azuis/violeta e mesas elegantes', icon: '💎' },
  { key: 'rustico', name: 'Rústico Madeira', desc: 'Tom madeira quente aconchegante com acabamento nobre', icon: '🪵' },
  { key: 'minimalista', name: 'Bistro Fine Dining', desc: 'Móveis polidos em mogno, mármore e detalhes a latão dourado', icon: '🍷' },
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
  const [tab, setTab] = useState<Tab>('editor');
  const [toolMode, setToolMode] = useState<ToolMode>('pointer');

  // Modal de Criar/Editar Zona
  const [showZonaModal, setShowZonaModal] = useState(false);
  const [zonaForm, setZonaForm] = useState({ descricao: '', width: 900, height: 650, precozona: 1, tabelaiva: 1, centroproducao: 0 });
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
  
  // Seleção Múltipla
  const [selectedObjIds, setSelectedObjIds] = useState<Set<number>>(new Set());
  const [editForm, setEditForm] = useState<{ lugares: string; cor_hex: string; largura: string; altura: string; forma: string }>({
    lugares: '', cor_hex: '#8B8578', largura: '', altura: '', forma: 'round'
  });
  
  // Guias Inteligentes de Alinhamento (Smart Alignment Guides)
  const [guideVLine, setGuideVLine] = useState<number | null>(null);
  const [guideHLine, setGuideHLine] = useState<number | null>(null);

  // Snap to Grid & Zoom
  const [snapGrid, setSnapGrid] = useState<number>(10);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

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
    setSelectedObjIds(new Set());
    loadZonasList();
  }, [isOpen, loadZonasList]);

  const loadZonaDetail = useCallback(async (codigo: number) => {
    setIsLoadingDetail(true);
    setErrorMsg(null);
    setSelectedObjIds(new Set());
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
    if (selectedZona === null || selectedObjIds.size === 0) return;
    setErrorMsg(null);
    const targetId = Array.from(selectedObjIds)[0];
    try {
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/objeto/${targetId}/duplicar`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.detail || data.message || 'Falha ao duplicar mesa.');
        return;
      }
      onSuccess(data.message);
      await loadZonaDetail(selectedZona);
      if (data.id) setSelectedObjIds(new Set([data.id]));
    } catch {
      setErrorMsg('Falha de rede ao duplicar mesa.');
    }
  };

  // Handler de Eliminar Selecionados
  const handleDeleteSelected = async () => {
    if (selectedZona === null || selectedObjIds.size === 0) return;
    if (!window.confirm(`Tem a certeza que pretende eliminar ${selectedObjIds.size} objeto(s)?`)) return;
    setErrorMsg(null);
    try {
      for (const id of Array.from(selectedObjIds)) {
        await fetch(`/api/mesas-map/zona/${selectedZona}/objeto/${id}`, { method: 'DELETE' });
      }
      onSuccess(`${selectedObjIds.size} objeto(s) eliminado(s).`);
      setSelectedObjIds(new Set());
      await loadZonaDetail(selectedZona);
    } catch {
      setErrorMsg('Falha de rede ao eliminar mesa.');
    }
  };

  // --- Alinhamento de Objetos em Grupo ---
  const handleAlign = (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (!zonaDetail || selectedObjIds.size < 2) return;
    const selectedObjs = zonaDetail.objetos.filter(o => selectedObjIds.has(o.id));
    if (selectedObjs.length < 2) return;

    let targetVal = 0;
    if (type === 'left') targetVal = Math.min(...selectedObjs.map(o => positions[o.id]?.posx ?? o.posx));
    else if (type === 'right') targetVal = Math.max(...selectedObjs.map(o => (positions[o.id]?.posx ?? o.posx) + o.largura));
    else if (type === 'top') targetVal = Math.min(...selectedObjs.map(o => positions[o.id]?.posy ?? o.posy));
    else if (type === 'bottom') targetVal = Math.max(...selectedObjs.map(o => (positions[o.id]?.posy ?? o.posy) + o.altura));

    setPositions(prev => {
      const next = { ...prev };
      selectedObjs.forEach(o => {
        const cur = next[o.id] || { posx: o.posx, posy: o.posy };
        if (type === 'left') next[o.id] = { ...cur, posx: targetVal };
        else if (type === 'right') next[o.id] = { ...cur, posx: targetVal - o.largura };
        else if (type === 'top') next[o.id] = { ...cur, posy: targetVal };
        else if (type === 'bottom') next[o.id] = { ...cur, posy: targetVal - o.altura };
      });
      return next;
    });

    setDirtyIds(prev => {
      const next = new Set(prev);
      selectedObjs.forEach(o => next.add(o.id));
      return next;
    });
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

  // --- Editor visual: arrastar objetos com Snap to Grid e Guias Inteligentes ---
  const handlePointerDown = (obj: ObjetoMesa, e: React.PointerEvent) => {
    e.stopPropagation();
    if (!e.shiftKey && !selectedObjIds.has(obj.id)) {
      setSelectedObjIds(new Set([obj.id]));
    } else if (e.shiftKey) {
      setSelectedObjIds(prev => {
        const next = new Set(prev);
        if (next.has(obj.id)) next.delete(obj.id);
        else next.add(obj.id);
        return next;
      });
    }

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
    if (!d || !zonaDetail) return;
    const scale = zoomLevel / 100;
    let dx = (e.clientX - d.startX) / scale;
    let dy = (e.clientY - d.startY) / scale;
    
    let newX = d.origX + dx;
    let newY = d.origY + dy;

    // Guias inteligentes de alinhamento magnético
    let vGuide: number | null = null;
    let hGuide: number | null = null;
    const snapThreshold = 6;

    const curObj = zonaDetail.objetos.find(o => o.id === d.id);
    const objW = curObj?.largura || 100;
    const objH = curObj?.altura || 100;

    for (const other of zonaDetail.objetos) {
      if (other.id === d.id) continue;
      const oPos = positions[other.id] || { posx: other.posx, posy: other.posy };
      const oW = other.largura || 100;
      const oH = other.altura || 100;

      // Alinhamento Vertical (X)
      if (Math.abs(newX - oPos.posx) < snapThreshold) {
        newX = oPos.posx;
        vGuide = newX;
      } else if (Math.abs((newX + objW / 2) - (oPos.posx + oW / 2)) < snapThreshold) {
        newX = oPos.posx + oW / 2 - objW / 2;
        vGuide = oPos.posx + oW / 2;
      }

      // Alinhamento Horizontal (Y)
      if (Math.abs(newY - oPos.posy) < snapThreshold) {
        newY = oPos.posy;
        hGuide = newY;
      } else if (Math.abs((newY + objH / 2) - (oPos.posy + oH / 2)) < snapThreshold) {
        newY = oPos.posy + oH / 2 - objH / 2;
        hGuide = oPos.posy + oH / 2;
      }
    }

    setGuideVLine(vGuide);
    setGuideHLine(hGuide);

    if (snapGrid > 0 && !vGuide && !hGuide) {
      newX = Math.round(newX / snapGrid) * snapGrid;
      newY = Math.round(newY / snapGrid) * snapGrid;
    }

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;
    setPositions(prev => ({ ...prev, [d.id]: { posx: Math.max(0, newX), posy: Math.max(0, newY) } }));
  };

  const handlePointerUp = () => {
    setGuideVLine(null);
    setGuideHLine(null);
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
    if (selectedZona === null || selectedObjIds.size === 0) return;
    const targetId = Array.from(selectedObjIds)[0];
    setIsSavingObjeto(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/objeto/${targetId}/props`, {
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
    if (selectedZona === null || selectedObjIds.size === 0) return;
    const targetId = Array.from(selectedObjIds)[0];
    setIsUploadingImagem(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/mesas-map/zona/${selectedZona}/objeto/${targetId}/imagem`, { method: 'POST', body: formData });
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

  const firstSelectedId = Array.from(selectedObjIds)[0];
  const selectedObj = zonaDetail?.objetos.find(o => o.id === firstSelectedId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-3">
      <div className="bg-slate-900 w-full max-w-7xl max-h-[96vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-800 text-slate-100">
        
        {/* Cabeçalho Premium */}
        <div className="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-700 text-white rounded-2xl shadow-lg shadow-emerald-500/20">
              <Compass className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Estúdio Profissional de Mapa de Mesas</h2>
              <p className="text-[11px] text-slate-400 font-medium">
                Desenho Vetorial Realista & Sincronização Cloud ZoneSoft
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra Superior de Seleção de Zona e Modos */}
        <div className="px-6 py-2.5 flex items-center justify-between border-b border-slate-800 bg-slate-900 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-300">Sala / Zona:</label>
              {isLoadingZonas ? (
                <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
              ) : (
                <select
                  value={selectedZona ?? ''}
                  onChange={(e) => { setSelectedZona(Number(e.target.value)); setAntes(null); setDepois(null); }}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                setZonaForm({ descricao: '', width: 900, height: 650, precozona: 1, tabelaiva: 1, centroproducao: 0 });
                setShowZonaModal(true);
              }}
              className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-bold transition"
            >
              <Plus className="w-3.5 h-3.5" /> Nova Sala
            </button>

            {selectedZona !== null && (
              <button
                type="button"
                onClick={handleDeleteZona}
                className="flex items-center gap-1 text-rose-400 hover:bg-rose-500/10 px-2 py-1 rounded-xl text-xs font-semibold transition"
                title="Eliminar Zona"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar Sala
              </button>
            )}

            <div className="flex items-center gap-1.5 ml-4 border-l border-slate-800 pl-4">
              <button
                type="button"
                onClick={() => setTab('editor')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${tab === 'editor' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                <Move className="w-3.5 h-3.5" /> Estúdio Vetorial Interativo
              </button>
              <button
                type="button"
                onClick={() => setTab('preset')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${tab === 'preset' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                <Sparkles className="w-3.5 h-3.5" /> Galeria de Temas HD
              </button>
            </div>
          </div>

          {tab === 'editor' && (
            <div className="flex items-center gap-3">
              {/* Controlo de Snap Grid */}
              <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
                <Grid className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-400 text-[11px]">Grelha:</span>
                <select
                  value={snapGrid}
                  onChange={(e) => setSnapGrid(Number(e.target.value))}
                  className="bg-transparent font-bold text-white text-[11px] border-none focus:outline-none cursor-pointer"
                >
                  <option value={0} className="bg-slate-900">Desativada</option>
                  <option value={10} className="bg-slate-900">10 px</option>
                  <option value={20} className="bg-slate-900">20 px</option>
                  <option value={50} className="bg-slate-900">50 px</option>
                </select>
              </div>

              {/* Controlo de Zoom */}
              <div className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-xl border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.max(50, prev - 25))}
                  className="p-1 hover:bg-slate-700 rounded-lg text-slate-300"
                  title="Reduzir Zoom"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-bold text-white text-[11px] min-w-[42px] text-center">{zoomLevel}%</span>
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.min(150, prev + 25))}
                  className="p-1 hover:bg-slate-700 rounded-lg text-slate-300"
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
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl shadow-lg shadow-emerald-600/30 transition text-xs animate-pulse"
                >
                  {isSavingPositions ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Gravar Posições ({dirtyIds.size})
                </button>
              )}
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="mx-6 mt-3 flex items-center gap-2 bg-rose-950/80 border border-rose-800 text-rose-200 text-xs font-semibold px-4 py-2.5 rounded-xl">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            {errorMsg}
          </div>
        )}

        {/* Aba do Estúdio Vetorial Interativo */}
        {tab === 'editor' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Canvas Principal */}
            <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
              
              {/* Barra Flutuante em Glassmorphism (Floating Quick Toolbar) */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-slate-900/85 backdrop-blur-md border border-slate-700/80 rounded-2xl p-1.5 flex items-center gap-1.5 shadow-2xl">
                <button
                  type="button"
                  onClick={() => {
                    const nextNum = zonaDetail?.objetos.length ? zonaDetail.objetos.length + 1 : 1;
                    setCreateObjForm({ nome: String(nextNum), tipoobjecto: 0, lugares: 4, forma: 'round', largura: 100, altura: 100, cor_hex: '#8B8578' });
                    setShowCreateObjModal(true);
                  }}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition shadow-md"
                >
                  <Plus className="w-3.5 h-3.5" /> + Criar Mesa
                </button>

                <div className="h-5 w-[1px] bg-slate-700 mx-1" />

                <button
                  type="button"
                  onClick={() => {
                    setCreateObjForm({ nome: 'Parede', tipoobjecto: 1, lugares: 0, forma: 'wall', largura: 160, altura: 20, cor_hex: '#64748B' });
                    setShowCreateObjModal(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition"
                  title="Criar Divisória / Parede"
                >
                  <Square className="w-3.5 h-3.5" /> Divisória
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCreateObjForm({ nome: 'Balcão', tipoobjecto: 1, lugares: 0, forma: 'counter', largura: 180, altura: 60, cor_hex: '#475569' });
                    setShowCreateObjModal(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition"
                  title="Criar Balcão / Caixa POS"
                >
                  <Store className="w-3.5 h-3.5" /> Balcão
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCreateObjForm({ nome: 'Planta', tipoobjecto: 1, lugares: 0, forma: 'plant', largura: 70, altura: 70, cor_hex: '#8B8578' });
                    setShowCreateObjModal(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition"
                  title="Criar Planta Decorativa"
                >
                  <TreePine className="w-3.5 h-3.5" /> Planta
                </button>

                {selectedObjIds.size > 0 && (
                  <>
                    <div className="h-5 w-[1px] bg-slate-700 mx-1" />
                    <button
                      type="button"
                      onClick={handleDuplicateSelected}
                      className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-xl transition"
                      title="Duplicar Selecionado"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-xl transition"
                      title="Eliminar Selecionado"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {/* Área do Canvas com Scroll e Zoom */}
              <div className="flex-1 overflow-auto p-12 flex items-center justify-center bg-slate-950">
                {isLoadingDetail ? (
                  <div className="flex items-center justify-center py-10 text-slate-500 text-xs gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> A carregar planta da zona...
                  </div>
                ) : zonaDetail ? (
                  <div
                    className="relative border border-slate-800 shadow-2xl transition-transform origin-top-left rounded-2xl overflow-hidden"
                    style={{
                      width: zonaDetail.width,
                      height: zonaDetail.height,
                      transform: `scale(${zoomLevel / 100})`,
                      backgroundImage: zonaDetail.background_base64 ? `url(data:image/bmp;base64,${zonaDetail.background_base64})` : undefined,
                      backgroundRepeat: 'repeat',
                      backgroundColor: '#1e293b'
                    }}
                  >
                    {/* Linha Guias Inteligentes de Alinhamento */}
                    {guideVLine !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-[2px] bg-rose-500 z-40 pointer-events-none shadow-lg shadow-rose-500/50"
                        style={{ left: guideVLine }}
                      />
                    )}
                    {guideHLine !== null && (
                      <div
                        className="absolute left-0 right-0 h-[2px] bg-cyan-400 z-40 pointer-events-none shadow-lg shadow-cyan-400/50"
                        style={{ top: guideHLine }}
                      />
                    )}

                    {/* Visual da Grelha Magnética */}
                    {snapGrid > 0 && (
                      <div
                        className="absolute inset-0 pointer-events-none opacity-20"
                        style={{
                          backgroundImage: `radial-gradient(circle, #ffffff 1px, transparent 1px)`,
                          backgroundSize: `${snapGrid}px ${snapGrid}px`
                        }}
                      />
                    )}

                    {/* Renderização Vetorial Interativa dos Objetos */}
                    {zonaDetail.objetos.map(obj => {
                      const pos = positions[obj.id] || { posx: obj.posx, posy: obj.posy };
                      if (pos.posx === 0 && pos.posy === 0) return null;
                      const isSelected = selectedObjIds.has(obj.id);
                      const isDirty = dirtyIds.has(obj.id);
                      return (
                        <div
                          key={obj.id}
                          onPointerDown={(e) => handlePointerDown(obj, e)}
                          className={`absolute cursor-move select-none flex items-center justify-center transition-shadow rounded-xl ${isSelected ? 'ring-4 ring-emerald-400 z-20 shadow-2xl' : isDirty ? 'ring-2 ring-amber-400 z-10' : 'hover:ring-2 hover:ring-slate-400'}`}
                          style={{
                            left: pos.posx,
                            top: pos.posy,
                            width: obj.largura || 100,
                            height: obj.altura || 100
                          }}
                        >
                          {obj.imagem_base64 ? (
                            <img src={`data:image/bmp;base64,${obj.imagem_base64}`} alt={obj.nome} className="w-full h-full pointer-events-none" draggable={false} />
                          ) : (
                            <div className="w-full h-full bg-slate-800 border border-slate-700 rounded-xl flex flex-col items-center justify-center text-xs font-bold text-white pointer-events-none p-1 text-center shadow-lg">
                              <span>{obj.nome}</span>
                              {obj.lugares > 0 && <span className="text-[10px] text-slate-400 font-normal">{obj.lugares} lug.</span>}
                            </div>
                          )}
                          <span className="absolute -top-2.5 -left-2 bg-slate-950/90 text-emerald-400 border border-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-md">
                            Mesa {obj.nome}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Seleciona uma zona para editar.</p>
                )}
              </div>

              {/* Barra Flutuante Inferior de Alinhamento para Seleção Múltipla */}
              {selectedObjIds.size >= 2 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-2xl px-4 py-2 flex items-center gap-2 shadow-2xl">
                  <span className="text-xs font-bold text-emerald-400 pr-2 border-r border-slate-700">
                    {selectedObjIds.size} Selecionados
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => handleAlign('left')} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 text-xs font-semibold flex items-center gap-1" title="Alinhar à Esquerda"><AlignLeft className="w-3.5 h-3.5" /> Esquerda</button>
                    <button type="button" onClick={() => handleAlign('center')} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 text-xs font-semibold flex items-center gap-1" title="Alinhar ao Centro"><AlignCenter className="w-3.5 h-3.5" /> Centro</button>
                    <button type="button" onClick={() => handleAlign('right')} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 text-xs font-semibold flex items-center gap-1" title="Alinhar à Direita"><AlignRight className="w-3.5 h-3.5" /> Direita</button>
                  </div>
                </div>
              )}
            </div>

            {/* Painel Lateral de Propriedades */}
            <div className="w-80 border-l border-slate-800 bg-slate-900 p-5 overflow-y-auto space-y-6">
              {selectedObj ? (
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">Editar Objeto</h3>
                      <p className="text-[10px] text-slate-400">Registo oficial em dbo.mesas & mapamesas</p>
                    </div>
                    <span className="text-[10px] font-bold bg-slate-800 text-emerald-400 px-2 py-1 rounded-lg">ID #{selectedObj.id}</span>
                  </div>

                  {/* Forma da Mesa / Objeto */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300">Forma / Estilo Visual:</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditForm(prev => ({ ...prev, forma: 'round' }))}
                        className={`flex items-center gap-1.5 p-2 rounded-xl border text-xs font-semibold transition ${editForm.forma === 'round' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:text-white'}`}
                      >
                        <Circle className="w-3.5 h-3.5" /> Redonda
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm(prev => ({ ...prev, forma: 'square' }))}
                        className={`flex items-center gap-1.5 p-2 rounded-xl border text-xs font-semibold transition ${editForm.forma === 'square' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:text-white'}`}
                      >
                        <Square className="w-3.5 h-3.5" /> Quadrada
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm(prev => ({ ...prev, forma: 'rectangle' }))}
                        className={`flex items-center gap-1.5 p-2 rounded-xl border text-xs font-semibold transition ${editForm.forma === 'rectangle' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:text-white'}`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" /> Retangular
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm(prev => ({ ...prev, forma: 'bench' }))}
                        className={`flex items-center gap-1.5 p-2 rounded-xl border text-xs font-semibold transition ${editForm.forma === 'bench' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:text-white'}`}
                      >
                        <Armchair className="w-3.5 h-3.5" /> Bancada
                      </button>
                    </div>
                  </div>

                  {/* Número de Lugares */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">Nº de Lugares (Pessoas):</label>
                    <select
                      value={editForm.lugares}
                      onChange={(e) => setEditForm(prev => ({ ...prev, lugares: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
                    >
                      <option value="1">1 Lugar</option>
                      <option value="2">2 Lugares</option>
                      <option value="4">4 Lugares</option>
                      <option value="6">6 Lugares</option>
                      <option value="8">8 Lugares</option>
                    </select>
                  </div>

                  {/* Cor Personalizada */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300">Cor Personalizada:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editForm.cor_hex}
                        onChange={(e) => setEditForm(prev => ({ ...prev, cor_hex: e.target.value }))}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-slate-700 bg-slate-800 p-0.5"
                      />
                      <input
                        type="text"
                        value={editForm.cor_hex}
                        onChange={(e) => setEditForm(prev => ({ ...prev, cor_hex: e.target.value }))}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono font-semibold text-white"
                      />
                    </div>
                    {/* Paleta rápida */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {COLOR_PRESETS.map(hex => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setEditForm(prev => ({ ...prev, cor_hex: hex }))}
                          className="w-5 h-5 rounded-full border border-slate-700 shadow-2xs transition hover:scale-110"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Dimensões */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400">Largura (px):</label>
                      <input
                        type="number"
                        value={editForm.largura}
                        onChange={(e) => setEditForm(prev => ({ ...prev, largura: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400">Altura (px):</label>
                      <input
                        type="number"
                        value={editForm.altura}
                        onChange={(e) => setEditForm(prev => ({ ...prev, altura: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveObjeto}
                    disabled={isSavingObjeto}
                    className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-lg shadow-emerald-600/20"
                  >
                    {isSavingObjeto ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Atualizar Mesa & Regenerar Ícone
                  </button>
                </div>
              ) : (
                <div className="text-center py-10 space-y-3">
                  <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto text-slate-500">
                    <Move className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Nenhum Objeto Selecionado</h4>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Clica numa mesa no canvas para arrastar, duplicar, eliminar ou ajustar a forma e lugares.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Aba da Galeria de Temas HD */}
        {tab === 'preset' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-white mb-1">Galeria de Temas Visuais de Luxo</h3>
              <p className="text-xs text-slate-400 mb-4">
                Aplica um acabamento de alta definição a todas as mesas e ao fundo da sala.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {THEME_OPTIONS.map(theme => (
                  <div
                    key={theme.key}
                    onClick={() => setSelectedTheme(theme.key)}
                    className={`cursor-pointer p-4 rounded-2xl border transition flex flex-col justify-between ${selectedTheme === theme.key ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20' : 'border-slate-800 hover:border-slate-700 bg-slate-900'}`}
                  >
                    <div>
                      <div className="text-2xl mb-2">{theme.icon}</div>
                      <div className="font-bold text-white text-sm mb-1">{theme.name}</div>
                      <p className="text-xs text-slate-400 font-medium">{theme.desc}</p>
                    </div>
                    <div className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                      {selectedTheme === theme.key ? <Check className="w-3.5 h-3.5" /> : null}
                      {selectedTheme === theme.key ? 'Selecionado' : 'Escolher Tema'}
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
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                {isPreviewing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
                Pré-visualizar Tema
              </button>

              {antes && depois && (
                <button
                  type="button"
                  onClick={handleApplyPreset}
                  disabled={isApplying}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-lg"
                >
                  {isApplying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Confirmar e Aplicar à Sala
                </button>
              )}
            </div>

            {antes && depois && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Antes</div>
                  <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950">
                    <img src={`data:image/png;base64,${antes}`} alt="Antes" className="w-full" />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-emerald-400 uppercase mb-1">Depois</div>
                  <div className="border border-emerald-500/40 rounded-2xl overflow-hidden bg-slate-950">
                    <img src={`data:image/png;base64,${depois}`} alt="Depois" className="w-full" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Criar Nova Sala / Zona */}
      {showZonaModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 border border-slate-800 text-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Criar Nova Sala / Zona</h3>
              <button onClick={() => setShowZonaModal(false)} className="p-1 text-slate-400 hover:text-white rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Nome da Sala / Zona:</label>
                <input
                  type="text"
                  placeholder="Ex: Esplanada Traseira"
                  value={zonaForm.descricao}
                  onChange={(e) => setZonaForm(prev => ({ ...prev, descricao: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 font-semibold text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Largura Canvas (px):</label>
                  <input
                    type="number"
                    value={zonaForm.width}
                    onChange={(e) => setZonaForm(prev => ({ ...prev, width: Number(e.target.value) }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 font-semibold text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Altura Canvas (px):</label>
                  <input
                    type="number"
                    value={zonaForm.height}
                    onChange={(e) => setZonaForm(prev => ({ ...prev, height: Number(e.target.value) }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 font-semibold text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowZonaModal(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateZona}
                disabled={isSavingZona}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                {isSavingZona ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Criar Sala
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criar Nova Mesa / Objeto */}
      {showCreateObjModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 border border-slate-800 text-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">
                {createObjForm.tipoobjecto === 0 ? 'Criar Nova Mesa no POS' : 'Adicionar Elemento Decorativo'}
              </h3>
              <button onClick={() => setShowCreateObjModal(false)} className="p-1 text-slate-400 hover:text-white rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Número / Nome da Mesa:</label>
                <input
                  type="text"
                  placeholder="Ex: 15 (cria o número de mesa oficial no ZS Rest)"
                  value={createObjForm.nome}
                  onChange={(e) => setCreateObjForm(prev => ({ ...prev, nome: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 font-semibold text-white"
                />
              </div>

              {createObjForm.tipoobjecto === 0 && (
                <>
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Forma Visual:</label>
                    <select
                      value={createObjForm.forma}
                      onChange={(e) => setCreateObjForm(prev => ({ ...prev, forma: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 font-semibold text-white"
                    >
                      <option value="round">Mesa Redonda</option>
                      <option value="square">Mesa Quadrada</option>
                      <option value="rectangle">Mesa Retangular</option>
                      <option value="bench">Bancada / Bar</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Nº de Lugares (Lotação):</label>
                    <select
                      value={createObjForm.lugares}
                      onChange={(e) => setCreateObjForm(prev => ({ ...prev, lugares: Number(e.target.value) }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 font-semibold text-white"
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
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateObject}
                disabled={isCreatingObj}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                {isCreatingObj ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Criar Mesa no ZS Rest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
