import os
import sys
from fastapi import FastAPI, HTTPException, Body, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List, Optional, Dict

from backend.models import (
    DatabaseConfig, ProductFilter, BulkEditRequest, BulkEditPreviewResponse,
    BackupItem, DetailedFamilyItem, BulkFamilyColorUpdateRequest,
    ImportPreviewResponse, ImportApplyRequest, ImportRow,
    ProductionCenterItem, PrinterItem,
    SelectionSummaryRequest, SelectionSummaryResponse, ProductCodesResponse,
    DataQualityCheck, PosLayoutProductItem, PosLayoutApplyRequest,
    MenuExtractionResponse, MenuReviewedRow, MenuMatchItem, MenuMatchResponse,
    EmentaProductItem, EmentaProductFilter, EmentaProductResponse,
    EmentaDigitalStructureResponse,
    EmentaImportFromPosRequest, EmentaImportCsvRequest, EmentaImportResponse,
    EmentaBulkEditRequest, EmentaImageUrlRequest,
    EmentaTranslateRequest, EmentaTranslateResponse,
    EmentaSaveTranslationsRequest, EmentaSingleProductUpdate,
    EmentaSuggestDescRequest,
    PortInfo, PortScanRequest, PortScanResponse,
    CustomerItem, CustomerAuditResponse, NifLookupRequest, NifLookupResponse, BulkCustomerUpdateRequest
)
from backend.services.customers import (
    get_customers, update_customer_data, lookup_nif_pt, validate_pt_nif
)
from backend.db import db_manager
from backend.services.products import (
    search_products, get_filtered_product_codes, get_selection_summary,
    get_families, create_family, get_families_detailed, update_family_colors,
    get_subfamilies, generate_csv_export, generate_shelf_labels_html,
    get_vats, preview_bulk_edit, apply_bulk_edit, list_backups, restore_backup,
    get_production_centers, get_printers
)
from backend.services.reports import run_data_quality_report
from backend.services.pos_layout import (
    get_pos_layout_products, preview_pos_layout, apply_pos_layout
)
from backend.services.menu_ai import (
    extract_text_from_pdf, parse_plain_text_menu, match_menu_articles,
    export_zs_import_template_csv, convert_matched_to_import_rows
)
from backend.services.ementa_digital import (
    get_ementa_schema_info, get_ementa_digital_structure, search_ementa_products, import_products_to_ementa, import_csv_data,
    preview_ementa_bulk_edit, apply_ementa_bulk_edit,
    save_product_image_data, set_product_image_url, delete_product_image, get_product_image_bytes,
    get_ementa_languages, set_ementa_active_languages, get_product_translations, save_product_translations,
    translate_menu_texts, update_single_ementa_product,
    auto_populate_general_translations, suggest_description_for_product, IMAGES_DIR
)
from fastapi.responses import HTMLResponse, Response

app = FastAPI(title="MassEdit POS API", description="API de Edição em Massa Segura de Artigos", version="1.0.0")

# A interface é servida pelo próprio servidor (mesma origem). CORS só para o servidor de desenvolvimento Vite.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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

