export interface DatabaseConfig {
  server: string;
  port: number;
  database: string;
  username?: string;
  password?: string;
  trusted_connection: boolean;
  driver: string;
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
  can_edit_description: boolean;
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
  familia?: number;
  subfamilia?: number;
  iva?: number;
  bloqueado?: number;
  frontoffice?: number;
  has_sales?: boolean;
  sort_by?: string; // "codigo", "plu", "descricao", "precovenda", "posicaofront", "familia"
  sort_order?: string; // "asc", "desc"
  page: number;
  page_size: number;
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
