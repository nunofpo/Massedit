import os
import re
import csv
import io
import html
import json
import math
import unicodedata
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple, Set, Iterable

from backend.models import (
    ProductFilter, ProductItem, BulkEditRequest, BulkEditPreviewResponse,
    ProductDiff, FieldDiff, BackupItem, DetailedFamilyItem, BulkFamilyColorUpdateRequest,
    ImportRow, ImportPreviewResponse,
    ProductionCenterItem, PrinterItem
)
from backend.db import (
    db_manager, hex_to_int_color, int_color_to_hex, is_valid_hex_color,
    get_app_dir, TEXT_TYPES, SchemaInfo
)

BACKUP_DIR = os.path.join(get_app_dir(), "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

BACKUP_FORMAT_VERSION = 2
BACKUP_NAME_RE = re.compile(r"^backup_[0-9_]+\.json$")

# O SQL Server aceita no máximo 2100 parâmetros por instrução
MAX_SQL_PARAMS = 2000
DEFAULT_CHUNK = 500

# Tabelas onde se procura movimento de vendas de um artigo no ZoneSoft
SALES_TABLES = ("vendas", "vendasprod", "consumo_doc", "movimentos", "vendas_devolucao", "vendastemp")

# Colunas opcionais de dbo.produtos (só usadas se existirem nesta base de dados)
INT_TYPES = {"int", "bigint", "smallint", "tinyint", "bit"}
OPTIONAL_PRODUCT_COLUMNS = ("bloqueado", "frontoffice", "cor")

PRICE_EPSILON = 0.00005


# ======================================================================
# Utilitários gerais
# ======================================================================

def _chunks(seq: List[Any], size: int = DEFAULT_CHUNK) -> Iterable[List[Any]]:
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def _unique_codes(codes: Iterable[Any]) -> List[int]:
    seen: Set[int] = set()
    result: List[int] = []
    for c in codes or []:
        try:
            code = int(c)
        except (TypeError, ValueError):
            continue
        if code not in seen:
            seen.add(code)
            result.append(code)
    return result


def _placeholders(n: int) -> str:
    return ",".join(["?"] * n)


def _schema(cursor) -> SchemaInfo:
    return db_manager.get_schema(cursor)


def _prod_cols(schema: SchemaInfo) -> Dict[str, Tuple[str, Optional[int]]]:
    return schema.get("produtos", {})


def _has_optional_int_col(schema: SchemaInfo, col: str) -> bool:
    info = _prod_cols(schema).get(col)
    return bool(info and info[0] in INT_TYPES)


def _text_limit(schema: SchemaInfo, table: str, col: str) -> Optional[int]:
    info = schema.get(table, {}).get(col)
    return info[1] if info else None


def _has_table_cols(schema: SchemaInfo, table: str, cols: Iterable[str]) -> bool:
    table_cols = schema.get(table)
    return bool(table_cols) and all(c in table_cols for c in cols)


def _float_eq(a: Optional[float], b: Optional[float]) -> bool:
    return abs(float(a or 0) - float(b or 0)) < PRICE_EPSILON


def format_iva_num(val) -> str:
    """Formata a taxa de IVA como percentagem numérica pura (ex: 23%, 13%, 6%, 0%)."""
    if val is None:
        return ""
    try:
        fval = float(val)
        if fval == int(fval):
            return f"{int(fval)}%"
        return f"{fval}%"
    except Exception:
        return str(val)


# ======================================================================
# Verificação de vendas (proteção da designação)
# ======================================================================

def _sales_tables(schema: SchemaInfo) -> List[Tuple[str, bool]]:
    """Lista (tabela, codigo_é_texto) das tabelas de vendas existentes nesta base de dados."""
    result = []
    for t in SALES_TABLES:
        info = schema.get(t, {}).get("codigo")
        if info:
            result.append((t, info[0] in TEXT_TYPES))
    return result


def get_sales_codes(cursor, codes: List[int]) -> Optional[Set[int]]:
    """
    Devolve o conjunto de códigos com movimento de vendas.
    Devolve None se não for possível verificar (tabelas inexistentes ou erro em todas) — nesse caso
    os artigos devem ser tratados como TENDO vendas (fail-safe).
    """
    codes = _unique_codes(codes)
    if not codes:
        return set()
    try:
        tables = _sales_tables(_schema(cursor))
    except Exception as e:
        print(f"[get_sales_codes] Erro ao obter esquema de vendas: {e}")
        return None
    if not tables:
        print("[get_sales_codes] Nenhuma tabela de vendas encontrada no esquema.")
        return None

    found: Set[int] = set()
    at_least_one_success = False

    for table, is_text in tables:
        try:
            for chunk in _chunks(codes, DEFAULT_CHUNK):
                params = [str(c) for c in chunk] if is_text else chunk
                sql = f"SELECT DISTINCT codigo FROM dbo.{table} WHERE codigo IN ({_placeholders(len(chunk))})"
                cursor.execute(sql, params)
                for (raw,) in cursor.fetchall():
                    if raw is not None:
                        try:
                            found.add(int(str(raw).strip()))
                        except ValueError:
                            continue
            at_least_one_success = True
        except Exception as ex:
            print(f"[get_sales_codes] Aviso na tabela dbo.{table}: {ex}")
            continue

    if not at_least_one_success:
        return None
    return found


def _sales_exists_sql(schema: SchemaInfo) -> Optional[str]:
    tables = _sales_tables(schema)
    if not tables:
        return None
    parts = []
    for table, is_text in tables:
        ref = "CAST(p.codigo AS VARCHAR(50))" if is_text else "p.codigo"
        parts.append(f"EXISTS (SELECT 1 FROM dbo.{table} s WHERE s.codigo = {ref})")
    return "(" + " OR ".join(parts) + ")"


# ======================================================================
# Leitura de artigos
# ======================================================================

PRODUCT_FROM_SQL = """
    FROM dbo.produtos p
    LEFT JOIN dbo.familias f ON p.familia = f.codigo
    LEFT JOIN dbo.subfamilias sf ON p.subfam = sf.codigo
    LEFT JOIN (
        SELECT codigo, MAX(centro) AS centro, MAX(CAST(informativo AS INT)) AS informativo
        FROM dbo.produtoscentrosprod
        GROUP BY codigo
    ) pcp ON p.codigo = pcp.codigo
    LEFT JOIN dbo.centrosprod cp ON pcp.centro = cp.codigo
"""


def _product_select_sql(schema: SchemaInfo) -> str:
    def opt(col: str, default: int) -> str:
        return f"ISNULL(p.{col}, {default})" if _has_optional_int_col(schema, col) else str(default)

    return f"""
        p.codigo, p.descricao, ISNULL(p.descricaocurta, ''), p.familia, f.descricao,
        p.subfam, sf.descricao, p.iva,
        ISNULL(p.precovenda, 0), ISNULL(p.pvp2, 0), ISNULL(p.pvp3, 0), ISNULL(p.pvp4, 0), ISNULL(p.pvp5, 0),
        ISNULL(p.pvp6, 0), ISNULL(p.pvp7, 0), ISNULL(p.pvp8, 0), ISNULL(p.pvp9, 0), ISNULL(p.pvp10, 0),
        ISNULL(p.fundo, 0), ISNULL(p.letra, 16777215), ISNULL(p.ordem, 0), ISNULL(p.codigo_alf, 0),
        ISNULL(p.codbarras, ''), ISNULL(p.referencia, ''),
        pcp.centro, cp.descricao, ISNULL(pcp.informativo, 0),
        {opt('bloqueado', 0)}, {opt('frontoffice', 1)}, {opt('cor', 0)}, {opt('sync', 0)}
    """


def _int_or(value: Any, default: int) -> int:
    return int(value) if value is not None else default


def _row_to_product(r, sales_codes: Optional[Set[int]]) -> ProductItem:
    code = int(r[0])
    if sales_codes is None:
        has_sales, sales_ok = True, False
    else:
        has_sales, sales_ok = code in sales_codes, True
    fundo = _int_or(r[18], 0)
    letra = _int_or(r[19], 16777215)
    cor = _int_or(r[29], 0)
    return ProductItem(
        codigo=code,
        descricao=r[1] or "",
        descricaocurta=r[2] or "",
        familias=r[3],
        familia_desc=r[4] or "",
        subfamilia=r[5],
        subfamilia_desc=r[6] or "",
        iva=float(r[7]) if r[7] is not None else None,
        iva_desc=format_iva_num(r[7]),
        pvp1=float(r[8] or 0), pvp2=float(r[9] or 0), pvp3=float(r[10] or 0), pvp4=float(r[11] or 0),
        pvp5=float(r[12] or 0), pvp6=float(r[13] or 0), pvp7=float(r[14] or 0), pvp8=float(r[15] or 0),
        pvp9=float(r[16] or 0), pvp10=float(r[17] or 0),
        fundo=fundo,
        fundo_hex=int_color_to_hex(fundo),
        letra=letra,
        letra_hex=int_color_to_hex(letra),
        posicaofront=_int_or(r[20], 0),
        plu=_int_or(r[21], 0),
        codbarras=r[22] or "",
        referencia=r[23] or "",
        centro_prod=r[24],
        centro_prod_desc=r[25] or "",
        centro_prod_info=_int_or(r[26], 0),
        bloqueado=_int_or(r[27], 0),
        frontoffice=_int_or(r[28], 1),
        cor=cor,
        cor_hex=int_color_to_hex(cor),
        sync=_int_or(r[30], 0),
        has_sales=has_sales,
        sales_check_ok=sales_ok,
        can_edit_description=not has_sales,
    )


def _fetch_products_by_codes(cursor, codes: List[int], with_sales: bool = True,
                             with_centros: bool = True) -> List[ProductItem]:
    codes = _unique_codes(codes)
    if not codes:
        return []
    schema = _schema(cursor)
    select_sql = _product_select_sql(schema)
    rows = []
    for chunk in _chunks(codes):
        cursor.execute(
            f"SELECT {select_sql} {PRODUCT_FROM_SQL} WHERE p.codigo IN ({_placeholders(len(chunk))})",
            chunk
        )
        rows.extend(cursor.fetchall())

    sales = get_sales_codes(cursor, codes) if with_sales else set()
    items = {int(r[0]): _row_to_product(r, sales) for r in rows}

    if with_centros and items:
        centros: Dict[int, List[Dict[str, int]]] = {c: [] for c in items}
        for chunk in _chunks(list(items.keys())):
            cursor.execute(
                f"SELECT codigo, centro, ISNULL(CAST(informativo AS INT), 0) FROM dbo.produtoscentrosprod "
                f"WHERE codigo IN ({_placeholders(len(chunk))}) ORDER BY codigo, centro",
                chunk
            )
            for code, centro, info in cursor.fetchall():
                if centro is not None:
                    centros.setdefault(int(code), []).append({"centro": int(centro), "informativo": int(info or 0)})
        for code, item in items.items():
            item.centros_prod = centros.get(code, [])

    return [items[c] for c in codes if c in items]


def get_products_by_codes(codes: List[int]) -> List[ProductItem]:
    """Obtém lista detalhada de artigos por código diretamente do SQL Server (suporta milhares de códigos)."""
    conn = db_manager.get_connection()
    try:
        return _fetch_products_by_codes(conn.cursor(), codes)
    finally:
        conn.close()


def _build_product_where(filters: ProductFilter, schema: SchemaInfo, temp_table: Optional[str] = None) -> Tuple[str, List[Any]]:
    where = ["1=1"]
    params: List[Any] = []

    if filters.codes is not None:
        if not filters.codes:
            where.append("1=0")
        elif temp_table:
            where.append(f"EXISTS (SELECT 1 FROM {temp_table} fc WHERE fc.codigo = p.codigo)")
        else:
            in_clauses = []
            for chunk in _chunks(filters.codes, 1000):
                in_clauses.append(f"p.codigo IN ({_placeholders(len(chunk))})")
                params.extend(chunk)
            where.append(f"({' OR '.join(in_clauses)})")

    if filters.search and filters.search.strip():
        raw_search = filters.search.strip()
        # Verificar se é um intervalo (ex: 100-250)
        range_match = re.match(r"^(\d+)\s*-\s*(\d+)$", raw_search)
        # Verificar se é uma lista de códigos (ex: 10, 25, 42 ou 10 25 42)
        list_match = re.findall(r"\b\d+\b", raw_search)
        
        if range_match:
            c_start = int(range_match.group(1))
            c_end = int(range_match.group(2))
            if c_start > c_end:
                c_start, c_end = c_end, c_start
            where.append("p.codigo BETWEEN ? AND ?")
            params.extend([c_start, c_end])
        elif len(list_match) > 1 and all(len(x) <= 8 for x in list_match) and ("," in raw_search or ";" in raw_search):
            code_ints = [int(x) for x in list_match]
            where.append(f"p.codigo IN ({_placeholders(len(code_ints))})")
            params.extend(code_ints)
        else:
            st = f"%{raw_search}%"
            where.append(
                "(p.descricao LIKE ? OR p.descricaocurta LIKE ? OR CAST(p.codigo AS VARCHAR(20)) LIKE ? "
                "OR CAST(p.codigo_alf AS VARCHAR(20)) LIKE ? OR p.codbarras LIKE ? OR p.referencia LIKE ?)"
            )
            params.extend([st] * 6)
    if filters.familia is not None:
        where.append("p.familia = ?")
        params.append(filters.familia)
    if filters.subfamilia is not None:
        where.append("p.subfam = ?")
        params.append(filters.subfamilia)
    if filters.iva is not None:
        where.append("ABS(ISNULL(p.iva, -1000) - ?) < 0.001")
        params.append(float(filters.iva))
    if filters.centro_prod is not None:
        if filters.centro_prod == 0:
            where.append("NOT EXISTS (SELECT 1 FROM dbo.produtoscentrosprod x WHERE x.codigo = p.codigo)")
        else:
            where.append("EXISTS (SELECT 1 FROM dbo.produtoscentrosprod x WHERE x.codigo = p.codigo AND x.centro = ?)")
            params.append(filters.centro_prod)

    if filters.bloqueado is not None:
        if _has_optional_int_col(schema, "bloqueado"):
            where.append("ISNULL(CAST(p.bloqueado AS INT), 0) = ?")
            params.append(int(filters.bloqueado))
        elif int(filters.bloqueado) != 0:
            where.append("1=0")  # Sem coluna: nenhum artigo está bloqueado

    if filters.frontoffice is not None:
        if _has_optional_int_col(schema, "frontoffice"):
            where.append("ISNULL(CAST(p.frontoffice AS INT), 1) = ?")
            params.append(int(filters.frontoffice))
        elif int(filters.frontoffice) != 1:
            where.append("1=0")  # Sem coluna: todos os artigos estão visíveis

    if filters.has_sales is not None:
        exists_sql = _sales_exists_sql(schema)
        if exists_sql is None:
            # Não é possível verificar: todos são tratados como "com vendas" (fail-safe)
            if not filters.has_sales:
                where.append("1=0")
        else:
            where.append(exists_sql if filters.has_sales else f"NOT {exists_sql}")

    return " AND ".join(where), params


def search_products(filters: ProductFilter) -> Tuple[List[ProductItem], int]:
    """Pesquisa artigos no SQL Server com filtros (incluindo vendas/estado) aplicados antes da paginação."""
    page = max(1, int(filters.page or 1))
    page_size = max(1, min(1000, int(filters.page_size or 50)))

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)

        temp_table = None
        if filters.codes is not None and len(filters.codes) > 1000:
            temp_table = "#filter_codes_search"
            cursor.execute(f"CREATE TABLE {temp_table} (codigo INT PRIMARY KEY)")
            for chunk in _chunks(filters.codes, 1000):
                val_rows = ",".join(["(?)"] * len(chunk))
                cursor.execute(f"INSERT INTO {temp_table} (codigo) VALUES {val_rows}", chunk)

        where_sql, params = _build_product_where(filters, schema, temp_table=temp_table)

        cursor.execute(f"SELECT COUNT(*) FROM dbo.produtos p WHERE {where_sql}", params)
        total_count = cursor.fetchone()[0]

        sort_map = {
            "codigo": "p.codigo",
            "plu": "ISNULL(p.codigo_alf, 0)",
            "descricao": "p.descricao",
            "precovenda": "ISNULL(p.precovenda, 0)",
            "posicaofront": "ISNULL(p.ordem, 0)",
            "familia": "f.descricao",
            "subfamilia": "sf.descricao",
            "codbarras": "p.codbarras",
        }
        sort_col = sort_map.get(filters.sort_by or "codigo", "p.codigo")
        sort_dir = "DESC" if filters.sort_order == "desc" else "ASC"
        order_sql = f"{sort_col} {sort_dir}" + (", p.codigo ASC" if sort_col != "p.codigo" else "")
        offset = (page - 1) * page_size

        cursor.execute(
            f"SELECT {_product_select_sql(schema)} {PRODUCT_FROM_SQL} WHERE {where_sql} "
            f"ORDER BY {order_sql} OFFSET {offset} ROWS FETCH NEXT {page_size} ROWS ONLY",
            params
        )
        rows = cursor.fetchall()
        sales = get_sales_codes(cursor, [int(r[0]) for r in rows])
        items = [_row_to_product(r, sales) for r in rows]
        return items, total_count
    finally:
        conn.close()


