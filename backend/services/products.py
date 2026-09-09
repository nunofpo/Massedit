import os
import sys
import json
import math
import unicodedata
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from backend.models import (
    ProductFilter, ProductItem, BulkEditRequest, BulkEditPreviewResponse,
    ProductDiff, FieldDiff, BackupItem, DetailedFamilyItem, BulkFamilyColorUpdateRequest,
    ImportRow, ImportPreviewResponse, ImportApplyRequest
)
from backend.db import db_manager, hex_to_int_color, int_color_to_hex

def get_app_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.dirname(__file__)))

BACKUP_DIR = os.path.join(get_app_dir(), "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)


def check_product_sales_db(cursor, codigo: int) -> bool:
    """Verifica se o produto tem registo de vendas na DB SQL Server."""
    try:
        query = """
            SELECT TOP 1 1 FROM (
                SELECT codigo FROM dbo.vendasprod WHERE codigo = ?
                UNION ALL
                SELECT codigo FROM dbo.consumo_doc WHERE codigo = ?
                UNION ALL
                SELECT codigo FROM dbo.movimentos WHERE codigo = ?
            ) AS sales
        """
        cursor.execute(query, (codigo, codigo, codigo))
        return cursor.fetchone() is not None
    except Exception:
        return False


def get_families() -> List[Dict[str, Any]]:
    """Obtém lista de famílias diretamente do SQL Server."""
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT codigo, descricao FROM dbo.familias ORDER BY codigo ASC")
    rows = cursor.fetchall()
    conn.close()
    return [{"codigo": row[0], "descricao": row[1] or ""} for row in rows]


def get_families_detailed() -> List[DetailedFamilyItem]:
    """Obtém lista detalhada de famílias com cores (fundo/letra) e contagem de artigos."""
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    query = """
        SELECT 
            f.codigo, 
            f.descricao, 
            ISNULL(f.fundo, 0) as fundo, 
            ISNULL(f.letra, 16777215) as letra,
            ISNULL(f.frontoffice, 1) as frontoffice,
            ISNULL(f.posicaofront, 0) as posicaofront,
            (SELECT COUNT(*) FROM dbo.produtos p WHERE p.familia = f.codigo) as products_count
        FROM dbo.familias f
        ORDER BY f.codigo ASC
    """
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    result = []
    for r in rows:
        fundo_int = r[2] if r[2] is not None else 0
        letra_int = r[3] if r[3] is not None else 16777215
        result.append(DetailedFamilyItem(
            codigo=r[0],
            descricao=r[1] or "",
            fundo=fundo_int,
            fundo_hex=int_color_to_hex(fundo_int),
            letra=letra_int,
            letra_hex=int_color_to_hex(letra_int),
            frontoffice=r[4] or 1,
            posicaofront=r[5] or 0,
            products_count=r[6] or 0
        ))
    return result


def update_family_colors(req: BulkFamilyColorUpdateRequest) -> Tuple[bool, str, int]:
    """Atualiza as cores das famílias em dbo.familias e opcionalmente em dbo.produtos (com sync=1)."""
    if not req.updates:
        return False, "Nenhuma família foi selecionada para atualização.", 0

    conn = db_manager.get_connection()
    cursor = conn.cursor()

    total_affected_products = 0
    updated_families_count = len(req.updates)

    try:
        cursor.execute("BEGIN TRANSACTION")

        for up in req.updates:
            fundo_int = hex_to_int_color(up.fundo_hex)
            letra_int = hex_to_int_color(up.letra_hex)

            # 1. Atualizar cores da família em dbo.familias
            cursor.execute(
                "UPDATE dbo.familias SET fundo = ?, letra = ? WHERE codigo = ?",
                (fundo_int, letra_int, up.codigo)
            )

            # 2. Opcionalmente propagar as cores para os produtos dessa família em dbo.produtos
            if up.apply_to_products:
                cursor.execute(
                    "UPDATE dbo.produtos SET fundo = ?, letra = ?, sync = 1 WHERE familia = ?",
                    (fundo_int, letra_int, up.codigo)
                )
                total_affected_products += cursor.rowcount

        conn.commit()
        conn.close()

        msg = f"Cores de {updated_families_count} família(s) atualizadas com sucesso."
        if total_affected_products > 0:
            msg += f" {total_affected_products} artigo(s) foram atualizados com as novas cores e sinalizados com sync = 1."

        return True, msg, total_affected_products

    except Exception as e:
        conn.rollback()
        conn.close()
        return False, f"Erro ao atualizar cores das famílias: {str(e)}", 0



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


def get_vats() -> List[Dict[str, Any]]:
    """Obtém lista de taxas de IVA diretamente do SQL Server formatadas com números."""
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT codigo, factor FROM dbo.iva ORDER BY codigo ASC")
    rows = cursor.fetchall()
    conn.close()
    result = []
    for row in rows:
        factor_num = float(row[1] or 0)
        desc_num = format_iva_num(factor_num)
        result.append({"codigo": row[0], "descricao": desc_num, "factor": factor_num})
    return result


def get_subfamilies(familia: Optional[int] = None) -> List[Dict[str, Any]]:
    """Obtém lista de subfamílias diretamente do SQL Server."""
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    if familia is not None:
        cursor.execute("SELECT codigo, descricao, familia FROM dbo.subfamilias WHERE familia = ? ORDER BY codigo ASC", (familia,))
    else:
        cursor.execute("SELECT codigo, descricao, familia FROM dbo.subfamilias ORDER BY codigo ASC")
    rows = cursor.fetchall()
    conn.close()
    return [{"codigo": row[0], "descricao": row[1] or "", "familia": row[2]} for row in rows]


def search_products(filters: ProductFilter) -> Tuple[List[ProductItem], int]:
    """Pesquisa artigos no SQL Server com suporte a filtros avançados, ordenação e subfamílias."""
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    
    where_clauses = ["1=1"]
    params = []
    
    if filters.search and filters.search.strip():
        st = f"%{filters.search.strip()}%"
        where_clauses.append("(p.descricao LIKE ? OR p.descricaocurta LIKE ? OR CAST(p.codigo AS VARCHAR) LIKE ? OR CAST(p.codigo_alf AS VARCHAR) LIKE ? OR p.codbarras LIKE ? OR p.referencia LIKE ?)")
        params.extend([st, st, st, st, st, st])
    if filters.familia is not None:
        where_clauses.append("p.familia = ?")
        params.append(filters.familia)
    if filters.subfamilia is not None:
        where_clauses.append("p.subfam = ?")
        params.append(filters.subfamilia)
    if filters.iva is not None:
        where_clauses.append("(p.iva = ? OR p.iva IN (SELECT factor FROM dbo.iva WHERE codigo = ?))")
        params.extend([filters.iva, filters.iva])
        
    where_sql = " AND ".join(where_clauses)
    
    count_sql = f"SELECT COUNT(*) FROM dbo.produtos p WHERE {where_sql}"
    cursor.execute(count_sql, params)
    total_count = cursor.fetchone()[0]
    
    # Mapeamento de Ordenação
    sort_map = {
        "codigo": "p.codigo",
        "plu": "ISNULL(p.codigo_alf, 0)",
        "descricao": "p.descricao",
        "precovenda": "p.precovenda",
        "posicaofront": "ISNULL(p.ordem, 0)",
        "familia": "f.descricao",
        "subfamilia": "sf.descricao",
        "codbarras": "p.codbarras"
    }
    sort_col = sort_map.get(filters.sort_by, "p.codigo")
    sort_dir = "DESC" if filters.sort_order == "desc" else "ASC"

    offset = (filters.page - 1) * filters.page_size
    sql = f"""
        SELECT 
            p.codigo, p.descricao, ISNULL(p.descricaocurta, '') as descricaocurta, p.familia, f.descricao as familia_desc,
            p.subfam, sf.descricao as subfamilia_desc, p.iva, i.descricao as iva_desc,
            ISNULL(p.precovenda, 0) as pvp1, ISNULL(p.pvp2, 0) as pvp2, ISNULL(p.pvp3, 0) as pvp3, ISNULL(p.pvp4, 0) as pvp4, ISNULL(p.pvp5, 0) as pvp5,
            ISNULL(p.pvp6, 0) as pvp6, ISNULL(p.pvp7, 0) as pvp7, ISNULL(p.pvp8, 0) as pvp8, ISNULL(p.pvp9, 0) as pvp9, ISNULL(p.pvp10, 0) as pvp10,
            ISNULL(p.fundo, 0) as fundo, ISNULL(p.letra, 16777215) as letra,
            ISNULL(p.ordem, 0) as posicaofront,
            ISNULL(p.codigo_alf, 0) as plu,
            ISNULL(p.codbarras, '') as codbarras,
            ISNULL(p.referencia, '') as referencia
        FROM dbo.produtos p
        LEFT JOIN dbo.familias f ON p.familia = f.codigo
        LEFT JOIN dbo.subfamilias sf ON p.subfam = sf.codigo
        LEFT JOIN dbo.iva i ON p.iva = i.factor
        WHERE {where_sql}
        ORDER BY {sort_col} {sort_dir}
        OFFSET {offset} ROWS FETCH NEXT {filters.page_size} ROWS ONLY
    """
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    
    items = []
    for r in rows:
        cod = r[0]
        has_sales = check_product_sales_db(cursor, cod)
        
        if filters.has_sales is not None and has_sales != filters.has_sales:
            continue

        items.append(ProductItem(
            codigo=r[0],
            descricao=r[1] or "",
            descricaocurta=r[2] or "",
            familias=r[3],
            familia_desc=r[4] or "",
            subfamilia=r[5],
            subfamilia_desc=r[6] or "",
            iva=r[7],
            iva_desc=format_iva_num(r[7]),
            pvp1=float(r[9] or 0),
            pvp2=float(r[10] or 0),
            pvp3=float(r[11] or 0),
            pvp4=float(r[12] or 0),
            pvp5=float(r[13] or 0),
            pvp6=float(r[14] or 0),
            pvp7=float(r[15] or 0),
            pvp8=float(r[16] or 0),
            pvp9=float(r[17] or 0),
            pvp10=float(r[18] or 0),
            fundo=int(r[19] or 0),
            fundo_hex=int_color_to_hex(r[19]),
            letra=int(r[20] or 16777215),
            letra_hex=int_color_to_hex(r[20]),
            bloqueado=0,
            frontoffice=1,
            posicaofront=int(r[21] or 0),
            plu=int(r[22] or 0),
            codbarras=r[23] or "",
            referencia=r[24] or "",
            cor=0,
            cor_hex="#000000",
            sync=0,
            has_sales=has_sales,
            can_edit_description=not has_sales
        ))
    
    conn.close()
    return items, total_count


def generate_csv_export(filters: ProductFilter, selected_codes: Optional[List[int]] = None) -> str:
    """Gera ficheiro CSV formatado para Excel com artigos e preços."""
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    
    where_clauses = ["1=1"]
    params = []
    
    if selected_codes:
        placeholders = ",".join(["?"] * len(selected_codes))
        where_clauses.append(f"p.codigo IN ({placeholders})")
        params.extend(selected_codes)
    else:
        if filters.search and filters.search.strip():
            st = f"%{filters.search.strip()}%"
            where_clauses.append("(p.descricao LIKE ? OR CAST(p.codigo AS VARCHAR) LIKE ?)")
            params.extend([st, st])
        if filters.familia is not None:
            where_clauses.append("p.familia = ?")
            params.append(filters.familia)
        if filters.subfamilia is not None:
            where_clauses.append("p.subfam = ?")
            params.append(filters.subfamilia)
        if filters.iva is not None:
            where_clauses.append("p.iva = ?")
            params.append(filters.iva)

    where_sql = " AND ".join(where_clauses)
    
    sql = f"""
        SELECT 
            p.codigo, ISNULL(p.codigo_alf, 0) as plu, ISNULL(p.codbarras, '') as codbarras, ISNULL(p.referencia, '') as referencia, p.descricao, ISNULL(p.descricaocurta, '') as descricaocurta,
            f.descricao as familia, sf.descricao as subfamilia, i.descricao as iva,
            ISNULL(p.precovenda, 0) as pvp1, ISNULL(p.pvp2, 0) as pvp2, ISNULL(p.pvp3, 0) as pvp3, ISNULL(p.pvp4, 0) as pvp4, ISNULL(p.pvp5, 0) as pvp5,
            ISNULL(p.pvp6, 0) as pvp6, ISNULL(p.pvp7, 0) as pvp7, ISNULL(p.pvp8, 0) as pvp8, ISNULL(p.pvp9, 0) as pvp9, ISNULL(p.pvp10, 0) as pvp10,
            ISNULL(p.ordem, 0) as posicaofront
        FROM dbo.produtos p
        LEFT JOIN dbo.familias f ON p.familia = f.codigo
        LEFT JOIN dbo.subfamilias sf ON p.subfam = sf.codigo
        LEFT JOIN dbo.iva i ON p.iva = i.factor
        WHERE {where_sql}
        ORDER BY p.codigo ASC
    """
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    conn.close()
    
    import io, csv
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow([
        "Codigo", "PLU", "CodBarras", "Referencia", "Designacao", "Descricaocurta", "Familia", "Subfamilia", "IVA",
        "PVP 1", "PVP 2", "PVP 3", "PVP 4", "PVP 5",
        "PVP 6", "PVP 7", "PVP 8", "PVP 9", "PVP 10",
        "Posicao POS"
    ])
    for r in rows:
        writer.writerow([
            r[0], r[1] if r[1] else "", r[2] or "", r[3] or "", r[4] or "", r[5] or "", r[6] or "", r[7] or "", r[8] or "",
            f"{r[9]:.2f}", f"{r[10]:.2f}", f"{r[11]:.2f}", f"{r[12]:.2f}", f"{r[13]:.2f}",
            f"{r[14]:.2f}", f"{r[15]:.2f}", f"{r[16]:.2f}", f"{r[17]:.2f}", f"{r[18]:.2f}",
            r[19]
        ])
    return output.getvalue()


def generate_shelf_labels_html(product_codes: List[int]) -> str:
    """Gera página HTML otimizada para impressão de etiquetas de prateleira."""
    products = get_products_by_codes(product_codes)
    date_str = datetime.now().strftime("%d/%m/%Y")
    
    cards_html = ""
    for p in products:
        fam = (p.familia_desc or "ARTIGO").upper()
        cards_html += f"""
        <div class="label-card">
            <div class="card-header">
                <span>COD: #{p.codigo}</span>
                <span>{fam}</span>
            </div>
            <div class="card-title">{p.descricao}</div>
            <div class="card-footer">
                <div class="price-box">
                    <span class="price-val">{p.pvp1:.2f} €</span>
                </div>
                <div class="meta-box">
                    <span class="vat-tag">C/ IVA {p.iva_desc or ""}</span>
                    <div class="date-tag">{date_str}</div>
                </div>
            </div>
        </div>
        """

    html = f"""<!DOCTYPE html>
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
        .label-card {{ background: #fff; border: 2px solid #0f172a; border-radius: 8px; padding: 10px; height: 42mm; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; page-break-inside: avoid; shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        .card-header {{ border-bottom: 1.5px solid #cbd5e1; padding-bottom: 3px; display: flex; justify-content: space-between; font-size: 10px; font-weight: 800; color: #475569; letter-spacing: 0.5px; }}
        .card-title {{ font-size: 13px; font-weight: 700; color: #0f172a; margin: 4px 0; max-height: 36px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.2; }}
        .card-footer {{ display: flex; align-items: flex-end; justify-content: space-between; border-top: 1.5px dashed #94a3b8; pt: 4px; margin-top: auto; }}
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
    return html


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

    if rounding == "90_cents":
        new_p = math.floor(new_p) + 0.90
    elif rounding == "95_cents":
        new_p = math.floor(new_p) + 0.95
    elif rounding == "00_cents":
        new_p = round(new_p)
    elif rounding == "2_decimals":
        new_p = round(new_p, 2)
        
    return round(new_p, 4)


def get_products_by_codes(codes: List[int]) -> List[ProductItem]:
    """Obtém lista detalhada de artigos por código diretamente do SQL Server."""
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    placeholders = ",".join(["?"] * len(codes))
    sql = f"""
        SELECT 
            p.codigo, p.descricao, ISNULL(p.descricaocurta, '') as descricaocurta, p.familia, f.descricao as familia_desc,
            p.subfam, sf.descricao as subfamilia_desc, p.iva, i.descricao as iva_desc,
            ISNULL(p.precovenda, 0) as pvp1, ISNULL(p.pvp2, 0) as pvp2, ISNULL(p.pvp3, 0) as pvp3, ISNULL(p.pvp4, 0) as pvp4, ISNULL(p.pvp5, 0) as pvp5,
            ISNULL(p.pvp6, 0) as pvp6, ISNULL(p.pvp7, 0) as pvp7, ISNULL(p.pvp8, 0) as pvp8, ISNULL(p.pvp9, 0) as pvp9, ISNULL(p.pvp10, 0) as pvp10,
            ISNULL(p.fundo, 0) as fundo, ISNULL(p.letra, 16777215) as letra,
            ISNULL(p.ordem, 0) as posicaofront,
            ISNULL(p.codigo_alf, 0) as plu,
            ISNULL(p.codbarras, '') as codbarras,
            ISNULL(p.referencia, '') as referencia
        FROM dbo.produtos p
        LEFT JOIN dbo.familias f ON p.familia = f.codigo
        LEFT JOIN dbo.subfamilias sf ON p.subfam = sf.codigo
        LEFT JOIN dbo.iva i ON p.iva = i.factor
        WHERE p.codigo IN ({placeholders})
    """
    cursor.execute(sql, codes)
    rows = cursor.fetchall()
    items = []
    for r in rows:
        cod = r[0]
        has_sales = check_product_sales_db(cursor, cod)
        items.append(ProductItem(
            codigo=r[0],
            descricao=r[1] or "",
            descricaocurta=r[2] or "",
            familias=r[3],
            familia_desc=r[4] or "",
            subfamilia=r[5],
            subfamilia_desc=r[6] or "",
            iva=r[7],
            iva_desc=format_iva_num(r[7]),
            pvp1=float(r[9] or 0),
            pvp2=float(r[10] or 0),
            pvp3=float(r[11] or 0),
            pvp4=float(r[12] or 0),
            pvp5=float(r[13] or 0),
            pvp6=float(r[14] or 0),
            pvp7=float(r[15] or 0),
            pvp8=float(r[16] or 0),
            pvp9=float(r[17] or 0),
            pvp10=float(r[18] or 0),
            fundo=int(r[19] or 0),
            fundo_hex=int_color_to_hex(r[19]),
            letra=int(r[20] or 16777215),
            letra_hex=int_color_to_hex(r[20]),
            bloqueado=0,
            frontoffice=1,
            posicaofront=int(r[21] or 0),
            plu=int(r[22] or 0),
            codbarras=r[23] or "",
            referencia=r[24] or "",
            cor=0,
            cor_hex="#000000",
            sync=0,
            has_sales=has_sales,
            can_edit_description=not has_sales
        ))
    conn.close()
    return items


import re

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
    """Remove acentos e diacríticos mantendo maiúsculas/minúsculas."""
    if not text:
        return ""
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


def preview_bulk_edit(req: BulkEditRequest) -> BulkEditPreviewResponse:
    """Gera a simulação (dry-run) das alterações sem alterar a DB."""
    products = get_products_by_codes(req.product_codes)
    previews: List[ProductDiff] = []
    blocked_count = 0

    families_map = {f["codigo"]: f["descricao"] for f in get_families()}
    vats_map = {v["codigo"]: v["descricao"] for v in get_vats()}

    for p in products:
        diffs: List[FieldDiff] = []
        
        # 1. Designação / Nome (Com validação estrita de vendas)
        if req.apply_descricao:
            if p.has_sales:
                blocked_count += 1
                diffs.append(FieldDiff(
                    field_name="descricao",
                    field_label="Designação / Nome",
                    old_value=p.descricao,
                    new_value=p.descricao,
                    blocked=True,
                    reason="Não é possível alterar a designação de artigos com vendas efetuadas."
                ))
            else:
                new_val = transform_text_case(p.descricao, req.descricao_mode, req.new_descricao)
                if new_val != p.descricao:
                    label_suffix = ""
                    if req.descricao_mode == "uppercase":
                        label_suffix = " (Tudo em Maiúsculas)"
                    elif req.descricao_mode == "lowercase":
                        label_suffix = " (Tudo em Minúsculas)"
                    elif req.descricao_mode == "titlecase":
                        label_suffix = " (Primeira Letra De Cada Palavra)"
                    elif req.descricao_mode == "capitalize":
                        label_suffix = " (Primeira Letra Da Frase)"
                    elif req.descricao_mode == "orthography":
                        label_suffix = " (Ortografia Correta - Português)"
                    elif req.descricao_mode == "unaccented_uppercase":
                        label_suffix = " (MAIÚSCULAS SEM ACENTOS)"
                    elif req.descricao_mode == "unaccented":
                        label_suffix = " (Sem Acentos)"

                    diffs.append(FieldDiff(
                        field_name="descricao",
                        field_label=f"Designação / Nome{label_suffix}",
                        old_value=p.descricao or "(Vazio)",
                        new_value=new_val or "(Vazio)",
                        blocked=False
                    ))

        # 1.2 Descrição Curta (POS)
        if req.apply_descricaocurta:
            new_val = transform_text_case(p.descricaocurta or "", req.descricaocurta_mode, req.new_descricaocurta)
            if new_val != (p.descricaocurta or ""):
                label_suffix = ""
                if req.descricaocurta_mode == "uppercase":
                    label_suffix = " (Maiúsculas)"
                elif req.descricaocurta_mode == "lowercase":
                    label_suffix = " (Minúsculas)"
                elif req.descricaocurta_mode == "titlecase":
                    label_suffix = " (Primeira Letra De Cada Palavra)"
                elif req.descricaocurta_mode == "capitalize":
                    label_suffix = " (Primeira Letra Da Frase)"
                elif req.descricaocurta_mode == "orthography":
                    label_suffix = " (Ortografia Correta - Português)"
                elif req.descricaocurta_mode == "unaccented_uppercase":
                    label_suffix = " (MAIÚSCULAS SEM ACENTOS)"
                elif req.descricaocurta_mode == "unaccented":
                    label_suffix = " (Sem Acentos)"

                diffs.append(FieldDiff(
                    field_name="descricaocurta",
                    field_label=f"Descrição Curta (POS){label_suffix}",
                    old_value=p.descricaocurta or "(Vazio)",
                    new_value=new_val or "(Vazio)",
                    blocked=False
                ))

        # 1.4 PLU (Balança / Teclado)
        if req.apply_plu:
            if req.plu_mode == "direct" and req.new_plu is not None:
                if req.new_plu != p.plu:
                    diffs.append(FieldDiff(
                        field_name="plu",
                        field_label="PLU (Teclado/Balança)",
                        old_value=str(p.plu),
                        new_value=str(req.new_plu),
                        blocked=False
                    ))
            elif req.plu_mode == "sequence":
                seq_val = (req.plu_seq_start or 1) + (req.product_codes.index(p.codigo))
                if seq_val != p.plu:
                    diffs.append(FieldDiff(
                        field_name="plu",
                        field_label="PLU (Sequencial)",
                        old_value=str(p.plu),
                        new_value=str(seq_val),
                        blocked=False
                    ))
            elif req.plu_mode == "copy_codigo":
                if p.codigo != p.plu:
                    diffs.append(FieldDiff(
                        field_name="plu",
                        field_label="PLU (Cópia do Código)",
                        old_value=str(p.plu),
                        new_value=str(p.codigo),
                        blocked=False
                    ))
            elif req.plu_mode == "clear":
                if p.plu != 0:
                    diffs.append(FieldDiff(
                        field_name="plu",
                        field_label="PLU (Teclado/Balança)",
                        old_value=str(p.plu),
                        new_value="0",
                        blocked=False
                    ))

        # 1.5 Código de Barras & Referência (Sem alterar código interno)
        if req.apply_codbarras:
            if req.codbarras_mode == "direct" and req.new_codbarras is not None:
                if req.new_codbarras != p.codbarras:
                    diffs.append(FieldDiff(
                        field_name="codbarras",
                        field_label="Código de Barras",
                        old_value=p.codbarras or "(Vazio)",
                        new_value=req.new_codbarras or "(Vazio)",
                        blocked=False
                    ))
            elif req.codbarras_mode == "sequence":
                seq_val = str((req.codbarras_seq_start or 1001) + (req.product_codes.index(p.codigo)))
                if seq_val != p.codbarras:
                    diffs.append(FieldDiff(
                        field_name="codbarras",
                        field_label="Código de Barras (Sequencial)",
                        old_value=p.codbarras or "(Vazio)",
                        new_value=seq_val,
                        blocked=False
                    ))
            elif req.codbarras_mode == "clear":
                if p.codbarras:
                    diffs.append(FieldDiff(
                        field_name="codbarras",
                        field_label="Código de Barras",
                        old_value=p.codbarras,
                        new_value="(Removido)",
                        blocked=False
                    ))

        if req.apply_referencia and req.new_referencia is not None:
            if req.new_referencia != p.referencia:
                diffs.append(FieldDiff(
                    field_name="referencia",
                    field_label="Referência do Artigo",
                    old_value=p.referencia or "(Vazio)",
                    new_value=req.new_referencia or "(Vazio)",
                    blocked=False
                ))

        # 2. Cores
        if req.colors.apply_fundo and req.colors.fundo_hex:
            new_fundo = hex_to_int_color(req.colors.fundo_hex)
            if new_fundo != p.fundo:
                diffs.append(FieldDiff(
                    field_name="fundo",
                    field_label="Cor de Fundo do Botão (POS)",
                    old_value=f"{p.fundo_hex} (int: {p.fundo})",
                    new_value=f"{req.colors.fundo_hex.upper()} (int: {new_fundo})",
                    blocked=False
                ))
                
        if req.colors.apply_letra and req.colors.letra_hex:
            new_letra = hex_to_int_color(req.colors.letra_hex)
            if new_letra != p.letra:
                diffs.append(FieldDiff(
                    field_name="letra",
                    field_label="Cor do Texto do Botão (POS)",
                    old_value=f"{p.letra_hex} (int: {p.letra})",
                    new_value=f"{req.colors.letra_hex.upper()} (int: {new_letra})",
                    blocked=False
                ))

        # 3. Preços PVP 1 a PVP 10 (Suporte a alteração e cópia entre PVPs)
        if req.prices.apply_price:
            mode = req.prices.mode
            target = req.prices.target_pvp
            source_field = req.prices.source_pvp or "pvp1"
            
            is_copy = (mode == "copy_pvp" or target == "copy_pvp1" or target.startswith("copy_"))

            if is_copy:
                src_price = getattr(p, source_field, 0.0)
                src_num = source_field[3:] if (source_field.startswith("pvp") and source_field[3:].isdigit()) else "1"
                
                if target in ("all", "copy_pvp1"):
                    pvp_indices = [i for i in range(1, 11) if f"pvp{i}" != source_field]
                elif target.startswith("pvp") and target[3:].isdigit():
                    pvp_indices = [int(target[3:])]
                else:
                    pvp_indices = [2]

                for idx in pvp_indices:
                    field_key = f"pvp{idx}"
                    old_val = getattr(p, field_key, 0.0)
                    new_val = src_price
                    if new_val != old_val:
                        diffs.append(FieldDiff(
                            field_name=field_key,
                            field_label=f"Preço PVP {idx} (Cópia de PVP {src_num})",
                            old_value=f"{old_val:.2f} €",
                            new_value=f"{new_val:.2f} €",
                            blocked=False
                        ))
            else:
                pvp_indices = []
                if target == "all":
                    pvp_indices = list(range(1, 11))
                elif target.startswith("pvp") and target[3:].isdigit():
                    pvp_indices = [int(target[3:])]

                for idx in pvp_indices:
                    field_key = f"pvp{idx}"
                    old_val = getattr(p, field_key, 0.0)
                    new_val = calculate_new_price(old_val, mode, req.prices.value, req.prices.rounding)
                    
                    if new_val != old_val:
                        diffs.append(FieldDiff(
                            field_name=field_key,
                            field_label=f"Preço PVP {idx}",
                            old_value=f"{old_val:.2f} €",
                            new_value=f"{new_val:.2f} €",
                            blocked=False
                        ))

        # 4. Família
        if req.apply_familia and req.new_familia is not None:
            if req.new_familia != p.familias:
                old_fam = families_map.get(p.familias, str(p.familias))
                new_fam = families_map.get(req.new_familia, str(req.new_familia))
                diffs.append(FieldDiff(
                    field_name="familia",
                    field_label="Família do Produto",
                    old_value=old_fam,
                    new_value=new_fam,
                    blocked=False
                ))

        # 5. IVA
        if req.apply_iva and req.new_iva is not None:
            if req.new_iva != p.iva:
                old_iva = format_iva_num(p.iva)
                new_iva = format_iva_num(req.new_iva)
                diffs.append(FieldDiff(
                    field_name="iva",
                    field_label="Taxa de IVA",
                    old_value=old_iva,
                    new_value=new_iva,
                    blocked=False
                ))

        if diffs:
            previews.append(ProductDiff(
                codigo=p.codigo,
                descricao=p.descricao,
                has_sales=p.has_sales,
                diffs=diffs
            ))

    return BulkEditPreviewResponse(
        total_selected=len(req.product_codes),
        total_affected=len(previews),
        blocked_descriptions_count=blocked_count,
        previews=previews
    )


def create_backup_snapshot(products: List[ProductItem], description: str) -> str:
    """Cria um ficheiro JSON de backup com o estado anterior dos produtos."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{ts}.json"
    filepath = os.path.join(BACKUP_DIR, filename)

    snapshot_data = {
        "timestamp": datetime.now().isoformat(),
        "description": description,
        "items_count": len(products),
        "products": [p.dict() for p in products]
    }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(snapshot_data, f, indent=2, ensure_ascii=False)

    return filename


def list_backups() -> List[BackupItem]:
    """Lista os ficheiros de cópia de segurança existentes."""
    files = [f for f in os.listdir(BACKUP_DIR) if f.endswith(".json")]
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


def apply_bulk_edit(req: BulkEditRequest) -> Tuple[bool, str, int]:
    """Aplica as alterações em massa na base de dados SQL Server dentro de uma transação atómica."""
    products = get_products_by_codes(req.product_codes)
    if not products:
        return False, "Nenhum artigo encontrado para os códigos especificados.", 0

    # 1. Guardar Backup de Segurança
    backup_name = create_backup_snapshot(products, f"Edição em massa de {len(products)} artigos")

    affected_count = 0

    # Execução na DB SQL Server real com BEGIN TRANSACTION
    try:
        conn = db_manager.get_connection()
        conn.autocommit = False  # Transação explícita
        cursor = conn.cursor()

        for p_item in products:
            set_clauses = []
            params = []

            # 1. Designação (com bloqueio estrito se tiver vendas)
            if req.apply_descricao and not p_item.has_sales:
                new_val = transform_text_case(p_item.descricao, req.descricao_mode, req.new_descricao)
                if new_val != p_item.descricao:
                    set_clauses.append("descricao = ?")
                    params.append(new_val)

            # 1.2 Descrição Curta (POS)
            if req.apply_descricaocurta:
                new_val = transform_text_case(p_item.descricaocurta or "", req.descricaocurta_mode, req.new_descricaocurta)
                if new_val != (p_item.descricaocurta or ""):
                    set_clauses.append("descricaocurta = ?")
                    params.append(new_val)

            # 1.4 PLU (dbo.produtos.codigo_alf)
            if req.apply_plu:
                if req.plu_mode == "direct" and req.new_plu is not None:
                    set_clauses.append("codigo_alf = ?")
                    params.append(req.new_plu)
                elif req.plu_mode == "sequence":
                    seq_val = (req.plu_seq_start or 1) + (req.product_codes.index(p_item.codigo))
                    set_clauses.append("codigo_alf = ?")
                    params.append(seq_val)
                elif req.plu_mode == "copy_codigo":
                    set_clauses.append("codigo_alf = ?")
                    params.append(p_item.codigo)
                elif req.plu_mode == "clear":
                    set_clauses.append("codigo_alf = ?")
                    params.append(0)

            # 1.5 Código de Barras & Referência (Sem alterar código interno)
            if req.apply_codbarras:
                if req.codbarras_mode == "direct" and req.new_codbarras is not None:
                    set_clauses.append("codbarras = ?")
                    params.append(req.new_codbarras)
                elif req.codbarras_mode == "sequence":
                    seq_val = str((req.codbarras_seq_start or 1001) + (req.product_codes.index(p_item.codigo)))
                    set_clauses.append("codbarras = ?")
                    params.append(seq_val)
                elif req.codbarras_mode == "clear":
                    set_clauses.append("codbarras = ?")
                    params.append("")

            if req.apply_referencia and req.new_referencia is not None:
                set_clauses.append("referencia = ?")
                params.append(req.new_referencia)

            # 2. Cores
            if req.colors.apply_fundo and req.colors.fundo_hex:
                set_clauses.append("fundo = ?")
                params.append(hex_to_int_color(req.colors.fundo_hex))
            if req.colors.apply_letra and req.colors.letra_hex:
                set_clauses.append("letra = ?")
                params.append(hex_to_int_color(req.colors.letra_hex))

            # 3. Preços PVP 1 a PVP 10 (precovenda = PVP1, pvp2..pvp10 = PVP2..10)
            if req.prices.apply_price:
                mode = req.prices.mode
                target = req.prices.target_pvp
                source_field = req.prices.source_pvp or "pvp1"
                
                is_copy = (mode == "copy_pvp" or target == "copy_pvp1" or target.startswith("copy_"))

                if is_copy:
                    src_price = getattr(p_item, source_field, 0.0)
                    
                    if target in ("all", "copy_pvp1"):
                        pvp_indices = [i for i in range(1, 11) if f"pvp{i}" != source_field]
                    elif target.startswith("pvp") and target[3:].isdigit():
                        pvp_indices = [int(target[3:])]
                    else:
                        pvp_indices = [2]

                    for idx in pvp_indices:
                        col_name = "precovenda" if idx == 1 else f"pvp{idx}"
                        old_price = getattr(p_item, f"pvp{idx}", 0.0)
                        new_price = src_price
                        
                        if new_price != old_price:
                            set_clauses.append(f"{col_name} = ?")
                            params.append(new_price)
                            try:
                                hist_sql = "INSERT INTO dbo.historico_precos (datahora, codigo, pvp, siva, preco) VALUES (GETDATE(), ?, ?, 0, ?)"
                                cursor.execute(hist_sql, (p_item.codigo, idx, new_price))
                            except Exception:
                                pass
                else:
                    pvp_indices = []
                    if target == "all":
                        pvp_indices = list(range(1, 11))
                    elif target.startswith("pvp") and target[3:].isdigit():
                        pvp_indices = [int(target[3:])]

                    for idx in pvp_indices:
                        col_name = "precovenda" if idx == 1 else f"pvp{idx}"
                        old_price = getattr(p_item, f"pvp{idx}", 0.0)
                        new_price = calculate_new_price(old_price, mode, req.prices.value, req.prices.rounding)
                        
                        if new_price != old_price:
                            set_clauses.append(f"{col_name} = ?")
                            params.append(new_price)
                            try:
                                hist_sql = "INSERT INTO dbo.historico_precos (datahora, codigo, pvp, siva, preco) VALUES (GETDATE(), ?, ?, 0, ?)"
                                cursor.execute(hist_sql, (p_item.codigo, idx, new_price))
                            except Exception:
                                pass

            # 4. Família
            if req.apply_familia and req.new_familia is not None:
                set_clauses.append("familia = ?")
                params.append(req.new_familia)

            # 5. IVA
            if req.apply_iva and req.new_iva is not None:
                set_clauses.append("iva = ?")
                params.append(req.new_iva)

            if set_clauses:
                sql = f"UPDATE dbo.produtos SET {', '.join(set_clauses)} WHERE codigo = ?"
                params.append(p_item.codigo)
                cursor.execute(sql, params)
                affected_count += 1

        conn.commit()  # Confirma a transação
        conn.close()
        return True, f"Atualização de {affected_count} artigos concluída com sucesso na base de dados! (Backup: {backup_name})", affected_count
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()  # Reverte em caso de falha
            conn.close()
        return False, f"Erro ao aplicar alterações na base de dados (Transação revertida): {str(e)}", 0


def restore_backup(filename: str) -> Tuple[bool, str]:
    """Restaura o estado dos produtos a partir de um ficheiro de backup JSON diretamente no SQL Server."""
    filepath = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        return False, f"Ficheiro de backup {filename} não encontrado."

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        products_data = data.get("products", [])
        if not products_data:
            return False, "Nenhum registo encontrado dentro do ficheiro de backup."

        conn = db_manager.get_connection()
        conn.autocommit = False
        cursor = conn.cursor()

        restored_count = 0
        for bp in products_data:
            sql = """
                UPDATE dbo.produtos 
                SET codigo_alf = ?, descricao = ?, descricaocurta = ?, familia = ?, iva = ?, precovenda = ?, pvp2 = ?, pvp3 = ?, pvp4 = ?, pvp5 = ?,
                    pvp6 = ?, pvp7 = ?, pvp8 = ?, pvp9 = ?, pvp10 = ?, fundo = ?, letra = ?
                WHERE codigo = ?
            """
            cursor.execute(sql, (
                bp.get("plu", 0), bp.get("descricao"), bp.get("descricaocurta", ""), bp.get("familias"), bp.get("iva"),
                bp.get("pvp1"), bp.get("pvp2"), bp.get("pvp3"), bp.get("pvp4"), bp.get("pvp5"),
                bp.get("pvp6"), bp.get("pvp7"), bp.get("pvp8"), bp.get("pvp9"), bp.get("pvp10"),
                bp.get("fundo"), bp.get("letra"),
                bp.get("codigo")
            ))
            restored_count += 1

        conn.commit()
        conn.close()
        return True, f"Reversão concluída com sucesso! {restored_count} artigos foram restaurados ao estado original."
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        return False, f"Falha ao restaurar cópia de segurança no SQL Server: {str(e)}"


def parse_import_csv(csv_text: str) -> List[ImportRow]:
    """Parse de ficheiro CSV (separador ; ou ,) para lista de ImportRow com suporte a formato europeu."""
    import csv, io
    lines = csv_text.strip().splitlines()
    if not lines:
        return []

    # Detetar delimitador ; ou ,
    first_line = lines[0]
    delimiter = ';' if ';' in first_line else ','
    
    reader = csv.reader(io.StringIO(csv_text), delimiter=delimiter)
    header = [h.strip().lower().replace(" ", "").replace("_", "") for h in next(reader, [])]
    
    col_map = {}
    for idx, col_name in enumerate(header):
        if col_name in ("codigo", "cod", "code", "id"):
            col_map["codigo"] = idx
        elif col_name in ("descricao", "designacao", "nome", "name"):
            col_map["descricao"] = idx
        elif col_name in ("descricaocurta", "desccurta", "nomecurto", "shortdesc", "desccut", "descricaocut"):
            col_map["descricaocurta"] = idx
        elif col_name in ("plu", "plucode", "plu_code", "codigoalf", "codigo_alf"):
            col_map["plu"] = idx
        elif col_name in ("codbarras", "barras", "ean", "barcode", "codigobarras", "plucodbarras", "plu_codbarras"):
            col_map["codbarras"] = idx
        elif col_name in ("referencia", "ref"):
            col_map["referencia"] = idx
        elif col_name in ("familia", "fam"):
            col_map["familia"] = idx
        elif col_name in ("subfamilia", "subfam"):
            col_map["subfam"] = idx
        elif col_name in ("iva", "taxaiva"):
            col_map["iva"] = idx
        elif col_name in ("fundohex", "fundo", "corfundo"):
            col_map["fundo_hex"] = idx
        elif col_name in ("letrahex", "letra", "cortexto"):
            col_map["letra_hex"] = idx
        else:
            for p_num in range(1, 11):
                if col_name in (f"pvp{p_num}", f"pvp{p_num}(€)", f"precovenda{p_num}", f"preco{p_num}"):
                    col_map[f"pvp{p_num}"] = idx
                elif p_num == 1 and col_name in ("precovenda", "preco", "pvp"):
                    col_map["pvp1"] = idx

    if "codigo" not in col_map:
        return []

    rows = []
    for row in reader:
        if not row or len(row) <= col_map["codigo"]:
            continue

        raw_cod = row[col_map["codigo"]].strip()
        if not raw_cod or not raw_cod.isdigit():
            continue

        codigo = int(raw_cod)
        
        def parse_float_val(idx_key):
            if idx_key in col_map and len(row) > col_map[idx_key]:
                raw = row[col_map[idx_key]].strip().replace("€", "").replace(" ", "").replace(",", ".")
                try:
                    return float(raw)
                except ValueError:
                    return None
            return None

        def parse_int_val(idx_key):
            if idx_key in col_map and len(row) > col_map[idx_key]:
                raw = row[col_map[idx_key]].strip()
                try:
                    return int(raw)
                except ValueError:
                    return None
            return None

        desc = row[col_map["descricao"]].strip() if ("descricao" in col_map and len(row) > col_map["descricao"]) else None
        descricaocurta = row[col_map["descricaocurta"]].strip() if ("descricaocurta" in col_map and len(row) > col_map["descricaocurta"]) else None
        plu_val = parse_int_val("plu")
        codbarras = row[col_map["codbarras"]].strip() if ("codbarras" in col_map and len(row) > col_map["codbarras"]) else None
        referencia = row[col_map["referencia"]].strip() if ("referencia" in col_map and len(row) > col_map["referencia"]) else None
        fundo = row[col_map["fundo_hex"]].strip() if ("fundo_hex" in col_map and len(row) > col_map["fundo_hex"]) else None
        letra = row[col_map["letra_hex"]].strip() if ("letra_hex" in col_map and len(row) > col_map["letra_hex"]) else None

        rows.append(ImportRow(
            codigo=codigo,
            descricao=desc,
            descricaocurta=descricaocurta,
            plu=plu_val,
            codbarras=codbarras,
            referencia=referencia,
            familia=parse_int_val("familia"),
            subfam=parse_int_val("subfam"),
            iva=parse_int_val("iva"),
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


def preview_import(items: List[ImportRow]) -> ImportPreviewResponse:
    """Gera o mapa de diferenças (dry-run) para os artigos a importar do ficheiro Excel/CSV."""
    codes = [item.codigo for item in items]
    existing_products = get_products_by_codes(codes)
    prod_map = {p.codigo: p for p in existing_products}

    previews: List[ProductDiff] = []
    blocked_count = 0

    for imp in items:
        p = prod_map.get(imp.codigo)
        if not p:
            continue

        diffs: List[FieldDiff] = []

        # 1. Designação / Nome
        if imp.descricao and imp.descricao != p.descricao:
            if p.has_sales:
                blocked_count += 1
                diffs.append(FieldDiff(
                    field_name="descricao",
                    field_label="Designação / Nome",
                    old_value=p.descricao,
                    new_value=p.descricao,
                    blocked=True,
                    reason="Artigo com vendas efetuadas: a designação é protegida contra edições por regras fiscais."
                ))
            else:
                diffs.append(FieldDiff(
                    field_name="descricao",
                    field_label="Designação / Nome",
                    old_value=p.descricao,
                    new_value=imp.descricao,
                    blocked=False
                ))

        # 1.2 Descrição Curta (POS)
        if imp.descricaocurta is not None and imp.descricaocurta != p.descricaocurta:
            diffs.append(FieldDiff(
                field_name="descricaocurta",
                field_label="Descrição Curta (POS)",
                old_value=p.descricaocurta or "(Vazio)",
                new_value=imp.descricaocurta or "(Vazio)",
                blocked=False
            ))

        # 1.4 PLU (Balança / Teclado)
        if imp.plu is not None and imp.plu != p.plu:
            diffs.append(FieldDiff(
                field_name="plu",
                field_label="PLU (Teclado/Balança)",
                old_value=str(p.plu),
                new_value=str(imp.plu),
                blocked=False
            ))

        # 1.5 Código de Barras & Referência
        if imp.codbarras is not None and imp.codbarras != p.codbarras:
            diffs.append(FieldDiff(
                field_name="codbarras",
                field_label="Código de Barras",
                old_value=p.codbarras or "(Vazio)",
                new_value=imp.codbarras or "(Vazio)",
                blocked=False
            ))

        if imp.referencia is not None and imp.referencia != p.referencia:
            diffs.append(FieldDiff(
                field_name="referencia",
                field_label="Referência do Artigo",
                old_value=p.referencia or "(Vazio)",
                new_value=imp.referencia or "(Vazio)",
                blocked=False
            ))

        # 2. PVPs 1 a 10
        for idx in range(1, 11):
            imp_val = getattr(imp, f"pvp{idx}", None)
            if imp_val is not None:
                old_val = getattr(p, f"pvp{idx}", 0.0)
                if abs(imp_val - old_val) > 0.001:
                    diffs.append(FieldDiff(
                        field_name=f"pvp{idx}",
                        field_label=f"Preço PVP {idx}",
                        old_value=f"{old_val:.2f} €",
                        new_value=f"{imp_val:.2f} €",
                        blocked=False
                    ))

        # 3. Família
        if imp.familia is not None and imp.familia != p.familias:
            diffs.append(FieldDiff(
                field_name="familia",
                field_label="Código de Família",
                old_value=str(p.familias),
                new_value=str(imp.familia),
                blocked=False
            ))

        # 4. Subfamília
        if imp.subfam is not None and imp.subfam != p.subfamilia:
            diffs.append(FieldDiff(
                field_name="subfam",
                field_label="Código de Subfamília",
                old_value=str(p.subfamilia),
                new_value=str(imp.subfam),
                blocked=False
            ))

        # 5. IVA
        if imp.iva is not None and imp.iva != p.iva:
            diffs.append(FieldDiff(
                field_name="iva",
                field_label="Taxa de IVA",
                old_value=str(p.iva),
                new_value=str(imp.iva),
                blocked=False
            ))

        # 6. Cores
        if imp.fundo_hex and imp.fundo_hex.upper() != p.fundo_hex.upper():
            diffs.append(FieldDiff(
                field_name="fundo",
                field_label="Cor de Fundo",
                old_value=p.fundo_hex,
                new_value=imp.fundo_hex.upper(),
                blocked=False
            ))

        if imp.letra_hex and imp.letra_hex.upper() != p.letra_hex.upper():
            diffs.append(FieldDiff(
                field_name="letra",
                field_label="Cor do Texto",
                old_value=p.letra_hex,
                new_value=imp.letra_hex.upper(),
                blocked=False
            ))

        if diffs:
            previews.append(ProductDiff(
                codigo=p.codigo,
                descricao=p.descricao,
                has_sales=p.has_sales,
                diffs=diffs
            ))

    return ImportPreviewResponse(
        total_file_rows=len(items),
        matched_products_count=len(existing_products),
        blocked_descriptions_count=blocked_count,
        previews=previews
    )


def apply_import(items: List[ImportRow]) -> Tuple[bool, str, int]:
    """Aplica as alterações importadas do ficheiro Excel diretamente no SQL Server com transação atómica."""
    codes = [item.codigo for item in items]
    existing_products = get_products_by_codes(codes)
    if not existing_products:
        return False, "Nenhum artigo do ficheiro de importação foi encontrado na base de dados.", 0

    prod_map = {p.codigo: p for p in existing_products}

    # Guardar snapshot de backup
    create_backup_snapshot(existing_products, f"Importação de ficheiro Excel ({len(items)} artigos)")

    conn = db_manager.get_connection()
    conn.autocommit = False
    cursor = conn.cursor()

    affected_count = 0
    try:
        for imp in items:
            p = prod_map.get(imp.codigo)
            if not p:
                continue

            set_clauses = ["sync = 1"]  # Sincronização cloud automática
            params = []

            # 1. Designação (Apenas se não tiver vendas)
            if imp.descricao and imp.descricao != p.descricao and not p.has_sales:
                set_clauses.append("descricao = ?")
                params.append(imp.descricao)

            # 1.2 Descrição Curta (POS)
            if imp.descricaocurta is not None and imp.descricaocurta != p.descricaocurta:
                set_clauses.append("descricaocurta = ?")
                params.append(imp.descricaocurta)

            # 1.4 PLU
            if imp.plu is not None and imp.plu != p.plu:
                set_clauses.append("codigo_alf = ?")
                params.append(imp.plu)

            # 1.5 Código de Barras & Referência
            if imp.codbarras is not None and imp.codbarras != p.codbarras:
                set_clauses.append("codbarras = ?")
                params.append(imp.codbarras)

            if imp.referencia is not None and imp.referencia != p.referencia:
                set_clauses.append("referencia = ?")
                params.append(imp.referencia)

            # 2. PVPs
            for idx in range(1, 11):
                imp_val = getattr(imp, f"pvp{idx}", None)
                if imp_val is not None:
                    old_val = getattr(p, f"pvp{idx}", 0.0)
                    if abs(imp_val - old_val) > 0.001:
                        col_name = "precovenda" if idx == 1 else f"pvp{idx}"
                        set_clauses.append(f"{col_name} = ?")
                        params.append(imp_val)
                        try:
                            hist_sql = "INSERT INTO dbo.historico_precos (datahora, codigo, pvp, siva, preco) VALUES (GETDATE(), ?, ?, 0, ?)"
                            cursor.execute(hist_sql, (p.codigo, idx, imp_val))
                        except Exception:
                            pass

            # 3. Família / Subfamília / IVA
            if imp.familia is not None and imp.familia != p.familias:
                set_clauses.append("familia = ?")
                params.append(imp.familia)

            if imp.subfam is not None and imp.subfam != p.subfamilia:
                set_clauses.append("subfam = ?")
                params.append(imp.subfam)

            if imp.iva is not None and imp.iva != p.iva:
                set_clauses.append("iva = ?")
                params.append(imp.iva)

            # 4. Cores
            if imp.fundo_hex:
                f_int = hex_to_int_color(imp.fundo_hex)
                if f_int != p.fundo:
                    set_clauses.append("fundo = ?")
                    params.append(f_int)

            if imp.letra_hex:
                l_int = hex_to_int_color(imp.letra_hex)
                if l_int != p.letra:
                    set_clauses.append("letra = ?")
                    params.append(l_int)

            if len(set_clauses) > 1:  # Mais do que apenas sync = 1
                sql = f"UPDATE dbo.produtos SET {', '.join(set_clauses)} WHERE codigo = ?"
                params.append(p.codigo)
                cursor.execute(sql, params)
                affected_count += 1

        conn.commit()
        conn.close()
        return True, f"Importação concluída com sucesso! {affected_count} artigo(s) foram atualizados na base de dados.", affected_count

    except Exception as e:
        conn.rollback()
        conn.close()
        return False, f"Falha ao aplicar importação no SQL Server: {str(e)}", 0

