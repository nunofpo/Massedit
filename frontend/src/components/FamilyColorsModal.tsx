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

  // Mapeamento de alterações por código de família
  const [editedColors, setEditedColors] = useState<Record<number, { fundo_hex: string; letra_hex: string; apply_to_products: boolean }>>({});

  const fetchFamilies = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/families/detailed');
      if (res.ok) {
        const data: DetailedFamilyItem[] = await res.json();
        setFamilies(data);
        // Inicializar estado de edição
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

    // Filtrar apenas famílias com alterações ou com apply_to_products = true
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-800/90 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/20 p-2.5 rounded-xl border border-amber-500/30 text-amber-400">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Gestor de Cores das Famílias
              </h2>
              <p className="text-xs text-slate-400">
                Altere a cor de fundo e texto das famílias de botões no POS e propague para os artigos.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Search */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar por código ou nome da família..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSetAllApplyProducts(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-950 border border-indigo-700/60 text-indigo-300 hover:bg-indigo-900 transition flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5" />
              Aplicar a Artigos em TODAS
            </button>
            <button
              onClick={() => handleSetAllApplyProducts(false)}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition"
            >
              Desmarcar Todas
            </button>
            <button
              onClick={fetchFamilies}
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
              title="Recarregar famílias"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-rose-950/80 border border-rose-800 rounded-lg text-xs text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Family Cards / Table */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-amber-400" />
              A carregar famílias do SQL Server...
            </div>
          ) : filteredFamilies.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
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
                    className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-3 hover:border-slate-600 transition"
                  >
                    {/* Header: Code, Name, Products badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
                            #{f.codigo}
                          </span>
                          <h3 className="text-sm font-bold text-white tracking-wide">
                            {f.descricao}
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {f.products_count} artigo(s) associado(s)
                        </p>
                      </div>

                      {/* POS Button Live Preview */}
                      <div className="text-right">
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold block mb-1">
                          Simulação POS
                        </span>
                        <div
                          className="px-4 py-2 rounded-lg font-bold text-xs shadow-md border border-white/20 transition-all duration-200 flex items-center justify-center min-w-[100px] text-center"
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
                    <div className="grid grid-cols-2 gap-3 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      {/* Cor de Fundo */}
                      <div>
                        <label className="text-[10px] text-slate-400 font-semibold block mb-1">
                          Cor de Fundo:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={state.fundo_hex}
                            onChange={e => handleColorChange(f.codigo, 'fundo_hex', e.target.value)}
                            className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                          />
                          <input
                            type="text"
                            value={state.fundo_hex}
                            onChange={e => handleColorChange(f.codigo, 'fundo_hex', e.target.value)}
                            className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 uppercase font-mono"
                          />
                        </div>
                      </div>

                      {/* Cor da Letra */}
                      <div>
                        <label className="text-[10px] text-slate-400 font-semibold block mb-1">
                          Cor da Letra:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={state.letra_hex}
                            onChange={e => handleColorChange(f.codigo, 'letra_hex', e.target.value)}
                            className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                          />
                          <input
                            type="text"
                            value={state.letra_hex}
                            onChange={e => handleColorChange(f.codigo, 'letra_hex', e.target.value)}
                            className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 uppercase font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Presets Bar */}
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block mb-1">
                        Paleta Rápida:
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {PRESET_COLORS.map(p => (
                          <button
                            key={p.name}
                            onClick={() => handleApplyPreset(f.codigo, p.fundo, p.letra)}
                            title={`${p.name} (Fundo: ${p.fundo}, Letra: ${p.letra})`}
                            className="w-5 h-5 rounded-md border border-white/20 hover:scale-110 transition shadow-sm"
                            style={{ backgroundColor: p.fundo }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Propagate to Products Checkbox */}
                    <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 hover:text-white transition">
                        <input
                          type="checkbox"
                          checked={state.apply_to_products}
                          onChange={() => handleToggleApplyProducts(f.codigo)}
                          className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                        />
                        <span>
                          Aplicar estas cores aos <strong className="text-amber-400">{f.products_count}</strong> artigos desta família <span className="text-slate-500 text-[10px]">(sync = 1)</span>
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
        <div className="bg-slate-800/90 border-t border-slate-700 px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Total de Famílias: <span className="text-white font-bold">{families.length}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:bg-amber-400/50 rounded-xl shadow-lg shadow-amber-400/20 transition flex items-center gap-2"
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