def get_filtered_product_codes(filters: ProductFilter) -> Dict[str, Any]:
    """Devolve todos os códigos de artigos que correspondem ao filtro (máximo 20.000)."""
    MAX_CODES = 20000
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)

        temp_table = None
        if filters.codes is not None and len(filters.codes) > 1000:
            temp_table = "#filter_codes_list"
            cursor.execute(f"CREATE TABLE {temp_table} (codigo INT PRIMARY KEY)")
            for chunk in _chunks(filters.codes, 1000):
                val_rows = ",".join(["(?)"] * len(chunk))
                cursor.execute(f"INSERT INTO {temp_table} (codigo) VALUES {val_rows}", chunk)

        where_sql, params = _build_product_where(filters, schema, temp_table=temp_table)

        cursor.execute(f"SELECT COUNT(*) FROM dbo.produtos p WHERE {where_sql}", params)
        total_count = int(cursor.fetchone()[0])

        sort_map = {
            "codigo": "p.codigo",
            "plu": "ISNULL(p.codigo_alf, 0)",
            "descricao": "p.descricao",
            "precovenda": "ISNULL(p.precovenda, 0)",
            "posicaofront": "ISNULL(p.ordem, 0)",
            "familia": "f.descricao",
            "subfamilia": "sf.descricao",
            "codbarras": "p.codbarras",
        }
        sort_col = sort_map.get(filters.sort_by or "codigo", "p.codigo")
        sort_dir = "DESC" if filters.sort_order == "desc" else "ASC"
        order_sql = f"{sort_col} {sort_dir}" + (", p.codigo ASC" if sort_col != "p.codigo" else "")

        cursor.execute(
            f"SELECT TOP {MAX_CODES} p.codigo {PRODUCT_FROM_SQL} WHERE {where_sql} ORDER BY {order_sql}",
            params
        )
        codes = [int(r[0]) for r in cursor.fetchall()]
        return {
            "codes": codes,
            "total": total_count,
            "truncated": total_count > MAX_CODES
        }
    finally:
        conn.close()


def get_selection_summary(product_codes: List[int]) -> Dict[str, Any]:
    """Calcula o resumo dos artigos selecionados (total, com vendas e amostra)."""
    codes = _unique_codes(product_codes)
    if not codes:
        return {
            "count": 0,
            "with_sales_count": 0,
            "sales_check_ok": True,
            "sample": None
        }

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        sales = get_sales_codes(cursor, codes)
        sample_item = None
        if codes:
            sample_list = _fetch_products_by_codes(cursor, [codes[0]], with_sales=(sales is not None), with_centros=True)
            if sample_list:
                sample_item = sample_list[0]

        if sales is None:
            with_sales_count = len(codes)
            sales_check_ok = False
        else:
            with_sales_count = len(sales)
            sales_check_ok = True

        return {
            "count": len(codes),
            "with_sales_count": with_sales_count,
            "sales_check_ok": sales_check_ok,
            "sample": sample_item.model_dump() if sample_item else None
        }
    finally:
        conn.close()


# ======================================================================
# Tabelas auxiliares
# ======================================================================

def get_production_centers() -> List[ProductionCenterItem]:
    """Obtém lista de Centros de Produção diretamente do SQL Server."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT codigo, descricao, ISNULL(id, 0) FROM dbo.centrosprod ORDER BY codigo ASC")
        rows = cursor.fetchall()
    finally:
        conn.close()
    return [ProductionCenterItem(codigo=row[0], descricao=row[1] or "", id=row[2]) for row in rows]


def get_printers() -> List[PrinterItem]:
    """Obtém lista de Impressoras diretamente do SQL Server."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT codigo, descricao, centro, ISNULL(sync, 0) FROM dbo.impressoras ORDER BY codigo ASC")
        rows = cursor.fetchall()
    finally:
        conn.close()
    return [PrinterItem(codigo=row[0], descricao=row[1] or "", centro=row[2], sync=row[3]) for row in rows]


