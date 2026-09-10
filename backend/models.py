from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field

class DatabaseConfig(BaseModel):
    server: str = "localhost"
    port: int = 1433
    database: str = "nuno"
    username: Optional[str] = ""
    password: Optional[str] = ""
    trusted_connection: bool = False
    driver: str = "ODBC Driver 17 for SQL Server"
    save_password: bool = False  # Se falso, a password não é gravada no config.json

class ProductFilter(BaseModel):
    search: Optional[str] = None
    codes: Optional[List[int]] = None
    familia: Optional[int] = None
    subfamilia: Optional[int] = None
    iva: Optional[float] = None  # Taxa (factor) de IVA, p.ex. 23
    centro_prod: Optional[int] = None  # Código do Centro de Produção (dbo.centrosprod.codigo)
    bloqueado: Optional[int] = None  # 0=Ativo, 1=Bloqueado, None=Todos
    frontoffice: Optional[int] = None  # 1=Visível, 0=Oculto, None=Todos
    has_sales: Optional[bool] = None  # True=Com Vendas, False=Sem Vendas, None=Todos
    sort_by: Optional[str] = "codigo"  # "codigo", "descricao", "precovenda", "posicaofront", "familia"
    sort_order: Optional[str] = "asc"  # "asc", "desc"
    page: int = 1
    page_size: int = 50

class SelectionSummaryRequest(BaseModel):
    product_codes: List[int]

class ProductCodesResponse(BaseModel):
    codes: List[int]
    total: int
    truncated: bool

class ProductItem(BaseModel):
    codigo: int
    descricao: str
    descricaocurta: Optional[str] = ""
    familias: Optional[int] = None
    familia_desc: Optional[str] = ""
    subfamilia: Optional[int] = None
    subfamilia_desc: Optional[str] = ""
    iva: Optional[float] = None
    iva_desc: Optional[str] = ""
    centro_prod: Optional[int] = None
    centro_prod_desc: Optional[str] = ""
    centro_prod_info: Optional[int] = 0
    pvp1: float = 0.0
    pvp2: float = 0.0
    pvp3: float = 0.0
    pvp4: float = 0.0
    pvp5: float = 0.0
    pvp6: float = 0.0
    pvp7: float = 0.0
    pvp8: float = 0.0
    pvp9: float = 0.0
    pvp10: float = 0.0
    bloqueado: int = 0
    frontoffice: int = 1
    posicaofront: Optional[int] = 0
    fundo: Optional[int] = 0
    fundo_hex: str = "#000000"
    letra: Optional[int] = 16777215
    letra_hex: str = "#FFFFFF"
    cor: Optional[int] = 0
    cor_hex: str = "#000000"
    plu: Optional[int] = 0
    codbarras: Optional[str] = ""
    referencia: Optional[str] = ""
    sync: int = 0
    has_sales: bool = False
    sales_check_ok: bool = True  # False = não foi possível verificar vendas (designação protegida por segurança)
    can_edit_description: bool = True
    centros_prod: Optional[List[Dict[str, int]]] = None  # Todas as linhas de dbo.produtoscentrosprod (para backups)

class ColorUpdate(BaseModel):
    apply_fundo: bool = False
    fundo_hex: Optional[str] = None  # p.ex: "#FF5733"
    apply_letra: bool = False
    letra_hex: Optional[str] = None  # p.ex: "#FFFFFF"
    apply_cor: bool = False
    cor_hex: Optional[str] = None

class PriceUpdate(BaseModel):
    apply_price: bool = False
    mode: str = "fixed_add"  # "fixed_add", "percentage", "fixed_set", "multiply", "copy_pvp"
    value: float = 0.0
    target_pvp: str = "pvp1"  # "pvp1".."pvp10", "all", "copy_pvp1"
    source_pvp: Optional[str] = "pvp1"  # "pvp1".."pvp10"
    rounding: Optional[str] = "none"  # "none", "90_cents", "95_cents", "00_cents", "2_decimals"