@app.post("/api/scan-ports", response_model=PortScanResponse)
def scan_sql_ports(req: PortScanRequest):
    """Verifica portas abertas num dado host (IP/hostname) com prioridade a 1433 e 65432."""
    import socket
    
    # Extrair host limpo caso venha no formato IP\INSTANCIA ou IP:PORTA
    raw_host = (req.host or "127.0.0.1").strip()
    if "\\" in raw_host:
        host = raw_host.split("\\")[0].strip()
    elif ":" in raw_host:
        host = raw_host.split(":")[0].strip()
    else:
        host = raw_host
    if not host:
        host = "127.0.0.1"

    # Prioridade obrigatória: 1433, 65432 e outras portas frequentes do SQL Server / ZoneSoft
    priority_ports = [1433, 65432]
    other_ports = [1434, 14333, 49152, 49153, 49154, 49155]
    
    candidate_ports = []
    if req.ports:
        for p in req.ports:
            if p not in candidate_ports:
                candidate_ports.append(p)
    else:
        candidate_ports = priority_ports + [p for p in other_ports if p not in priority_ports]

    labels = {
        1433: "SQL Server (Porta Padrão TCP)",
        65432: "SQL Server (Porta ZoneSoft Alternativa)",
        1434: "SQL Server Browser / Admin",
        14333: "SQL Server Secundária",
        49152: "Porta Dinâmica SQL Server (RPC)",
        49153: "Porta Dinâmica SQL Server",
        49154: "Porta Dinâmica SQL Server",
        49155: "Porta Dinâmica SQL Server",
    }

    results: List[PortInfo] = []
    recommended_port: Optional[int] = None

    for port in candidate_ports:
        is_open = False
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.7)  # timeout rápido de 700ms por porta
        try:
            res = s.connect_ex((host, port))
            if res == 0:
                is_open = True
                if recommended_port is None:
                    recommended_port = port
        except Exception:
            is_open = False
        finally:
            s.close()
            
        results.append(PortInfo(
            port=port,
            open=is_open,
            label=labels.get(port, f"Porta {port}")
        ))

    return PortScanResponse(
        host=host,
        results=results,
        recommended_port=recommended_port
    )

@app.get("/api/debug-sales")
def debug_sales_endpoint():
    """Diagnóstico das tabelas de vendas na base de dados atualmente conetada."""
    if db_manager.use_mock:
        return {"mode": "mock", "message": "Em modo mock não há base de dados real ligada."}
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = db_manager.get_schema(cursor)
        from backend.services.products import _sales_tables, SALES_TABLES
        detected_sales_tables = _sales_tables(schema)
        
        counts = {}
        for table, is_text in detected_sales_tables:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM dbo.{table}")
                row = cursor.fetchone()
                counts[table] = {"exists": True, "count": row[0] if row else 0, "is_text": is_text}
            except Exception as ex:
                counts[table] = {"exists": True, "error": str(ex)}
                
        all_tables_in_schema = [t for t in schema.keys() if "venda" in t or "consumo" in t or "movimento" in t or "linha" in t or "doc" in t]
        
        return {
            "configured_sales_tables": list(SALES_TABLES),
            "detected_sales_tables": [t for t, _ in detected_sales_tables],
            "table_stats": counts,
            "similar_tables_in_db": all_tables_in_schema
        }
    finally:
        conn.close()

# ======================================================================
# Endpoints de Clientes e Validação de NIF (NIF.pt)
# ======================================================================

@app.get("/api/customers", response_model=CustomerAuditResponse)
def list_customers_endpoint(search: Optional[str] = None, only_invalid: bool = False, limit: int = 300):
    """Lista e audita clientes do SQL Server com validação de NIF."""
    return get_customers(search=search, only_invalid=only_invalid, limit=limit)

@app.post("/api/customers/lookup-nif", response_model=NifLookupResponse)
def lookup_customer_nif_endpoint(req: NifLookupRequest):
    """Consulta dados de faturação da empresa através da API do NIF.pt."""
    return lookup_nif_pt(req.nif, req.api_key)

@app.post("/api/customers/update")
def update_customers_endpoint(req: BulkCustomerUpdateRequest):
    """Atualiza dados de clientes em lote no SQL Server com sync=1."""
    success, msg, count = update_customer_data(req)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"success": True, "message": msg, "updated_count": count}

@app.get("/api/families")
def list_families_endpoint():
    """Lista famílias disponíveis para filtragem e atribuição."""
    return get_families()