def get_families() -> List[Dict[str, Any]]:
    """Obtém lista de famílias diretamente do SQL Server."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT codigo, descricao FROM dbo.familias ORDER BY codigo ASC")
        rows = cursor.fetchall()
    finally:
        conn.close()
    return [{"codigo": row[0], "descricao": row[1] or ""} for row in rows]


def create_family(descricao: str, fundo: int = 8421504, letra: int = 16777215) -> Dict[str, Any]:
    """Cria uma nova família em dbo.familias se não existir e devolve {codigo, descricao}."""
    desc_clean = (descricao or "").strip()
    if not desc_clean:
        raise ValueError("A descrição da família não pode ser vazia.")

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        fam_cols = schema.get("familias", {})

        cursor.execute("SELECT codigo, ISNULL(descricao, '') FROM dbo.familias")
        all_fam = cursor.fetchall()
        norm_target = remove_accents(desc_clean).lower()
        for code, desc in all_fam:
            if remove_accents(desc or "").lower() == norm_target:
                return {"codigo": int(code), "descricao": desc or ""}

        cursor.execute("SELECT ISNULL(MAX(codigo), 0) + 1 FROM dbo.familias")
        next_code = int(cursor.fetchone()[0])

        has_posprint = "posicaoprint" in fam_cols
        
        cols = ["codigo", "frontoffice", "posicaofront", "fundo", "letra", "tipo"]
        vals = [next_code, 1, next_code, fundo, letra, 0]
        if "id" in fam_cols:
            cols.append("id")
            vals.append(next_code)

        if has_posprint:
            cols.append("posicaoprint")
            vals.append(0)

        try:
            hex_str = "0x" + desc_clean.encode('cp1252').hex()
            desc_sql = f"CONVERT(VARCHAR(250), {hex_str})"
        except Exception:
            desc_sql = "?"
            cols.append("descricao")
            vals.append(desc_clean)

        cols_str = ", ".join(cols)
        placeholders = ", ".join(["?"] * len(vals))

        if desc_sql != "?":
            cursor.execute(f"INSERT INTO dbo.familias ({cols_str}, descricao) VALUES ({placeholders}, {desc_sql})", vals)
        else:
            cursor.execute(f"INSERT INTO dbo.familias ({cols_str}) VALUES ({placeholders})", vals)

        conn.commit()
        return {"codigo": next_code, "descricao": desc_clean}

    finally:
        conn.close()



def get_families_detailed() -> List[DetailedFamilyItem]:
    """Obtém lista detalhada de famílias com cores (fundo/letra) e contagem de artigos."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                f.codigo,
                f.descricao,
                ISNULL(f.fundo, 0) AS fundo,
                ISNULL(f.letra, 16777215) AS letra,
                ISNULL(f.frontoffice, 1) AS frontoffice,
                ISNULL(f.posicaofront, 0) AS posicaofront,
                (SELECT COUNT(*) FROM dbo.produtos p WHERE p.familia = f.codigo) AS products_count
            FROM dbo.familias f
            ORDER BY f.codigo ASC
        """)
        rows = cursor.fetchall()
    finally:
        conn.close()

    result = []
    for r in rows:
        fundo_int = _int_or(r[2], 0)
        letra_int = _int_or(r[3], 16777215)
        result.append(DetailedFamilyItem(
            codigo=r[0],
            descricao=r[1] or "",
            fundo=fundo_int,
            fundo_hex=int_color_to_hex(fundo_int),
            letra=letra_int,
            letra_hex=int_color_to_hex(letra_int),
            frontoffice=_int_or(r[4], 1),
            posicaofront=_int_or(r[5], 0),
            products_count=r[6] or 0
        ))
    return result


def get_vats() -> List[Dict[str, Any]]:
    """Obtém lista de taxas de IVA diretamente do SQL Server formatadas com números."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT codigo, factor FROM dbo.iva ORDER BY codigo ASC")
        rows = cursor.fetchall()
    finally:
        conn.close()
    result = []
    for row in rows:
        factor_num = float(row[1] or 0)
        result.append({"codigo": row[0], "descricao": format_iva_num(factor_num), "factor": factor_num})
    return result


def get_motivos_isencao() -> List[Dict[str, Any]]:
    """Obtém lista de motivos de isenção de IVA diretamente do SQL Server."""
    try:
        conn = db_manager.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT codigo, descricao, norma FROM dbo.motivos_isencao ORDER BY codigo ASC")
        rows = cursor.fetchall()
        conn.close()
        return [{"codigo": str(r[0]), "descricao": str(r[1]), "norma": str(r[2] or "")} for r in rows]
    except Exception as e:
        print(f"Aviso ao ler dbo.motivos_isencao: {e}")
        return [
            {"codigo": "M07", "descricao": "Isento artigo 9.º do CIVA", "norma": "Artigo 9.º do CIVA"},
            {"codigo": "M10", "descricao": "IVA - Regime de isenção", "norma": "Artigo 57.º do CIVA"},
            {"codigo": "M01", "descricao": "Artigo 16.º, n.º 6 do CIVA", "norma": "Artigo 16.º do CIVA"},
            {"codigo": "M99", "descricao": "Não sujeito ou não tributado", "norma": "Outras situações"},
        ]



def get_subfamilies(familia: Optional[int] = None) -> List[Dict[str, Any]]:
    """Obtém lista de subfamílias diretamente do SQL Server."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        if familia is not None:
            cursor.execute("SELECT codigo, descricao, familia FROM dbo.subfamilias WHERE familia = ? ORDER BY codigo ASC", (familia,))
        else:
            cursor.execute("SELECT codigo, descricao, familia FROM dbo.subfamilias ORDER BY codigo ASC")
        rows = cursor.fetchall()
    finally:
        conn.close()
    return [{"codigo": row[0], "descricao": row[1] or "", "familia": row[2]} for row in rows]


class _Lookups:
    """Tabelas auxiliares carregadas uma vez por operação (validação e descrições)."""

    def __init__(self, cursor):
        cursor.execute("SELECT codigo, descricao FROM dbo.familias")
        self.families: Dict[int, str] = {int(r[0]): (r[1] or "") for r in cursor.fetchall()}
        cursor.execute("SELECT codigo, descricao, familia FROM dbo.subfamilias")
        self.subfamilies: Dict[int, Tuple[str, Optional[int]]] = {
            int(r[0]): (r[1] or "", r[2]) for r in cursor.fetchall()
        }
        cursor.execute("SELECT factor FROM dbo.iva")
        self.vat_factors: List[float] = [float(r[0]) for r in cursor.fetchall() if r[0] is not None]
        cursor.execute("SELECT codigo, descricao FROM dbo.centrosprod")
        self.centers: Dict[int, str] = {int(r[0]): (r[1] or "") for r in cursor.fetchall()}

    def vat_exists(self, factor: float) -> bool:
        return any(abs(f - float(factor)) < 0.001 for f in self.vat_factors)

    def family_label(self, code: Optional[int]) -> str:
        if code is None:
            return "(Sem Família)"
        return f"{self.families.get(int(code), '?')} (#{code})"

    def subfamily_label(self, code: Optional[int]) -> str:
        if not code:
            return "(Sem Subfamília)"
        return f"{self.subfamilies.get(int(code), ('?', None))[0]} (#{code})"


# ======================================================================
# Exportação CSV e etiquetas
# ======================================================================

def generate_csv_export(filters: ProductFilter, selected_codes: Optional[List[int]] = None) -> str:
    """Gera ficheiro CSV formatado para Excel com artigos e preços."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if selected_codes:
            products = _fetch_products_by_codes(cursor, selected_codes, with_sales=False, with_centros=False)
            products.sort(key=lambda p: p.codigo)
        else:
            where_sql, params = _build_product_where(filters, schema)
            cursor.execute(
                f"SELECT {_product_select_sql(schema)} {PRODUCT_FROM_SQL} WHERE {where_sql} ORDER BY p.codigo ASC",
                params
            )
            products = [_row_to_product(r, set()) for r in cursor.fetchall()]
    finally:
        conn.close()

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow([
        "Codigo", "PLU", "CodBarras", "Referencia", "Designacao", "Descricaocurta", "Familia", "Subfamilia", "IVA",
        "PVP 1", "PVP 2", "PVP 3", "PVP 4", "PVP 5",
        "PVP 6", "PVP 7", "PVP 8", "PVP 9", "PVP 10",
        "Posicao POS"
    ])
    for p in products:
        writer.writerow([
            p.codigo, p.plu if p.plu else "", p.codbarras or "", p.referencia or "", p.descricao or "",
            p.descricaocurta or "", p.familia_desc or "", p.subfamilia_desc or "", p.iva_desc or "",
            *[f"{getattr(p, f'pvp{i}'):.2f}" for i in range(1, 11)],
            p.posicaofront or 0
        ])
    return output.getvalue()


def generate_shelf_labels_html(product_codes: List[int]) -> str:
    """Gera página HTML otimizada para impressão de etiquetas de prateleira."""
    conn = db_manager.get_connection()
    try:
        products = _fetch_products_by_codes(conn.cursor(), product_codes, with_sales=False, with_centros=False)
    finally:
        conn.close()
    date_str = datetime.now().strftime("%d/%m/%Y")
    esc = html.escape

    cards_html = ""
    for p in products:
        fam = (p.familia_desc or "ARTIGO").upper()
        cards_html += f"""
        <div class="label-card">
            <div class="card-header">
                <span>COD: #{p.codigo}</span>
                <span>{esc(fam)}</span>
            </div>
            <div class="card-title">{esc(p.descricao or "")}</div>
            <div class="card-footer">
                <div class="price-box">
                    <span class="price-val">{p.pvp1:.2f} €</span>
                </div>
                <div class="meta-box">
                    <span class="vat-tag">C/ IVA {esc(p.iva_desc or "")}</span>
                    <div class="date-tag">{date_str}</div>
                </div>
            </div>
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="utf-8">
    <title>Etiquetas de Prateleira - MassEdit POS</title>
    <style>
        @page {{ size: A4; margin: 8mm; }}
        body {{ font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 0; }}
        .no-print {{ background: #0f172a; color: #fff; padding: 14px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }}
        .btn-print {{ background: #2563eb; color: #fff; border: none; padding: 10px 20px; font-size: 13px; font-weight: bold; border-radius: 8px; cursor: pointer; transition: background 0.2s; }}
        .btn-print:hover {{ background: #1d4ed8; }}
        .grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; padding: 6mm; max-width: 210mm; margin: 0 auto; }}
        .label-card {{ background: #fff; border: 2px solid #0f172a; border-radius: 8px; padding: 10px; height: 42mm; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; page-break-inside: avoid; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        .card-header {{ border-bottom: 1.5px solid #cbd5e1; padding-bottom: 3px; display: flex; justify-content: space-between; font-size: 10px; font-weight: 800; color: #475569; letter-spacing: 0.5px; }}
        .card-title {{ font-size: 13px; font-weight: 700; color: #0f172a; margin: 4px 0; max-height: 36px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.2; }}
        .card-footer {{ display: flex; align-items: flex-end; justify-content: space-between; border-top: 1.5px dashed #94a3b8; padding-top: 4px; margin-top: auto; }}
        .price-val {{ font-size: 24px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }}
        .meta-box {{ text-align: right; }}
        .vat-tag {{ font-size: 9px; font-weight: 700; background: #e2e8f0; color: #1e293b; padding: 2px 6px; border-radius: 4px; display: inline-block; }}
        .date-tag {{ font-size: 8px; color: #64748b; margin-top: 2px; }}
        @media print {{
            .no-print {{ display: none !important; }}
            body {{ background: #fff; }}
            .grid {{ padding: 0; gap: 4mm; }}
        }}
    </style>
</head>
<body>
    <div class="no-print">
        <div>
            <strong style="font-size: 16px;">Imprimir Etiquetas de Prateleira</strong>
            <span style="color: #94a3b8; font-size: 13px; margin-left: 12px;">{len(products)} artigo(s) selecionado(s)</span>
        </div>
        <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar em PDF (Ctrl+P)</button>
    </div>
    <div class="grid">
        {cards_html}
    </div>
</body>
</html>
    """


# ======================================================================
# Transformações de texto e preços
# ======================================================================

