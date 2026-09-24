export interface DatabaseConfig {
  server: string;
  port: number;
  database: string;
  username?: string;
  password?: string;
  trusted_connection: boolean;
  driver: string;
  save_password?: boolean;
  password_saved?: boolean;
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
  isencao?: string;
  centro_prod?: number;
  centro_prod_desc?: string;
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
  descontinuado?: number;
  frontoffice: number;
  posicaofront?: number;
  fundo?: number;
  fundo_hex: string;
  letra?: number;
  letra_hex: string;
  cor?: number;
  cor_hex: string;
  sync: number;
  meiadose?: number;
  precomeia?: number;
  meiadosedesc?: string;
  dosedesc?: string;
  vendersemstock?: number;
  autoquebra?: number;
  tiposaft?: string;
  precocompra?: number;
  has_sales: boolean;
  sales_check_ok?: boolean;
  can_edit_description: boolean;
  composto?: number;
  is_menu?: boolean;
  menu_levels?: MenuLevelItem[];
  centros_prod?: { centro: number; informativo: number }[];
}

export interface MenuOptionItem {
  codigo: number;
  descricao: string;
  preco: number;
  fixo: boolean;
  default: boolean;
}

export interface MenuLevelItem {
  nivel: number;
  descricao: string;
  obrigatorio: boolean;
  ordem: number;
  options: MenuOptionItem[];
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
  descontinuado?: number;
  frontoffice?: number;
  has_sales?: boolean;
  is_menu?: boolean;
  sort_by?: string; // "codigo", "plu", "descricao", "precovenda", "posicaofront", "familia"
  sort_order?: string; // "asc", "desc"
  page: number;
  page_size: number;
}

export interface DeadProductSample {
  codigo: number;
  descricao: string;
  pvp1: number;
  familia: string;
}

export interface DeadProductsSummary {
  available: boolean;
  message?: string;
  count: number;
  codes: number[];
  sample: DeadProductSample[];
  families: { familia: string; count: number }[];
  total_pvp1: number;
}

export interface HousekeepingFileItem {
  id: number;
  type: string;
  logical_name: string;
  physical_path: string;
  size_mb: number;
  used_mb: number;
  free_mb: number;
}

export interface HousekeepingTableItem {
  name: string;
  rows: number;
  total_mb: number;
  used_mb: number;
}

export interface HousekeepingStatus {
  database_name: string;
  recovery_model: string;
  data_size_mb: number;
  data_used_mb: number;
  data_free_mb: number;
  log_size_mb: number;
  log_used_mb: number;
  log_free_mb: number;
  log_file_name: string;
  log_bloated: boolean;
  files: HousekeepingFileItem[];
  top_tables: HousekeepingTableItem[];
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
  category?: 'iva' | 'codes' | 'structure' | 'prices' | 'text' | 'geral';
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
  apply_precocompra?: boolean;
  new_precocompra?: number;
  apply_meiadose?: boolean;
  new_meiadose?: number;
  apply_precomeia?: boolean;
  new_precomeia?: number;
  precomeia_mode?: 'fixed' | 'percent_pvp1';
  precomeia_pct_pvp1?: number;
  apply_meiadosedesc?: boolean;
  new_meiadosedesc?: string;
  apply_dosedesc?: boolean;
  new_dosedesc?: string;
  apply_vendersemstock?: boolean;
  new_vendersemstock?: number;
  apply_autoquebra?: boolean;
  new_autoquebra?: number;
  apply_tiposaft?: boolean;
  new_tiposaft?: string;
  apply_familia: boolean;
  new_familia?: number;
  apply_subfamilia?: boolean;
  new_subfamilia?: number;
  apply_centro_primario?: boolean;
  new_centro_primario?: number | null;
  apply_centros_secundarios?: boolean;
  new_centros_secundarios?: number[];
  apply_centros_informativos?: boolean;
  new_centros_informativos?: number[];
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
  set_ordem_frontoffice?: boolean;
  colors?: { [codigo: number]: { fundo_hex: string; letra_hex: string } };
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
  proximo_codigo?: number;
}

export interface MotivoIsencao {
  codigo: string;
  descricao: string;
  norma?: string;
}

export interface MenuReviewedRow {
  codigo?: number | null;
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
  selected_isencao?: string | null;
  selected?: boolean;
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
  ementa_familia?: number;
  ementa_familia_desc?: string;
  ementa_seccao_desc?: string;
}

export interface EmentaDigitalMenu {
  codigo: number;
  nome: string;
}

export interface EmentaDigitalSection {
  codigo: number;
  descricao: string;
  visivel: number;
  posicao: number;
  image_url?: string;
  ementa?: number;
}

export interface EmentaDigitalFamily {
  codigo: number;
  seccao: number;
  descricao: string;
  visivel: number;
  posicao: number;
  dose?: string;
  meiadose?: string;
}

export interface EmentaDigitalStructureResponse {
  available: boolean;
  menus?: EmentaDigitalMenu[];
  sections: EmentaDigitalSection[];
  families: EmentaDigitalFamily[];
}

export interface EmentaRuleItem {
  codigo: number;
  app: number;
  servico: number;
  ordem: number;
  zona: number;
  ementa: number;
  pvp: number;
  inicio: string;
  fim: string;
  app_label: string;
  servico_label: string;
  ementa_nome: string;
  zona_nome: string;
}

export interface EmentaProductResponse {
  items: EmentaProductItem[];
  total_count: number;
  page: number;
  total_pages: number;
}

export interface EmentaLanguage {
  id?: string;
  name: string;
  code: string;
  visivel?: number;
  is_active?: number;
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

export interface CustomerItem {
  codigo: number;
  nome: string;
  nif: string;
  morada?: string;
  localidade?: string;
  codpostal?: string;
  codpostal1?: string;
  pais?: string;
  telefone?: string;
  telemovel?: string;
  email?: string;
  web?: string;
  fax?: string;
  nomecontacto?: string;
  desconto?: number;
  limitecredito?: number;
  saldo?: number;
  valordivida?: number;
  obs?: string;
  obsaviso?: string;
  bloqueado?: number;
  datacriacao?: string;
  is_valid_nif: boolean;
  nif_validation_message?: string;
  sales_count?: number;
  has_sales?: boolean;
  can_delete?: boolean;
}

export interface CustomerAuditResponse {
  total: number;
  valid_count: number;
  invalid_count: number;
  customers: CustomerItem[];
}

export interface NifLookupResponse {
  nif: string;
  is_valid: boolean;
  validation_message: string;
  nome?: string;
  morada?: string;
  localidade?: string;
  codpostal?: string;
  telefone?: string;
  email?: string;
  atividade?: string;
}

export interface PriceZoneInfo {
  pvp_index: number;
  label: string;
  zones: string[];
  display: string;
}

export type PriceZonesMap = Record<string, PriceZoneInfo>;
