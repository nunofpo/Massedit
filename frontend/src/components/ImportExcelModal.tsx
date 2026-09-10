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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] text-slate-900">
        
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2.5 rounded-xl border border-emerald-200 text-emerald-700">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Importar Preços & Artigos do Excel (.csv / .xlsx)
              </h2>
              <p className="text-xs text-slate-500">
                Atualize preços PVP1..10, cores, famílias e taxas de IVA diretamente a partir de um ficheiro Excel.
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          
          {/* File Upload Area */}
          {!fileContent ? (
            <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-8 text-center bg-white transition group shadow-xs">
              <Upload className="w-12 h-12 text-slate-400 group-hover:text-emerald-600 mx-auto mb-3 transition" />
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Selecione ou Arraste o Ficheiro Excel / CSV para Importar
              </h3>
              <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto leading-relaxed">
                O ficheiro deve conter a coluna <strong className="text-emerald-700">Codigo</strong> e as colunas que pretende atualizar (ex: <strong className="text-slate-800">PVP1, PVP2, Designacao, Familia, IVA</strong>).
              </p>
              
              <div className="flex items-center justify-center gap-3">
                <label className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-md shadow-emerald-600/10 transition flex items-center gap-2">
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
                  className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl border border-slate-300 transition flex items-center gap-1.5 shadow-xs"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  Baixar Modelo Excel (.csv)
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">{fileName}</span>
                  <span className="text-[11px] text-slate-500 font-mono font-semibold">
                    {parsedRows.length} registos identificados
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-slate-600 hover:text-rose-700 bg-slate-100 hover:bg-rose-50 border border-slate-200 px-3 py-1.5 rounded-lg transition font-semibold"
              >
                Trocar Ficheiro
              </button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="py-12 text-center text-slate-600 text-sm font-semibold">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-emerald-600" />
              A analisar ficheiro e a gerar simulação dry-run...
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Preview Dry-Run Metrics & Diff Table */}
          {previewData && !isLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-xs">
                  <span className="text-[11px] text-slate-500 block font-semibold">Total de Registos no Ficheiro</span>
                  <span className="text-xl font-black text-slate-900">{previewData.total_file_rows}</span>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl shadow-xs">
                  <span className="text-[11px] text-emerald-800 block font-semibold">Artigos Válidos a Atualizar</span>
                  <span className="text-xl font-black text-emerald-700">{previewData.matched_products_count}</span>
                </div>

                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl shadow-xs">
                  <span className="text-[11px] text-amber-800 block font-semibold">Alterações Bloqueadas</span>
                  <span className="text-xl font-black text-amber-700">{previewData.blocked_descriptions_count}</span>
                </div>
              </div>

              {/* Table of Differences */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="p-3 bg-slate-100 border-b border-slate-200 font-bold text-xs text-slate-800 flex items-center justify-between">
                  <span>Pré-visualização das Alterações a Aplicar</span>
                  <span className="text-[11px] text-slate-500 font-normal font-mono">
                    Mostrando até {previewData.previews.length} registos
                  </span>
                </div>

                <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 text-xs">
                  {previewData.previews.map((item) => (
                    <div key={item.codigo} className="p-3 hover:bg-slate-50 transition space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 text-[10px]">
                            #{item.codigo}
                          </span>
                          <span className="font-bold text-slate-900">{item.descricao}</span>
                        </div>

                        {item.has_sales && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-amber-600" />
                            Nome Protegido (Vendas)
                          </span>
                        )}
                      </div>

                      {/* Fields changed */}
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        {item.diffs.map((diff) => (
                          diff.blocked ? (
                            <span key={diff.field_name} title={diff.reason || ''} className="bg-amber-50 text-amber-900 px-2 py-0.5 rounded border border-amber-300 font-mono">
                              <strong>{diff.field_label}: não alterado</strong>{diff.reason ? <span className="font-sans"> — {diff.reason}</span> : null}
                            </span>
                          ) : (
                            <span key={diff.field_name} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-mono">
                              <strong className="text-indigo-600">{diff.field_label}:</strong> {String(diff.old_value)} ➔ <strong className="text-emerald-700">{String(diff.new_value)}</strong>
                            </span>
                          )
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={isApplying}
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition shadow-xs"
          >
            Cancelar
          </button>

          {previewData && (
            <button
              onClick={handleConfirmImport}
              disabled={isApplying || previewData.matched_products_count === 0}
              className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-md shadow-emerald-600/10 transition flex items-center gap-2"
            >
              {isApplying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  A Importar e Gravar no SQL Server...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Confirmar & Aplicar Importação ({previewData.matched_products_count} Artigos)
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
