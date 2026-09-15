import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  RotateCcw,
  RotateCw,
  Square,
  Upload,
  Trash2,
  Check,
  X,
  Sparkles,
  Maximize2
} from 'lucide-react';
import { EmentaProductItem } from '../types';

interface ImageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: EmentaProductItem | null;
  onSaveSuccess: (updatedUrl: string | null) => void;
  onSuccessMsg: (msg: string) => void;
}

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  isOpen,
  onClose,
  product,
  onSaveSuccess,
  onSuccessMsg
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rotateDeg, setRotateDeg] = useState<number>(0);
  const [fitSquare, setFitSquare] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setPreviewUrl(product.image_url || null);
      setSelectedFile(null);
      setRotateDeg(0);
      setFitSquare(true);
      setErrorMsg(null);
    }
  }, [product]);

  if (!isOpen || !product) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        setErrorMsg('A imagem excede o tamanho máximo de 10 MB.');
        return;
      }
      setSelectedFile(file);
      setErrorMsg(null);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleRotateLeft = () => {
    setRotateDeg((prev) => (prev - 90 + 360) % 360);
  };

  const handleRotateRight = () => {
    setRotateDeg((prev) => (prev + 90) % 360);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('rotate_deg', rotateDeg.toString());
        formData.append('fit_square', fitSquare ? 'true' : 'false');

        const res = await fetch(`/api/ementa-digital/upload-image/${product.codigo}`, {
          method: 'POST',
          body: formData
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Erro ao carregar imagem.');
        }

        const data = await res.json();
        onSaveSuccess(data.image_url);
        onSuccessMsg(`Imagem do artigo #${product.codigo} ajustada (máx 600x600 px) e guardada!`);
        onClose();
      } else if (previewUrl) {
        const res = await fetch(`/api/ementa-digital/edit-image/${product.codigo}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rotate_deg: rotateDeg,
            fit_square: fitSquare
          })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Erro ao editar imagem.');
        }

        const data = await res.json();
        onSaveSuccess(data.image_url);
        onSuccessMsg(`Edição de imagem do artigo #${product.codigo} guardada com sucesso!`);
        onClose();
      } else {
        setErrorMsg('Por favor selecione uma imagem para carregar.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao guardar imagem.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Deseja realmente remover a imagem do artigo #${product.codigo}?`)) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/ementa-digital/delete-image/${product.codigo}`, {
        method: 'POST'
      });
      if (res.ok) {
        onSaveSuccess(null);
        onSuccessMsg(`Imagem do artigo #${product.codigo} removida com sucesso.`);
        onClose();
      } else {
        const data = await res.json();
        throw new Error(data.detail || 'Erro ao remover imagem.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao remover imagem.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">
                Editor de Imagem da Ementa Digital
              </h3>
              <p className="text-xs text-slate-300">
                #{product.codigo} - {product.produto || product.pos_descricao}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* Automatic Resize Banner */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Ajuste Automático Ativo:</strong> A imagem será otimizada para o tamanho máximo de <strong>600x600 px</strong> ao guardar.
              </span>
            </div>
          </div>

          {/* Image Preview Canvas */}
          <div className="flex flex-col items-center justify-center bg-slate-950 rounded-xl p-6 border border-slate-800 min-h-[260px] relative group">
            {previewUrl ? (
              <div className="relative flex items-center justify-center max-w-[280px] max-h-[280px] overflow-hidden rounded-lg border-2 border-dashed border-amber-500/50 shadow-lg bg-white">
                <img
                  src={previewUrl}
                  alt="Pré-visualização"
                  style={{
                    transform: `rotate(${rotateDeg}deg)`,
                    transition: 'transform 0.3s ease'
                  }}
                  className={`max-w-full max-h-[260px] object-contain ${
                    fitSquare ? 'aspect-square bg-white p-1' : ''
                  }`}
                />
                <div className="absolute bottom-2 right-2 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1 border border-slate-700">
                  <Maximize2 className="w-3 h-3 text-amber-400" />
                  <span>Max 600 x 600 px</span>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400 py-10 space-y-3">
                <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300">Nenhuma imagem associada</p>
                  <p className="text-xs text-slate-500">Selecione um ficheiro JPG, PNG ou WebP</p>
                </div>
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="space-y-4">
            {/* File Upload Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Selecionar Ficheiro de Imagem
              </label>
              <label className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-xl cursor-pointer transition text-sm font-medium text-slate-700 hover:text-amber-600">
                <Upload className="w-4 h-4 text-amber-500" />
                <span>{selectedFile ? selectedFile.name : 'Escolher ficheiro do computador...'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {/* Editing Controls (Rotation & Fitting) */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Rotação da Imagem
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRotateLeft}
                    className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition"
                    title="Rodar -90°"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                    <span>-90°</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRotateRight}
                    className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition"
                    title="Rodar +90°"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-slate-600" />
                    <span>+90°</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Formato de Enquadramento
                </label>
                <button
                  type="button"
                  onClick={() => setFitSquare(!fitSquare)}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition ${
                    fitSquare
                      ? 'bg-amber-500/10 border-amber-500 text-amber-700 font-semibold'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Square className={`w-3.5 h-3.5 ${fitSquare ? 'text-amber-600' : 'text-slate-500'}`} />
                  <span>{fitSquare ? 'Tela 1:1 (600x600px)' : 'Proporção Original'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div>
            {product.image_url && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || isSaving}
                className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'A remover...' : 'Remover Imagem'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || (!selectedFile && !previewUrl)}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-amber-500/20 transition disabled:opacity-50"
            >
              {isSaving ? (
                <span>A otimizar (600x600px)...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Guardar Imagem</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