class BulkEditRequest(BaseModel):
    product_codes: List[int]
    
    # Nome / Designação (Apenas para produtos sem vendas)
    apply_descricao: bool = False
    new_descricao: Optional[str] = None
    descricao_mode: str = "direct"  # "direct", "uppercase", "lowercase", "titlecase", "capitalize", "orthography", "unaccented_uppercase", "unaccented"

    # Descrição Curta (POS)
    apply_descricaocurta: bool = False
    new_descricaocurta: Optional[str] = None
    descricaocurta_mode: str = "direct"  # "direct", "uppercase", "lowercase", "titlecase", "capitalize", "orthography", "unaccented_uppercase", "unaccented"

    # PLU (Código PLU / balança / teclado - dbo.produtos.codigo_alf)
    apply_plu: bool = False
    new_plu: Optional[int] = None
    plu_mode: str = "direct"  # "direct", "sequence", "copy_codigo", "clear"
    plu_seq_start: Optional[int] = 1001

    # Código de Barras & Referência (dbo.produtos.codbarras & referencia)
    apply_codbarras: bool = False
    new_codbarras: Optional[str] = None
    codbarras_mode: str = "direct"  # "direct", "sequence", "clear"
    codbarras_seq_start: Optional[int] = 1001

    apply_referencia: bool = False
    new_referencia: Optional[str] = None
    
    # Aparência / Cores
    colors: ColorUpdate = Field(default_factory=ColorUpdate)
    
    # Preços PVP 1 a 10
    prices: PriceUpdate = Field(default_factory=PriceUpdate)
    
    # Categoria / Família & Subfamília
    apply_familia: bool = False
    new_familia: Optional[int] = None

    apply_subfamilia: bool = False
    new_subfamilia: Optional[int] = None

    # Centro de Produção (Cozinha, Bar, Bebidas, etc.)
    apply_centro_prod: bool = False
    new_centro_prod: Optional[int] = None  # Código do centrosprod (ou None/0 para remover)
    centro_prod_info: int = 0  # 0=Preparação, 1=Informativo
    
    # Imposto / IVA
    apply_iva: bool = False
    new_iva: Optional[float] = None  # Taxa (factor) de IVA existente em dbo.iva
    
    # Estado / Visibilidade / Posição Frontoffice
    apply_bloqueado: bool = False
    new_bloqueado: Optional[int] = None  # 0 ou 1
    
    apply_frontoffice: bool = False
    new_frontoffice: Optional[int] = None  # 0 ou 1

    apply_posicaofront: bool = False
    new_posicaofront: Optional[int] = None  # número inteiro
    
    # Sincronização Cloud
    mark_cloud_sync: bool = True

class FieldDiff(BaseModel):
    field_name: str
    field_label: str
    old_value: Any
    new_value: Any
    blocked: bool = False
    reason: Optional[str] = None

class ProductDiff(BaseModel):
    codigo: int
    descricao: str
    has_sales: bool
    diffs: List[FieldDiff]

class BulkEditPreviewResponse(BaseModel):
    total_selected: int
    total_affected: int
    blocked_descriptions_count: int
    previews: List[ProductDiff]

class SelectionSummaryResponse(BaseModel):
    count: int
    with_sales_count: int
    sales_check_ok: bool
    sample: Optional[ProductItem] = None

class DataQualityGroup(BaseModel):
    key: str
    codes: List[int]

class DataQualityCheck(BaseModel):
    id: str
    title: str
    description: str
    severity: str  # "error" | "warning" | "info"
    count: int
    codes: List[int]
    groups: Optional[List[DataQualityGroup]] = None
    available: bool = True
    unavailable_reason: Optional[str] = None
    truncated: bool = False

class BackupItem(BaseModel):
    filename: str
    created_at: str
    items_count: int
    description: str

class DetailedFamilyItem(BaseModel):
    codigo: int
    descricao: str
    fundo: int = 0
    fundo_hex: str = "#000000"
    letra: int = 16777215
    letra_hex: str = "#FFFFFF"
    frontoffice: int = 1
    posicaofront: int = 0
    products_count: int = 0