def calculate_new_price(old_price: float, mode: str, value: float, rounding: Optional[str]) -> float:
    """Calcula o novo preço com modos (fixed_add, percentage, fixed_set, multiply) e arredondamentos."""
    if mode == "fixed_add":
        new_p = old_price + value
    elif mode == "percentage":
        new_p = old_price * (1.0 + (value / 100.0))
    elif mode == "fixed_set":
        new_p = value
    elif mode == "multiply":
        new_p = old_price * value
    else:
        new_p = old_price

    if new_p < 0:
        new_p = 0.0

    if rounding == "nearest_5_cents":
        new_p = round(new_p * 20.0) / 20.0
    elif rounding == "ends_0_or_5":
        new_p = math.ceil(new_p * 20.0) / 20.0
    elif rounding == "90_cents":
        new_p = math.floor(new_p) + 0.90
    elif rounding == "95_cents":
        new_p = math.floor(new_p) + 0.95
    elif rounding == "00_cents":
        new_p = round(new_p)
    elif rounding == "2_decimals":
        new_p = round(new_p, 2)

    return round(new_p, 4)


PT_LOWERCASE_WORDS = {
    "de", "do", "da", "dos", "das", "e", "c/", "s/", "com", "sem", "para", "por", "em",
    "a", "o", "as", "os", "um", "uma", "uns", "umas", "kg", "g", "gr", "mg", "ml", "cl", "dl", "l", "lt"
}


def correct_pt_orthography(text: str) -> str:
    """Corrige pontuação, espaçamento e preposições em português para nomes de artigos."""
    if not text:
        return ""
    # 1. Limpa múltiplos espaços
    text = re.sub(r'\s+', ' ', text).strip()

    # 2. Normaliza c/ e s/ (com / sem)
    text = re.sub(r'\b([cs])\s*/\s*', r'\1/ ', text, flags=re.IGNORECASE)
    text = re.sub(r'\s+', ' ', text).strip()

    # 3. Corrige espaços em pontuações
    text = re.sub(r'\s+([,.!?:;])', r'\1', text)
    text = re.sub(r'([,.!?:;])(?=[^\s\d,.!?:;])', r'\1 ', text)

    # 4. Capitaliza palavras mantendo preposições e unidades em minúsculas
    words = text.split(" ")
    formatted_words = []
    for i, word in enumerate(words):
        clean_word_lower = word.lower().strip(",.!:;?()[]{}")
        if i > 0 and clean_word_lower in PT_LOWERCASE_WORDS:
            formatted_words.append(word.lower())
        else:
            if word:
                formatted_words.append(word[0].upper() + word[1:].lower())
            else:
                formatted_words.append("")
    return " ".join(formatted_words)


def remove_accents(text: str) -> str:
    """Remove acentos e diacríticos mantendo maiúsculas/minúsculas com limpeza de Mojibake."""
    if not text:
        return ""
    text = (text.replace("Ã\xad", "í").replace("Ã§", "ç").replace("Ã\xa3", "ã")
            .replace("Ã\xa1", "á").replace("Ã©", "é").replace("Ã¢", "â")
            .replace("Ã³", "ó").replace("Ãº", "ú").replace("Ãª", "ê")
            .replace("\xad", "í"))
    nfd = unicodedata.normalize('NFD', text)
    return "".join(c for c in nfd if unicodedata.category(c) != 'Mn')


def remove_accents_uppercase(text: str) -> str:
    """Remove acentos e converte para MAIÚSCULAS."""
    return remove_accents(text).upper()


def transform_text_case(original_text: str, mode: str, fallback_new: Optional[str] = None) -> str:
    """Transforma o texto de acordo com o modo selecionado (direct, uppercase, lowercase, titlecase, capitalize, orthography, unaccented_uppercase, unaccented)."""
    if mode == "uppercase":
        return (original_text or "").upper()
    elif mode == "lowercase":
        return (original_text or "").lower()
    elif mode == "titlecase":
        text = original_text or ""
        return " ".join([word.capitalize() for word in text.split(" ")])
    elif mode == "capitalize":
        text = (original_text or "").strip()
        if not text:
            return ""
        return text[0].upper() + text[1:].lower()
    elif mode == "orthography":
        return correct_pt_orthography(original_text or "")
    elif mode == "unaccented_uppercase":
        return remove_accents_uppercase(original_text or "")
    elif mode == "unaccented":
        return remove_accents(original_text or "")
    elif mode == "direct":
        return fallback_new if fallback_new is not None else (original_text or "")
    return original_text or ""


TEXT_MODE_SUFFIX = {
    "titlecase": " (Primeira Letra De Cada Palavra)",
    "capitalize": " (Primeira Letra Da Frase)",
    "orthography": " (Ortografia Correta - Português)",
    "unaccented_uppercase": " (MAIÚSCULAS SEM ACENTOS)",
    "unaccented": " (Sem Acentos)",
}


def _text_mode_suffix(mode: str, short: bool) -> str:
    if mode == "uppercase":
        return " (Maiúsculas)" if short else " (Tudo em Maiúsculas)"
    if mode == "lowercase":
        return " (Minúsculas)" if short else " (Tudo em Minúsculas)"
    return TEXT_MODE_SUFFIX.get(mode, "")


# ======================================================================
# Motor de alterações (usado igualmente na simulação e na gravação)
# ======================================================================

class Change:
    """Uma alteração a um campo de um artigo. A simulação mostra-a; a gravação executa-a."""

    def __init__(self, field_name: str, label: str, old: Any, new: Any,
                 column: Optional[str] = None, value: Any = None,
                 blocked: bool = False, reason: Optional[str] = None,
                 centros: Optional[List[Tuple[int, int]]] = None,
                 price_idx: Optional[int] = None):
        self.field_name = field_name
        self.label = label
        self.old = old
        self.new = new
        self.column = column
        self.value = value
        self.blocked = blocked
        self.reason = reason
        self.centros = centros
        self.price_idx = price_idx

    def to_diff(self) -> FieldDiff:
        return FieldDiff(
            field_name=self.field_name,
            field_label=self.label,
            old_value=self.old,
            new_value=self.new,
            blocked=self.blocked,
            reason=self.reason,
        )


def _blocked(field_name: str, label: str, old: Any, new: Any, reason: str) -> Change:
    return Change(field_name, label, old, new, blocked=True, reason=reason)


def _sales_block_reason(p: ProductItem) -> str:
    if not p.sales_check_ok:
        return "Não foi possível verificar se o artigo tem vendas — a designação fica protegida por segurança."
    return "Não é possível alterar a designação de artigos com vendas efetuadas."


def _text_change(schema: SchemaInfo, field_name: str, column: str, label: str,
                 old: str, new: str) -> Optional[Change]:
    old = old or ""
    new = new if new is not None else ""
    if new == old:
        return None
    limit = _text_limit(schema, "produtos", column)
    if limit is not None and len(new) > limit:
        return _blocked(field_name, label, old or "(Vazio)", new,
                        f"O texto tem {len(new)} caracteres e a coluna '{column}' só aceita {limit}.")
    return Change(field_name, label, old or "(Vazio)", new or "(Vazio)", column=column, value=new)


def _descricao_change(schema: SchemaInfo, p: ProductItem, new_val: Optional[str], label: str) -> Optional[Change]:
    if new_val is None or new_val == p.descricao:
        return None
    if p.has_sales:
        return _blocked("descricao", label, p.descricao, new_val, _sales_block_reason(p))
    if not new_val.strip():
        return _blocked("descricao", label, p.descricao, "(Vazio)", "A designação não pode ficar vazia.")
    return _text_change(schema, "descricao", "descricao", label, p.descricao, new_val)


def _color_change(field_name: str, column: str, label: str, schema: SchemaInfo,
                  old_int: int, old_hex: str, new_hex: Optional[str], optional_column: bool = False) -> Optional[Change]:
    if not new_hex:
        return None
    if not is_valid_hex_color(new_hex):
        return _blocked(field_name, label, old_hex, new_hex, "Cor inválida (use o formato #RRGGBB).")
    new_int = hex_to_int_color(new_hex)
    if new_int == old_int:
        return None
    new_disp = "#" + new_hex.strip().lstrip('#').upper()
    if optional_column and not _has_optional_int_col(schema, column):
        return _blocked(field_name, label, old_hex, new_disp,
                        f"A coluna '{column}' não existe na tabela produtos desta base de dados.")
    return Change(field_name, label, f"{old_hex} (int: {old_int})", f"{new_disp} (int: {new_int})",
                  column=column, value=new_int)


def _price_change(idx: int, label: str, old_val: float, new_val: float) -> Optional[Change]:
    if _float_eq(old_val, new_val):
        return None
    col = "precovenda" if idx == 1 else f"pvp{idx}"
    return Change(f"pvp{idx}", label, f"{old_val:.2f} €", f"{new_val:.2f} €",
                  column=col, value=new_val, price_idx=idx)


def _pvp_index(field: Optional[str]) -> Optional[int]:
    if field and field.startswith("pvp") and field[3:].isdigit():
        idx = int(field[3:])
        if 1 <= idx <= 10:
            return idx
    return None


def _familia_change(lookups: _Lookups, p: ProductItem, new_fam: Optional[int]) -> Optional[Change]:
    if new_fam is None or new_fam == p.familias:
        return None
    label = "Família do Produto"
    if int(new_fam) not in lookups.families:
        return _blocked("familia", label, lookups.family_label(p.familias), f"#{new_fam}",
                        f"A família {new_fam} não existe na tabela de famílias.")
    return Change("familia", label, lookups.family_label(p.familias), lookups.family_label(new_fam),
                  column="familia", value=int(new_fam))


def _subfamilia_change(lookups: _Lookups, p: ProductItem, new_sub: Optional[int],
                       target_family: Optional[int]) -> Optional[Change]:
    new_code = int(new_sub or 0)
    old_code = int(p.subfamilia or 0)
    if new_code == old_code:
        return None
    label = "Subfamília"
    old_disp = lookups.subfamily_label(old_code)
    if new_code:
        sub = lookups.subfamilies.get(new_code)
        if sub is None:
            return _blocked("subfam", label, old_disp, f"#{new_code}",
                            f"A subfamília {new_code} não existe na tabela de subfamílias.")
        sub_family = sub[1]
        if sub_family is not None and target_family is not None and int(sub_family) != int(target_family):
            return _blocked("subfam", label, old_disp, lookups.subfamily_label(new_code),
                            f"A subfamília pertence à família {lookups.family_label(sub_family)}, "
                            f"não à família do artigo {lookups.family_label(target_family)}.")
    return Change("subfam", label, old_disp, lookups.subfamily_label(new_code), column="subfam", value=new_code)


def _iva_change(lookups: _Lookups, p: ProductItem, new_iva: Optional[float]) -> Optional[Change]:
    if new_iva is None:
        return None
    if p.iva is not None and abs(float(p.iva) - float(new_iva)) < 0.001:
        return None
    label = "Taxa de IVA"
    if not lookups.vat_exists(new_iva):
        return _blocked("iva", label, format_iva_num(p.iva), format_iva_num(new_iva),
                        f"A taxa {format_iva_num(new_iva)} não existe na tabela de IVA (dbo.iva).")
    return Change("iva", label, format_iva_num(p.iva), format_iva_num(new_iva), column="iva", value=float(new_iva))


def _optional_state_change(schema: SchemaInfo, p: ProductItem, field: str, label: str,
                           new_val: Optional[int], names: Dict[int, str]) -> Optional[Change]:
    if new_val is None:
        return None
    new_val = int(new_val)
    old_val = int(getattr(p, field))
    if new_val == old_val:
        return None
    if not _has_optional_int_col(schema, field):
        return _blocked(field, label, names.get(old_val, str(old_val)), names.get(new_val, str(new_val)),
                        f"A coluna '{field}' não existe na tabela produtos desta base de dados.")
    return Change(field, label, names.get(old_val, str(old_val)), names.get(new_val, str(new_val)),
                  column=field, value=new_val)


