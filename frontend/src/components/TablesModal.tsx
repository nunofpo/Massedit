import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Search, CheckCircle2, AlertCircle, RefreshCw,
  Edit3, Save, AlertTriangle, Filter, Utensils, LayoutGrid,
  Check, ArrowRight, RotateCcw
} from 'lucide-react';
import { TableItem, TableDataResponse, BulkEditPreviewResponse, ProductDiff } from '../types';

interface TablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export const TablesModal: React.FC<TablesModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [tables, setTables] = useState<TableItem[]>([]);
  const [salas, setSalas] = useState<{ codigo: number; descricao: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSala, setSelectedSala] = useState<number | 'all'>('all');

  // Map of edited table names: codigo -> new description
  const [editedNames, setEditedNames] = useState<Record<number, string>>({});
  
  // Bulk prefix/replace tool states
  const [showBulkTool, setShowBulkTool] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [prefixText, setPrefixText] = useState('');

  // Dry-run preview modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<BulkEditPreviewResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadTables = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const q = new URLSearchParams();
      if (search) q.append('search', search);
      if (selectedSala !== 'all') q.append('sala', String(selectedSala));

      const res = await fetch(`/api/tables?${q.toString()}`);
      if (res.ok) {
        const data: TableDataResponse = await res.json();
        setTables(data.tables);
        setSalas(data.salas);
      } else {
        const err = await res.json();
        setErrorMessage(err.detail || 'Falha ao carregar mesas.');
      }
    } catch (e) {
      console.error('Erro ao carregar mesas:', e);
      setErrorMessage('Erro de comunicação com o servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTables();
      setEditedNames({});
      setFindText('');
      setReplaceText('');
      setPrefixText('');
    }
  }, [isOpen, selectedSala]);

  const filteredTables = useMemo(() => {
    return tables.filter(t => {
      const matchSearch = !search.trim() || 
        t.descricao.toLowerCase().includes(search.toLowerCase()) ||
        String(t.codigo).includes(search) ||
        (t.sala_desc && t.sala_desc.toLowerCase().includes(search.toLowerCase()));
      const matchSala = selectedSala === 'all' || t.sala === selectedSala;
      return matchSearch && matchSala;
    });
  }, [tables, search, selectedSala]);

  const modifiedCount = useMemo(() => {
    return Object.entries(editedNames).filter(([codeStr, newDesc]) => {
      const original = tables.find(t => t.codigo === Number(codeStr));
      return original && original.descricao !== newDesc;
    }).length;
  }, [editedNames, tables]);

  const handleNameChange = (codigo: number, val: string) => {
    setEditedNames(prev => ({
      ...prev,
      [codigo]: val
    }));
  };

  const handleResetEdits = () => {
    setEditedNames({});
  };

  const handleApplyFindReplace = () => {
    if (!findText) return;
    const nextEdited = { ...editedNames };
    filteredTables.forEach(t => {
      const currentVal = nextEdited[t.codigo] ?? t.descricao;
      if (currentVal.includes(findText)) {
        nextEdited[t.codigo] = currentVal.split(findText).join(replaceText);
      }
    });
    setEditedNames(nextEdited);
  };

  const handleApplyPrefix = () => {
    if (!prefixText) return;
    const nextEdited = { ...editedNames };
    filteredTables.forEach(t => {
      const currentVal = nextEdited[t.codigo] ?? t.descricao;
      if (!currentVal.startsWith(prefixText)) {
        nextEdited[t.codigo] = `${prefixText}${currentVal}`;
      }
    });
    setEditedNames(nextEdited);
  };

  const handlePrepareUpdates = () => {
    const list = Object.entries(editedNames)
      .map(([codeStr, desc]) => ({
        codigo: Number(codeStr),
        descricao: desc.trim()
      }))
      .filter(item => {
        const orig = tables.find(t => t.codigo === item.codigo);
        return orig && orig.descricao !== item.descricao;
      });

    return list;
  };

  const handleOpenPreview = async () => {
    const updates = handlePrepareUpdates();
    if (updates.length === 0) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/tables/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: updates })
      });
      if (res.ok) {
        const data: BulkEditPreviewResponse = await res.json();
        setPreviewData(data);
        setIsPreviewOpen(true);
      } else {
        const err = await res.json();
        setErrorMessage(err.detail || 'Erro na pré-visualização das alterações.');
      }
    } catch (e) {
      setErrorMessage('Erro de ligação ao servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSave = async () => {
    const updates = handlePrepareUpdates();
    if (updates.length === 0) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/tables/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: updates })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsPreviewOpen(false);
        onSuccess(data.message || `${data.updated_count} mesas atualizadas com sucesso!`);
        onClose();
      } else {
        setErrorMessage(data.message || data.detail || 'Falha ao gravar alterações de mesas.');
      }
    } catch (e) {
      setErrorMessage('Erro de comunicação com o servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Utensils className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Gestão de Mesas e Salas
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                  ZoneSoft POS
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Altere a designação visual das mesas no mapa do POS (dbo.mapamesas → nomeobjecto & dbo.mesas, sync = 1)
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[300px]">
            {/* Search */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                placeholder="Pesquisar mesa, número ou sala..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Filter by Sala */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={selectedSala}
                onChange={e => setSelectedSala(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">Todas as Salas ({salas.length})</option>
                {salas.map(s => (
                  <option key={s.codigo} value={s.codigo}>
                    {s.descricao}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={loadTables}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
              title="Recarregar mesas"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowBulkTool(!showBulkTool)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition flex items-center gap-1.5 ${
                showBulkTool 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Substituição em Lote
            </button>

            {modifiedCount > 0 && (
              <button
                onClick={handleResetEdits}
                className="px-3 py-2 text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 rounded-lg transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Desfazer ({modifiedCount})
              </button>
            )}
          </div>
        </div>

        {/* Bulk Replace Bar (Expandable) */}
        {showBulkTool && (
          <div className="p-4 bg-slate-950 border-b border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Procurar texto (ex: Mesa)"
                value={findText}
                onChange={e => setFindText(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 text-xs rounded-lg text-slate-200"
              />
              <input
                type="text"
                placeholder="Substituir por (ex: M)"
                value={replaceText}
                onChange={e => setReplaceText(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 text-xs rounded-lg text-slate-200"
              />
              <button
                onClick={handleApplyFindReplace}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition"
              >
                Substituir
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Prefixar texto (ex: Esp. )"
                value={prefixText}
                onChange={e => setPrefixText(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 text-xs rounded-lg text-slate-200"
              />
              <button
                onClick={handleApplyPrefix}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
              >
                Adicionar Prefixo
              </button>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="m-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tables Grid / List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
              <p className="text-sm font-medium">A carregar mesas da base de dados ZoneSoft...</p>
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2">
              <LayoutGrid className="w-10 h-10 text-slate-600" />
              <p className="text-sm font-medium">Nenhuma mesa encontrada com os filtros atuais.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTables.map(t => {
                const currentVal = editedNames[t.codigo] ?? t.descricao;
                const isModified = currentVal !== t.descricao;

                return (
                  <div
                    key={t.codigo}
                    className={`p-4 rounded-xl border transition-all ${
                      isModified
                        ? 'bg-emerald-950/20 border-emerald-500/50 shadow-lg shadow-emerald-950/20'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <Utensils className="w-3.5 h-3.5 text-emerald-400" />
                        Mesa #{t.codigo}
                      </span>
                      
                      {t.sala_desc && (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-slate-800 text-slate-300 rounded-md border border-slate-700">
                          {t.sala_desc}
                        </span>
                      )}
                    </div>

                    <div className="mt-2">
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Nome no POS:
                      </label>
                      <input
                        type="text"
                        value={currentVal}
                        onChange={e => handleNameChange(t.codigo, e.target.value)}
                        placeholder="Nome da Mesa"
                        maxLength={50}
                        className={`w-full px-3 py-2 text-sm rounded-lg border font-medium focus:outline-none transition ${
                          isModified
                            ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200'
                            : 'bg-slate-900 border-slate-700 text-slate-100 focus:border-emerald-500'
                        }`}
                      />
                    </div>

                    {isModified && (
                      <div className="mt-2 flex items-center justify-between text-[11px] text-emerald-400 font-medium">
                        <span>Alterado de: "{t.descricao}"</span>
                        <button
                          onClick={() => {
                            const next = { ...editedNames };
                            delete next[t.codigo];
                            setEditedNames(next);
                          }}
                          className="hover:underline text-slate-400"
                        >
                          Anular
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Total: <span className="font-semibold text-slate-200">{filteredTables.length}</span> mesas | 
            Modificadas: <span className="font-semibold text-emerald-400">{modifiedCount}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
            >
              Cancelar
            </button>

            <button
              onClick={handleOpenPreview}
              disabled={modifiedCount === 0 || isSubmitting}
              className={`px-5 py-2 text-sm font-semibold rounded-xl transition flex items-center gap-2 ${
                modifiedCount > 0 && !isSubmitting
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40'
                  : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  A validar...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Pré-visualizar & Gravar ({modifiedCount})
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Dry-run Preview Modal */}
      {isPreviewOpen && previewData && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden text-slate-100">
            <div className="p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Confirmação de Alterações de Mesas</h3>
                  <p className="text-xs text-slate-400">Verifique as alterações antes de atualizar o POS ZoneSoft</p>
                </div>
              </div>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[60vh] space-y-3">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-center">
                  <div className="text-xs text-slate-400">Mesas Selecionadas</div>
                  <div className="text-xl font-bold text-slate-100">{previewData.total_selected}</div>
                </div>
                <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-center">
                  <div className="text-xs text-emerald-400">Mesas a Atualizar</div>
                  <div className="text-xl font-bold text-emerald-300">{previewData.total_affected}</div>
                </div>
              </div>

              <div className="space-y-2">
                {previewData.previews.map(p => (
                  <div key={p.codigo} className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <div className="text-xs font-semibold text-slate-300 mb-2">
                      Mesa #{p.codigo} ({p.descricao})
                    </div>
                    {p.diffs.map((d, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-slate-400">{d.field_label}:</span>
                        <span className="text-rose-400 line-through">{String(d.old_value)}</span>
                        <ArrowRight className="w-3 h-3 text-slate-500" />
                        <span className="text-emerald-400 font-semibold">{String(d.new_value)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
              >
                Voltar
              </button>

              <button
                onClick={handleConfirmSave}
                disabled={isSubmitting}
                className="px-6 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-950/50 transition flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    A aplicar...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirmar & Atualizar POS (sync = 1)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
