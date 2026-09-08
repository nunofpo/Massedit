import React, { useState } from 'react';
import { Upload, FileSpreadsheet, X, Check, AlertCircle, RefreshCw, ShieldAlert, Download, ArrowRight } from 'lucide-react';
import { ImportRow, ImportPreviewResponse } from '../types';

interface ImportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const ImportExcelModal: React.FC<ImportExcelModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [previewData, setPreviewData] = useState<ImportPreviewResponse | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setFileContent(null);
    setFileName(null);
    setParsedRows([]);
    setPreviewData(null);
    setErrorMsg(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsLoading(true);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      setFileContent(text);
      
      try {
        // 1. Parse CSV
        const parseRes = await fetch('/api/products/parse-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text })
        });

        if (!parseRes.ok) {
          const errData = await parseRes.json();
          setErrorMsg(errData.detail || 'Falha ao ler o ficheiro.');
          setIsLoading(false);
          return;
        }

        const rows: ImportRow[] = await parseRes.json();
        setParsedRows(rows);

        // 2. Fetch Preview Dry-Run
        const prevRes = await fetch('/api/products/preview-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: rows })
        });

        if (prevRes.ok) {
          const prevData: ImportPreviewResponse = await prevRes.json();
          setPreviewData(prevData);
        } else {
          const errData = await prevRes.json();
          setErrorMsg(errData.detail || 'Falha ao calcular simulação de alterações.');
        }
      } catch (err: any) {
        setErrorMsg(`Erro no processamento do ficheiro: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadSample = () => {
    const sampleCsv = `Codigo;PLU;CodBarras;Referencia;Designacao;Descricaocurta;Familia;Subfamilia;IVA;PVP1;PVP2;PVP3;PVP4;PVP5;PVP6;PVP7;PVP8;PVP9;PVP10;FundoHex;LetraHex\n1;101;5601234567890;REF001;Artigo Exemplo 1;Exemplo 1;1;1;23;10,50;12,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;#2563EB;#FFFFFF\n2;102;5601234567891;REF002;Artigo Exemplo 2;Exemplo 2;1;2;13;5,90;6,50;0,00;0,00;0,00;0,00;0,00;0,00;0,00;#059669;#FFFFFF`;
    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_importacao_artigos.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleConfirmImport = async () => {
    if (parsedRows.length === 0) return;
    setIsApplying(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/products/apply-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedRows })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onSuccess(data.message);
        onClose();
        handleReset();
      } else {
        setErrorMsg(data.detail || data.message || 'Falha ao aplicar importação na base de dados.');
      }
    } catch (err: any) {
      setErrorMsg(`Erro de comunicação: ${err.message}`);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-800/90 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/20 p-2.5 rounded-xl border border-emerald-500/30 text-emerald-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Importar Preços & Artigos do Excel (.csv / .xlsx)
              </h2>
              <p className="text-xs text-slate-400">
                Atualize preços PVP1..10, cores, famílias e taxas de IVA diretamente a partir de um ficheiro Excel.
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* File Upload Area */}
          {!fileContent ? (
            <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-2xl p-8 text-center bg-slate-950/50 transition group">
              <Upload className="w-12 h-12 text-slate-500 group-hover:text-emerald-400 mx-auto mb-3 transition" />
              <h3 className="text-sm font-bold text-slate-200 mb-1">
                Selecione ou Arraste o Ficheiro Excel / CSV para Importar
              </h3>
              <p className="text-xs text-slate-400 mb-4 max-w-md mx-auto">
                O ficheiro deve conter a coluna <strong className="text-emerald-400">Codigo</strong> e as colunas que pretende atualizar (ex: <strong className="text-slate-300">PVP1, PVP2, Designacao, Familia, IVA</strong>).
              </p>
              
              <div className="flex items-center justify-center gap-3">
                <label className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-lg shadow-emerald-600/20 transition flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Escolher Ficheiro Excel / CSV
                  <input
                    type="file"
                    accept=".csv, .txt, .xlsx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-700 transition flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  Baixar Modelo Excel (.csv)
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                <div>
                  <span className="text-xs font-bold text-white block">{fileName}</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {parsedRows.length} registos identificados
                  </span>
                </div>
              </div>

              <button
                onClick={handleReset}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 transition"
              >
                Carregar Outro Ficheiro
              </button>
            </div>
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="py-12 text-center text-slate-400 text-sm">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-emerald-400" />
              A analisar ficheiro e a comparar alterações com o SQL Server...
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-4 bg-rose-950/90 border border-rose-800 rounded-xl text-xs text-rose-200 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Dry-Run Preview Table */}
          {previewData && !isLoading && (
            <div className="space-y-4">
              {/* Stats Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Linhas no Ficheiro</span>
                  <strong className="text-base text-slate-100">{previewData.total_file_rows}</strong>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Artigos que Sofrerão Alteração</span>
                  <strong className="text-base text-emerald-400">{previewData.previews.length}</strong>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Nomes Protegidos por Vendas</span>
                  <strong className="text-base text-amber-400">{previewData.blocked_descriptions_count}</strong>
                </div>
              </div>

              {previewData.previews.length === 0 ? (
                <div className="py-8 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-400 text-xs">
                  Nenhum dos artigos do ficheiro apresenta alterações em relação ao estado atual na base de dados.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                  <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 font-bold text-xs text-slate-200">
                    Pré-visualização das Alterações a Gravar no SQL Server:
                  </div>

                  <div className="max-h-[350px] overflow-y-auto divide-y divide-slate-800/60 text-xs">
                    {previewData.previews.map(p => (
                      <div key={p.codigo} className="p-3 hover:bg-slate-900/50 transition space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800 text-[10px]">
                              #{p.codigo}
                            </span>
                            <span className="font-bold text-slate-100">{p.descricao}</span>
                          </div>

                          {p.has_sales && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800">
                              <ShieldAlert className="w-3 h-3 text-amber-400" />
                              Nome Mantido (Com Vendas)
                            </span>
                          )}
                        </div>

                        {/* Diffs List */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-4 border-l-2 border-indigo-600/40">
                          {p.diffs.map((d, idx) => (
                            <div key={idx} className="bg-slate-900/70 p-2 rounded border border-slate-800 text-[11px] flex items-center justify-between">
                              <span className="text-slate-400 font-medium">{d.field_label}:</span>
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="line-through text-slate-500">{String(d.old_value)}</span>
                                <ArrowRight className="w-3 h-3 text-emerald-400 shrink-0" />
                                <strong className={d.blocked ? "text-amber-400" : "text-emerald-400"}>
                                  {String(d.new_value)}
                                </strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="bg-slate-800/90 border-t border-slate-700 px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {previewData && (
              <span>Artigos a atualizar: <strong className="text-emerald-400">{previewData.previews.length}</strong></span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={isApplying || !previewData || previewData.previews.length === 0}
              className="px-5 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 rounded-xl shadow-lg shadow-emerald-400/20 transition flex items-center gap-2"
            >
              {isApplying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  A aplicar no SQL Server...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Confirmar e Gravar Importação na BD
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