def _compute_bulk_changes(p: ProductItem, req: BulkEditRequest, schema: SchemaInfo,
                          lookups: _Lookups, seq_index: Dict[int, int]) -> List[Change]:
    changes: List[Optional[Change]] = []

    # 1. Designação (bloqueada se tiver vendas ou se não for possível verificar)
    if req.apply_descricao:
        new_val = transform_text_case(p.descricao, req.descricao_mode, req.new_descricao)
        changes.append(_descricao_change(schema, p, new_val,
                                         "Designação / Nome" + _text_mode_suffix(req.descricao_mode, short=False)))

    # 1.2 Descrição curta
    if req.apply_descricaocurta:
        new_val = transform_text_case(p.descricaocurta or "", req.descricaocurta_mode, req.new_descricaocurta)
        changes.append(_text_change(schema, "descricaocurta", "descricaocurta",
                                    "Descrição Curta (POS)" + _text_mode_suffix(req.descricaocurta_mode, short=True),
                                    p.descricaocurta or "", new_val))

    # 1.4 PLU (codigo_alf)
    if req.apply_plu:
        new_plu: Optional[int] = None
        label = "PLU (Teclado/Balança)"
        if req.plu_mode == "direct" and req.new_plu is not None:
            new_plu = int(req.new_plu)
        elif req.plu_mode == "sequence":
            new_plu = int(req.plu_seq_start or 1) + seq_index.get(p.codigo, 0)
            label = "PLU (Sequencial)"
        elif req.plu_mode == "copy_codigo":
            new_plu = p.codigo
            label = "PLU (Cópia do Código)"
        elif req.plu_mode == "clear":
            new_plu = 0
        if new_plu is not None and new_plu != (p.plu or 0):
            if new_plu < 0:
                changes.append(_blocked("plu", label, str(p.plu), str(new_plu), "O PLU não pode ser negativo."))
            else:
                changes.append(Change("plu", label, str(p.plu or 0), str(new_plu), column="codigo_alf", value=new_plu))

    # 1.5 Código de barras e referência
    if req.apply_codbarras:
        new_cb: Optional[str] = None
        label = "Código de Barras"
        if req.codbarras_mode == "direct" and req.new_codbarras is not None:
            new_cb = req.new_codbarras.strip()
        elif req.codbarras_mode == "sequence":
            new_cb = str(int(req.codbarras_seq_start or 1001) + seq_index.get(p.codigo, 0))
            label = "Código de Barras (Sequencial)"
        elif req.codbarras_mode == "clear":
            new_cb = ""
        if new_cb is not None:
            changes.append(_text_change(schema, "codbarras", "codbarras", label, p.codbarras or "", new_cb))

    if req.apply_referencia and req.new_referencia is not None:
        changes.append(_text_change(schema, "referencia", "referencia", "Referência do Artigo",
                                    p.referencia or "", req.new_referencia.strip()))

    # 2. Cores
    if req.colors.apply_fundo:
        changes.append(_color_change("fundo", "fundo", "Cor de Fundo do Botão (POS)", schema,
                                     p.fundo or 0, p.fundo_hex, req.colors.fundo_hex))
    if req.colors.apply_letra:
        changes.append(_color_change("letra", "letra", "Cor do Texto do Botão (POS)", schema,
                                     p.letra if p.letra is not None else 16777215, p.letra_hex, req.colors.letra_hex))
    if req.colors.apply_cor:
        changes.append(_color_change("cor", "cor", "Cor Adicional (cor)", schema,
                                     p.cor or 0, p.cor_hex, req.colors.cor_hex, optional_column=True))

    # 3. Preços PVP 1 a 10
    if req.prices.apply_price:
        mode = req.prices.mode
        target = req.prices.target_pvp or "pvp1"
        is_copy = (mode == "copy_pvp" or target.startswith("copy_"))
        if is_copy:
            src_idx = _pvp_index(req.prices.source_pvp) or 1
            src_price = float(getattr(p, f"pvp{src_idx}", 0.0))
            # Se tiver valor adicional ou arredondamento definido para a cópia
            final_src_price = src_price
            if req.prices.value and float(req.prices.value) != 0:
                final_src_price = calculate_new_price(src_price, "percentage" if req.prices.value > 0 or req.prices.value < 0 else "fixed_set", float(req.prices.value), req.prices.rounding)
            elif req.prices.rounding and req.prices.rounding != "none":
                final_src_price = calculate_new_price(src_price, "fixed_set", src_price, req.prices.rounding)

            if target in ("all", "copy_pvp1"):
                indices = [i for i in range(1, 11) if i != src_idx]
            else:
                indices = [_pvp_index(target) or 2]
            for idx in indices:
                if idx == src_idx:
                    continue
                label_extra = f" (Cópia de PVP {src_idx}{f' + {req.prices.value}%' if req.prices.value else ''})"
                changes.append(_price_change(idx, f"Preço PVP {idx}{label_extra}",
                                             float(getattr(p, f"pvp{idx}", 0.0)), final_src_price))
        else:
            if target == "all":
                indices = list(range(1, 11))
            else:
                idx = _pvp_index(target)
                indices = [idx] if idx else []
            for idx in indices:
                old_val = float(getattr(p, f"pvp{idx}", 0.0))
                new_val = calculate_new_price(old_val, mode, float(req.prices.value or 0), req.prices.rounding)
                changes.append(_price_change(idx, f"Preço PVP {idx}", old_val, new_val))

    # 4. Família e subfamília
    target_family = p.familias
    if req.apply_familia and req.new_familia is not None:
        fam_change = _familia_change(lookups, p, req.new_familia)
        changes.append(fam_change)
        if fam_change is not None and not fam_change.blocked:
            target_family = req.new_familia
    if req.apply_subfamilia:
        changes.append(_subfamilia_change(lookups, p, req.new_subfamilia, target_family))

    # 5. IVA
    if req.apply_iva:
        changes.append(_iva_change(lookups, p, req.new_iva))

    # 6. Centro de produção
    if req.apply_centro_prod:
        new_center = req.new_centro_prod if (req.new_centro_prod and req.new_centro_prod > 0) else None
        new_rows = [(int(new_center), int(req.centro_prod_info or 0))] if new_center else []
        old_rows = sorted((c["centro"], c["informativo"]) for c in (p.centros_prod or []))
        if sorted(new_rows) != old_rows:
            old_disp = p.centro_prod_desc or "(Sem Centro)"
            if len(old_rows) > 1:
                old_disp += f" (+{len(old_rows) - 1})"
            label = "Centro de Produção"
            if new_center and new_center not in lookups.centers:
                changes.append(_blocked("centro_prod", label, old_disp, f"#{new_center}",
                                        f"O centro de produção {new_center} não existe."))
            else:
                new_disp = (f"{lookups.centers[new_center]} ({'Informativo' if req.centro_prod_info else 'Preparação'})"
                            if new_center else "(Remover / Nenhum)")
                changes.append(Change("centro_prod", label, old_disp, new_disp, centros=new_rows))

    # 7. Estado, visibilidade e posição
    if req.apply_bloqueado:
        changes.append(_optional_state_change(schema, p, "bloqueado", "Estado de Bloqueio", req.new_bloqueado,
                                              {0: "Ativo", 1: "Bloqueado"}))
    if req.apply_frontoffice:
        changes.append(_optional_state_change(schema, p, "frontoffice", "Visibilidade FrontOffice", req.new_frontoffice,
                                              {1: "Visível no POS", 0: "Oculto no POS"}))
    if req.apply_posicaofront and req.new_posicaofront is not None:
        new_pos = int(req.new_posicaofront)
        if new_pos != (p.posicaofront or 0):
            if new_pos < 0:
                changes.append(_blocked("posicaofront", "Posição POS", str(p.posicaofront or 0), str(new_pos),
                                        "A posição não pode ser negativa."))
            else:
                changes.append(Change("posicaofront", "Posição POS", str(p.posicaofront or 0), str(new_pos),
                                      column="ordem", value=new_pos))

    return [c for c in changes if c is not None]


def _apply_changes(cursor, schema: SchemaInfo, codigo: int, changes: List[Change], mark_sync: bool) -> bool:
    """Executa as alterações (não bloqueadas) de um artigo dentro da transação em curso."""
    sets: List[str] = []
    params: List[Any] = []
    touched = False
    history_ok = _has_table_cols(schema, "historico_precos", ("datahora", "codigo", "pvp", "siva", "preco"))

    for ch in changes:
        if ch.blocked:
            continue
        if ch.centros is not None:
            cursor.execute("DELETE FROM dbo.produtoscentrosprod WHERE codigo = ?", (codigo,))
            for centro, info in ch.centros:
                cursor.execute(
                    "INSERT INTO dbo.produtoscentrosprod (codigo, centro, informativo) VALUES (?, ?, ?)",
                    (codigo, centro, info)
                )
            touched = True
        elif ch.column:
            sets.append(f"{ch.column} = ?")
            params.append(ch.value)
            touched = True
            if ch.price_idx and history_ok:
                cursor.execute(
                    "INSERT INTO dbo.historico_precos (datahora, codigo, pvp, siva, preco) VALUES (GETDATE(), ?, ?, 0, ?)",
                    (codigo, ch.price_idx, ch.value)
                )

    if not touched:
        return False
    if mark_sync and "sync" in _prod_cols(schema):
        sets.append("sync = 1")
    if sets:
        cursor.execute(f"UPDATE dbo.produtos SET {', '.join(sets)} WHERE codigo = ?", params + [codigo])
    return True


def _has_applicable(changes: List[Change]) -> bool:
    return any(not c.blocked for c in changes)


# ======================================================================
# Edição em massa
# ======================================================================

def preview_bulk_edit(req: BulkEditRequest) -> BulkEditPreviewResponse:
    """Gera a simulação (dry-run) das alterações sem alterar a DB."""
    codes = _unique_codes(req.product_codes)
    seq_index = {c: i for i, c in enumerate(codes)}

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        lookups = _Lookups(cursor)
        products = _fetch_products_by_codes(cursor, codes)
    finally:
        conn.close()

    previews: List[ProductDiff] = []
    blocked_count = 0
    affected = 0
    for p in products:
        changes = _compute_bulk_changes(p, req, schema, lookups, seq_index)
        if not changes:
            continue
        blocked_count += sum(1 for c in changes if c.blocked)
        if _has_applicable(changes):
            affected += 1
        previews.append(ProductDiff(codigo=p.codigo, descricao=p.descricao, has_sales=p.has_sales,
                                    diffs=[c.to_diff() for c in changes]))

    return BulkEditPreviewResponse(
        total_selected=len(codes),
        total_affected=affected,
        blocked_descriptions_count=blocked_count,
        previews=previews
    )


