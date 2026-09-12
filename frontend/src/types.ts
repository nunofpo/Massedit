export interface DatabaseConfig {
  server: string;
  port: number;
  database: string;
  username?: string;
  password?: string;
  trusted_connection: boolean;
  driver: string;
  save_password?: boolean;
}

export interface PortInfo {
  port: number;
  open: boolean;
  label: string;
}

export interface PortScanResponse {
  host: string;
  results: PortInfo[];
  recommended_port?: number | null;
}

export interface ProductItem {
  codigo: number;
  plu?: number;
  descricao: string;
  descricaocurta?: string;
  codbarras?: string;
  referencia?: string;
  familias?: number;
  familia_desc?: string;
  subfamilia?: number;
  subfamilia_desc?: string;
  iva?: number;
  iva_desc?: string;
  centro_prod?: number;
  centro_prod_desc?: string;
  centro_prod_info?: number;
  pvp1: number;
  pvp2: number;
  pvp3: number;
  pvp4: number;
  pvp5: number;
  pvp6: number;
  pvp7: number;
  pvp8: number;
  pvp9: number;
  pvp10: number;
  bloqueado: number;
  frontoffice: number;
  posicaofront?: number;
  fundo?: number;
  fundo_hex: string;
  letra?: number;
  letra_hex: string;
  cor?: number;
  cor_hex: string;
  sync: number;
  has_sales: boolean;
  sales_check_ok?: boolean;
  can_edit_description: boolean;
}

export interface ProductionCenterItem {
  codigo: number;
  descricao: string;
  id?: number;
}

export interface PrinterItem {
  codigo: number;
  descricao: string;
  centro?: number;
  sync?: number;
}

export interface Family {
  codigo: number;
  descricao: string;
}

export interface Subfamily {
  codigo: number;
  descricao: string;
  familia: number;
}

export interface DetailedFamilyItem {
  codigo: number;
  descricao: string;
  fundo: number;
  fundo_hex: string;
  letra: number;
  letra_hex: string;
  frontoffice: number;
  posicaofront: number;
  products_count: number;
}

export interface FamilyColorUpdate {
  codigo: number;
  fundo_hex: string;
  letra_hex: string;
  apply_to_products: boolean;
}

export interface Vat {
  codigo: number;
  descricao: string;
  factor: number;
}

export interface ProductFilter {
  search?: string;
  codes?: number[];
  familia?: number;
  subfamilia?: number;
  iva?: number;
  centro_prod?: number;
  bloqueado?: number;
  frontoffice?: number;
  has_sales?: boolean;
  sort_by?: string; // "codigo", "plu", "descricao", "precovenda", "posicaofront", "familia"
  sort_order?: string; // "asc", "desc"
  page: number;
  page_size: number;
}

export interface ProductCodesResponse {
  codes: number[];
  total: number;
  truncated: boolean;
}

export interface SelectionSummaryResponse {
  count: number;
  with_sales_count: number;
  sales_check_ok: boolean;
  sample?: ProductItem | null;
}

export interface DataQualityGroup {
  key: string;
  codes: number[];
}

export interface DataQualityCheck {
  id: string;
  title: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  count: number;
  codes: number[];
  groups?: DataQualityGroup[] | null;
  available: boolean;
  unavailable_reason?: string | null;
  truncated: boolean;
}

export interface ColorUpdate {
  apply_fundo: boolean;
  fundo_hex?: string;
  apply_letra: boolean;
  letra_hex?: string;
  apply_cor: boolean;
  cor_hex?: string;
}

export interface PriceUpdate {
  apply_price: boolean;
  mode: string; // "fixed_add", "percentage", "fixed_set", "multiply", "copy_pvp"
  value: number;
  target_pvp: string; // "pvp1".."pvp10", "all", "copy_pvp1"
  source_pvp?: string; // "pvp1".."pvp10"
  rounding?: string; // "none", "90_cents", "95_cents", "00_cents", "2_decimals"
}

export interface BulkEditRequest {
  product_codes: number[];
  apply_descricao: boolean;
  new_descricao?: string;
  descricao_mode?: 'direct' | 'uppercase' | 'lowercase' | 'titlecase' | 'capitalize' | 'orthography' | 'unaccented_uppercase' | 'unaccented';
  apply_descricaocurta?: boolean;
  new_descricaocurta?: string;
  descricaocurta_mode?: 'direct' | 'uppercase' | 'lowercase' | 'titlecase' | 'capitalize' | 'orthography' | 'unaccented_uppercase' | 'unaccented';
  apply_plu?: boolean;
  new_plu?: number;
  plu_mode?: 'direct' | 'sequence' | 'copy_codigo' | 'clear';
  plu_seq_start?: number;
  apply_codbarras?: boolean;
  new_codbarras?: string;
  codbarras_mode?: 'direct' | 'sequence' | 'clear';
  codbarras_seq_start?: number;
  apply_referencia?: boolean;
  new_referencia?: string;
  colors: ColorUpdate;
  prices: PriceUpdate;
  apply_familia: boolean;
  new_familia?: number;
  apply_subfamilia?: boolean;
  new_subfamilia?: number;
  apply_centro_prod?: boolean;
  new_centro_prod?: number | null;
  centro_prod_info?: number;
  apply_iva: boolean;
  new_iva?: number;
  apply_bloqueado: boolean;
  new_bloqueado?: number;
  apply_frontoffice: boolean;
  new_frontoffice?: number;
  apply_posicaofront?: boolean;
  new_posicaofront?: number;
  mark_cloud_sync: boolean;
}

