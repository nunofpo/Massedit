import os
import sys
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List, Optional

from backend.models import (
    DatabaseConfig, ProductFilter, BulkEditRequest, BulkEditPreviewResponse,
    BackupItem, DetailedFamilyItem, BulkFamilyColorUpdateRequest,
    ImportPreviewResponse, ImportApplyRequest,
    ProductionCenterItem, PrinterItem,
    SelectionSummaryRequest, SelectionSummaryResponse, ProductCodesResponse,
    DataQualityCheck, PosLayoutProductItem, PosLayoutApplyRequest
)
from backend.db import db_manager
from backend.services.products import (
    search_products, get_filtered_product_codes, get_selection_summary,
    get_families, get_families_detailed, update_family_colors,
    get_subfamilies, generate_csv_export, generate_shelf_labels_html,
    get_vats, preview_bulk_edit, apply_bulk_edit, list_backups, restore_backup,
    get_production_centers, get_printers
)
from backend.services.reports import run_data_quality_report
from backend.services.pos_layout import (
    get_pos_layout_products, preview_pos_layout, apply_pos_layout
)
from backend.services.ementa_digital import discover_ementa_schema
from fastapi.responses import HTMLResponse, Response

app = FastAPI(title="MassEdit POS API", description="API de Edição em Massa Segura de Artigos", version="1.0.0")

# A interface é servida pelo próprio servidor (mesma origem). CORS só para o servidor de desenvolvimento Vite.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

@app.get("/api/config")
def get_db_config():
    """Obtém a configuração de ligação e o estado atual da conexão ao SQL Server."""
    online, message = db_manager.test_connection()
    return {
        "config": db_manager.config.model_dump(),
        "is_connected": online,
        "use_mock": db_manager.use_mock,
        "message": message
    }

@app.post("/api/config")
def update_db_config(cfg: DatabaseConfig):
    """Atualiza a configuração da base de dados, grava-a em config.json e testa a conexão."""
    save_error = db_manager.set_config(cfg)
    online, message = db_manager.test_connection()
    if save_error:
        message = f"{message} Aviso: {save_error}"
    return {
        "config": db_manager.config.model_dump(),
        "is_connected": online,
        "use_mock": db_manager.use_mock,
        "message": message
    }

@app.get("/api/drivers")
def list_odbc_drivers():
    """Lista os drivers ODBC instalados neste computador."""
    try:
        import pyodbc
        return [d for d in pyodbc.drivers() if "SQL Server" in d]
    except Exception:
        return []

@app.get("/api/families")
def list_families_endpoint():
    """Lista famílias disponíveis para filtragem e atribuição."""
    return get_families()

@app.get("/api/subfamilies")
def list_subfamilies_endpoint(familia: Optional[int] = None):
    """Lista subfamílias disponíveis para filtragem e atribuição."""
    return get_subfamilies(familia)

@app.get("/api/production-centers", response_model=List[ProductionCenterItem])
def list_production_centers_endpoint():
    """Lista Centros de Produção disponíveis para filtragem e encaminhamento."""
    return get_production_centers()

@app.get("/api/printers", response_model=List[PrinterItem])
def list_printers_endpoint():
    """Lista Impressoras disponíveis."""
    return get_printers()


@app.get("/api/families/detailed", response_model=List[DetailedFamilyItem])
def list_families_detailed_endpoint():
    """Lista detalhada de famílias com cores de fundo/letra e contagem de artigos."""
    return get_families_detailed()

@app.post("/api/families/update-colors")
def update_family_colors_endpoint(req: BulkFamilyColorUpdateRequest):
    """Atualiza cores de fundo e letra das famílias e opcionalmente dos produtos associados."""
    success, message, affected = update_family_colors(req)
    if not success:
        raise HTTPException(status_code=500, detail=message)
    return {
        "success": True,
        "message": message,
        "affected_products_count": affected
    }

@app.get("/api/pos-layout/families", response_model=List[DetailedFamilyItem])
def list_pos_layout_families_endpoint():
    """Lista famílias para o gestor de botões POS (ordenadas por ordem/posicaofront)."""
    families = get_families_detailed()
    families.sort(key=lambda f: (f.posicaofront if f.posicaofront is not None else 0, f.codigo))
    return families

@app.get("/api/pos-layout/family/{familia}", response_model=List[PosLayoutProductItem])
def get_pos_layout_products_endpoint(familia: int, include_hidden: bool = False):
    """Obtém botões dos artigos da família para a grelha POS ordenados por ordem."""
    return get_pos_layout_products(familia, include_hidden=include_hidden)

@app.post("/api/pos-layout/preview", response_model=BulkEditPreviewResponse)
def preview_pos_layout_endpoint(req: PosLayoutApplyRequest):
    """Simula a nova ordenação dos botões POS para a família indicada."""
    try:
        return preview_pos_layout(req)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

@app.post("/api/pos-layout/apply")
def apply_pos_layout_endpoint(req: PosLayoutApplyRequest):
    """Grava a nova ordenação dos botões POS com backup e transação atómica."""
    success, message, affected = apply_pos_layout(req)
    if not success:
        raise HTTPException(status_code=400 if "duplicados" in message or "pertence" in message else 500, detail=message)
    return {
        "success": True,
        "message": message,
        "affected_count": affected
    }

@app.post("/api/products/export-csv")