@app.post("/api/families/create")
def create_family_endpoint(descricao: str = Body(..., embed=True)):
    """Cria uma nova família no SQL Server se não existir."""
    try:
        res = create_family(descricao)
        return {"success": True, "family": res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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

@app.post("/api/menu-import/extract-text", response_model=MenuExtractionResponse)
def extract_menu_text_endpoint(raw_text: str = Body(..., embed=True)):
    """Extrai secções, artigos e preços a partir de texto de ementa (sem recurso a IA)."""
    return parse_plain_text_menu(raw_text)

@app.post("/api/menu-import/upload-pdf")
async def upload_menu_pdf_endpoint(file: UploadFile = File(...)):
    """Lê e extrai o texto de um ficheiro PDF ou TXT carregado pelo utilizador."""
    content = await file.read()
    filename = file.filename or "ementa.pdf"
    
    if filename.lower().endswith(".txt"):
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1", errors="ignore")
    else:
        text = extract_text_from_pdf(content)
        
    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="Não foi possível extrair texto legível do ficheiro selecionado. Se for um PDF digitalizado ou imagem, cole o texto manualmente."
        )
        
    return {
        "filename": filename,
        "text": text,
        "length": len(text)
    }

@app.post("/api/menu-import/match", response_model=List[MenuMatchResponse])
def match_menu_endpoint(rows: List[MenuReviewedRow]):
    """Pesquisa correspondências automáticas na base de dados para cada artigo da ementa."""
    return match_menu_articles(rows)

@app.post("/api/menu-import/export-zs-template")
def export_zs_template_endpoint(rows: List[MenuReviewedRow]):
    """Gera ficheiro CSV formatado de acordo com o template oficial de importação da ZoneSoft."""
    csv_str = export_zs_import_template_csv(rows)
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=importacao_zonesoft_artigos.csv"}
    )

@app.post("/api/menu-import/to-import-rows", response_model=List[ImportRow])
def to_import_rows_endpoint(rows: List[MenuReviewedRow], price_mapping: Dict[str, str] = Body(...)):
    """Converte artigos correspondentes em ImportRow para permitir simulação e gravação atómica."""
    return convert_matched_to_import_rows(rows, price_mapping)

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


# ======================================================================
# Endpoints da Ementa Digital e Traduções
# ======================================================================

@app.get("/api/ementa-digital/schema")
def get_ementa_schema_endpoint():
    """Devolve informações da estrutura das tabelas da ementa digital."""
    return get_ementa_schema_info()


@app.get("/api/ementa-digital/structure", response_model=EmentaDigitalStructureResponse)
def get_ementa_structure_endpoint():
    """Devolve as secções e famílias ativas da ementa digital."""
    return get_ementa_digital_structure()


@app.post("/api/ementa-digital/search", response_model=EmentaProductResponse)
def search_ementa_products_endpoint(filter_req: EmentaProductFilter):
    """Pesquisa e lista artigos com os respetivos dados da ementa digital."""
    return search_ementa_products(filter_req)


@app.post("/api/ementa-digital/import-from-pos", response_model=EmentaImportResponse)
def import_products_to_ementa_endpoint(req: EmentaImportFromPosRequest):
    """Importa artigos de dbo.produtos para dbo.ementa_digital_produtos."""
    return import_products_to_ementa(req)


@app.post("/api/ementa-digital/import-csv", response_model=EmentaImportResponse)
def import_csv_endpoint(req: EmentaImportCsvRequest):
    """Importa artigos a partir de um texto CSV para a ementa digital e catálogo."""
    return import_csv_data(req)


@app.post("/api/ementa-digital/preview", response_model=BulkEditPreviewResponse)
def preview_ementa_bulk_edit_endpoint(req: EmentaBulkEditRequest):
    """Simulação (dry-run) de alterações em massa na ementa digital."""
    return preview_ementa_bulk_edit(req)


@app.post("/api/ementa-digital/apply")
def apply_ementa_bulk_edit_endpoint(req: EmentaBulkEditRequest):
    """Aplica alterações em massa à ementa digital com backup e transação segura."""
    success, message, count = apply_ementa_bulk_edit(req)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {
        "success": True,
        "message": message,
        "affected_count": count
    }


@app.post("/api/ementa-digital/product/{cod_produto}")
def update_single_ementa_product_endpoint(cod_produto: int, req: EmentaSingleProductUpdate):
    """Atualiza a descrição e detalhes de um artigo individual na ementa digital."""
    success, message = update_single_ementa_product(cod_produto, req)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {
        "success": True,
        "message": message
    }