export interface FieldDiff {
  field_name: string;
  field_label: string;
  old_value: any;
  new_value: any;
  blocked: boolean;
  reason?: string;
}

export interface ProductDiff {
  codigo: number;
  descricao: string;
  has_sales: boolean;
  diffs: FieldDiff[];
}

export interface BulkEditPreviewResponse {
  total_selected: number;
  total_affected: number;
  blocked_descriptions_count: number;
  previews: ProductDiff[];
}

export interface BackupItem {
  filename: string;
  created_at: string;
  items_count: number;
  description: string;
}

export interface ImportRow {
  codigo: number;
  descricao?: string;
  descricaocurta?: string;
  plu?: number;
  codbarras?: string;
  referencia?: string;
  familia?: number;
  subfam?: number;
  iva?: number;
  pvp1?: number;
  pvp2?: number;
  pvp3?: number;
  pvp4?: number;
  pvp5?: number;
  pvp6?: number;
  pvp7?: number;
  pvp8?: number;
  pvp9?: number;
  pvp10?: number;
  fundo_hex?: string;
  letra_hex?: string;
}

export interface ImportPreviewResponse {
  total_file_rows: number;
  matched_products_count: number;
  blocked_descriptions_count: number;
  previews: ProductDiff[];
}

export interface PosLayoutProductItem {
  codigo: number;
  descricao: string;
  descricaocurta?: string;
  fundo_hex: string;
  letra_hex: string;
  ordem: number;
  pvp1: number;
  bloqueado: number;
  frontoffice: number;
  subfamilia?: number;
  subfamilia_desc?: string;
  low_contrast: boolean;
}

export interface PosLayoutApplyRequest {
  familia: number;
  order: number[];
  step?: number;
  mark_cloud_sync?: boolean;
}

export interface MenuPriceItem {
  rotulo: string;
  valor?: number | null;
}

export interface MenuArticleItem {
  nome: string;
  descricao?: string;
  precos: MenuPriceItem[];
  confianca: number;
  notas?: string;
}

export interface MenuSectionItem {
  nome: string;
  subsecao?: string | null;
  artigos: MenuArticleItem[];
}

export interface MenuExtractionResponse {
  secoes: MenuSectionItem[];
  rotulos_preco_encontrados: string[];
  avisos: string[];
}

export interface MenuReviewedRow {
  seccao: string;
  subseccao?: string;
  nome: string;
  descricaocurta: string;
  precos: Record<string, number | null>;
  confianca: number;
  notas?: string;
  matched_codigo?: number | null;
  match_status: 'new' | 'matched' | 'ambiguous';
  selected_familia?: number | null;
  selected_subfamilia?: number | null;
  selected_iva?: number | null;
}

export interface MenuMatchItem {
  codigo: number;
  descricao: string;
  descricaocurta?: string;
  familia?: number | null;
  subfamilia?: number | null;
  pvp1: number;
  similarity: number;
}

export interface MenuMatchResponse {
  row_index: number;
  matches: MenuMatchItem[];
}

export interface EmentaProductItem {
  codigo: number;
  pos_descricao: string;
  familia?: number;
  familia_desc?: string;
  subfamilia?: number;
  subfamilia_desc?: string;
  pvp1: number;
  exists_in_ementa: boolean;
  produto?: string;
  descricao?: string;
  visivel: number;
  highlight: number;
  posicao: number;
  image_url?: string;
  has_image_bytes: boolean;
  alergenios: number;
  gluten: number;
  sal: number;
  lactose: number;
  picante: number;
  dieta: number;
  vegetariano: number;
  pessoas: number;
  calorias: number;
  tempo: number;
}

export interface EmentaProductResponse {
  items: EmentaProductItem[];
  total_count: number;
  page: number;
  total_pages: number;
}

export interface EmentaLanguage {
  id: string;
  name: string;
  code: string;
  visivel?: number;
}

export interface EmentaSchemaInfo {
  available: boolean;
  has_produtos: boolean;
  has_traducoes: boolean;
  has_paises: boolean;
  has_familias: boolean;
  tables: Record<string, {
    exists: boolean;
    columns?: Array<{
      name: string;
      type: string;
      max_length: number;
      is_nullable: boolean;
    }>;
    row_count?: number;
  }>;
}
