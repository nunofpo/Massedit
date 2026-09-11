import React, { useState, useEffect } from 'react';
import {
  X, Sparkles, Upload, ArrowRight, ArrowLeft, Check, AlertCircle, FileText,
  FileSpreadsheet, Download, RefreshCw, Layers, CheckCircle2, HelpCircle
} from 'lucide-react';
import {
  Family, Subfamily, Vat, MenuExtractionResponse, MenuReviewedRow,
  MenuMatchResponse, ImportRow, BulkEditPreviewResponse
} from '../types';

interface MenuImportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  families: Family[];
  subfamilies: Subfamily[];
  vats: Vat[];
  onOpenPreview: (previewData: BulkEditPreviewResponse, onConfirm: () => Promise<void>) => void;
  onSuccess: (message: string) => void;
}

export const MenuImportWizardModal: React.FC<MenuImportWizardModalProps> = ({
  isOpen,
  onClose,
  families,
  subfamilies,
  vats,
  onOpenPreview,
  onSuccess
}) => {
  const [step, setStep] = useState<number>(1);
  const [rawText, setRawText] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isMatching, setIsMatching] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Extracted rows state
  const [reviewedRows, setReviewedRows] = useState<MenuReviewedRow[]>([]);
  const [priceLabels, setPriceLabels] = useState<string[]>(['PVP']);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [matchesByRow, setMatchesByRow] = useState<Record<number, MenuMatchResponse>>({});

  // Price column mapping (label -> pvp1..10)
  const [priceMapping, setPriceMapping] = useState<Record<string, string>>({
    'PVP': 'pvp1',
    'Sala': 'pvp1',
    'Take Away': 'pvp2'
  });

  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    setErrorMsg(null);

    try {
      if (file.name.toLowerCase().endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const text = (evt.target?.result as string) || '';
          setRawText(text);
          setUploadedFileName(file.name);
          setIsUploadingFile(false);
        };
        reader.onerror = () => {
          setErrorMsg('Falha ao ler o ficheiro de texto.');
          setIsUploadingFile(false);
        };
        reader.readAsText(file, 'utf-8');
      } else {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/menu-import/upload-pdf', {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          const data = await res.json();
          setRawText(data.text);
          setUploadedFileName(data.filename);
        } else {
          const err = await res.json();
          setErrorMsg(err.detail || 'Falha ao extrair texto do PDF.');
        }
        setIsUploadingFile(false);
      }
    } catch (err: any) {
      setErrorMsg(`Erro no envio do ficheiro: ${err.message}`);
      setIsUploadingFile(false);
    }
  };

  // Step 1: Text extraction
  const handleExtractText = async () => {
    if (!rawText.trim()) {
      setErrorMsg('Cole o texto da ementa ou de um PDF para iniciar a extração.');
      return;
    }
    setIsExtracting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/menu-import/extract-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText })
      });
      if (!res.ok) throw new Error('Falha ao processar texto.');
      const data: MenuExtractionResponse = await res.json();
      
      const rows: MenuReviewedRow[] = [];
      data.secoes.forEach(sec => {
        sec.artigos.forEach(art => {
          const precosDict: Record<string, number | null> = {};
          art.precos.forEach(p => {
            precosDict[p.rotulo] = p.valor;
          });
          rows.push({
            seccao: sec.nome,
            subseccao: sec.subsecao || '',
            nome: art.nome,
            descricaocurta: art.nome.slice(0, 20),
            precos: precosDict,
            confianca: art.confianca,
            notas: art.notas,
            matched_codigo: null,
            match_status: 'new',
            selected_familia: families.length > 0 ? families[0].codigo : null,
            selected_subfamilia: null,
            selected_iva: 23.0
          });
        });
      });

      setReviewedRows(rows);
      setPriceLabels(data.rotulos_preco_encontrados.length > 0 ? data.rotulos_preco_encontrados : ['PVP']);
      setWarnings(data.avisos);
      setStep(2);
    } catch (e: any) {
      setErrorMsg(`Erro na extração: ${e.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  // Step 3 trigger: Automated matching search
  const handleProceedToMatching = async () => {
    setIsMatching(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/menu-import/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewedRows)
      });
      if (!res.ok) throw new Error('Falha na correspondência de artigos.');
      const matchesData: MenuMatchResponse[] = await res.json();
      
      const map: Record<number, MenuMatchResponse> = {};
      const updatedRows = [...reviewedRows];

      matchesData.forEach(m => {
        map[m.row_index] = m;
        if (m.matches.length === 1 && m.matches[0].similarity === 1.0) {
          updatedRows[m.row_index].matched_codigo = m.matches[0].codigo;
          updatedRows[m.row_index].match_status = 'matched';
        } else if (m.matches.length > 0) {
          updatedRows[m.row_index].match_status = 'ambiguous';
        } else {
          updatedRows[m.row_index].match_status = 'new';
        }
      });

      setMatchesByRow(map);
      setReviewedRows(updatedRows);
      setStep(3);
    } catch (e: any) {
      setErrorMsg(`Erro: ${e.message}`);
    } finally {
      setIsMatching(false);
    }
  };

  // Step 4A: Export ZoneSoft CSV
  const handleExportZSTemplate = async () => {
    try {
      const res = await fetch('/api/menu-import/export-zs-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewedRows)
      });
      if (!res.ok) throw new Error('Falha ao gerar ficheiro.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `artigos_zonesoft_importacao_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  // Step 4B: Update existing products via PreviewModal and apply_import
  const handleUpdateExisting = async () => {
    try {
      const res = await fetch('/api/menu-import/to-import-rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: reviewedRows.filter(r => r.matched_codigo),
          price_mapping: priceMapping
        })
      });
      if (!res.ok) throw new Error('Falha ao preparar artigos.');
      const importRows: ImportRow[] = await res.json();

      if (importRows.length === 0) {
        alert('Nenhum artigo da ementa foi associado a um artigo existente para atualização.');
        return;
      }

      // Dry-Run Preview
      const previewRes = await fetch('/api/products/preview-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: importRows })
      });
      if (!previewRes.ok) throw new Error('Falha na simulação de importação.');
      const previewData: BulkEditPreviewResponse = await previewRes.json();

      onOpenPreview(previewData, async () => {
        const applyRes = await fetch('/api/products/apply-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: importRows })
        });
        if (!applyRes.ok) throw new Error('Falha na gravação atómica.');
        const data = await applyRes.json();
        onSuccess(data.message);
        onClose();
      });
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-6xl h-[88vh] flex flex-col shadow-2xl overflow-hidden text-slate-900">
        
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-violet-600 p-2.5 rounded-xl text-white shadow-md shadow-violet-600/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Assistente de Importação de Ementas
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-800 border border-violet-200 font-semibold">
                  Passo {step} de 4
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Transforme ementas em artigos estruturados para a ZoneSoft com revisão obrigatória e validação segura.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Navigation Banner */}
        <div className="bg-slate-100/70 px-6 py-2 border-b border-slate-200 flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-6">
            <span className={step === 1 ? 'text-violet-700 font-bold flex items-center gap-1.5' : 'text-slate-500'}>
              <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px]">1</span>
              1. Carregar Ementa
            </span>
            <span className={step === 2 ? 'text-violet-700 font-bold flex items-center gap-1.5' : 'text-slate-500'}>
              <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px]">2</span>
              2. Rever Tabela ({reviewedRows.length})
            </span>
            <span className={step === 3 ? 'text-violet-700 font-bold flex items-center gap-1.5' : 'text-slate-500'}>
              <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px]">3</span>
              3. Mapear Famílias & Artigos
            </span>
            <span className={step === 4 ? 'text-violet-700 font-bold flex items-center gap-1.5' : 'text-slate-500'}>
              <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px]">4</span>
              4. Gerar Resultado
            </span>
          </div>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-2 text-xs text-rose-800 font-semibold flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="underline hover:opacity-80">Fechar</button>
          </div>
        )}

        {/* Content Body based on Step */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* STEP 1: LOAD */}
          {step === 1 && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs text-amber-900 leading-relaxed">
                <strong>Nota sobre privacidade e extração direta:</strong>
                <p className="mt-1 text-amber-800">
                  Pode carregar um ficheiro PDF / TXT do seu computador ou colar o texto diretamente. A leitura direta local é rápida, segura e não envia dados para serviços externos.
                </p>
              </div>

              {/* Botão de Selecionar Ficheiro PDF / TXT */}
              <div className="border-2 border-dashed border-violet-200 hover:border-violet-400 bg-violet-50/50 hover:bg-violet-50 p-6 rounded-2xl text-center transition flex flex-col items-center justify-center gap-2">
                <input
                  type="file"
                  id="menu-pdf-upload-input"
                  accept=".pdf,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label
                  htmlFor="menu-pdf-upload-input"
                  className="cursor-pointer flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md shadow-violet-600/20 transition"
                >
                  {isUploadingFile ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Upload className="w-4 h-4 text-white" />
                  )}
                  {isUploadingFile ? 'A Ler Ficheiro...' : 'Carregar Ficheiro da Ementa (PDF / TXT)'}
                </label>
                <span className="text-xs text-slate-500 font-medium mt-1">
                  Clique no botão para selecionar um ficheiro <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">.pdf</code> ou <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">.txt</code> do computador
                </span>
                {uploadedFileName && (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full mt-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Ficheiro "{uploadedFileName}" carregado com sucesso!
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Ou Cole o Texto da Ementa / Artigos:
                </label>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`ENTRADAS\nPão com manteiga 1.50 €\nAzeitonas temperadas 2.00 €\n\nPRATOS DE CARNE\nBitoque da Casa 9.50 €\nBife da Vazia 12.00 €\n\nBEBIDAS\nÁgua Mineral 1.20 €\nRefrigerante 1.80 €`}
                  rows={10}
                  className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleExtractText}
                  disabled={isExtracting || !rawText.trim()}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md shadow-violet-600/20 transition disabled:opacity-50"
                >
                  {isExtracting ? 'A extrair artigos...' : 'Ler Ementa e Avançar'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: REVIEW */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Revisão dos Artigos Extraídos</h3>
                  <p className="text-xs text-slate-500">Confirme nomes, secções e preços antes de mapear com a base de dados.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                  </button>
                  <button
                    type="button"
                    onClick={handleProceedToMatching}
                    disabled={isMatching || reviewedRows.length === 0}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg shadow-xs"
                  >
                    {isMatching ? 'A pesquisar correspondências...' : 'Avançar para Mapeamento'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Secção</th>
                      <th className="px-3 py-2">Nome / Designação</th>
                      <th className="px-3 py-2">Desc. Curta</th>
                      <th className="px-3 py-2">Preço PVP</th>
                      <th className="px-3 py-2">Confiança</th>
                      <th className="px-3 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {reviewedRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-1.5">
                          <input
                            type="text"
                            value={row.seccao}
                            onChange={(e) => {
                              const updated = [...reviewedRows];
                              updated[idx].seccao = e.target.value;
                              setReviewedRows(updated);
                            }}
                            className="bg-transparent border-b border-transparent focus:border-violet-500 text-xs font-semibold"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="text"
                            value={row.nome}
                            onChange={(e) => {
                              const updated = [...reviewedRows];
                              updated[idx].nome = e.target.value;
                              setReviewedRows(updated);
                            }}
                            className="w-full bg-transparent border-b border-transparent focus:border-violet-500 text-xs font-bold text-slate-900"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="text"
                            maxLength={20}
                            value={row.descricaocurta}
                            onChange={(e) => {
                              const updated = [...reviewedRows];
                              updated[idx].descricaocurta = e.target.value;
                              setReviewedRows(updated);
                            }}
                            className="w-full bg-transparent border-b border-transparent focus:border-violet-500 text-xs text-slate-600"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            step="0.05"
                            value={row.precos['PVP'] !== null && row.precos['PVP'] !== undefined ? row.precos['PVP'] : ''}
                            onChange={(e) => {
                              const updated = [...reviewedRows];
                              updated[idx].precos['PVP'] = e.target.value ? parseFloat(e.target.value) : null;
                              setReviewedRows(updated);
                            }}
                            placeholder="Sem preço"
                            className="w-24 bg-transparent border-b border-transparent focus:border-violet-500 text-xs font-bold text-indigo-700"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            row.confianca >= 0.8 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                          }`}>
                            {(row.confianca * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = reviewedRows.filter((_, i) => i !== idx);
                              setReviewedRows(updated);
                            }}
                            className="text-rose-600 hover:text-rose-800 text-xs"
                            title="Remover artigo"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: MAPPING */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Mapeamento de Famílias e Correspondências</h3>
                  <p className="text-xs text-slate-500">Associe as secções a famílias existentes e confirme artigos existentes vs novos.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg shadow-xs"
                  >
                    Avançar para Resultado <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Artigo da Ementa</th>
                      <th className="px-3 py-2">Família ZoneSoft</th>
                      <th className="px-3 py-2">Taxa de IVA</th>
                      <th className="px-3 py-2">Estado na DB</th>
                      <th className="px-3 py-2">Correspondência Selecionada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {reviewedRows.map((row, idx) => {
                      const matchData = matchesByRow[idx];
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-bold text-slate-900">
                            {row.nome}
                            <span className="block text-[10px] font-normal text-slate-400 font-sans">
                              {row.seccao} • {row.precos['PVP'] ? `${row.precos['PVP']} €` : 'S/ preço'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={row.selected_familia || ''}
                              onChange={(e) => {
                                const val = e.target.value ? parseInt(e.target.value, 10) : null;
                                const updated = [...reviewedRows];
                                updated[idx].selected_familia = val;
                                setReviewedRows(updated);
                              }}
                              className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs"
                            >
                              <option value="">(Sem Família)</option>
                              {families.map(f => (
                                <option key={f.codigo} value={f.codigo}>{f.descricao}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={row.selected_iva !== null && row.selected_iva !== undefined ? row.selected_iva : 23}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                const updated = [...reviewedRows];
                                updated[idx].selected_iva = val;
                                setReviewedRows(updated);
                              }}
                              className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs"
                            >
                              {vats.map(v => (
                                <option key={v.codigo} value={v.factor}>{v.descricao || `${v.factor}%`}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            {row.match_status === 'matched' ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                Encontrado (#{row.matched_codigo})
                              </span>
                            ) : row.match_status === 'ambiguous' ? (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                                Várias Opções
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                                Artigo Novo
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {matchData?.matches && matchData.matches.length > 0 ? (
                              <select
                                value={row.matched_codigo || ''}
                                onChange={(e) => {
                                  const val = e.target.value ? parseInt(e.target.value, 10) : null;
                                  const updated = [...reviewedRows];
                                  updated[idx].matched_codigo = val;
                                  updated[idx].match_status = val ? 'matched' : 'new';
                                  setReviewedRows(updated);
                                }}
                                className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs max-w-[200px] truncate"
                              >
                                <option value="">Criar como Novo Artigo</option>
                                {matchData.matches.map(m => (
                                  <option key={m.codigo} value={m.codigo}>
                                    #{m.codigo} - {m.descricao} ({Math.round(m.similarity * 100)}%)
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-slate-400 text-xs">Novo</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 4: RESULT */}
          {step === 4 && (
            <div className="max-w-3xl mx-auto space-y-6 py-4">
              <div className="text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                <h3 className="text-lg font-bold text-slate-900">Ementa Pronta para Processamento</h3>
                <p className="text-xs text-slate-500">Escolha como pretende aplicar os artigos da ementa:</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Option A: Official ZoneSoft Import File */}
                <div className="bg-white border-2 border-slate-200 hover:border-violet-400 rounded-2xl p-5 shadow-xs flex flex-col justify-between transition">
                  <div>
                    <div className="flex items-center gap-2 text-violet-700 font-bold text-sm mb-1">
                      <FileSpreadsheet className="w-5 h-5" />
                      Opção A: Template ZoneSoft
                    </div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Para Artigos Novos</span>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Gera o ficheiro CSV oficial pronto a importar através do utilitário oficial de importação da ZoneSoft (com colunas de código, designação, família, unidade, IVA e PVP).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportZSTemplate}
                    className="mt-6 w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-xl transition shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    Descarregar Ficheiro ZoneSoft
                  </button>
                </div>

                {/* Option B: Update Existing Database Products */}
                <div className="bg-white border-2 border-slate-200 hover:border-violet-400 rounded-2xl p-5 shadow-xs flex flex-col justify-between transition">
                  <div>
                    <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm mb-1">
                      <Layers className="w-5 h-5" />
                      Opção B: Atualizar Existentes
                    </div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Para Artigos Associados</span>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Atualiza os preços, descrições curtas e famílias dos artigos existentes na base de dados, com simulação prévia (Dry-Run), cópia de segurança automática e gravação atómica.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleUpdateExisting}
                    className="mt-6 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 rounded-xl transition shadow-md shadow-indigo-600/20"
                  >
                    <Sparkles className="w-4 h-4" />
                    Simular & Atualizar Existentes
                  </button>
                </div>

              </div>

              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Mapeamento
                </button>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
