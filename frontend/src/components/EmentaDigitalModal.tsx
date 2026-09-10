import React, { useState, useEffect } from 'react';
import {
  X, QrCode, Copy, Check, AlertCircle, RefreshCw, Table, Database, Info, ExternalLink
} from 'lucide-react';

interface ColumnInfo {
  name: string;
  type: string;
  max_length: number;
  is_nullable: boolean;
  is_primary_key: boolean;
}

interface TableInfo {
  table_name: string;
  total_rows: number | string;
  columns: ColumnInfo[];
  sample_rows: Record<string, any>[];
}

interface EmentaSchemaResponse {
  available: boolean;
  reason?: string;
  target_table_found?: boolean;
  tables_found?: string[];
  tables: TableInfo[];
}

interface EmentaDigitalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmentaDigitalModal: React.FC<EmentaDigitalModalProps> = ({
  isOpen,
  onClose
}) => {
  const [data, setData] = useState<EmentaSchemaResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [selectedTableIndex, setSelectedTableIndex] = useState<number>(0);

  const fetchSchema = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ementa-digital/schema');
      if (res.ok) {
        const schemaData: EmentaSchemaResponse = await res.json();
        setData(schemaData);
        if (schemaData.tables && schemaData.tables.length > 0) {
          // Select dbo.ementa_digital_produtos if present, else first table
          const targetIdx = schemaData.tables.findIndex(
            t => t.table_name.toLowerCase() === 'ementa_digital_produtos'
          );
          setSelectedTableIndex(targetIdx >= 0 ? targetIdx : 0);
        }
      } else {
        setErrorMsg('Falha ao obter esquema da ementa digital do servidor.');
      }
    } catch (e: any) {
      setErrorMsg(`Erro de ligação: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSchema();
    }
  }, [isOpen]);

  const handleCopyClipboard = () => {
    if (!data) return;
    const jsonStr = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!isOpen) return null;

  const currentTable = data?.tables && data.tables.length > selectedTableIndex ? data.tables[selectedTableIndex] : null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden text-slate-900">
        
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-teal-600 p-2.5 rounded-xl text-white shadow-md shadow-teal-600/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Editor da Ementa Digital (QR Code / ZoneSoft)
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 font-semibold">
                  Fase A: Descoberta de Esquema
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Inspeção só de leitura para mapeamento seguro das colunas da tabela <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">dbo.ementa_digital_produtos</code>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyClipboard}
              disabled={!data || isLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
              }`}
              title="Copiar estrutura completa em formato JSON para partilhar com o Nuno"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              {copied ? 'Copiado para a área de transferência!' : 'Copiar Estrutura (JSON)'}
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-teal-600" />
              <span className="text-xs font-semibold">A inspecionar esquema da base de dados SQL Server...</span>
            </div>
          ) : errorMsg ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
              <h3 className="text-sm font-bold text-slate-800">Falha ao inspecionar esquema</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">{errorMsg}</p>
              <button
                onClick={fetchSchema}
                className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl"
              >
                Tentar novamente
              </button>
            </div>
          ) : !data?.available ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Database className="w-12 h-12 text-amber-500 mb-3" />
              <h3 className="text-sm font-bold text-slate-800">Tabela de Ementa Digital Não Encontrada</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                {data?.reason || 'Não foi encontrada nenhuma tabela com o termo "ementa" no schema dbo desta base de dados.'}
              </p>
              {data?.tables_found && data.tables_found.length > 0 && (
                <div className="mt-4 text-xs bg-slate-50 border border-slate-200 p-3 rounded-xl max-w-md text-left">
                  <span className="font-bold text-slate-700 block mb-1">Tabelas encontradas noutros esquemas:</span>
                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                    {data.tables_found.map(t => <li key={t} className="font-mono">{t}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Tables Sidebar */}
              <div className="w-64 bg-slate-50/60 border-r border-slate-200 flex flex-col p-3 gap-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1">
                  Tabelas Identificadas ({data.tables.length})
                </span>
                {data.tables.map((t, idx) => {
                  const isSelected = idx === selectedTableIndex;
                  return (
                    <button
                      key={t.table_name}
                      onClick={() => setSelectedTableIndex(idx)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                        isSelected
                          ? 'bg-teal-700 text-white shadow-sm'
                          : 'hover:bg-slate-200/70 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Table className="w-3.5 h-3.5 shrink-0 opacity-75" />
                        <span className="truncate font-mono">{t.table_name}</span>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                        isSelected ? 'bg-teal-800 text-teal-100' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {t.total_rows}
                      </span>
                    </button>
                  );
                })}

                <div className="mt-auto bg-amber-50 border border-amber-200 p-3 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                  <span className="font-bold block mb-1 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-amber-700" />
                    Instruções para o Nuno
                  </span>
                  Copie os detalhes desta estrutura (botão acima) e confirme:
                  <ul className="list-disc list-inside mt-1 space-y-0.5 text-amber-800">
                    <li>Coluna que liga a <code className="font-mono">dbo.produtos</code></li>
                    <li>Colunas editáveis e seu significado</li>
                    <li>Se existe coluna de <code className="font-mono">sync</code></li>
                  </ul>
                </div>
              </div>

              {/* Table Details & Sample Rows */}
              <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
                {currentTable && (
                  <>
                    {/* Summary Card */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 font-mono flex items-center gap-2">
                          dbo.{currentTable.table_name}
                          {currentTable.table_name.toLowerCase() === 'ementa_digital_produtos' && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-sans font-semibold">
                              Tabela Principal Alvo
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Total de registos: <strong className="text-slate-800 font-mono">{currentTable.total_rows}</strong> • Total de colunas: <strong className="text-slate-800 font-mono">{currentTable.columns.length}</strong>
                        </p>
                      </div>
                    </div>

                    {/* Columns Schema Table */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Table className="w-3.5 h-3.5 text-teal-600" />
                        Esquema de Colunas ({currentTable.columns.length})
                      </h4>
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                            <tr>
                              <th className="px-3 py-2">Coluna</th>
                              <th className="px-3 py-2">Tipo SQL</th>
                              <th className="px-3 py-2">Tamanho</th>
                              <th className="px-3 py-2">Nulidade</th>
                              <th className="px-3 py-2">Chave Primária</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                            {currentTable.columns.map((col) => (
                              <tr key={col.name} className="hover:bg-slate-50">
                                <td className="px-3 py-1.5 font-bold text-slate-900 flex items-center gap-1.5">
                                  {col.name}
                                </td>
                                <td className="px-3 py-1.5 text-indigo-600">{col.type}</td>
                                <td className="px-3 py-1.5 text-slate-600">{col.max_length > 0 ? col.max_length : '-'}</td>
                                <td className="px-3 py-1.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${col.is_nullable ? 'bg-slate-100 text-slate-600' : 'bg-rose-50 text-rose-700 font-bold'}`}>
                                    {col.is_nullable ? 'NULL' : 'NOT NULL'}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5">
                                  {col.is_primary_key ? (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                                      PK
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Sample Rows (TOP 5) */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-indigo-600" />
                        Amostra de Dados (TOP 5 registos)
                      </h4>
                      {currentTable.sample_rows.length === 0 ? (
                        <div className="border border-slate-200 rounded-xl p-4 bg-white text-xs text-slate-400 text-center">
                          A tabela não tem registos gravados.
                        </div>
                      ) : (
                        <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-xs">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 font-mono text-[10px]">
                              <tr>
                                {Object.keys(currentTable.sample_rows[0]).map(key => (
                                  <th key={key} className="px-3 py-2 whitespace-nowrap">{key}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                              {currentTable.sample_rows.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-slate-50">
                                  {Object.values(row).map((val, cIdx) => (
                                    <td key={cIdx} className="px-3 py-1.5 whitespace-nowrap text-slate-700">
                                      {val === null ? (
                                        <span className="text-slate-300 italic">null</span>
                                      ) : typeof val === 'boolean' ? (
                                        val ? 'true' : 'false'
                                      ) : (
                                        String(val)
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                  </>
                )}
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Esta análise é 100% segura e executa apenas consultas <code className="font-mono text-slate-700">SELECT</code> de metadados.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