def apply_bulk_edit(req: BulkEditRequest) -> Tuple[bool, str, int]:
    """Aplica as alterações em massa na base de dados SQL Server dentro de uma transação atómica."""
    codes = _unique_codes(req.product_codes)
    seq_index = {c: i for i, c in enumerate(codes)}

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        lookups = _Lookups(cursor)
        products = _fetch_products_by_codes(cursor, codes)
        if not products:
            return False, "Nenhum artigo encontrado para os códigos especificados.", 0

        plan = []
        blocked_total = 0
        for p in products:
            changes = _compute_bulk_changes(p, req, schema, lookups, seq_index)
            blocked_total += sum(1 for c in changes if c.blocked)
            if _has_applicable(changes):
                plan.append((p, changes))

        if not plan:
            return True, "Nenhuma alteração a aplicar (os artigos já têm estes valores ou as alterações estão bloqueadas).", 0

        # 1. Cópia de segurança obrigatória antes de gravar
        try:
            backup_name = create_backup_snapshot([p for p, _ in plan], f"Edição em massa de {len(plan)} artigos")
        except Exception as e:
            return False, f"Não foi possível criar a cópia de segurança ({e}). Nenhuma alteração foi gravada.", 0

        # 2. Transação atómica
        try:
            affected = 0
            for p, changes in plan:
                if _apply_changes(cursor, schema, p.codigo, changes, req.mark_cloud_sync):
                    affected += 1
            conn.commit()
        except Exception as e:
            conn.rollback()
            return False, f"Erro ao aplicar alterações na base de dados (Transação revertida): {str(e)}", 0

        msg = f"Atualização de {affected} artigos concluída com sucesso na base de dados! (Backup: {backup_name})"
        if blocked_total:
            msg += f" {blocked_total} alteração(ões) bloqueada(s) não foram aplicadas."
        return True, msg, affected
    finally:
        conn.close()


# ======================================================================
# Cópias de segurança
# ======================================================================

def _read_family_colors(cursor, codes: List[int]) -> List[Dict[str, Any]]:
    result = []
    for chunk in _chunks(_unique_codes(codes)):
        cursor.execute(
            f"SELECT codigo, descricao, ISNULL(fundo, 0), ISNULL(letra, 16777215) FROM dbo.familias "
            f"WHERE codigo IN ({_placeholders(len(chunk))})",
            chunk
        )
        for r in cursor.fetchall():
            result.append({"codigo": int(r[0]), "descricao": r[1] or "", "fundo": int(r[2]), "letra": int(r[3])})
    return result


def create_backup_snapshot(products: List[ProductItem], description: str,
                           families: Optional[List[Dict[str, Any]]] = None,
                           ementa_digital: Optional[List[Dict[str, Any]]] = None) -> str:
    """Cria um ficheiro JSON de backup com o estado anterior dos produtos (e famílias / ementa digital). Lança exceção se falhar."""
    now = datetime.now()
    filename = f"backup_{now.strftime('%Y%m%d_%H%M%S')}_{now.microsecond:06d}.json"
    filepath = os.path.join(BACKUP_DIR, filename)

    schema = db_manager.cached_schema()
    snapshot_data = {
        "format_version": BACKUP_FORMAT_VERSION,
        "timestamp": now.isoformat(),
        "description": description,
        "items_count": len(products) + len(families or []) + len(ementa_digital or []),
        "database": db_manager.config.database,
        "optional_columns": [c for c in OPTIONAL_PRODUCT_COLUMNS if _has_optional_int_col(schema, c)],
        "products": [p.model_dump() for p in products],
        "families": families or [],
        "ementa_digital": ementa_digital or [],
    }

    os.makedirs(BACKUP_DIR, exist_ok=True)
    tmp_path = filepath + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(snapshot_data, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, filepath)
    return filename


def list_backups() -> List[BackupItem]:
    """Lista os ficheiros de cópia de segurança existentes."""
    try:
        files = [f for f in os.listdir(BACKUP_DIR) if BACKUP_NAME_RE.match(f)]
    except FileNotFoundError:
        return []
    files.sort(reverse=True)
    backups = []

    for fname in files:
        fpath = os.path.join(BACKUP_DIR, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            backups.append(BackupItem(
                filename=fname,
                created_at=data.get("timestamp", ""),
                items_count=data.get("items_count", 0),
                description=data.get("description", "Cópia de Segurança")
            ))
        except Exception:
            continue

    return backups


def _resolve_backup_path(filename: str) -> Optional[str]:
    """Valida o nome do ficheiro (sem caminhos) e garante que fica dentro da pasta de backups."""
    if not isinstance(filename, str):
        return None
    name = os.path.basename(filename)
    if name != filename or not BACKUP_NAME_RE.match(name):
        return None
    backup_root = os.path.realpath(BACKUP_DIR)
    path = os.path.realpath(os.path.join(backup_root, name))
    if os.path.dirname(path) != backup_root:
        return None
    return path


# Campos repostos no restauro: (chave no backup, coluna SQL, tipo)
RESTORE_FIELDS = [
    ("plu", "codigo_alf", "int"),
    ("descricao", "descricao", "text"),
    ("descricaocurta", "descricaocurta", "text"),
    ("familias", "familia", "int"),
    ("subfamilia", "subfam", "int"),
    ("iva", "iva", "float"),
    ("pvp1", "precovenda", "float"),
    ("pvp2", "pvp2", "float"),
    ("pvp3", "pvp3", "float"),
    ("pvp4", "pvp4", "float"),
    ("pvp5", "pvp5", "float"),
    ("pvp6", "pvp6", "float"),
    ("pvp7", "pvp7", "float"),
    ("pvp8", "pvp8", "float"),
    ("pvp9", "pvp9", "float"),
    ("pvp10", "pvp10", "float"),
    ("fundo", "fundo", "int"),
    ("letra", "letra", "int"),
    ("posicaofront", "ordem", "int"),
    ("codbarras", "codbarras", "text"),
    ("referencia", "referencia", "text"),
]


def _values_equal(kind: str, a: Any, b: Any) -> bool:
    if kind == "float":
        if a is None or b is None:
            return a is None and b is None
        return _float_eq(a, b)
    if kind == "text":
        return (a or "") == (b or "")
    return a == b


def restore_backup(filename: str) -> Tuple[bool, str]:
    """Restaura o estado dos artigos (e famílias) a partir de um ficheiro de backup JSON."""
    filepath = _resolve_backup_path(filename)
    if filepath is None:
        return False, "Nome de ficheiro de backup inválido."
    if not os.path.exists(filepath):
        return False, f"Ficheiro de backup {filename} não encontrado."

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return False, f"Não foi possível ler o ficheiro de backup: {e}"

    version = int(data.get("format_version", 1) or 1)
    products_data = [bp for bp in data.get("products", []) if isinstance(bp, dict) and bp.get("codigo") is not None]
    families_data = [fd for fd in (data.get("families") or []) if isinstance(fd, dict) and fd.get("codigo") is not None]
    ementa_data = [ed for ed in (data.get("ementa_digital") or []) if isinstance(ed, dict) and ed.get("cod_produto") is not None]
    if not products_data and not families_data and not ementa_data:
        return False, "Nenhum registo encontrado dentro do ficheiro de backup."

    backup_optional = set(data.get("optional_columns", [])) if version >= 2 else set()

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        prod_cols = _prod_cols(schema)
        codes = _unique_codes(bp["codigo"] for bp in products_data)
        current = {p.codigo: p for p in _fetch_products_by_codes(cursor, codes)}
        current_families = _read_family_colors(cursor, [fd["codigo"] for fd in families_data])

        fields = [f for f in RESTORE_FIELDS if f[1] in prod_cols]
        for col in OPTIONAL_PRODUCT_COLUMNS:
            if col in backup_optional and _has_optional_int_col(schema, col):
                fields.append((col, col, "int"))

        # Planeamento: só repõe o que difere do estado atual
        plan = []
        protected = 0
        missing = 0
        for bp in products_data:
            code = int(bp["codigo"])
            cur = current.get(code)
            if cur is None:
                missing += 1
                continue
            sets: List[str] = []
            params: List[Any] = []
            for key, col, kind in fields:
                if key not in bp:
                    continue
                val = bp[key]
                cur_val = getattr(cur, key)
                if _values_equal(kind, val, cur_val):
                    continue
                if version < 2 and key == "letra" and val == 16777215:
                    # Backups antigos gravavam letra=0 (preto) como 16777215: valor ambíguo, não repor
                    continue
                if key == "descricao":
                    if not val or not str(val).strip():
                        continue
                    if cur.has_sales:
                        protected += 1
                        continue
                sets.append(f"{col} = ?")
                params.append(val)

            centros = None
            if version >= 2 and isinstance(bp.get("centros_prod"), list):
                wanted = sorted((int(c["centro"]), int(c.get("informativo", 0))) for c in bp["centros_prod"]
                                if isinstance(c, dict) and c.get("centro") is not None)
                existing = sorted((c["centro"], c["informativo"]) for c in (cur.centros_prod or []))
                if wanted != existing:
                    centros = wanted

            if sets or centros is not None:
                plan.append((cur, sets, params, centros))

        cur_fam_map = {f["codigo"]: f for f in current_families}
        fam_plan = []
        for fd in families_data:
            cf = cur_fam_map.get(int(fd["codigo"]))
            if cf is None:
                continue
            if int(fd.get("fundo", 0)) != cf["fundo"] or int(fd.get("letra", 16777215)) != cf["letra"]:
                fam_plan.append((int(fd["codigo"]), int(fd.get("fundo", 0)), int(fd.get("letra", 16777215))))

        # Planeamento de Ementa Digital
        ementa_plan = []
        cur_ementa_snapshots = []
        has_ementa_table = "ementa_digital_produtos" in schema
        if has_ementa_table and ementa_data:
            ementa_cols = schema["ementa_digital_produtos"]
            ed_codes = [int(ed["cod_produto"]) for ed in ementa_data]
            chunks = [ed_codes[i:i + 500] for i in range(0, len(ed_codes), 500)]
            existing_ementa = {}
            for chunk in chunks:
                placeholders = ",".join("?" for _ in chunk)
                cursor.execute(f"SELECT * FROM dbo.ementa_digital_produtos WHERE cod_produto IN ({placeholders})", chunk)
                desc = [c[0].lower() for c in cursor.description]
                for row in cursor.fetchall():
                    row_dict = dict(zip(desc, row))
                    existing_ementa[int(row_dict["cod_produto"])] = row_dict

            restore_cols = ["produto", "descricao", "visivel", "highlight", "posicao", "gluten", "sal",
                            "lactose", "picante", "dieta", "vegetariano", "pessoas", "calorias", "tempo", "image_url"]
            valid_restore_cols = [c for c in restore_cols if c in ementa_cols]

            for ed in ementa_data:
                c_prod = int(ed["cod_produto"])
                cur_ed = existing_ementa.get(c_prod)
                if not cur_ed:
                    continue
                cur_ementa_snapshots.append(cur_ed)
                ed_sets: List[str] = []
                ed_params: List[Any] = []
                for col in valid_restore_cols:
                    if col in ed:
                        val = ed[col]
                        cur_val = cur_ed.get(col)
                        if str(val) != str(cur_val):
                            ed_sets.append(f"{col} = ?")
                            ed_params.append(val)
                if ed_sets:
                    ementa_plan.append({"cod_produto": c_prod, "sets": ed_sets, "params": ed_params})

        if not plan and not fam_plan and not ementa_plan:
            msg = "Nada a restaurar: os artigos já estão no estado desta cópia de segurança."
            if protected:
                msg += f" ({protected} designação(ões) de artigos com vendas não foram repostas.)"
            return True, msg

        # Cópia de segurança do estado atual (para poder desfazer o restauro)
        try:
            safety_name = create_backup_snapshot(
                [cur for cur, _, _, _ in plan],
                f"Estado antes do restauro de {filename}",
                families=[cur_fam_map[c] for c, _, _ in fam_plan],
                ementa_digital=cur_ementa_snapshots
            )
        except Exception as e:
            return False, f"Não foi possível criar a cópia de segurança do estado atual ({e}). Nada foi alterado."

        try:
            has_sync = "sync" in prod_cols
            for cur, sets, params, centros in plan:
                if centros is not None:
                    cursor.execute("DELETE FROM dbo.produtoscentrosprod WHERE codigo = ?", (cur.codigo,))
                    for centro, info in centros:
                        cursor.execute(
                            "INSERT INTO dbo.produtoscentrosprod (codigo, centro, informativo) VALUES (?, ?, ?)",
                            (cur.codigo, centro, info)
                        )
                final_sets = list(sets)
                if has_sync:
                    final_sets.append("sync = 1")
                if final_sets:
                    cursor.execute(f"UPDATE dbo.produtos SET {', '.join(final_sets)} WHERE codigo = ?",
                                   params + [cur.codigo])

            fam_sync = "sync" in schema.get("familias", {})
            for code, fundo, letra in fam_plan:
                cursor.execute(
                    f"UPDATE dbo.familias SET fundo = ?, letra = ?{', sync = 1' if fam_sync else ''} WHERE codigo = ?",
                    (fundo, letra, code)
                )

            # Restaurar Ementa Digital
            if ementa_plan:
                has_ed_sync = "sync" in schema.get("ementa_digital_produtos", {})
                for ed_item in ementa_plan:
                    sets_sql = list(ed_item["sets"])
                    if has_ed_sync:
                        sets_sql.append("sync = 1")
                    cursor.execute(
                        f"UPDATE dbo.ementa_digital_produtos SET {', '.join(sets_sql)} WHERE cod_produto = ?",
                        ed_item["params"] + [ed_item["cod_produto"]]
                    )

            conn.commit()
        except Exception as e:
            conn.rollback()
            return False, f"Falha ao restaurar cópia de segurança no SQL Server (transação revertida): {str(e)}"

        parts = [f"Reversão concluída! {len(plan)} artigo(s) restaurado(s)"]
        if fam_plan:
            parts.append(f"e {len(fam_plan)} família(s)")
        if ementa_plan:
            parts.append(f"e {len(ementa_plan)} artigo(s) na ementa digital")
        msg = " ".join(parts) + f". Estado anterior guardado em {safety_name}."
        if protected:
            msg += f" {protected} designação(ões) não foram repostas porque os artigos já têm vendas."
        if missing:
            msg += f" {missing} artigo(s) do backup já não existem na base de dados."
        if version < 2:
            msg += " (Backup antigo: centros de produção e ementa digital não incluídos.)"
        return True, msg
    finally:
        conn.close()


# ======================================================================
# Cores das famílias
# ======================================================================

def update_family_colors(req: BulkFamilyColorUpdateRequest) -> Tuple[bool, str, int]:
    """Atualiza as cores das famílias em dbo.familias e opcionalmente em dbo.produtos (com sync=1)."""
    if not req.updates:
        return False, "Nenhuma família foi selecionada para atualização.", 0

    for up in req.updates:
        if not is_valid_hex_color(up.fundo_hex) or not is_valid_hex_color(up.letra_hex):
            return False, f"Cor inválida na família {up.codigo} (use o formato #RRGGBB).", 0

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)

        # Estado anterior (famílias e artigos afetados) para a cópia de segurança
        families_before = _read_family_colors(cursor, [u.codigo for u in req.updates])
        propagate = _unique_codes(u.codigo for u in req.updates if u.apply_to_products)
        product_codes: List[int] = []
        for chunk in _chunks(propagate):
            cursor.execute(f"SELECT codigo FROM dbo.produtos WHERE familia IN ({_placeholders(len(chunk))})", chunk)
            product_codes.extend(int(r[0]) for r in cursor.fetchall())
        products_before = _fetch_products_by_codes(cursor, product_codes, with_sales=False) if product_codes else []

        try:
            backup_name = create_backup_snapshot(
                products_before, f"Cores de {len(req.updates)} família(s)", families=families_before
            )
        except Exception as e:
            return False, f"Não foi possível criar a cópia de segurança ({e}). Nenhuma alteração foi gravada.", 0

        fam_sync = ", sync = 1" if "sync" in schema.get("familias", {}) else ""
        prod_sync = ", sync = 1" if "sync" in _prod_cols(schema) else ""
        total_affected_products = 0
        try:
            for up in req.updates:
                fundo_int = hex_to_int_color(up.fundo_hex)
                letra_int = hex_to_int_color(up.letra_hex)
                cursor.execute(f"UPDATE dbo.familias SET fundo = ?, letra = ?{fam_sync} WHERE codigo = ?",
                               (fundo_int, letra_int, up.codigo))
                if up.apply_to_products:
                    cursor.execute(f"UPDATE dbo.produtos SET fundo = ?, letra = ?{prod_sync} WHERE familia = ?",
                                   (fundo_int, letra_int, up.codigo))
                    total_affected_products += max(cursor.rowcount, 0)
            conn.commit()
        except Exception as e:
            conn.rollback()
            return False, f"Erro ao atualizar cores das famílias (transação revertida): {str(e)}", 0
    finally:
        conn.close()

    msg = f"Cores de {len(req.updates)} família(s) atualizadas com sucesso (Backup: {backup_name})."
    if total_affected_products > 0:
        msg += f" {total_affected_products} artigo(s) foram atualizados com as novas cores e sinalizados com sync = 1."
    return True, msg, total_affected_products