@app.post("/api/ementa-digital/suggest-description")
def suggest_description_endpoint(req: EmentaSuggestDescRequest):
    """Gera uma sugestão de descrição culinária baseada no nome do artigo."""
    suggestion = suggest_description_for_product(req.codigo, req.nome)
    return {
        "suggestion": suggestion
    }


@app.post("/api/ementa-digital/upload-image/{cod_produto}")
async def upload_product_image_endpoint(cod_produto: int, file: UploadFile = File(...)):
    """Upload e associação de imagem para um artigo da ementa digital."""
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="A imagem excede o tamanho máximo de 10 MB.")
    success, message, url = save_product_image_data(cod_produto, contents, file.filename or "image.jpg")
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {
        "success": True,
        "message": message,
        "image_url": url
    }


@app.post("/api/ementa-digital/set-image-url/{cod_produto}")
def set_product_image_url_endpoint(cod_produto: int, req: EmentaImageUrlRequest):
    """Define o URL de imagem para um artigo da ementa digital."""
    success, message = set_product_image_url(cod_produto, req.image_url)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {
        "success": True,
        "message": message
    }


@app.delete("/api/ementa-digital/image/{cod_produto}")
@app.post("/api/ementa-digital/delete-image/{cod_produto}")
def delete_product_image_endpoint(cod_produto: int):
    """Remove a imagem (binário e URL) de um artigo da ementa digital."""
    success, message = delete_product_image(cod_produto)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {
        "success": True,
        "message": message
    }


@app.get("/api/ementa-digital/image/{cod_produto}")
def get_product_image_endpoint(cod_produto: int):
    """Devolve a imagem binária de um artigo da ementa digital."""
    data, mime = get_product_image_bytes(cod_produto)
    if not data or not mime:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    return Response(content=data, media_type=mime)


@app.get("/api/ementa-digital/image-file/{filename}")
def get_local_image_file_endpoint(filename: str):
    """Serve imagens armazenadas localmente para a ementa digital."""
    clean_name = os.path.basename(filename)
    path = os.path.join(IMAGES_DIR, clean_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Ficheiro de imagem não encontrado.")
    return FileResponse(path)


@app.get("/api/ementa-digital/languages")
def get_ementa_languages_endpoint():
    """Devolve a lista de idiomas para tradução da ementa."""
    return get_ementa_languages()


@app.post("/api/ementa-digital/activate-languages")
def activate_ementa_languages_endpoint(lang_codes: List[str]):
    """Ativa/sincroniza os idiomas na tabela dbo.ementa_digital_paises da ZoneSoft ZSRest."""
    success, message = set_ementa_active_languages(lang_codes)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {
        "success": True,
        "message": message
    }


@app.get("/api/ementa-digital/translations/{cod_produto}")
def get_product_translations_endpoint(cod_produto: int):
    """Obtém as traduções de um produto em todos os idiomas."""
    return get_product_translations(cod_produto)


@app.post("/api/ementa-digital/translations")
def save_product_translations_endpoint(req: EmentaSaveTranslationsRequest):
    """Grava as traduções de um produto."""
    success, message = save_product_translations(req)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {
        "success": True,
        "message": message
    }


@app.post("/api/ementa-digital/translate", response_model=EmentaTranslateResponse)
def translate_menu_texts_endpoint(req: EmentaTranslateRequest):
    """Assistente de tradução culinária para textos e descrições."""
    return translate_menu_texts(req)


@app.post("/api/ementa-digital/auto-general-translations")
def auto_general_translations_endpoint(target_langs: Optional[List[str]] = Body(default=None)):
    """Preenche automaticamente as 82 Traduções Gerais da interface ZoneSoft (typeid=0) para GB, ES, FR, DE."""
    success, message, count = auto_populate_general_translations(target_langs)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message, "count": count}


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
