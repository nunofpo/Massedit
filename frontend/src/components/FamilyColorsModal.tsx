import React, { useState, useEffect } from 'react';
import { Palette, X, Search, Check, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { DetailedFamilyItem, FamilyColorUpdate } from '../types';

interface FamilyColorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const PRESET_COLORS = [
  { name: 'Azul Escuro', fundo: '#1E3A8A', letra: '#FFFFFF' },
  { name: 'Azul POS', fundo: '#2563EB', letra: '#FFFFFF' },
  { name: 'Verde Tático', fundo: '#065F46', letra: '#FFFFFF' },
  { name: 'Verde Esmeralda', fundo: '#059669', letra: '#FFFFFF' },
  { name: 'Vermelho Ruby', fundo: '#991B1B', letra: '#FFFFFF' },
  { name: 'Laranja Quente', fundo: '#C2410C', letra: '#FFFFFF' },
  { name: 'Roxo Nobre', fundo: '#581C87', letra: '#FFFFFF' },
  { name: 'Cinza Antracite', fundo: '#374151', letra: '#FFFFFF' },
  { name: 'Preto Total', fundo: '#000000', letra: '#FFFFFF' },
  { name: 'Branco Neve', fundo: '#FFFFFF', letra: '#000000' }
];

export const FamilyColorsModal: React.FC<FamilyColorsModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [families, setFamilies] = useState<DetailedFamilyItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editedColors, setEditedColors] = useState<Record<number, { fundo_hex: string; letra_hex: string; apply_to_products: boolean }>>({});


  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCode, setNewCode] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createSuccessMsg, setCreateSuccessMsg] = useState<string | null>(null);

  const handleCreateFamily = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    setErrorMsg(null);
    setCreateSuccessMsg(null);
    try {
      const codeVal = newCode.trim() ? parseInt(newCode.trim(), 10) : undefined;
      const res = await fetch('/api/families/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: newName.trim(), codigo: codeVal })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao criar família.');
      }
      const data = await res.json();
      setCreateSuccessMsg(`Família "${data.family.descricao}" (Código ${data.family.codigo}) criada com sucesso!`);
      setNewName('');
      setNewCode('');
      setShowCreateForm(false);
      fetchFamilies();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setIsCreating(false);
    }
  };


  const fetchFamilies = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/families/detailed');
      if (res.ok) {
        const data: DetailedFamilyItem[] = await res.json();
        setFamilies(data);
        const initial: Record<number, { fundo_hex: string; letra_hex: string; apply_to_products: boolean }> = {};
        data.forEach(f => {
          initial[f.codigo] = {
            fundo_hex: f.fundo_hex || '#000000',
            letra_hex: f.letra_hex || '#FFFFFF',
            apply_to_products: false
          };
        });
        setEditedColors(initial);
      } else {
        setErrorMsg('Falha ao carregar lista de famílias do servidor.');
      }
    } catch (e: any) {
      setErrorMsg(`Erro de ligação: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFamilies();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleColorChange = (codigo: number, field: 'fundo_hex' | 'letra_hex', value: string) => {
    setEditedColors(prev => ({
      ...prev,
      [codigo]: {
        ...prev[codigo],
        [field]: value
      }
    }));
  };

  const handleToggleApplyProducts = (codigo: number) => {
    setEditedColors(prev => ({
      ...prev,
      [codigo]: {
        ...prev[codigo],
        apply_to_products: !prev[codigo]?.apply_to_products
      }
    }));
  };

  const handleApplyPreset = (codigo: number, fundo: string, letra: string) => {
    setEditedColors(prev => ({
      ...prev,
      [codigo]: {
        ...prev[codigo],
        fundo_hex: fundo,
        letra_hex: letra
      }
    }));
  };

  const handleSetAllApplyProducts = (apply: boolean) => {
    setEditedColors(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        const code = Number(key);
        next[code] = {
          ...next[code],
          apply_to_products: apply
        };
      });
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);

    const updates: FamilyColorUpdate[] = Object.entries(editedColors).map(([codeStr, state]) => ({
      codigo: Number(codeStr),
      fundo_hex: state.fundo_hex,
      letra_hex: state.letra_hex,
      apply_to_products: state.apply_to_products
    }));

    try {
      const res = await fetch('/api/families/update-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        onSuccess(data.message);
        onClose();
      } else {
        setErrorMsg(data.detail || data.message || 'Falha ao guardar cores das famílias.');
      }
    } catch (e: any) {
      setErrorMsg(`Erro de comunicação: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredFamilies = families.filter(f =>
    f.descricao.toLowerCase().includes(search.toLowerCase()) ||
    String(f.codigo).includes(search)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] text-slate-900">
        
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-2.5 rounded-xl border border-amber-200 text-amber-700">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Gestor de Cores das Famílias
              </h2>
              <p className="text-xs text-slate-500">
                Altere a cor de fundo e texto das famílias de botões no POS e propague para os artigos.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Search */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar por código ou nome da família..."
              className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center gap-1.5 shadow-xs"
            >
              + Criar Nova Família
            </button>
            <button
              onClick={() => handleSetAllApplyProducts(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-bold transition flex items-center gap-1.5 shadow-xs"
            >
              <Layers className="w-3.5 h-3.5" />
              Aplicar a Artigos em TODAS
            </button>
            <button
              onClick={() => handleSetAllApplyProducts(false)}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold transition shadow-xs"
            >
              Desmarcar Todas
            </button>
            <button
              onClick={fetchFamilies}
              className="p-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition shadow-xs"
              title="Recarregar famílias"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Formulário de Criação de Família com Código Personalizado */}
        {showCreateForm && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-center gap-2 font-bold text-emerald-950">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>Nova Família:</span>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[280px]">
              <input
                type="number"
                value={newCode}
                onChange={e => setNewCode(e.target.value)}
                placeholder="Código (Ex: 105)"
                title="Código da família (opcional - se deixado em branco, atribui o código seguinte)"
                className="w-28 bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nome da Família (Ex: Sobremesas)"
                className="flex-1 bg-white border border-emerald-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateFamily();
                }}
              />
              <button
                onClick={handleCreateFamily}
                disabled={isCreating || !newName.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1.5 rounded-lg transition disabled:opacity-50"
              >
                {isCreating ? 'A gravar...' : 'Gravar Família'}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewCode('');
                  setNewName('');
                }}
                className="text-slate-500 hover:text-slate-800 font-semibold px-2 py-1.5"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Success Alert */}
        {createSuccessMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2 font-bold">
            <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{createSuccessMsg}</span>
          </div>
        )}


        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Family Cards / Table */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
          {isLoading ? (
            <div className="py-16 text-center text-slate-500 text-sm font-medium">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-600" />
              A carregar famílias do SQL Server...
            </div>
          ) : filteredFamilies.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm font-medium">
              Nenhuma família encontrada com o termo "{search}".
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredFamilies.map(f => {
                const state = editedColors[f.codigo] || {
                  fundo_hex: f.fundo_hex || '#000000',
                  letra_hex: f.letra_hex || '#FFFFFF',
                  apply_to_products: false
                };

                return (
                  <div
                    key={f.codigo}
                    className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3 hover:border-slate-300 transition shadow-xs"
                  >
                    {/* Header: Code, Name, Products badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                            #{f.codigo}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 tracking-wide">
                            {f.descricao}
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                          {f.products_count} artigo(s) associado(s)
                        </p>
                      </div>

                      {/* POS Button Live Preview */}
                      <div className="text-right">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                          Simulação POS
                        </span>
                        <div
                          className="px-4 py-2 rounded-lg font-bold text-xs shadow-sm border border-slate-300 transition-all duration-200 flex items-center justify-center min-w-[100px] text-center"
                          style={{
                            backgroundColor: state.fundo_hex,
                            color: state.letra_hex
                          }}
                        >
                          {f.descricao.toUpperCase()}
                        </div>
                      </div>
                    </div>

                    {/* Color Controls */}
                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      {/* Cor de Fundo */}
                      <div>
                        <label className="text-[10px] text-slate-600 font-bold block mb-1">
                          Cor de Fundo:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={state.fundo_hex}
                            onChange={e => handleColorChange(f.codigo, 'fundo_hex', e.target.value)}
                            className="w-7 h-7 rounded border border-slate-300 bg-white cursor-pointer"
                          />
                          <input
                            type="text"
                            value={state.fundo_hex}
                            onChange={e => handleColorChange(f.codigo, 'fundo_hex', e.target.value)}
                            className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 uppercase font-mono font-semibold"
                          />
                        </div>
                      </div>

                      {/* Cor da Letra */}
                      <div>
                        <label className="text-[10px] text-slate-600 font-bold block mb-1">
                          Cor da Letra:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={state.letra_hex}
                            onChange={e => handleColorChange(f.codigo, 'letra_hex', e.target.value)}
                            className="w-7 h-7 rounded border border-slate-300 bg-white cursor-pointer"
                          />
                          <input
                            type="text"
                            value={state.letra_hex}
                            onChange={e => handleColorChange(f.codigo, 'letra_hex', e.target.value)}
                            className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 uppercase font-mono font-semibold"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Presets Bar */}
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block mb-1">
                        Paleta Rápida:
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {PRESET_COLORS.map(p => (
                          <button
                            key={p.name}
                            onClick={() => handleApplyPreset(f.codigo, p.fundo, p.letra)}
                            title={`${p.name} (Fundo: ${p.fundo}, Letra: ${p.letra})`}
                            className="w-5 h-5 rounded-md border border-slate-300 hover:scale-110 transition shadow-xs"
                            style={{ backgroundColor: p.fundo }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Propagate to Products Checkbox */}
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 hover:text-slate-900 transition font-medium">
                        <input
                          type="checkbox"
                          checked={state.apply_to_products}
                          onChange={() => handleToggleApplyProducts(f.codigo)}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                        />
                        <span>
                          Aplicar estas cores aos <strong className="text-amber-700">{f.products_count}</strong> artigos desta família <span className="text-slate-400 text-[10px] font-mono">(sync = 1)</span>
                        </span>
                      </label>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-slate-600 font-medium">
            Total de Famílias: <span className="text-slate-900 font-bold">{families.length}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition shadow-xs"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-md shadow-indigo-600/10 transition flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  A guardar no SQL Server...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Gravar Cores no SQL Server
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