# ======================================================================
# Importação CSV / Excel
# ======================================================================

def parse_import_csv(csv_text: str) -> List[ImportRow]:
    """Parse de ficheiro CSV (separador ; ou ,) para lista de ImportRow com suporte a formato europeu e auto-atribuição de códigos."""
    csv_text = (csv_text or "").lstrip("\ufeff")
    lines = csv_text.strip().splitlines()
    if not lines:
        return []

    # Detetar delimitador ; ou ,
    first_line = lines[0]
    delimiter = ';' if ';' in first_line else ','

    reader = csv.reader(io.StringIO(csv_text), delimiter=delimiter)
    header = [h.strip().lower().replace(" ", "").replace("_", "") for h in next(reader, [])]

    col_map: Dict[str, int] = {}
    for idx, col_name in enumerate(header):
        if col_name in ("codigo", "cod", "code", "id"):
            col_map["codigo"] = idx
        elif col_name in ("descricao", "designacao", "nome", "name", "artigo"):
            col_map["descricao"] = idx
        elif col_name in ("descricaocurta", "desccurta", "nomecurto", "shortdesc", "desccut", "descricaocut"):
            col_map["descricaocurta"] = idx
        elif col_name in ("plu", "plucode", "codigoalf"):
            col_map["plu"] = idx
        elif col_name in ("codbarras", "barras", "ean", "barcode", "codigobarras", "plucodbarras"):
            col_map["codbarras"] = idx
        elif col_name in ("referencia", "ref"):
            col_map["referencia"] = idx
        elif col_name in ("familia", "fam", "família"):
            col_map["familia"] = idx
        elif col_name in ("subfamilia", "subfam", "subfamília"):
            col_map["subfam"] = idx
        elif col_name in ("iva", "taxaiva"):
            col_map["iva"] = idx
        elif col_name in ("fundohex", "fundo", "corfundo"):
            col_map["fundo_hex"] = idx
        elif col_name in ("letrahex", "letra", "cortexto"):
            col_map["letra_hex"] = idx
        else:
            for p_num in range(1, 11):
                if col_name in (f"pvp{p_num}", f"pvp{p_num}(€)", f"precovenda{p_num}", f"preco{p_num}", f"preço{p_num}"):
                    col_map[f"pvp{p_num}"] = idx
                elif p_num == 1 and col_name in ("precovenda", "preco", "preço", "pvp"):
                    col_map["pvp1"] = idx

    if "descricao" not in col_map:
        if len(header) >= 2:
            col_map["descricao"] = 1
        elif len(header) >= 1:
            col_map["descricao"] = 0

    has_code_col = "codigo" in col_map
    auto_code = 700001
    family_map: Dict[str, int] = {}
    max_fam_code = 0

    try:
        conn = db_manager.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT codigo, descricao FROM dbo.familias")
        for code, desc in cursor.fetchall():
            if desc:
                family_map[desc.strip().lower()] = code
        cursor.execute("SELECT ISNULL(MAX(codigo), 0) FROM dbo.familias")
        max_fam_code = cursor.fetchone()[0] or 0

        if not has_code_col:
            cursor.execute("SELECT ISNULL(MAX(codigo), 700000) FROM dbo.produtos WHERE codigo >= 700000 AND codigo < 800000")
            row = cursor.fetchone()
            auto_code = (row[0] if row and row[0] >= 700000 else 700000) + 1
            if auto_code < 700001:
                auto_code = 700001
        conn.close()
    except Exception:
        pass

    rows = []
    for row in reader:
        if not row or not any(row):
            continue

        if has_code_col and len(row) > col_map["codigo"]:
            raw_cod = row[col_map["codigo"]].strip()
            if raw_cod and raw_cod.isdigit():
                codigo = int(raw_cod)
            else:
                codigo = auto_code
                auto_code += 1
        else:
            codigo = auto_code
            auto_code += 1

        def cell(key: str) -> Optional[str]:
            if key in col_map and len(row) > col_map[key]:
                return row[col_map[key]].strip()
            return None

        def parse_float_val(key: str) -> Optional[float]:
            raw = cell(key)
            if raw is None or raw == "":
                return None
            raw = raw.replace("€", "").replace("%", "").replace(" ", "")
            if "," in raw and "." in raw:
                raw = raw.replace(".", "")  # 1.234,50 -> 1234,50
            raw = raw.replace(",", ".")
            try:
                return float(raw)
            except ValueError:
                return None

        def parse_int_val(key: str) -> Optional[int]:
            raw = cell(key)
            if raw is None or raw == "":
                return None
            try:
                return int(float(raw.replace(",", ".")))
            except ValueError:
                return None

        fam_val = parse_int_val("familia")
        if fam_val is None:
            raw_fam = cell("familia")
            if raw_fam:
                k = raw_fam.strip().lower()
                if k in family_map:
                    fam_val = family_map[k]
                else:
                    max_fam_code += 1
                    family_map[k] = max_fam_code
                    fam_val = max_fam_code
                    try:
                        conn_f = db_manager.get_connection()
                        cur_f = conn_f.cursor()
                        raw_desc = raw_fam.strip()
                        try:
                            hex_str = "0x" + raw_desc.encode('cp1252').hex()
                            cur_f.execute(f"INSERT INTO dbo.familias (id, codigo, descricao, frontoffice, posicaofront, fundo, letra, tipo) VALUES (?, ?, CONVERT(VARCHAR(250), {hex_str}), 1, ?, 8421504, 16777215, 0)", (max_fam_code, max_fam_code, max_fam_code))
                        except Exception:
                            cur_f.execute("INSERT INTO dbo.familias (id, codigo, descricao, frontoffice, posicaofront, fundo, letra, tipo) VALUES (?, ?, ?, 1, ?, 8421504, 16777215, 0)", (max_fam_code, max_fam_code, raw_desc, max_fam_code))
                        conn_f.commit()
                        conn_f.close()
                    except Exception:
                        pass

        fundo = cell("fundo_hex")
        letra = cell("letra_hex")

        rows.append(ImportRow(
            codigo=codigo,
            descricao=cell("descricao"),
            descricaocurta=cell("descricaocurta"),
            plu=parse_int_val("plu"),
            codbarras=cell("codbarras"),
            referencia=cell("referencia"),
            familia=fam_val,
            subfam=parse_int_val("subfam"),
            iva=parse_float_val("iva"),
            pvp1=parse_float_val("pvp1"),
            pvp2=parse_float_val("pvp2"),
            pvp3=parse_float_val("pvp3"),
            pvp4=parse_float_val("pvp4"),
            pvp5=parse_float_val("pvp5"),
            pvp6=parse_float_val("pvp6"),
            pvp7=parse_float_val("pvp7"),
            pvp8=parse_float_val("pvp8"),
            pvp9=parse_float_val("pvp9"),
            pvp10=parse_float_val("pvp10"),
            fundo_hex=fundo if (fundo and fundo.startswith("#")) else None,
            letra_hex=letra if (letra and letra.startswith("#")) else None
        ))

    return rows