def export_products_csv_endpoint(filters: ProductFilter, selected_codes: Optional[List[int]] = Body(None)):
    """Exporta lista de artigos filtrados ou selecionados para CSV Excel."""
    csv_content = generate_csv_export(filters, selected_codes)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=artigos_massedit.csv"}
    )

@app.post("/api/products/print-labels")
def print_shelf_labels_endpoint(product_codes: List[int] = Body(...)):
    """Gera página HTML de etiquetas de prateleira pronta para impressão."""
    if not product_codes:
        raise HTTPException(status_code=400, detail="Selecione pelo menos 1 artigo para imprimir etiquetas.")
    html_content = generate_shelf_labels_html(product_codes)
    return HTMLResponse(content=html_content)

@app.post("/api/products/parse-import")
def parse_import_endpoint(content: str = Body(..., embed=True)):
    """Faz o parse do conteúdo CSV/Excel importado."""
    from backend.services.products import parse_import_csv
    rows = parse_import_csv(content)
    if not rows:
        raise HTTPException(status_code=400, detail="Não foi possível identificar registos válidos com a coluna 'Codigo' no ficheiro.")
    return [r.model_dump() for r in rows]

@app.post("/api/products/preview-import", response_model=ImportPreviewResponse)
def preview_import_endpoint(req: ImportApplyRequest):
    """Simula as alterações em massa resultantes da importação do Excel (Dry-Run)."""
    from backend.services.products import preview_import
    if not req.items:
        raise HTTPException(status_code=400, detail="Ficheiro sem artigos válidos para importar.")
    return preview_import(req.items)

@app.post("/api/products/apply-import")
def apply_import_endpoint(req: ImportApplyRequest):
    """Aplica as alterações importadas do Excel na base de dados SQL Server com transação atómica e backup."""
    from backend.services.products import apply_import
    if not req.items:
        raise HTTPException(status_code=400, detail="Ficheiro sem artigos válidos para importar.")
    
    success, message, count = apply_import(req.items)
    if not success:
        raise HTTPException(status_code=500, detail=message)
    return {
        "success": True,
        "message": message,
        "affected_count": count
    }

@app.get("/api/vats")
def list_vats_endpoint():
    """Lista taxas de IVA disponíveis."""
    return get_vats()

@app.get("/api/reports/data-quality", response_model=List[DataQualityCheck])
def get_data_quality_report_endpoint(short_desc_max: int = 20):
    """Executa diagnóstico de qualidade de dados na base de dados SQL Server."""
    return run_data_quality_report(short_desc_max=short_desc_max)

@app.get("/api/ementa-digital/schema")
def get_ementa_digital_schema_endpoint():
    """Fase A: Descoberta e inspeção de esquema de tabelas relacionadas com a ementa digital."""
    return discover_ementa_schema()

@app.post("/api/products/search")
def search_products_endpoint(filters: ProductFilter):
    """Pesquisa artigos na base de dados com suporte a filtros e paginação."""
    items, total = search_products(filters)
    return {
        "items": [item.model_dump() for item in items],
        "total": total,
        "page": filters.page,
        "page_size": filters.page_size,
        "use_mock": db_manager.use_mock
    }

@app.post("/api/products/codes", response_model=ProductCodesResponse)
def get_product_codes_endpoint(filters: ProductFilter):
    """Devolve todos os códigos que correspondem ao filtro (até 20.000)."""
    return get_filtered_product_codes(filters)

@app.post("/api/products/selection-summary", response_model=SelectionSummaryResponse)
def get_selection_summary_endpoint(req: SelectionSummaryRequest):
    """Devolve o resumo da seleção de artigos (contagem, artigos com vendas e artigo de amostra)."""
    return get_selection_summary(req.product_codes)

@app.post("/api/products/preview-bulk-edit", response_model=BulkEditPreviewResponse)
def preview_bulk_edit_endpoint(req: BulkEditRequest):
    """Simula as alterações em massa (Dry-Run) antes de gravar na DB."""
    if not req.product_codes:
        raise HTTPException(status_code=400, detail="É necessário selecionar pelo menos 1 artigo para pré-visualizar.")
    return preview_bulk_edit(req)

@app.post("/api/products/apply-bulk-edit")
def apply_bulk_edit_endpoint(req: BulkEditRequest):
    """Aplica as alterações em massa com transação atómica, backup prévio e cloud sync."""
    if not req.product_codes:
        raise HTTPException(status_code=400, detail="É necessário selecionar pelo menos 1 artigo para editar.")
    
    success, message, count = apply_bulk_edit(req)
    if not success:
        raise HTTPException(status_code=500, detail=message)
    
    return {
        "success": True,
        "message": message,
        "affected_count": count
    }

@app.get("/api/backups", response_model=List[BackupItem])
def get_backups_endpoint():
    """Lista histórico de backups disponíveis para reversão."""
    return list_backups()

@app.post("/api/backups/restore")
def restore_backup_endpoint(filename: str = Body(..., embed=True)):
    """Restaura o estado dos artigos a partir de uma cópia de segurança prévia."""
    success, message = restore_backup(filename)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {
        "success": True,
        "message": message
    }

# Servir Frontend estático se compilado (Suporte a PyInstaller bundle)
def get_bundle_dir():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.dirname(__file__))

DIST_DIR = os.path.join(get_bundle_dir(), "frontend", "dist")

if os.path.exists(DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
        file_path = os.path.join(DIST_DIR, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))