class FamilyColorUpdate(BaseModel):
    codigo: int
    fundo_hex: str
    letra_hex: str
    apply_to_products: bool = False

class BulkFamilyColorUpdateRequest(BaseModel):
    updates: List[FamilyColorUpdate]

class ImportRow(BaseModel):
    codigo: int
    descricao: Optional[str] = None
    descricaocurta: Optional[str] = None
    plu: Optional[int] = None
    codbarras: Optional[str] = None
    referencia: Optional[str] = None
    familia: Optional[int] = None
    subfam: Optional[int] = None
    iva: Optional[float] = None
    pvp1: Optional[float] = None
    pvp2: Optional[float] = None
    pvp3: Optional[float] = None
    pvp4: Optional[float] = None
    pvp5: Optional[float] = None
    pvp6: Optional[float] = None
    pvp7: Optional[float] = None
    pvp8: Optional[float] = None
    pvp9: Optional[float] = None
    pvp10: Optional[float] = None
    fundo_hex: Optional[str] = None
    letra_hex: Optional[str] = None

class ImportPreviewResponse(BaseModel):
    total_file_rows: int
    matched_products_count: int
    blocked_descriptions_count: int
    previews: List[ProductDiff]

class ImportApplyRequest(BaseModel):
    items: List[ImportRow]

class ProductionCenterItem(BaseModel):
    codigo: int
    descricao: str
    id: Optional[int] = None

class PrinterItem(BaseModel):
    codigo: int
    descricao: str
    centro: Optional[int] = None
    sync: Optional[int] = 0

class PosLayoutProductItem(BaseModel):
    codigo: int
    descricao: str
    descricaocurta: Optional[str] = ""
    fundo_hex: str = "#000000"
    letra_hex: str = "#FFFFFF"
    ordem: int = 0
    pvp1: float = 0.0
    bloqueado: int = 0
    frontoffice: int = 1
    subfamilia: Optional[int] = None
    subfamilia_desc: Optional[str] = ""
    low_contrast: bool = False

class PosLayoutApplyRequest(BaseModel):
    familia: int
    order: List[int]
    step: int = 1
    mark_cloud_sync: bool = True

class MenuPriceItem(BaseModel):
    rotulo: str
    valor: Optional[float] = None

class MenuVariantItem(BaseModel):
    nome: str
    precos: List[MenuPriceItem] = Field(default_factory=list)

class MenuArticleItem(BaseModel):
    nome: str
    descricao: Optional[str] = ""
    precos: List[MenuPriceItem] = Field(default_factory=list)
    variantes: List[MenuVariantItem] = Field(default_factory=list)
    confianca: float = 1.0
    notas: Optional[str] = ""

class MenuSectionItem(BaseModel):
    nome: str
    subsecao: Optional[str] = None
    artigos: List[MenuArticleItem] = Field(default_factory=list)

class MenuExtractionResponse(BaseModel):
    secoes: List[MenuSectionItem] = Field(default_factory=list)
    rotulos_preco_encontrados: List[str] = Field(default_factory=list)
    avisos: List[str] = Field(default_factory=list)

class MenuReviewedRow(BaseModel):
    seccao: str
    subseccao: Optional[str] = ""
    nome: str
    descricaocurta: str
    precos: Dict[str, Optional[float]] = Field(default_factory=dict)
    confianca: float = 1.0
    notas: Optional[str] = ""
    matched_codigo: Optional[int] = None
    match_status: str = "new"  # "new", "matched", "ambiguous"
    selected_familia: Optional[int] = None
    selected_subfamilia: Optional[int] = None
    selected_iva: Optional[float] = None

class MenuMatchItem(BaseModel):
    codigo: int
    descricao: str
    descricaocurta: Optional[str] = ""
    familia: Optional[int] = None
    subfamilia: Optional[int] = None
    pvp1: float = 0.0
    similarity: float = 1.0

class MenuMatchResponse(BaseModel):
    row_index: int
    matches: List[MenuMatchItem] = Field(default_factory=list)