def _compute_import_changes(p: ProductItem, imp: ImportRow, schema: SchemaInfo, lookups: _Lookups) -> List[Change]:
    changes: List[Optional[Change]] = []

    if imp.descricao:
        changes.append(_descricao_change(schema, p, imp.descricao, "Designação / Nome"))
    if imp.descricaocurta is not None:
        changes.append(_text_change(schema, "descricaocurta", "descricaocurta", "Descrição Curta (POS)",
                                    p.descricaocurta or "", imp.descricaocurta))
    if imp.plu is not None and imp.plu != (p.plu or 0):
        if imp.plu < 0:
            changes.append(_blocked("plu", "PLU (Teclado/Balança)", str(p.plu), str(imp.plu), "O PLU não pode ser negativo."))
        else:
            changes.append(Change("plu", "PLU (Teclado/Balança)", str(p.plu or 0), str(imp.plu),
                                  column="codigo_alf", value=imp.plu))
    if imp.codbarras is not None:
        changes.append(_text_change(schema, "codbarras", "codbarras", "Código de Barras", p.codbarras or "", imp.codbarras))
    if imp.referencia is not None:
        changes.append(_text_change(schema, "referencia", "referencia", "Referência do Artigo", p.referencia or "", imp.referencia))

    for idx in range(1, 11):
        imp_val = getattr(imp, f"pvp{idx}", None)
        if imp_val is not None:
            if imp_val < 0:
                changes.append(_blocked(f"pvp{idx}", f"Preço PVP {idx}", f"{getattr(p, f'pvp{idx}'):.2f} €",
                                        f"{imp_val:.2f} €", "O preço não pode ser negativo."))
            else:
                changes.append(_price_change(idx, f"Preço PVP {idx}", float(getattr(p, f"pvp{idx}", 0.0)), float(imp_val)))

    target_family = p.familias
    if imp.familia is not None:
        fam_change = _familia_change(lookups, p, imp.familia)
        changes.append(fam_change)
        if fam_change is not None and not fam_change.blocked:
            target_family = imp.familia
    if imp.subfam is not None:
        changes.append(_subfamilia_change(lookups, p, imp.subfam, target_family))
    if imp.iva is not None:
        changes.append(_iva_change(lookups, p, imp.iva))

    if imp.fundo_hex:
        changes.append(_color_change("fundo", "fundo", "Cor de Fundo", schema, p.fundo or 0, p.fundo_hex, imp.fundo_hex))
    if imp.letra_hex:
        changes.append(_color_change("letra", "letra", "Cor do Texto", schema,
                                     p.letra if p.letra is not None else 16777215, p.letra_hex, imp.letra_hex))

    return [c for c in changes if c is not None]


def _dedupe_import_items(items: List[ImportRow]) -> List[ImportRow]:
    """Se o mesmo código aparecer várias vezes, prevalece a última linha do ficheiro."""
    by_code: Dict[int, ImportRow] = {}
    for item in items:
        by_code[item.codigo] = item
    return list(by_code.values())


def preview_import(items: List[ImportRow]) -> ImportPreviewResponse:
    """Gera o mapa de diferenças (dry-run) para os artigos a importar do ficheiro Excel/CSV."""
    unique_items = _dedupe_import_items(items)
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        lookups = _Lookups(cursor)
        prod_map = {p.codigo: p for p in _fetch_products_by_codes(cursor, [i.codigo for i in unique_items])}
    finally:
        conn.close()

    previews: List[ProductDiff] = []
    blocked_count = 0
    for imp in unique_items:
        p = prod_map.get(imp.codigo)
        if not p:
            diff_list = [
                FieldDiff(field_name="codigo", field_label="Código do Artigo", old_value="-", new_value=str(imp.codigo)),
                FieldDiff(field_name="descricao", field_label="Designação / Nome", old_value="-", new_value=imp.descricao or ""),
                FieldDiff(field_name="pvp1", field_label="Preço PVP 1", old_value="-", new_value=f"{imp.pvp1 or 0:.2f} €"),
                FieldDiff(field_name="familia", field_label="Família", old_value="-", new_value=str(imp.familia or 1))
            ]
            previews.append(ProductDiff(
                codigo=imp.codigo,
                descricao=f"[NOVO ARTIGO] {imp.descricao or ''}",
                has_sales=False,
                diffs=diff_list
            ))
            continue

        changes = _compute_import_changes(p, imp, schema, lookups)
        if not changes:
            continue
        blocked_count += sum(1 for c in changes if c.blocked)
        previews.append(ProductDiff(codigo=p.codigo, descricao=p.descricao, has_sales=p.has_sales,
                                    diffs=[c.to_diff() for c in changes]))

    return ImportPreviewResponse(
        total_file_rows=len(items),
        matched_products_count=len(unique_items),
        blocked_descriptions_count=blocked_count,
        previews=previews
    )


def apply_import(items: List[ImportRow]) -> Tuple[bool, str, int]:
    """Aplica as alterações importadas do ficheiro Excel/CSV diretamente no SQL Server com transação atómica."""
    unique_items = _dedupe_import_items(items)
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        lookups = _Lookups(cursor)
        prod_map = {p.codigo: p for p in _fetch_products_by_codes(cursor, [i.codigo for i in unique_items])}

        plan = []
        new_items_to_create: List[ImportRow] = []
        blocked_total = 0

        for imp in unique_items:
            p = prod_map.get(imp.codigo)
            if not p:
                new_items_to_create.append(imp)
                continue
            changes = _compute_import_changes(p, imp, schema, lookups)
            blocked_total += sum(1 for c in changes if c.blocked)
            if _has_applicable(changes):
                plan.append((p, changes))

        if not plan and not new_items_to_create:
            return True, "Nenhuma alteração a aplicar a partir do ficheiro.", 0

        try:
            backup_name = create_backup_snapshot([p for p, _ in plan],
                                                 f"Importação de ficheiro CSV ({len(plan) + len(new_items_to_create)} artigos)")
        except Exception as e:
            return False, f"Não foi possível criar a cópia de segurança ({e}). Nenhuma alteração foi gravada.", 0

        try:
            affected = 0
            for p, changes in plan:
                if _apply_changes(cursor, schema, p.codigo, changes, mark_sync=True):
                    affected += 1

            for idx, imp in enumerate(new_items_to_create):
                target_iva = imp.iva
                if target_iva is not None and not lookups.vat_exists(target_iva):
                    target_iva = lookups.vat_factors[0] if lookups.vat_factors else 0.0
                elif target_iva is None:
                    target_iva = lookups.vat_factors[0] if lookups.vat_factors else 0.0

                fam_code = imp.familia or 1
                cursor.execute("SELECT COUNT(*) FROM dbo.familias WHERE codigo = ?", (fam_code,))
                if cursor.fetchone()[0] == 0:
                    cursor.execute(
                        "INSERT INTO dbo.familias (id, codigo, descricao, frontoffice, posicaofront, posicaoprint, fundo, letra, tipo) "
                        "VALUES (?, ?, 'Geral', 1, ?, 0, 8421504, 16777215, 0)",
                        (fam_code, fam_code, fam_code)
                    )

                target_isencao = (imp.isencao or "0").strip()

                prod_desc = (imp.descricao or f"Artigo {imp.codigo}")[:250]
                prod_curta = (imp.descricaocurta or "")[:250]

                try:
                    desc_hex = "0x" + prod_desc.encode('cp1252').hex()
                    sql_desc = f"CONVERT(VARCHAR(250), {desc_hex})"
                except Exception:
                    sql_desc = "?"

                if sql_desc != "?":
                    cursor.execute(
                        f"INSERT INTO dbo.produtos ("
                        f"id, codigo, descricao, descricaocurta, precovenda, familia, subfam, iva, ordem, fundo, letra, vendersemstock, isencao, restricted, "
                        f"unidade, fornecedor, precocompra, datacriacao, ivacompra, iva2, ivarevenda, qtdstock, prodstock, retalho, composto"
                        f") VALUES (?, ?, {sql_desc}, ?, ?, ?, 0, ?, ?, 8421504, 16777215, 1, ?, 1, 1, 1, 0.0, GETDATE(), ?, ?, ?, 0.0, 0, 0, 0)",
                        (
                            imp.codigo,
                            imp.codigo,
                            prod_curta,
                            imp.pvp1 or 0.0,
                            fam_code,
                            target_iva,
                            idx + 1,
                            target_isencao,
                            target_iva,
                            target_iva,
                            target_iva
                        )
                    )
                else:
                    cursor.execute(
                        "INSERT INTO dbo.produtos ("
                        "id, codigo, descricao, descricaocurta, precovenda, familia, subfam, iva, ordem, fundo, letra, vendersemstock, isencao, restricted, "
                        "unidade, fornecedor, precocompra, datacriacao, ivacompra, iva2, ivarevenda, qtdstock, prodstock, retalho, composto"
                        ") VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 8421504, 16777215, 1, ?, 1, 1, 1, 0.0, GETDATE(), ?, ?, ?, 0.0, 0, 0, 0)",
                        (
                            imp.codigo,
                            imp.codigo,
                            prod_desc,
                            prod_curta,
                            imp.pvp1 or 0.0,
                            fam_code,
                            target_iva,
                            idx + 1,
                            target_isencao,
                            target_iva,
                            target_iva,
                            target_iva
                        )
                    )

                try:
                    cursor.execute("IF NOT EXISTS (SELECT 1 FROM dbo.produtosfamilias WHERE produto = ? AND familia = ?) INSERT INTO dbo.produtosfamilias (produto, familia) VALUES (?, ?)", (imp.codigo, fam_code, imp.codigo, fam_code))
                except Exception:
                    pass

                affected += 1


            conn.commit()
        except Exception as e:
            conn.rollback()
            return False, f"Falha ao aplicar importação no SQL Server (transação revertida): {str(e)}", 0

        msg = f"Importação concluída com sucesso! {affected} artigo(s) foram inseridos/atualizados na base de dados. (Backup: {backup_name})"
        if blocked_total:
            msg += f" {blocked_total} alteração(ões) bloqueada(s) não foram aplicadas."
        return True, msg, affected
    finally:
        conn.close()
