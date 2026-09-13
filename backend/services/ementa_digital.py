import csv
import io
import os
import re
import json
import mimetypes
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

from backend.db import db_manager, get_app_dir
from backend.models import (
    EmentaProductItem, EmentaProductFilter, EmentaProductResponse,
    EmentaImportFromPosRequest, EmentaImportCsvRequest, EmentaImportResponse,
    EmentaBulkEditRequest, BulkEditPreviewResponse, ProductDiff,
    EmentaTranslateRequest, EmentaTranslateResponse,
    EmentaSaveTranslationsRequest
)
from backend.services.products import (
    _schema, _text_limit, _chunks, create_backup_snapshot
)

# Diretório para armazenamento local de imagens caso a base de dados use image_url relativo
IMAGES_DIR = os.path.join(get_app_dir(), "ementa_images")
os.makedirs(IMAGES_DIR, exist_ok=True)


# ======================================================================
# Inspeção de Esquema da Ementa Digital
# ======================================================================

def get_ementa_schema_info() -> Dict[str, Any]:
    """Informa sobre a existência e estrutura das tabelas da ementa digital."""
    try:
        conn = db_manager.get_connection()
    except Exception as e:
        return {
            "available": False,
            "has_produtos": False,
            "has_traducoes": False,
            "has_paises": False,
            "has_familias": False,
            "message": f"Não foi possível ligar ao SQL Server: {str(e)}",
            "tables": {}
        }
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        has_produtos = "ementa_digital_produtos" in schema
        has_traducoes = "ementa_digital_traducoes" in schema
        has_paises = "ementa_digital_paises" in schema
        has_familias = "ementa_digital_familias" in schema

        tables_info: Dict[str, Any] = {}
        for tbl in ["ementa_digital_produtos", "ementa_digital_traducoes", "ementa_digital_paises", "ementa_digital_familias", "ementa_digital_seccoes", "ementa_digital_ementas", "ementa_digital_regras"]:
            if tbl in schema:
                cursor.execute(f"""
                    SELECT c.name, ty.name, c.max_length, c.is_nullable
                    FROM sys.tables t
                    JOIN sys.columns c ON c.object_id = t.object_id
                    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
                    WHERE t.name = ? AND t.schema_id = SCHEMA_ID('dbo')
                    ORDER BY c.column_id
                """, (tbl,))
                cols = []
                for row in cursor.fetchall():
                    cols.append({
                        "name": row[0],
                        "type": row[1],
                        "max_length": row[2],
                        "is_nullable": bool(row[3])
                    })
                # Contagem de linhas
                cursor.execute(f"SELECT COUNT(*) FROM dbo.{tbl}")
                count_row = cursor.fetchone()
                total_rows = count_row[0] if count_row else 0

                tables_info[tbl] = {
                    "exists": True,
                    "columns": cols,
                    "row_count": total_rows
                }
            else:
                tables_info[tbl] = {"exists": False}

        return {
            "available": has_produtos,
            "has_produtos": has_produtos,
            "has_traducoes": has_traducoes,
            "has_paises": has_paises,
            "has_familias": has_familias,
            "has_seccoes": "ementa_digital_seccoes" in schema,
            "has_ementas": "ementa_digital_ementas" in schema,
            "tables": tables_info
        }
    finally:
        conn.close()


def ensure_ementa_digital_hierarchy(cursor):
    """Garante que existem registos por omissão em ementas, secções e regras da Ementa Digital."""
    try:
        schema = db_manager.cached_schema()
        if "ementa_digital_ementas" in schema:
            cursor.execute("IF NOT EXISTS (SELECT 1 FROM dbo.ementa_digital_ementas WHERE codigo = 1) INSERT INTO dbo.ementa_digital_ementas (codigo, nome, sync) VALUES (1, 'Geral', 0)")

        if "ementa_digital_seccoes" in schema:
            cursor.execute("IF NOT EXISTS (SELECT 1 FROM dbo.ementa_digital_seccoes WHERE codigo = 1) INSERT INTO dbo.ementa_digital_seccoes (codigo, descricao, imagem, visivel, sync, ementa, image_url, posicao) VALUES (1, 'Geral', CONVERT(VARBINARY, ''), 1, 0, 1, '', 1)")

        if "ementa_digital_regras" in schema:
            cursor.execute("IF NOT EXISTS (SELECT 1 FROM dbo.ementa_digital_regras WHERE codigo = 1) INSERT INTO dbo.ementa_digital_regras (codigo, app, servico, ordem, zona, ementa, pvp, inicio, fim, sync) VALUES (1, 1, 1, 1, 0, 1, 0, '2021-01-01 00:00:00', '2099-12-31 23:59:59', 0)")

        if "ementa_digital_refresh" in schema:
            cursor.execute("IF NOT EXISTS (SELECT 1 FROM dbo.ementa_digital_refresh) INSERT INTO dbo.ementa_digital_refresh (refresh) VALUES (1)")
    except Exception:
        pass



def ensure_traducoes_table(cursor) -> bool:
    """Cria a tabela dbo.ementa_digital_traducoes se não existir, de acordo com o esquema da ZoneSoft."""
    schema = db_manager.cached_schema()
    if "ementa_digital_traducoes" in schema:
        return True
    try:
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ementa_digital_traducoes' AND schema_id = SCHEMA_ID('dbo'))
            BEGIN
                CREATE TABLE dbo.ementa_digital_traducoes (
                    id_country varchar(5) NOT NULL,
                    typeid int NOT NULL,
                    id1 int NOT NULL,
                    id2 int NOT NULL DEFAULT 0,
                    field varchar(100) NOT NULL,
                    value nvarchar(max) NULL,
                    CONSTRAINT pk_ementa_traducoes PRIMARY KEY (id_country, typeid, id1, id2, field)
                );
            END
        """)
        # Invalida cache de esquema
        with db_manager._lock:
            db_manager._schema = None
        return True
    except Exception:
        return False


def get_ementa_digital_structure() -> Dict[str, Any]:
    """Retorna a estrutura de secções e famílias da Ementa Digital."""
    try:
        conn = db_manager.get_connection()
    except Exception as e:
        return {"available": False, "sections": [], "families": [], "message": str(e)}
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "ementa_digital_familias" not in schema:
            return {"available": False, "sections": [], "families": []}

        sections = []
        if "ementa_digital_seccoes" in schema:
            cursor.execute("SELECT codigo, descricao, ISNULL(visivel, 1), ISNULL(posicao, 0) FROM dbo.ementa_digital_seccoes ORDER BY posicao, codigo")
            for r in cursor.fetchall():
                sections.append({"codigo": int(r[0]), "descricao": r[1] or "", "visivel": int(r[2] or 1), "posicao": int(r[3] or 0)})

        families = []
        cursor.execute("SELECT codigo, seccao, descricao, ISNULL(visivel, 1), ISNULL(posicao, 0) FROM dbo.ementa_digital_familias ORDER BY seccao, posicao, codigo")
        for r in cursor.fetchall():
            families.append({"codigo": int(r[0]), "seccao": int(r[1]), "descricao": r[2] or "", "visivel": int(r[3] or 1), "posicao": int(r[4] or 0)})

        return {"available": True, "sections": sections, "families": families}
    finally:
        conn.close()


# ======================================================================
# Pesquisa e Listagem de Artigos da Ementa Digital
# ======================================================================

def search_ementa_products(filter_req: EmentaProductFilter) -> EmentaProductResponse:
    """Pesquisa artigos do POS juntamente com os dados da tabela dbo.ementa_digital_produtos."""
    try:
        conn = db_manager.get_connection()
    except Exception:
        return EmentaProductResponse(items=[], total_count=0, page=1, total_pages=1)
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        has_ementa = "ementa_digital_produtos" in schema
        has_digital_familias = "ementa_digital_familias" in schema
        has_digital_seccoes = "ementa_digital_seccoes" in schema
        ed_cols = schema.get("ementa_digital_produtos", {})

        has_image_col = "imagem" in ed_cols
        has_image_url_col = "image_url" in ed_cols
        has_gluten = "gluten" in ed_cols
        has_lactose = "lactose" in ed_cols
        has_vegetariano = "vegetariano" in ed_cols
        has_picante = "picante" in ed_cols
        has_calorias = "calorias" in ed_cols
        has_tempo = "tempo" in ed_cols
        has_highlight = "highlight" in ed_cols

        conditions = ["1=1"]
        params: List[Any] = []

        if filter_req.search and filter_req.search.strip():
            term = f"%{filter_req.search.strip()}%"
            if filter_req.search.strip().isdigit():
                conditions.append("(p.codigo = ? OR p.descricao LIKE ? OR (ed.produto IS NOT NULL AND ed.produto LIKE ?))")
                params.extend([int(filter_req.search.strip()), term, term])
            else:
                conditions.append("(p.descricao LIKE ? OR (ed.produto IS NOT NULL AND ed.produto LIKE ?))")
                params.extend([term, term])

        if filter_req.familia is not None:
            conditions.append("p.familia = ?")
            params.append(filter_req.familia)

        if filter_req.ementa_familia is not None:
            conditions.append("ed.familia = ?")
            params.append(filter_req.ementa_familia)

        if filter_req.has_ementa_filter == "with_ementa":
            if has_digital_familias:
                conditions.append("(ed.cod_produto IS NOT NULL AND ef.codigo IS NOT NULL)")
            else:
                conditions.append("ed.cod_produto IS NOT NULL")
        elif filter_req.has_ementa_filter == "without_ementa":
            if has_digital_familias:
                conditions.append("(ed.cod_produto IS NULL OR ef.codigo IS NULL)")
            else:
                conditions.append("ed.cod_produto IS NULL")

        if filter_req.visivel_filter == "visible":
            if has_digital_familias:
                conditions.append("(ed.cod_produto IS NOT NULL AND ef.codigo IS NOT NULL AND ed.visivel = 1)")
            else:
                conditions.append("(ed.cod_produto IS NOT NULL AND ed.visivel = 1)")
        elif filter_req.visivel_filter == "hidden":
            if has_digital_familias:
                conditions.append("(ed.cod_produto IS NOT NULL AND ef.codigo IS NOT NULL AND ed.visivel = 0)")
            else:
                conditions.append("(ed.cod_produto IS NOT NULL AND ed.visivel = 0)")

        where_clause = " AND ".join(conditions)

        # Contagem total
        if has_digital_familias:
            count_sql = f"""
                SELECT COUNT(*)
                FROM dbo.produtos p
                LEFT JOIN dbo.ementa_digital_produtos ed ON p.codigo = ed.cod_produto
                LEFT JOIN dbo.ementa_digital_familias ef ON ed.familia = ef.codigo
                {"LEFT JOIN dbo.ementa_digital_seccoes es ON ef.seccao = es.codigo" if has_digital_seccoes else ""}
                WHERE {where_clause}
            """
        elif has_ementa:
            count_sql = f"""
                SELECT COUNT(*)
                FROM dbo.produtos p
                LEFT JOIN dbo.ementa_digital_produtos ed ON p.codigo = ed.cod_produto
                WHERE {where_clause}
            """
        else:
            count_sql = f"""
                SELECT COUNT(*)
                FROM dbo.produtos p
                WHERE {where_clause.replace('ed.cod_produto IS NOT NULL', '1=0').replace('ed.cod_produto IS NULL', '1=1')}
            """

        cursor.execute(count_sql, params)
        count_row = cursor.fetchone()
        total_count = count_row[0] if count_row else 0

        # Paginação
        offset = (filter_req.page - 1) * filter_req.page_size
        total_pages = max(1, (total_count + filter_req.page_size - 1) // filter_req.page_size)

        image_check_sql = "CASE WHEN ed.imagem IS NOT NULL AND DATALENGTH(ed.imagem) > 0 THEN 1 ELSE 0 END" if has_image_col else "0"
        image_url_sql = "ISNULL(ed.image_url, '')" if has_image_url_col else "''"
        exists_check_sql = "CASE WHEN ed.cod_produto IS NOT NULL AND ef.codigo IS NOT NULL THEN 1 ELSE 0 END" if has_digital_familias else "CASE WHEN ed.cod_produto IS NOT NULL THEN 1 ELSE 0 END"

        query_sql = f"""
            SELECT p.codigo,
                   ISNULL(p.descricao, ''),
                   p.familia,
                   ISNULL(f.descricao, ''),
                   p.subfam,
                   ISNULL(sf.descricao, ''),
                   ISNULL(p.precovenda, 0.0),
                   {exists_check_sql},
                   ISNULL(ed.produto, ''),
                   ISNULL(CAST(ed.descricao AS nvarchar(max)), ''),
                   ISNULL(ed.visivel, 1),
                   { "ISNULL(ed.highlight, 0)" if has_highlight else "0" },
                   ISNULL(ed.posicao, 0),
                   {image_url_sql},
                   {image_check_sql},
                   { "ISNULL(ed.gluten, 0)" if has_gluten else "0" },
                   { "ISNULL(ed.lactose, 0)" if has_lactose else "0" },
                   { "ISNULL(ed.vegetariano, 0)" if has_vegetariano else "0" },
                   { "ISNULL(ed.picante, 0)" if has_picante else "0" },
                   { "ISNULL(ed.calorias, 0)" if has_calorias else "0" },
                   { "ISNULL(ed.tempo, 0)" if has_tempo else "0" },
                   ed.familia,
                   { "ISNULL(ef.descricao, '')" if has_digital_familias else "''" },
                   { "ISNULL(es.descricao, '')" if has_digital_familias and has_digital_seccoes else "''" }
            FROM dbo.produtos p
            LEFT JOIN dbo.familias f ON p.familia = f.codigo
            LEFT JOIN dbo.subfamilias sf ON p.subfam = sf.codigo
            LEFT JOIN dbo.ementa_digital_produtos ed ON p.codigo = ed.cod_produto
            { "LEFT JOIN dbo.ementa_digital_familias ef ON ed.familia = ef.codigo" if has_digital_familias else "" }
            { "LEFT JOIN dbo.ementa_digital_seccoes es ON ef.seccao = es.codigo" if has_digital_familias and has_digital_seccoes else "" }
            WHERE {where_clause}
            ORDER BY p.codigo ASC
            OFFSET {offset} ROWS FETCH NEXT {filter_req.page_size} ROWS ONLY
        """

        cursor.execute(query_sql, params)
        items: List[EmentaProductItem] = []
        for row in cursor.fetchall():
            items.append(EmentaProductItem(
                codigo=int(row[0]),
                pos_descricao=row[1] or "",
                familia=row[2],
                familia_desc=row[3] or "",
                subfamilia=row[4],
                subfamilia_desc=row[5] or "",
                pvp1=float(row[6] or 0.0),
                exists_in_ementa=bool(row[7]),
                produto=row[8] or "",
                descricao=row[9] or "",
                visivel=int(row[10] if row[10] is not None else 1),
                highlight=int(row[11] or 0),
                posicao=int(row[12] or 0),
                image_url=row[13] or "",
                has_image_bytes=bool(row[14]),
                gluten=int(row[15] or 0),
                lactose=int(row[16] or 0),
                vegetariano=int(row[17] or 0),
                picante=int(row[18] or 0),
                calorias=int(row[19] or 0),
                tempo=int(row[20] or 0),
                ementa_familia=row[21],
                ementa_familia_desc=row[22] or "",
                ementa_seccao_desc=row[23] or ""
            ))

        return EmentaProductResponse(
            items=items,
            total_count=total_count,
            page=filter_req.page,
            total_pages=total_pages
        )
    finally:
        conn.close()


# ======================================================================
# Importação de Artigos do ZoneSoft (dbo.produtos -> ementa_digital_produtos)
# ======================================================================

def import_products_to_ementa(req: EmentaImportFromPosRequest) -> EmentaImportResponse:
    """Importa artigos de dbo.produtos para dbo.ementa_digital_produtos de forma segura."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "ementa_digital_produtos" not in schema:
            return EmentaImportResponse(
                success=False,
                imported_count=0,
                message="A tabela dbo.ementa_digital_produtos não existe nesta base de dados ZoneSoft."
            )

        ed_cols = schema["ementa_digital_produtos"]
        has_digital_familias = "ementa_digital_familias" in schema

        target_ed_fam = req.ementa_familia
        if target_ed_fam is None and has_digital_familias:
            cursor.execute("SELECT TOP 1 codigo FROM dbo.ementa_digital_familias ORDER BY posicao, codigo")
            fam_row = cursor.fetchone()
            if fam_row:
                target_ed_fam = fam_row[0]

        # Determinar os códigos a importar
        where_parts = ["1=1"]
        params: List[Any] = []
        if req.codes:
            placeholders = ",".join("?" for _ in req.codes)
            where_parts.append(f"p.codigo IN ({placeholders})")
            params.extend(req.codes)
        elif req.familia is not None:
            where_parts.append("p.familia = ?")
            params.append(req.familia)

        if req.min_code is not None:
            where_parts.append("p.codigo >= ?")
            params.append(req.min_code)

        if req.max_code is not None:
            where_parts.append("p.codigo <= ?")
            params.append(req.max_code)

        if not req.overwrite:
            if has_digital_familias:
                where_parts.append("(ed.cod_produto IS NULL OR ef.codigo IS NULL)")
            else:
                where_parts.append("ed.cod_produto IS NULL")

        where_sql = " AND ".join(where_parts)
        if has_digital_familias:
            select_sql = f"""
                SELECT p.codigo, ISNULL(p.descricao, ''), ISNULL(p.descricaocurta, ''),
                       ISNULL(p.familia, 0), ISNULL(p.ordem, 0)
                FROM dbo.produtos p
                LEFT JOIN dbo.ementa_digital_produtos ed ON p.codigo = ed.cod_produto
                LEFT JOIN dbo.ementa_digital_familias ef ON ed.familia = ef.codigo
                WHERE {where_sql}
            """
        else:
            select_sql = f"""
                SELECT p.codigo, ISNULL(p.descricao, ''), ISNULL(p.descricaocurta, ''),
                       ISNULL(p.familia, 0), ISNULL(p.ordem, 0)
                FROM dbo.produtos p
                LEFT JOIN dbo.ementa_digital_produtos ed ON p.codigo = ed.cod_produto
                WHERE {where_sql}
            """
        cursor.execute(select_sql, params)
        to_import = cursor.fetchall()
        if not to_import:
            return EmentaImportResponse(
                success=True,
                imported_count=0,
                message="Nenhum artigo novo para importar para a ementa digital com os critérios indicados."
            )

        # Snapshot de backup
        codes_list = [int(r[0]) for r in to_import]
        cursor.execute(f"SELECT * FROM dbo.ementa_digital_produtos WHERE cod_produto IN ({','.join('?' for _ in codes_list)})", codes_list)
        desc = [c[0].lower() for c in cursor.description]
        prev_snapshot = [dict(zip(desc, row)) for row in cursor.fetchall()]

        try:
            create_backup_snapshot(
                products=[],
                description=f"Importação de {len(to_import)} artigos para a Ementa Digital",
                ementa_digital=prev_snapshot
            )
        except Exception as e:
            return EmentaImportResponse(
                success=False,
                imported_count=0,
                message=f"Não foi possível criar cópia de segurança antes de importar: {e}"
            )

        # Colunas suportadas para inserção
        insert_cols = ["cod_produto", "familia", "produto", "descricao", "visivel", "posicao"]
        if "highlight" in ed_cols:
            insert_cols.append("highlight")
        for f in ["alergenios", "gluten", "sal", "lactose", "picante", "dieta", "vegetariano", "pessoas", "calorias", "tempo"]:
            if f in ed_cols:
                insert_cols.append(f)

        imported_count = 0
        for code, pos_name, pos_short, pos_fam, ordem in to_import:
            # Se target_ed_fam foi indicado ou obtido, usar essa família da ementa digital; caso contrário fallback para pos_fam
            fam_to_use = target_ed_fam if target_ed_fam is not None else pos_fam
            cursor.execute("SELECT cod_produto FROM dbo.ementa_digital_produtos WHERE cod_produto = ?", (code,))
            existing = cursor.fetchone()

            menu_name = (pos_name or "").strip()[:250]
            menu_desc = ""

            if existing:
                if req.overwrite:
                    update_sql = f"UPDATE dbo.ementa_digital_produtos SET produto = ?, familia = ?, visivel = ? WHERE cod_produto = ?"
                    cursor.execute(update_sql, (menu_name, fam_to_use, req.default_visivel, code))
                    imported_count += 1
            else:
                vals = [code, fam_to_use, menu_name, menu_desc, req.default_visivel, ordem or 0]
                if "highlight" in ed_cols:
                    vals.append(0)
                for f in ["alergenios", "gluten", "sal", "lactose", "picante", "dieta", "vegetariano", "pessoas", "calorias", "tempo"]:
                    if f in ed_cols:
                        vals.append(0)
                placeholders = ",".join("?" for _ in vals)
                sql = f"INSERT INTO dbo.ementa_digital_produtos ({','.join(insert_cols)}) VALUES ({placeholders})"
                cursor.execute(sql, vals)
                imported_count += 1

        conn.commit()
        return EmentaImportResponse(
            success=True,
            imported_count=imported_count,
            message=f"{imported_count} artigo(s) importado(s) com sucesso para a Ementa Digital."
        )
    except Exception as e:
        conn.rollback()
        return EmentaImportResponse(
            success=False,
            imported_count=0,
            message=f"Falha ao importar artigos para a ementa digital: {str(e)}"
        )
    finally:
        conn.close()


# ======================================================================
# Operações em Massa: Pré-visualização (Simulação) e Aplicação
# ======================================================================

def preview_ementa_bulk_edit(req: EmentaBulkEditRequest) -> BulkEditPreviewResponse:
    """Simula alterações em massa na ementa digital sem alterar a base de dados."""
    if not req.codes:
        return BulkEditPreviewResponse(
            total_selected=0, affected_count=0, blocked_count=0,
            protected_count=0, diffs=[]
        )

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "ementa_digital_produtos" not in schema:
            return BulkEditPreviewResponse(
                total_selected=len(req.codes), affected_count=0,
                blocked_count=len(req.codes), protected_count=0,
                diffs=[
                    ProductDiff(
                        codigo=c, descricao="N/A", field="ementa_digital",
                        old_value="N/A", new_value="N/A", status="blocked",
                        reason="A tabela dbo.ementa_digital_produtos não existe nesta base de dados."
                    ) for c in req.codes
                ]
            )

        chunks = [req.codes[i:i + 500] for i in range(0, len(req.codes), 500)]
        diffs: List[ProductDiff] = []
        affected = 0
        blocked = 0

        for chunk in chunks:
            placeholders = ",".join("?" for _ in chunk)
            cursor.execute(f"""
                SELECT p.codigo, ISNULL(p.descricao, ''), ed.cod_produto,
                       ISNULL(ed.produto, ''), ISNULL(CAST(ed.descricao AS nvarchar(max)), ''),
                       ISNULL(ed.visivel, 1), ISNULL(ed.highlight, 0),
                       ISNULL(ed.gluten, 0), ISNULL(ed.lactose, 0),
                       ISNULL(ed.vegetariano, 0), ISNULL(ed.picante, 0),
                       ISNULL(p.descricaocurta, '')
                FROM dbo.produtos p
                LEFT JOIN dbo.ementa_digital_produtos ed ON p.codigo = ed.cod_produto
                WHERE p.codigo IN ({placeholders})
            """, chunk)

            for row in cursor.fetchall():
                code = int(row[0])
                pos_name = row[1]
                exists = row[2] is not None
                cur_menu_name = row[3]
                cur_desc = row[4]
                cur_visivel = int(row[5])
                cur_highlight = int(row[6])
                cur_gluten = int(row[7])
                cur_lactose = int(row[8])
                cur_veggie = int(row[9])
                cur_picante = int(row[10])
                pos_short = row[11]

                if not exists:
                    blocked += 1
                    diffs.append(ProductDiff(
                        codigo=code, descricao=pos_name, field="registo_ementa",
                        old_value="Inexistente", new_value="Inexistente", status="blocked",
                        reason="Artigo ainda não existe na ementa digital (use a função 'Importar do POS' primeiro)."
                    ))
                    continue

                row_has_changes = False

                # Visibilidade
                if req.actions.set_visivel is not None:
                    if cur_visivel != req.actions.set_visivel:
                        row_has_changes = True
                        diffs.append(ProductDiff(
                            codigo=code, descricao=pos_name, field="visivel",
                            old_value="Visível" if cur_visivel == 1 else "Oculto",
                            new_value="Visível" if req.actions.set_visivel == 1 else "Oculto",
                            status="modified"
                        ))

                # Destaque
                if req.actions.set_highlight is not None:
                    if cur_highlight != req.actions.set_highlight:
                        row_has_changes = True
                        diffs.append(ProductDiff(
                            codigo=code, descricao=pos_name, field="highlight",
                            old_value="Destaque" if cur_highlight == 1 else "Normal",
                            new_value="Destaque" if req.actions.set_highlight == 1 else "Normal",
                            status="modified"
                        ))

                # Copiar nome do POS para a ementa
                if req.actions.copy_pos_name:
                    new_val = pos_name.strip()[:250]
                    if cur_menu_name != new_val:
                        row_has_changes = True
                        diffs.append(ProductDiff(
                            codigo=code, descricao=pos_name, field="produto",
                            old_value=cur_menu_name or "(vazio)",
                            new_value=new_val,
                            status="modified"
                        ))

                # Copiar descrição curta do POS para a ementa
                if req.actions.copy_pos_short_desc and pos_short:
                    new_desc = pos_short.strip()
                    if cur_desc != new_desc:
                        row_has_changes = True
                        diffs.append(ProductDiff(
                            codigo=code, descricao=pos_name, field="descricao",
                            old_value=cur_desc[:30] + "..." if len(cur_desc) > 30 else (cur_desc or "(vazio)"),
                            new_value=new_desc[:30] + "...",
                            status="modified"
                        ))

                # Formatação de caixa de texto
                if req.actions.text_case_name:
                    val = cur_menu_name or pos_name
                    case_op = req.actions.text_case_name
                    new_val = val
                    if case_op == "upper":
                        new_val = val.upper()
                    elif case_op == "lower":
                        new_val = val.lower()
                    elif case_op == "title":
                        new_val = val.title()
                    elif case_op == "capitalize":
                        new_val = val.capitalize()

                    if cur_menu_name != new_val:
                        row_has_changes = True
                        diffs.append(ProductDiff(
                            codigo=code, descricao=pos_name, field="produto",
                            old_value=cur_menu_name,
                            new_value=new_val,
                            status="modified"
                        ))

                # Descrição
                if req.actions.set_descricao is not None:
                    if cur_desc != req.actions.set_descricao:
                        row_has_changes = True
                        diffs.append(ProductDiff(
                            codigo=code, descricao=pos_name, field="descricao",
                            old_value=cur_desc[:30] + "..." if len(cur_desc) > 30 else (cur_desc or "(vazio)"),
                            new_value=req.actions.set_descricao[:30] + "...",
                            status="modified"
                        ))
                elif req.actions.append_descricao:
                    new_desc = (cur_desc + " " + req.actions.append_descricao).strip()
                    row_has_changes = True
                    diffs.append(ProductDiff(
                        codigo=code, descricao=pos_name, field="descricao",
                        old_value=cur_desc[:30] + "...",
                        new_value=new_desc[:30] + "...",
                        status="modified"
                    ))

                # Alergénios e dietas
                if req.actions.set_gluten is not None and cur_gluten != req.actions.set_gluten:
                    row_has_changes = True
                    diffs.append(ProductDiff(codigo=code, descricao=pos_name, field="gluten",
                                             old_value=str(cur_gluten), new_value=str(req.actions.set_gluten), status="modified"))
                if req.actions.set_lactose is not None and cur_lactose != req.actions.set_lactose:
                    row_has_changes = True
                    diffs.append(ProductDiff(codigo=code, descricao=pos_name, field="lactose",
                                             old_value=str(cur_lactose), new_value=str(req.actions.set_lactose), status="modified"))
                if req.actions.set_vegetariano is not None and cur_veggie != req.actions.set_vegetariano:
                    row_has_changes = True
                    diffs.append(ProductDiff(codigo=code, descricao=pos_name, field="vegetariano",
                                             old_value=str(cur_veggie), new_value=str(req.actions.set_vegetariano), status="modified"))
                if req.actions.set_picante is not None and cur_picante != req.actions.set_picante:
                    row_has_changes = True
                    diffs.append(ProductDiff(codigo=code, descricao=pos_name, field="picante",
                                             old_value=str(cur_picante), new_value=str(req.actions.set_picante), status="modified"))

                if row_has_changes:
                    affected += 1

        return BulkEditPreviewResponse(
            total_selected=len(req.codes),
            affected_count=affected,
            blocked_count=blocked,
            protected_count=0,
            diffs=diffs
        )
    finally:
        conn.close()


def apply_ementa_bulk_edit(req: EmentaBulkEditRequest) -> Tuple[bool, str, int]:
    """Aplica alterações em massa à tabela dbo.ementa_digital_produtos com transação e backup."""
    if not req.codes:
        return False, "Nenhum artigo selecionado.", 0

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "ementa_digital_produtos" not in schema:
            return False, "Tabela dbo.ementa_digital_produtos não existe.", 0

        ed_cols = schema["ementa_digital_produtos"]
        has_sync = "sync" in ed_cols

        # Snapshot do estado anterior
        cursor.execute(f"SELECT * FROM dbo.ementa_digital_produtos WHERE cod_produto IN ({','.join('?' for _ in req.codes)})", req.codes)
        desc = [c[0].lower() for c in cursor.description]
        prev_data = [dict(zip(desc, row)) for row in cursor.fetchall()]
        if not prev_data:
            return False, "Nenhum dos artigos selecionados existe na ementa digital.", 0

        try:
            create_backup_snapshot(
                products=[],
                description=f"Edição em massa na Ementa Digital ({len(prev_data)} artigos)",
                ementa_digital=prev_data
            )
        except Exception as e:
            return False, f"Falha ao criar cópia de segurança antes de aplicar: {e}", 0

        # Montar instruções de atualização
        updated_count = 0
        for item in prev_data:
            code = int(item["cod_produto"])
            sets: List[str] = []
            params: List[Any] = []

            if req.actions.set_visivel is not None:
                sets.append("visivel = ?")
                params.append(req.actions.set_visivel)

            if req.actions.set_highlight is not None and "highlight" in ed_cols:
                sets.append("highlight = ?")
                params.append(req.actions.set_highlight)

            if req.actions.copy_pos_name:
                cursor.execute("SELECT descricao FROM dbo.produtos WHERE codigo = ?", (code,))
                pos_r = cursor.fetchone()
                if pos_r and pos_r[0]:
                    sets.append("produto = ?")
                    params.append(pos_r[0].strip()[:250])

            if req.actions.text_case_name:
                cur_p = item.get("produto") or ""
                case_op = req.actions.text_case_name
                new_p = cur_p
                if case_op == "upper":
                    new_p = cur_p.upper()
                elif case_op == "lower":
                    new_p = cur_p.lower()
                elif case_op == "title":
                    new_p = cur_p.title()
                elif case_op == "capitalize":
                    new_p = cur_p.capitalize()
                sets.append("produto = ?")
                params.append(new_p[:250])

            if req.actions.copy_pos_short_desc:
                cursor.execute("SELECT descricaocurta FROM dbo.produtos WHERE codigo = ?", (code,))
                sc_r = cursor.fetchone()
                if sc_r and sc_r[0]:
                    sets.append("descricao = ?")
                    params.append(sc_r[0].strip())

            if req.actions.set_descricao is not None:
                sets.append("descricao = ?")
                params.append(req.actions.set_descricao)
            elif req.actions.append_descricao:
                cur_d = item.get("descricao") or ""
                new_d = (cur_d + " " + req.actions.append_descricao).strip()
                sets.append("descricao = ?")
                params.append(new_d)

            if req.actions.set_ementa_familia is not None:
                sets.append("familia = ?")
                params.append(req.actions.set_ementa_familia)

            for col_name, act_val in [
                ("gluten", req.actions.set_gluten),
                ("lactose", req.actions.set_lactose),
                ("vegetariano", req.actions.set_vegetariano),
                ("picante", req.actions.set_picante),
                ("dieta", req.actions.set_dieta),
            ]:
                if act_val is not None and col_name in ed_cols:
                    sets.append(f"{col_name} = ?")
                    params.append(act_val)

            if sets:
                if has_sync:
                    sets.append("sync = 1")
                sql = f"UPDATE dbo.ementa_digital_produtos SET {', '.join(sets)} WHERE cod_produto = ?"
                params.append(code)
                cursor.execute(sql, params)
                updated_count += 1

        conn.commit()
        return True, f"{updated_count} artigo(s) da Ementa Digital atualizados com sucesso.", updated_count
    except Exception as e:
        conn.rollback()
        return False, f"Erro ao aplicar alterações na ementa digital: {str(e)}", 0
    finally:
        conn.close()


def update_single_ementa_product(cod_produto: int, update_data: Any) -> Tuple[bool, str]:
    """Atualiza os detalhes e descrição de um artigo individual na ementa digital com backup prévio."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "ementa_digital_produtos" not in schema:
            return False, "A tabela dbo.ementa_digital_produtos não existe nesta base de dados."

        ed_cols = schema["ementa_digital_produtos"]

        cursor.execute("SELECT * FROM dbo.ementa_digital_produtos WHERE cod_produto = ?", (cod_produto,))
        desc = [c[0].lower() for c in cursor.description]
        prev_row = cursor.fetchone()
        prev_data = [dict(zip(desc, prev_row))] if prev_row else []

        if prev_data:
            try:
                create_backup_snapshot(
                    products=[],
                    description=f"Edição do artigo #{cod_produto} na Ementa Digital",
                    ementa_digital=prev_data
                )
            except Exception as e:
                return False, f"Falha ao criar backup de segurança: {e}"

        sets: List[str] = []
        params: List[Any] = []

        if getattr(update_data, 'produto', None) is not None:
            sets.append("produto = ?")
            params.append(update_data.produto.strip()[:250])
        if getattr(update_data, 'descricao', None) is not None:
            sets.append("descricao = ?")
            params.append(update_data.descricao.strip())
        if getattr(update_data, 'visivel', None) is not None:
            sets.append("visivel = ?")
            params.append(update_data.visivel)
        if getattr(update_data, 'highlight', None) is not None and "highlight" in ed_cols:
            sets.append("highlight = ?")
            params.append(update_data.highlight)
        if getattr(update_data, 'ementa_familia', None) is not None:
            sets.append("familia = ?")
            params.append(update_data.ementa_familia)

        for f, val in [
            ("gluten", getattr(update_data, 'gluten', None)),
            ("lactose", getattr(update_data, 'lactose', None)),
            ("vegetariano", getattr(update_data, 'vegetariano', None)),
            ("picante", getattr(update_data, 'picante', None)),
            ("sal", getattr(update_data, 'sal', None)),
            ("calorias", getattr(update_data, 'calorias', None)),
            ("tempo", getattr(update_data, 'tempo', None)),
        ]:
            if val is not None and f in ed_cols:
                sets.append(f"{f} = ?")
                params.append(val)

        if not prev_data:
            cursor.execute("SELECT familia, descricao, descricaocurta, ordem FROM dbo.produtos WHERE codigo = ?", (cod_produto,))
            pos_info = cursor.fetchone()
            fam = getattr(update_data, 'ementa_familia', None)
            if fam is None and "ementa_digital_familias" in schema:
                cursor.execute("SELECT TOP 1 codigo FROM dbo.ementa_digital_familias ORDER BY posicao, codigo")
                fam_row = cursor.fetchone()
                if fam_row:
                    fam = fam_row[0]
            if fam is None:
                fam = pos_info[0] if pos_info else 0

            p_name = update_data.produto or (pos_info[1] or "")[:250]
            p_desc = update_data.descricao if update_data.descricao is not None else (pos_info[2] or "")
            p_ordem = pos_info[3] if (pos_info and pos_info[3]) else 0
            cursor.execute("""
                INSERT INTO dbo.ementa_digital_produtos (cod_produto, familia, produto, descricao, visivel, posicao)
                VALUES (?, ?, ?, ?, 1, ?)
            """, (cod_produto, fam, p_name, p_desc, p_ordem))
            conn.commit()
            return True, f"Artigo #{cod_produto} criado e guardado na Ementa Digital."

        if sets:
            if "sync" in ed_cols:
                sets.append("sync = 1")
            cursor.execute(f"UPDATE dbo.ementa_digital_produtos SET {', '.join(sets)} WHERE cod_produto = ?", params + [cod_produto])

        conn.commit()
        return True, f"Artigo #{cod_produto} atualizado com sucesso."
    except Exception as e:
        conn.rollback()
        return False, f"Erro ao atualizar artigo #{cod_produto}: {str(e)}"
    finally:
        conn.close()


def suggest_description_for_product(codigo: int, nome: str) -> str:
    """Gera uma sugestão culinária inteligente para a descrição de um prato."""
    clean = _clean_key(nome)

    if any(k in clean for k in ["bacalhau", "polvo", "salmao", "robalo", "dourada", "peixe", "marisco", "camarao", "gambas"]):
        return "Peixe ou marisco selecionado, confecionado na perfeição com azeite virgem extra e alho, servido com acompanhamentos tradicionais da casa."
    if any(k in clean for k in ["bife", "vazia", "lombo", "picanha", "vaca", "carne", "prego", "bitoque"]):
        return "Corte de carne nobre grelhado no ponto pretendido, temperado com flor de sal e acompanhado por batatas fritas estaladiças e salada fresca."
    if any(k in clean for k in ["francesinha"]):
        return "Prato emblemático do Porto preparado em pão de forma tostado com carnes selecionadas, coberto com queijo fundido e regado com o tradicional molho picante à cerveja."
    if any(k in clean for k in ["sopa", "caldo"]):
        return "Confecionada diariamente com legumes frescos da época e enriquecida com azeite de primeira extração."
    if any(k in clean for k in ["mousse", "pudim", "doce", "torta", "bolo", "tarte", "sobremesa"]):
        return "Sobremesa artesanal confecionada pela casa com ingredientes frescos segundo a receita tradicional."

    return "Confecionado com ingredientes de qualidade superior, servido com os acompanhamentos tradicionais da nossa cozinha."


# ======================================================================
# Gestão e Colocação de Imagens
# ======================================================================

def save_product_image_data(cod_produto: int, image_bytes: bytes, filename: str) -> Tuple[bool, str, Optional[str]]:
    """Grava os bytes da imagem no SQL Server (coluna imagem) ou no disco com URL gerado."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "ementa_digital_produtos" not in schema:
            return False, "A tabela dbo.ementa_digital_produtos não existe.", None

        ed_cols = schema["ementa_digital_produtos"]
        has_imagem = "imagem" in ed_cols
        has_image_url = "image_url" in ed_cols

        # Guardar também em ficheiro local para pré-visualização rápida no browser
        ext = os.path.splitext(filename)[1].lower() or ".jpg"
        local_filename = f"prod_{cod_produto}_{datetime.now().strftime('%Y%m%d%H%M%S')}{ext}"
        local_path = os.path.join(IMAGES_DIR, local_filename)
        with open(local_path, "wb") as f:
            f.write(image_bytes)

        generated_url = f"/api/ementa-digital/image-file/{local_filename}"

        sets = []
        params = []
        if has_imagem:
            sets.append("imagem = ?")
            params.append(image_bytes)
        if has_image_url:
            sets.append("image_url = ?")
            params.append(generated_url)

        if not sets:
            return False, "A tabela ementa_digital_produtos não tem as colunas 'imagem' ou 'image_url'.", None

        # Garante que o artigo existe na ementa
        cursor.execute("SELECT cod_produto FROM dbo.ementa_digital_produtos WHERE cod_produto = ?", (cod_produto,))
        if not cursor.fetchone():
            cursor.execute("SELECT familia, descricao FROM dbo.produtos WHERE codigo = ?", (cod_produto,))
            pos_info = cursor.fetchone()
            fam = pos_info[0] if pos_info else 0
            p_name = (pos_info[1] or "")[:250] if pos_info else f"Artigo {cod_produto}"
            cursor.execute("""
                INSERT INTO dbo.ementa_digital_produtos (cod_produto, familia, produto, visivel, posicao)
                VALUES (?, ?, ?, 1, 0)
            """, (cod_produto, fam, p_name))

        if "sync" in ed_cols:
            sets.append("sync = 1")

        cursor.execute(f"UPDATE dbo.ementa_digital_produtos SET {', '.join(sets)} WHERE cod_produto = ?", params + [cod_produto])
        conn.commit()
        return True, "Imagem guardada com sucesso.", generated_url
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao gravar imagem: {str(e)}", None
    finally:
        conn.close()


def set_product_image_url(cod_produto: int, image_url: str) -> Tuple[bool, str]:
    """Define o URL de imagem de um artigo da ementa."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "ementa_digital_produtos" not in schema or "image_url" not in schema["ementa_digital_produtos"]:
            return False, "Coluna 'image_url' não disponível na tabela dbo.ementa_digital_produtos."

        cursor.execute("SELECT cod_produto FROM dbo.ementa_digital_produtos WHERE cod_produto = ?", (cod_produto,))
        if not cursor.fetchone():
            cursor.execute("SELECT familia, descricao FROM dbo.produtos WHERE codigo = ?", (cod_produto,))
            pos_info = cursor.fetchone()
            fam = pos_info[0] if pos_info else 0
            p_name = (pos_info[1] or "")[:250] if pos_info else f"Artigo {cod_produto}"
            cursor.execute("""
                INSERT INTO dbo.ementa_digital_produtos (cod_produto, familia, produto, visivel, posicao)
                VALUES (?, ?, ?, 1, 0)
            """, (cod_produto, fam, p_name))

        sync_part = ", sync = 1" if "sync" in schema["ementa_digital_produtos"] else ""
        cursor.execute(f"UPDATE dbo.ementa_digital_produtos SET image_url = ?{sync_part} WHERE cod_produto = ?", (image_url[:500], cod_produto))
        conn.commit()
        return True, "URL da imagem atualizado com sucesso."
    except Exception as e:
        conn.rollback()
        return False, f"Erro ao atualizar URL: {str(e)}"
    finally:
        conn.close()


def delete_product_image(cod_produto: int) -> Tuple[bool, str]:
    """Remove a imagem (binário e URL) de um artigo da ementa digital."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "ementa_digital_produtos" not in schema:
            return False, "A tabela dbo.ementa_digital_produtos não existe."

        ed_cols = schema["ementa_digital_produtos"]
        sets = []
        if "imagem" in ed_cols:
            sets.append("imagem = NULL")
        if "image_url" in ed_cols:
            sets.append("image_url = NULL")

        if not sets:
            return False, "Sem colunas de imagem para remover na tabela."

        if "sync" in ed_cols:
            sets.append("sync = 1")

        cursor.execute(f"UPDATE dbo.ementa_digital_produtos SET {', '.join(sets)} WHERE cod_produto = ?", (cod_produto,))
        conn.commit()
        return True, "Imagem removida com sucesso."
    except Exception as e:
        conn.rollback()
        return False, f"Erro ao remover imagem: {str(e)}"
    finally:
        conn.close()



def get_product_image_bytes(cod_produto: int) -> Tuple[Optional[bytes], Optional[str]]:
    """Obtém os bytes da imagem gravada em dbo.ementa_digital_produtos.imagem ou local."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "ementa_digital_produtos" not in schema:
            return None, None

        ed_cols = schema["ementa_digital_produtos"]
        has_imagem = "imagem" in ed_cols
        has_url = "image_url" in ed_cols

        cols = []
        if has_imagem:
            cols.append("imagem")
        if has_url:
            cols.append("image_url")

        if not cols:
            return None, None

        cursor.execute(f"SELECT {', '.join(cols)} FROM dbo.ementa_digital_produtos WHERE cod_produto = ?", (cod_produto,))
        row = cursor.fetchone()
        if not row:
            return None, None

        raw_bytes = row[0] if has_imagem else None
        url = row[1] if (has_imagem and has_url) else (row[0] if has_url else None)

        if raw_bytes and len(raw_bytes) > 0:
            # Tenta detetar o tipo MIME pelos primeiros bytes mágicos
            mime = "image/jpeg"
            if raw_bytes.startswith(b'\x89PNG'):
                mime = "image/png"
            elif raw_bytes.startswith(b'GIF8'):
                mime = "image/gif"
            elif raw_bytes.startswith(b'RIFF') and b'WEBP' in raw_bytes[:12]:
                mime = "image/webp"
            return bytes(raw_bytes), mime

        if url and "/api/ementa-digital/image-file/" in url:
            fname = url.split("/api/ementa-digital/image-file/")[-1]
            local_path = os.path.join(IMAGES_DIR, fname)
            if os.path.exists(local_path):
                with open(local_path, "rb") as f:
                    b = f.read()
                mime, _ = mimetypes.guess_type(local_path)
                return b, mime or "image/jpeg"

        return None, None
    finally:
        conn.close()


# ======================================================================
# Assistente de Tradução de Ementas Multilíngue
# ======================================================================

DEFAULT_LANGUAGES = [
    {"id": "GB", "name": "Inglês 🇬🇧", "code": "gb", "visivel": 1},
    {"id": "ES", "name": "Espanhol 🇪🇸", "code": "es", "visivel": 1},
    {"id": "FR", "name": "Francês 🇫🇷", "code": "fr", "visivel": 1},
    {"id": "DE", "name": "Alemão 🇩🇪", "code": "de", "visivel": 1}
]

# Dicionário gastronómico português especializado para restauração
CULINARY_DICTIONARY: Dict[str, Dict[str, Any]] = {
    # Pratos e confeções completas
    "dourada assada": {
        "en": "Roasted Sea Bream", "gb": "Roasted Sea Bream",
        "es": "Dorada asada al horno",
        "fr": "Daurade rôtie au four",
        "de": "Gebratene Goldbrasse",
        "desc": {
            "en": "Fresh sea bream roasted in the oven with olive oil, garlic and herbs, served with roasted potatoes.",
            "gb": "Fresh sea bream roasted in the oven with olive oil, garlic and herbs, served with roasted potatoes.",
            "es": "Dorada fresca asada al horno con aceite de oliva, ajo y hierbas, servida con patatas asadas.",
            "fr": "Daurade fraîche rôtie au four à l'huile d'olive, ail et herbes, servie avec pommes de terre rôties.",
            "de": "Frische Goldbrasse im Ofen gebraten mit Olivenöl, Knoblauch und Kräutern, serviert mit Ofenkartoffeln."
        }
    },
    "dourada grelhada": {
        "en": "Grilled Sea Bream", "gb": "Grilled Sea Bream",
        "es": "Dorada a la plancha",
        "fr": "Daurade grillée",
        "de": "Gegrillte Dorade",
        "desc": {
            "en": "Fresh sea bream grilled over charcoal with olive oil and lemon, served with boiled potatoes and fresh salad.",
            "gb": "Fresh sea bream grilled over charcoal with olive oil and lemon, served with boiled potatoes and fresh salad.",
            "es": "Dorada fresca a la parrilla con aceite de oliva y limón, servida con patatas cocidas y ensalada fresca.",
            "fr": "Daurade fraîche grillée au charbon à l'huile d'olive et citron, servie avec pommes de terre et salade.",
            "de": "Frische Goldbrasse gegrillt mit Olivenöl und Zitrone, serviert mit Kartoffeln und frischem Salat."
        }
    },
    "robalo assado": {
        "en": "Roasted Sea Bass", "gb": "Roasted Sea Bass",
        "es": "Lubina asada al horno",
        "fr": "Bar rôti au four",
        "de": "Gebratener Wolfsbarsch",
        "desc": {
            "en": "Oven-roasted wild sea bass with garlic, white wine and roasted potatoes.",
            "gb": "Oven-roasted wild sea bass with garlic, white wine and roasted potatoes.",
            "es": "Lubina salvaje asada al horno con ajo, vino blanco y patatas asadas.",
            "fr": "Bar sauvage rôti au four à l'ail, vin blanc et pommes de terre rôties.",
            "de": "Im Ofen gebratener Wolfsbarsch mit Knoblauch, Weißwein und Ofenkartoffeln."
        }
    },
    "robalo grelhado": {
        "en": "Grilled Sea Bass", "gb": "Grilled Sea Bass",
        "es": "Lubina a la plancha",
        "fr": "Bar grillé",
        "de": "Gegrillter Wolfsbarsch",
        "desc": {
            "en": "Charcoal-grilled sea bass drizzled with extra virgin olive oil, served with fresh salad.",
            "gb": "Charcoal-grilled sea bass drizzled with extra virgin olive oil, served with fresh salad.",
            "es": "Lubina a la parrilla con aceite de oliva virgen extra, servida con ensalada fresca.",
            "fr": "Bar grillé au charbon arrosé d'huile d'olive vierge extra, servi avec salade fraîche.",
            "de": "Gegrillter Wolfsbarsch mit nativem Olivenöl extra, serviert mit frischem Salat."
        }
    },
    "picanha": {
        "en": "Picanha Rump Cap Steak", "gb": "Picanha Rump Cap Steak",
        "es": "Picanha a la parrilla",
        "fr": "Picanha de bœuf grillée",
        "de": "Picanha Hüftdeckel-Steak",
        "desc": {
            "en": "Tender grilled picanha steak served with white rice, black beans, french fries and farofa.",
            "gb": "Tender grilled picanha steak served with white rice, black beans, french fries and farofa.",
            "es": "Tierna picanha a la parrilla servida con arroz blanco, frijoles negros, patatas fritas y farofa.",
            "fr": "Picanha de bœuf tendre grillée servie avec riz blanc, haricots noirs, frites et farofa.",
            "de": "Zartes gegrilltes Picanha-Steak serviert mit weißem Reis, schwarzen Bohnen, Pommes Frites und Farofa."
        }
    },
    "bacalhau a bras": {
        "en": "Salt cod with shredded potatoes, onions and scrambled eggs", "gb": "Salt cod with shredded potatoes, onions and scrambled eggs",
        "es": "Bacalao dorado con patatas paja y huevos revueltos",
        "fr": "Morue à la Brás aux pommes paille et œufs brouillés",
        "de": "Stockfisch nach Brás-Art mit Kartoffelstroh und Rührei",
        "desc": {
            "en": "Shredded salt cod sautéed with matchstick potatoes, onions, scrambled eggs, black olives and parsley.",
            "gb": "Shredded salt cod sautéed with matchstick potatoes, onions, scrambled eggs, black olives and parsley.",
            "es": "Bacalao desmenuzado salteado con patatas paja, cebolla, huevos revueltos, aceitunas negras y perejil.",
            "fr": "Morue effilochée sautée aux pommes paille, oignons, œufs brouillés, olives noires et persil.",
            "de": "Zerkleinerter Stockfisch mit Kartoffelstroh, Zwiebeln, Rührei, schwarzen Oliven und Petersilie."
        }
    },
    "bacalhau com broa": {
        "en": "Baked salt cod topped with cornbread crust", "gb": "Baked salt cod topped with cornbread crust",
        "es": "Bacalao al horno con costra de pan de maíz",
        "fr": "Morue au four en croûte de pain de maïs",
        "de": "Überbackener Stockfisch mit Maisbrotkruste",
        "desc": {
            "en": "Thick salt cod loin baked with garlic, olive oil and a crunchy golden cornbread crust, served with smashed potatoes.",
            "gb": "Thick salt cod loin baked with garlic, olive oil and a crunchy golden cornbread crust, served with smashed potatoes.",
            "es": "Lomo de bacalao al horno con ajo, aceite de oliva y crujiente costra de pan de maíz, servido con patatas aplastadas.",
            "fr": "Pavé de morue au four à l'ail, huile d'olive et croûte dorée de pain de maïs, servi avec pommes de terre écrasées.",
            "de": "Stockfischfilet im Ofen gebacken mit Knoblauch, Olivenöl und knuspriger Maisbrotkruste, serviert mit Quetschkartoffeln."
        }
    },
    "bacalhau com natas": {
        "en": "Salt cod gratin with potatoes and cream", "gb": "Salt cod gratin with potatoes and cream",
        "es": "Bacalao gratinado con patatas y nata",
        "fr": "Gratin de morue aux pommes de terre et crème",
        "de": "Stockfisch-Gratin mit Kartoffeln und Sahne",
        "desc": {
            "en": "Baked shredded salt cod with diced potatoes in a rich creamy béchamel sauce, topped with melted cheese.",
            "gb": "Baked shredded salt cod with diced potatoes in a rich creamy béchamel sauce, topped with melted cheese.",
            "es": "Bacalao al horno en dados de patata con cremosa salsa bechamel gratinada con queso.",
            "fr": "Morue effilochée au four avec pommes de terre en dés dans une sauce béchamel crémeuse gratinée.",
            "de": "Im Ofen gebackener Stockfisch mit Kartoffelwürfeln in cremiger Béchamelsauce mit Käse überbacken."
        }
    },
    "polvo a lagareiro": {
        "en": "Roasted octopus with smashed potatoes and garlic olive oil", "gb": "Roasted octopus with smashed potatoes and garlic olive oil",
        "es": "Pulpo al horno con patatas machacadas y aceite de oliva",
        "fr": "Poulpe rôti à l'huile d'olive et pommes de terre écrasées",
        "de": "Gegrillter Oktopus mit Ofenkartoffeln und Knoblauch-Olivenöl",
        "desc": {
            "en": "Tender octopus roasted in garlic-infused olive oil, served with punched roasted potatoes and herbs.",
            "gb": "Tender octopus roasted in garlic-infused olive oil, served with punched roasted potatoes and herbs.",
            "es": "Tierno pulpo asado en abundante aceite de oliva con ajo, servido con patatas asadas aplastadas.",
            "fr": "Poulpe tendre rôti généreusement à l'huile d'olive et à l'ail, servi avec pommes de terre écrasées.",
            "de": "Zarter Oktopus gebraten in reichlich Knoblauch-Olivenöl, serviert mit Quetschkartoffeln."
        }
    },
    "francesinha": {
        "en": "Porto-style Francesinha sandwich with melted cheese and spicy beer sauce", "gb": "Porto-style Francesinha sandwich with melted cheese and spicy beer sauce",
        "es": "Francesinha estilo Oporto con queso fundido y salsa picante",
        "fr": "Sandwich Francesinha gratiné à la sauce piquante à la bière",
        "de": "Francesinha-Sandwich mit geschmolzenem Käse und Biersauce",
        "desc": {
            "en": "Iconic Porto sandwich layered with beef, cured ham and sausage, wrapped in melted cheese and drenched in spicy beer sauce.",
            "gb": "Iconic Porto sandwich layered with beef, cured ham and sausage, wrapped in melted cheese and drenched in spicy beer sauce.",
            "es": "Emblemático sándwich de Oporto con ternera, jamón y salchicha, cubierto de queso fundido y salsa picante de cerveza.",
            "fr": "Sandwich emblématique de Porto garni de bœuf, jambon et saucisse, recouvert de fromage fondu et sauce piquante à la bière.",
            "de": "Kult-Sandwich aus Porto mit Rindfleisch, Schinken und Wurst, umhüllt von geschmolzenem Käse und scharfer Biersauce."
        }
    },
    "bitoque": {
        "en": "Minute steak with fried egg, french fries and rice", "gb": "Minute steak with fried egg, french fries and rice",
        "es": "Filete de ternera con huevo frito, patatas fritas y arroz",
        "fr": "Steak minute surmonté d'un œuf au plat, frites et riz",
        "de": "Minutensteak mit Spiegelei, Pommes Frites und Reis",
        "desc": {
            "en": "Pan-fried beef steak topped with a sunny-side-up egg, garlic sauce, crispy french fries and rice.",
            "gb": "Pan-fried beef steak topped with a sunny-side-up egg, garlic sauce, crispy french fries and rice.",
            "es": "Filete de ternera a la sartén con huevo frito, salsa de ajo, patatas fritas crujientes y arroz.",
            "fr": "Steak de bœuf poêlé surmonté d'un œuf au plat, sauce à l'ail, frites croustillantes et riz.",
            "de": "Gebratenes Rindersteak mit Spiegelei, Knoblauchsauce, knusprigen Pommes Frites und Reis."
        }
    },
    "bife da vazia": {
        "en": "Sirloin steak", "gb": "Sirloin steak",
        "es": "Bife de chorizo / Entrecot",
        "fr": "Entrecôte de bœuf",
        "de": "Rumpsteak",
        "desc": {
            "en": "Juicy grilled sirloin steak seasoned with sea salt, served with french fries and fresh garden salad.",
            "gb": "Juicy grilled sirloin steak seasoned with sea salt, served with french fries and fresh garden salad.",
            "es": "Jugoso entrecot de ternera a la parrilla con sal marina, servido con patatas fritas y ensalada fresca.",
            "fr": "Entrecôte de bœuf juteuse grillée au sel marin, servie avec frites et salade verte.",
            "de": "Saftiges gegrilltes Rumpsteak mit Meersalz, serviert mit Pommes Frites und frischem Salat."
        }
    },
    "bife do lombo": {
        "en": "Beef tenderloin fillet", "gb": "Beef tenderloin fillet",
        "es": "Solomillo de ternera",
        "fr": "Filet de bœuf",
        "de": "Rinderfilet",
        "desc": {
            "en": "Prime cut tenderloin steak cooked to order with garlic butter sauce, served with roasted potatoes.",
            "gb": "Prime cut tenderloin steak cooked to order with garlic butter sauce, served with roasted potatoes.",
            "es": "Solomillo de ternera de primera calidad con mantequilla de ajo, servido con patatas asadas.",
            "fr": "Filet de bœuf de première qualité à la sauce au beurre d'ail, servi avec pommes de terre rôties.",
            "de": "Zartes Rinderfiletsteak nach Wunsch zubereitet mit Knoblauchbutter, serviert mit Ofenkartoffeln."
        }
    },
    "arroz de marisco": {
        "en": "Seafood stew with rice", "gb": "Seafood stew with rice",
        "es": "Arroz caldoso de marisco",
        "fr": "Riz aux fruits de mer en sauce",
        "de": "Meeresfrüchte-Reiseintopf",
        "desc": {
            "en": "Rich rice stew packed with prawns, clams, mussels and crab in a flavorful tomato, garlic and cilantro broth.",
            "gb": "Rich rice stew packed with prawns, clams, mussels and crab in a flavorful tomato, garlic and cilantro broth.",
            "es": "Arroz caldoso con gambas, almejas, mejillones y nécora en un sabroso caldo de tomate, ajo y cilantro.",
            "fr": "Riz crémeux mijoté aux crevettes, palourdes, moules et crabe dans un bouillon de tomate, ail et coriandre.",
            "de": "Cremiger Reiseintopf mit Garnelen, Muscheln und Krabben in würziger Tomaten-Knoblauch-Koriander-Brühe."
        }
    },
    "arroz de tamboril": {
        "en": "Monkfish and prawn rice stew", "gb": "Monkfish and prawn rice stew",
        "es": "Arroz caldoso de rape con langostinos",
        "fr": "Riz crémeux à la lotte et crevettes",
        "de": "Seeteufel-Reiseintopf",
        "desc": {
            "en": "Tender monkfish medallions and juicy prawns simmered with rice, tomatoes and fresh herbs.",
            "gb": "Tender monkfish medallions and juicy prawns simmered with rice, tomatoes and fresh herbs.",
            "es": "Medallones de rape y jugosos langostinos cocinados a fuego lento con arroz, tomate y hierbas frescas.",
            "fr": "Médaillons de lotte et crevettes juteuses mijotés avec riz, tomates et herbes fraîches.",
            "de": "Zarte Seeteufelmedaillons und saftige Garnelen gekocht mit Reis, Tomaten und frischen Kräutern."
        }
    },
    "sopa do dia": {
        "en": "Soup of the day", "gb": "Soup of the day",
        "es": "Sopa del día",
        "fr": "Soupe du jour",
        "de": "Tagessuppe",
        "desc": {
            "en": "Freshly prepared vegetable soup made daily with fresh seasonal ingredients.",
            "gb": "Freshly prepared vegetable soup made daily with fresh seasonal ingredients.",
            "es": "Sopa de verduras recién preparada diariamente con ingredientes frescos de temporada.",
            "fr": "Soupe de légumes fraîchement préparée chaque jour avec des ingrédients de saison.",
            "de": "Täglich frisch zubereitete Gemüsebrühe mit frischen Zutaten der Saison."
        }
    },
    "caldo verde": {
        "en": "Traditional kale and potato soup with chorizo", "gb": "Traditional kale and potato soup with chorizo",
        "es": "Caldo verde tradicional con col rizada y chorizo",
        "fr": "Bouillon vert traditionnel au chou frisé et chorizo",
        "de": "Traditionelle Grünkohlsuppe mit Chouriço",
        "desc": {
            "en": "Classic Portuguese potato and finely shredded kale soup infused with olive oil and sliced chouriço sausage.",
            "gb": "Classic Portuguese potato and finely shredded kale soup infused with olive oil and sliced chouriço sausage.",
            "es": "Clásica sopa portuguesa de patata y col verde cortada fina con aceite de oliva y rodajas de chorizo.",
            "fr": "Soupe traditionnelle de pommes de terre et chou émincé à l'huile d'olive et rondelles de chouriço.",
            "de": "Klassische portugiesische Kartoffel- und Grünkohlsuppe mit Olivenöl und Chouriço-Scheiben."
        }
    },
    "prego no prato": {
        "en": "Sirloin steak on the plate with fried egg and fries", "gb": "Sirloin steak on the plate with fried egg and fries",
        "es": "Bistec al plato con huevo frito y patatas",
        "fr": "Steak minute à l'assiette avec œuf au plat et frites",
        "de": "Rindersteak auf dem Teller mit Spiegelei und Pommes",
        "desc": {
            "en": "Garlic beef steak served on the plate with fried egg, french fries, rice and fresh salad.",
            "gb": "Garlic beef steak served on the plate with fried egg, french fries, rice and fresh salad.",
            "es": "Bistec de ternera al ajo servido al plato con huevo frito, patatas fritas, arroz y ensalada.",
            "fr": "Steak de bœuf à l'ail servi à l'assiette avec œuf au plat, frites, riz et salade.",
            "de": "Knoblauch-Rindersteak auf dem Teller mit Spiegelei, Pommes Frites, Reis und Salat."
        }
    },
    "prego no pao": {
        "en": "Traditional garlic steak sandwich", "gb": "Traditional garlic steak sandwich",
        "es": "Bocadillo de ternera al ajo",
        "fr": "Sandwich au steak et à l'ail",
        "de": "Rindersteak-Sandwich mit Knoblauch",
        "desc": {
            "en": "Tender garlic-marinated beef steak served inside a fresh crispy bread roll with mustard or hot sauce.",
            "gb": "Tender garlic-marinated beef steak served inside a fresh crispy bread roll with mustard or hot sauce.",
            "es": "Tierna ternera marinada al ajo servida en pan crujiente con mostaza o salsa picante.",
            "fr": "Steak de bœuf mariné à l'ail servi dans un petit pain croustillant avec moutarde ou sauce piquante.",
            "de": "Zartes Knoblauch-Rindersteak im frischen Brötchen mit Senf oder scharfer Sauce."
        }
    },
    "mousse de chocolate": {
        "en": "Chocolate mousse", "gb": "Chocolate mousse",
        "es": "Mousse de chocolate",
        "fr": "Mousse au chocolat",
        "de": "Schokoladenmousse",
        "desc": {
            "en": "Rich and creamy dark chocolate mousse topped with chocolate shavings.",
            "gb": "Rich and creamy dark chocolate mousse topped with chocolate shavings.",
            "es": "Cremosa mousse de chocolate negro artesanal decorada con virutas de chocolate.",
            "fr": "Mousse au chocolat noir maison onctueuse saupoudrée de copeaux de chocolat.",
            "de": "Cremiges hausgemachtes Zartbitterschokoladen-Mousse mit Schokoraspeln."
        }
    },
    "pudim de ovos": {
        "en": "Egg caramel flan", "gb": "Egg caramel flan",
        "es": "Flan de huevo",
        "fr": "Flan aux œufs et caramel",
        "de": "Eier-Karamellpudding",
        "desc": {
            "en": "Silky traditional egg custard flan coated in a rich golden caramel sauce.",
            "gb": "Silky traditional egg custard flan coated in a rich golden caramel sauce.",
            "es": "Suave flan tradicional de huevo bañado en rica salsa de caramelo dorado.",
            "fr": "Flan traditionnel aux œufs nappé d'un délicieux caramel doré.",
            "de": "Traditioneller Eierpudding mit einer feinen goldenen Karamellsauce."
        }
    },

    # Expressões e frases comuns para descrições de ementa
    "servido com": {"en": "served with", "gb": "served with", "es": "servido con", "fr": "servi avec", "de": "serviert mit"},
    "servida com": {"en": "served with", "gb": "served with", "es": "servida con", "fr": "servie avec", "de": "serviert mit"},
    "servidos com": {"en": "served with", "gb": "served with", "es": "servidos con", "fr": "servis avec", "de": "serviert mit"},
    "acompanhado de": {"en": "served with", "gb": "served with", "es": "acompañado de", "fr": "accompagné de", "de": "serviert mit"},
    "acompanhada de": {"en": "served with", "gb": "served with", "es": "acompañada de", "fr": "accompagnée de", "de": "serviert mit"},
    "acompanhado com": {"en": "served with", "gb": "served with", "es": "acompañado con", "fr": "accompagné avec", "de": "serviert mit"},
    "no forno": {"en": "in the oven", "gb": "in the oven", "es": "al horno", "fr": "au four", "de": "im Ofen"},
    "grelhado na brasa": {"en": "charcoal grilled", "gb": "charcoal grilled", "es": "a la brasa", "fr": "grillé au charbon", "de": "holzkohlegegrillt"},
    "grelhada na brasa": {"en": "charcoal grilled", "gb": "charcoal grilled", "es": "a la brasa", "fr": "grillée au charbon", "de": "holzkohlegegrillt"},
    "molho de alho": {"en": "garlic sauce", "gb": "garlic sauce", "es": "salsa de ajo", "fr": "sauce à l'ail", "de": "Knoblauchsauce"},
    "molho de natas": {"en": "cream sauce", "gb": "cream sauce", "es": "salsa de nata", "fr": "sauce à la crème", "de": "Rahmsauce"},
    "molho de cerveja": {"en": "beer sauce", "gb": "beer sauce", "es": "salsa de cerveza", "fr": "sauce à la bière", "de": "Biersauce"},
    "molho de pimenta": {"en": "pepper sauce", "gb": "pepper sauce", "es": "salsa de pimienta", "fr": "sauce au poivre", "de": "Pfeffersauce"},
    "salada mista": {"en": "mixed salad", "gb": "mixed salad", "es": "ensalada mixta", "fr": "salade mixte", "de": "gemischter Salat"},
    "sem": {"en": "without", "gb": "without", "es": "sin", "fr": "sans", "de": "ohne"},
    "ou": {"en": "or", "gb": "or", "es": "o", "fr": "ou", "de": "oder"},

    # Termos gerais, confeções e carnes/peixes
    "grelhado": {"en": "grilled", "gb": "grilled", "es": "a la parrilla", "fr": "grillé", "de": "gegrillt"},
    "grelhada": {"en": "grilled", "gb": "grilled", "es": "a la parrilla", "fr": "grillée", "de": "gegrillt"},
    "assado": {"en": "roasted", "gb": "roasted", "es": "asado", "fr": "rôti", "de": "gebraten"},
    "assada": {"en": "roasted", "gb": "roasted", "es": "asada", "fr": "rôtie", "de": "gebraten"},
    "cozido": {"en": "boiled / stewed", "gb": "boiled / stewed", "es": "cocido", "fr": "bouilli / mijoté", "de": "gekocht"},
    "frito": {"en": "fried", "gb": "fried", "es": "frito", "fr": "frit", "de": "gebraten / frittiert"},
    "frita": {"en": "fried", "gb": "fried", "es": "frita", "fr": "frite", "de": "frittiert"},
    "fritas": {"en": "french fries", "gb": "french fries", "es": "patatas fritas", "fr": "frites", "de": "Pommes Frites"},
    "salada": {"en": "salad", "gb": "salad", "es": "ensalada", "fr": "salade", "de": "Salat"},
    "legumes": {"en": "vegetables", "gb": "vegetables", "es": "verduras", "fr": "légumes", "de": "Gemüse"},
    "arroz": {"en": "rice", "gb": "rice", "es": "arroz", "fr": "riz", "de": "Reis"},
    "batata": {"en": "potato", "gb": "potato", "es": "patata", "fr": "pomme de terre", "de": "Kartoffel"},
    "carne": {"en": "meat", "gb": "meat", "es": "carne", "fr": "viande", "de": "Fleisch"},
    "vaca": {"en": "beef", "gb": "beef", "es": "ternera", "fr": "bœuf", "de": "Rindfleisch"},
    "porco": {"en": "pork", "gb": "pork", "es": "cerdo", "fr": "porc", "de": "Schweinefleisch"},
    "frango": {"en": "chicken", "gb": "chicken", "es": "pollo", "fr": "poulet", "de": "Hähnchen"},
    "peixe": {"en": "fish", "gb": "fish", "es": "pescado", "fr": "poisson", "de": "Fisch"},
    "salmao": {"en": "salmon", "gb": "salmon", "es": "salmón", "fr": "saumon", "de": "Lachs"},
    "dourada": {"en": "sea bream", "gb": "sea bream", "es": "dorada", "fr": "dorade", "de": "Dorade"},
    "robalo": {"en": "sea bass", "gb": "sea bass", "es": "lubina", "fr": "bar", "de": "Wolfsbarsch"},
    "sardinha": {"en": "sardine", "gb": "sardine", "es": "sardina", "fr": "sardine", "de": "Sardine"},
    "gambas": {"en": "prawns", "gb": "prawns", "es": "gambas", "fr": "crevettes", "de": "Garnelen"},
    "camarao": {"en": "shrimp / prawn", "gb": "shrimp / prawn", "es": "langostino / gamba", "fr": "crevette", "de": "Garnele"},
    "sobremesa": {"en": "dessert", "gb": "dessert", "es": "postre", "fr": "dessert", "de": "Dessert"},
    "agua": {"en": "water", "gb": "water", "es": "agua", "fr": "eau", "de": "Wasser"},
    "batata frita": {"en": "french fries", "gb": "french fries", "es": "patatas fritas", "fr": "frites", "de": "Pommes Frites"},
    "batatas fritas": {"en": "french fries", "gb": "french fries", "es": "patatas fritas", "fr": "frites", "de": "Pommes Frites"},
    "batatas a murro": {"en": "punched roasted potatoes", "gb": "punched roasted potatoes", "es": "patatas asadas aplastadas", "fr": "pommes de terre écrasées", "de": "Quetschkartoffeln"},
    "com": {"en": "with", "gb": "with", "es": "con", "fr": "avec", "de": "mit"},
    "e": {"en": "and", "gb": "and", "es": "y", "fr": "et", "de": "und"},
    "molho": {"en": "sauce", "gb": "sauce", "es": "salsa", "fr": "sauce", "de": "Sauce"},
    "queijo": {"en": "cheese", "gb": "cheese", "es": "queso", "fr": "fromage", "de": "Käse"},
    "presunto": {"en": "cured ham", "gb": "cured ham", "es": "jamón serrano", "fr": "jambon cru", "de": "Schinken"},
    "fiambre": {"en": "ham", "gb": "ham", "es": "jamón cocido", "fr": "jambon blanc", "de": "Kochschinken"},
    "ovo": {"en": "egg", "gb": "egg", "es": "huevo", "fr": "œuf", "de": "Ei"},
    "azeite": {"en": "olive oil", "gb": "olive oil", "es": "aceite de oliva", "fr": "huile d'olive", "de": "Olivenöl"},
    "alho": {"en": "garlic", "gb": "garlic", "es": "ajo", "fr": "ail", "de": "Knoblauch"},
    "cebola": {"en": "onion", "gb": "onion", "es": "cebolla", "fr": "oignon", "de": "Zwiebel"},
    "tomate": {"en": "tomato", "gb": "tomato", "es": "tomate", "fr": "tomate", "de": "Tomate"},
    "marisco": {"en": "seafood", "gb": "seafood", "es": "marisco", "fr": "fruits de mer", "de": "Meeresfrüchte"},
    "ameijoas": {"en": "clams", "gb": "clams", "es": "almejas", "fr": "palourdes", "de": "Muscheln"},
    "vinho da casa": {"en": "house wine", "gb": "house wine", "es": "vino de la casa", "fr": "vin de la maison", "de": "Hauswein"},
    "sobremesa do dia": {"en": "dessert of the day", "gb": "dessert of the day", "es": "postre del día", "fr": "dessert du jour", "de": "Dessert des Tages"},
    "pao": {"en": "bread", "gb": "bread", "es": "pan", "fr": "pain", "de": "Brot"},
    "manteiga": {"en": "butter", "gb": "butter", "es": "mantequilla", "fr": "beurre", "de": "Butter"},
    "azeitonas": {"en": "olives", "gb": "olives", "es": "aceitunas", "fr": "olives", "de": "Oliven"},
}


def _clean_key(text: str) -> str:
    """Normaliza texto para procura sem acentos e em minúsculas."""
    import unicodedata
    n = unicodedata.normalize('NFKD', text.lower()).encode('ASCII', 'ignore').decode('utf-8')
    return re.sub(r'[^a-z0-9 ]', ' ', n).strip()


def _build_accent_regex(term: str) -> str:
    """Gera padrão regex tolerante a acentos e cedilhas para termos culinários."""
    char_map = {
        'a': '[aáàãâä]', 'e': '[eéèêë]', 'i': '[iíìîï]',
        'o': '[oóòõôö]', 'u': '[uúùûü]', 'c': '[cç]'
    }
    pattern = []
    for char in term.lower():
        pattern.append(char_map.get(char, re.escape(char)))
    return r'\b' + ''.join(pattern) + r'\b'


def _get_lang_val(dic: Dict[str, Any], lang: str) -> Optional[str]:
    """Obtém o valor de tradução do dicionário gastronómico normalizando 'gb' <-> 'en'."""
    val = dic.get(lang)
    if not val:
        if lang in ("gb", "en"):
            val = dic.get("en") or dic.get("gb")
    return val if isinstance(val, str) else None


def translate_menu_texts(req: EmentaTranslateRequest) -> EmentaTranslateResponse:
    """Gera traduções automáticas para artigos e descrições gastronómicas."""
    results: Dict[str, Dict[str, str]] = {}
    descriptions: Dict[str, Dict[str, str]] = {}

    target_langs = [l.lower() for l in req.target_langs]
    sorted_terms = sorted(CULINARY_DICTIONARY.keys(), key=len, reverse=True)
    combined_pattern = re.compile(
        '|'.join(_build_accent_regex(t) for t in sorted_terms if len(t) > 2 or t in ("e", "com", "ou", "sem")),
        flags=re.IGNORECASE
    )

    for text in req.texts:
        if not text or not text.strip():
            continue

        raw = text.strip()
        cleaned = _clean_key(raw)
        tr_map: Dict[str, str] = {}
        desc_map: Dict[str, str] = {}

        # 1. Correspondência direta ou exata no dicionário gastronómico
        if cleaned in CULINARY_DICTIONARY:
            entry = CULINARY_DICTIONARY[cleaned]
            for lang in target_langs:
                tr_map[lang] = _get_lang_val(entry, lang) or raw
                if "desc" in entry and isinstance(entry["desc"], dict):
                    d_val = _get_lang_val(entry["desc"], lang)
                    if d_val:
                        desc_map[lang] = d_val
        else:
            # 2. Heurística composta por substituição num único passo (evita re-substituições)
            for lang in target_langs:
                def replacer(match, target_lang=lang):
                    m_text = match.group(0)
                    k = _clean_key(m_text)
                    val = _get_lang_val(CULINARY_DICTIONARY.get(k, {}), target_lang)
                    if not val:
                        return m_text
                    if m_text.isupper() and len(m_text) > 1:
                        return val.upper()
                    if m_text[0].isupper():
                        return val.capitalize()
                    return val

                translated_phrase = combined_pattern.sub(replacer, raw)
                tr_map[lang] = translated_phrase

        results[raw] = tr_map
        if desc_map:
            descriptions[raw] = desc_map

    return EmentaTranslateResponse(translations=results, descriptions=descriptions)


def get_ementa_languages() -> List[Dict[str, Any]]:
    """Devolve a lista de idiomas disponíveis para tradução."""
    try:
        conn = db_manager.get_connection()
    except Exception:
        return DEFAULT_LANGUAGES
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "ementa_digital_paises" in schema:
            cursor.execute("SELECT id, name, visivel FROM dbo.ementa_digital_paises ORDER BY id ASC")
            db_langs = []
            for row in cursor.fetchall():
                db_langs.append({
                    "id": row[0],
                    "name": row[1],
                    "code": row[0].lower(),
                    "visivel": int(row[2] or 1)
                })
            if db_langs:
                return db_langs
    except Exception:
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass

    return DEFAULT_LANGUAGES


LANG_NAME_MAP = {
    "GB": "English",
    "ES": "Spanish",
    "FR": "French",
    "DE": "German",
    "IT": "Italian",
    "NL": "Dutch",
    "RU": "Russian"
}


def set_ementa_active_languages(lang_codes: List[str]) -> Tuple[bool, str]:
    """Ativa os idiomas selecionados na tabela dbo.ementa_digital_paises da ZoneSoft."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "ementa_digital_paises" not in schema:
            return False, "A tabela dbo.ementa_digital_paises não existe no banco de dados."

        ed_cols = schema["ementa_digital_paises"]
        has_sync = "sync" in ed_cols

        upper_codes = [c.upper() for c in lang_codes]

        for code in upper_codes:
            name = LANG_NAME_MAP.get(code, code)
            cursor.execute("SELECT id FROM dbo.ementa_digital_paises WHERE id = ?", (code,))
            if cursor.fetchone():
                sync_clause = ", sync = 1" if has_sync else ""
                cursor.execute(f"UPDATE dbo.ementa_digital_paises SET visivel = 1{sync_clause} WHERE id = ?", (code,))
            else:
                if has_sync:
                    cursor.execute("INSERT INTO dbo.ementa_digital_paises (id, name, visivel, sync) VALUES (?, ?, 1, 1)", (code, name))
                else:
                    cursor.execute("INSERT INTO dbo.ementa_digital_paises (id, name, visivel) VALUES (?, ?, 1)", (code, name))

        if upper_codes:
            placeholders = ", ".join(["?"] * len(upper_codes))
            sync_clause = ", sync = 1" if has_sync else ""
            cursor.execute(f"UPDATE dbo.ementa_digital_paises SET visivel = 0{sync_clause} WHERE id NOT IN ({placeholders})", upper_codes)

        conn.commit()
        return True, f"Idiomas ativados na ementa digital com sucesso: {', '.join(upper_codes)}"
    except Exception as e:
        conn.rollback()
        return False, f"Erro ao ativar idiomas na ementa digital: {str(e)}"
    finally:
        conn.close()



def get_product_translations(cod_produto: int) -> Dict[str, Dict[str, str]]:
    """Obtém as traduções de um produto da tabela dbo.ementa_digital_traducoes."""
    try:
        conn = db_manager.get_connection()
    except Exception:
        return {}
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "ementa_digital_traducoes" not in schema:
            return {}

        cursor.execute("""
            SELECT id_country, field, value
            FROM dbo.ementa_digital_traducoes
            WHERE id1 = ? AND typeid IN (1, 2)
        """, (cod_produto,))

        translations: Dict[str, Dict[str, str]] = {}
        for row in cursor.fetchall():
            country = (row[0] or "").upper()
            field = row[1] or ""
            val = row[2] or ""
            # Mapeia 'nome' (ZoneSoft typeid=2) para 'produto' no frontend
            if field == "nome":
                field = "produto"
            translations.setdefault(country, {})[field] = val

        return translations
    finally:
        conn.close()


def save_product_translations(req: EmentaSaveTranslationsRequest) -> Tuple[bool, str]:
    """Guarda as traduções de um produto na tabela dbo.ementa_digital_traducoes com salvaguarda."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        ensure_traducoes_table(cursor)
        schema = _schema(cursor)
        if "ementa_digital_traducoes" not in schema:
            return False, "Não foi possível aceder nem criar a tabela dbo.ementa_digital_traducoes."

        for country, fields in req.translations.items():
            c_code = country.upper()
            for field, val in fields.items():
                alt_field = "nome" if field == "produto" else ("produto" if field == "nome" else field)
                if not val or not str(val).strip():
                    cursor.execute("""
                        DELETE FROM dbo.ementa_digital_traducoes
                        WHERE id_country = ? AND typeid IN (1, 2) AND id1 = ? AND id2 = 0 AND field IN (?, ?)
                    """, (c_code, req.cod_produto, field, alt_field))
                else:
                    cursor.execute("""
                        SELECT typeid, field FROM dbo.ementa_digital_traducoes
                        WHERE id_country = ? AND typeid IN (1, 2) AND id1 = ? AND id2 = 0 AND field IN (?, ?)
                    """, (c_code, req.cod_produto, field, alt_field))
                    found = cursor.fetchone()
                    if found:
                        tid, f_name = found[0], found[1]
                        cursor.execute("""
                            UPDATE dbo.ementa_digital_traducoes
                            SET value = ?
                            WHERE id_country = ? AND typeid = ? AND id1 = ? AND id2 = 0 AND field = ?
                        """, (val, c_code, tid, req.cod_produto, f_name))
                    else:
                        db_field = "nome" if field == "produto" else field
                        cursor.execute("""
                            INSERT INTO dbo.ementa_digital_traducoes (id_country, typeid, id1, id2, field, value)
                            VALUES (?, 2, ?, 0, ?, ?)
                        """, (c_code, req.cod_produto, db_field, val))

        conn.commit()
        return True, "Traduções gravadas com sucesso."
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao gravar traduções: {str(e)}"
    finally:
        conn.close()


GENERAL_UI_TRANSLATIONS_DICT: Dict[str, Dict[str, str]] = {
    "aceitar": {"GB": "Place Order", "ES": "Realizar pedido", "FR": "Passer la commande", "DE": "Bestellung aufgeben"},
    "aceitarconta": {"GB": "Accept Bill", "ES": "Aceptar cuenta", "FR": "Accepter l'addition", "DE": "Rechnung akzeptieren"},
    "addproduto": {"GB": "Add item", "ES": "Añadir producto", "FR": "Ajouter un produit", "DE": "Produkt hinzufügen"},
    "adicionado": {"GB": "Added", "ES": "Añadido", "FR": "Ajouté", "DE": "Hinzugefügt"},
    "ajudamsg": {"GB": "Request staff assistance?", "ES": "¿Solicitar asistencia de un camarero?", "FR": "Demander l'aide d'un serveur ?", "DE": "Mitarbeiter um Hilfe bitten?"},
    "alergenio": {"GB": "Contains allergens", "ES": "Contiene alérgenos", "FR": "Contient des allergènes", "DE": "Enthält Allergene"},
    "bemvindo": {"GB": "Welcome", "ES": "Bienvenido", "FR": "Bienvenue", "DE": "Willkommen"},
    "billwait": {"GB": "Waiting for bill", "ES": "Esperando la cuenta", "FR": "En attente de l'addition", "DE": "Warten auf Rechnung"},
    "calorias": {"GB": "Calories", "ES": "Calorías", "FR": "Calories", "DE": "Kalorien"},
    "cancel": {"GB": "Cancel", "ES": "Cancelar", "FR": "Annuler", "DE": "Abbrechen"},
    "categorias": {"GB": "Categories", "ES": "Categorías", "FR": "Catégories", "DE": "Kategorien"},
    "complementares": {"GB": "Extras", "ES": "Extras", "FR": "Suppléments", "DE": "Extras"},
    "confirm": {"GB": "Confirmation", "ES": "Confirmación", "FR": "Confirmation", "DE": "Bestätigung"},
    "confirmadd": {"GB": "Confirm", "ES": "Confirmar", "FR": "Confirmer", "DE": "Bestätigen"},
    "confirmaddtitle": {"GB": "Add to order?", "ES": "¿Añadir al pedido?", "FR": "Ajouter à la commande ?", "DE": "Zur Bestellung hinzufügen?"},
    "confirmajuda": {"GB": "Staff assistance requested. Please wait...", "ES": "Se ha solicitado asistencia. Por favor espere...", "FR": "Assistance demandée. Veuillez patienter...", "DE": "Hilfe angefordert. Bitte warten..."},
    "conta": {"GB": "Bill", "ES": "Cuenta", "FR": "Addition", "DE": "Rechnung"},
    "customgratificacao": {"GB": "Custom amount", "ES": "Personalizar importe", "FR": "Personnaliser le montant", "DE": "Betrag anpassen"},
    "dadosfiscais": {"GB": "Tax Details", "ES": "Datos fiscales", "FR": "Informations fiscales", "DE": "Steuerdaten"},
    "deixeopiniao": {"GB": "Leave us your feedback", "ES": "Déjenos su opinión", "FR": "Laissez-nous votre avis", "DE": "Hinterlassen Sie Ihr Feedback"},
    "descontos": {"GB": "Discounts", "ES": "Descuentos", "FR": "Remises", "DE": "Rabatte"},
    "dieta": {"GB": "Dietary", "ES": "Dieta", "FR": "Régime", "DE": "Diät"},
    "divisaoconta": {"GB": "Split Bill", "ES": "Dividir cuenta", "FR": "Partager l'addition", "DE": "Rechnung teilen"},
    "dose": {"GB": "Full Portion", "ES": "Ración", "FR": "Portion entière", "DE": "Ganze Portion"},
    "dosepara": {"GB": "Serves", "ES": "Para", "FR": "Pour", "DE": "Portion für"},
    "ementaoffline": {"GB": "Menu Offline\n\nPlease ask a staff member.", "ES": "Menú fuera de línea\n\nPor favor consulte al personal.", "FR": "Menu hors ligne\n\nVeuillez contacter un serveur.", "DE": "Speisekarte offline\n\nBitte wenden Sie sich an das Personal."},
    "enquantoespera": {"GB": "While you wait...", "ES": "Mientras espera...", "FR": "En attendant...", "DE": "Während Sie warten..."},
    "enviarpedido": {"GB": "Send order", "ES": "Enviar pedido", "FR": "Enviar pedido", "DE": "Bestellung senden"},
    "error": {"GB": "An error occurred during operation.", "ES": "Ocurrió un error al ejecutar la operación.", "FR": "Une erreur est survenue lors de l'opération.", "DE": "Ein Fehler ist aufgetreten."},
    "escolhapagamento": {"GB": "Select payment method", "ES": "Elija el método de pago", "FR": "Choisissez le mode de paiement", "DE": "Zahlungsmethode wählen"},
    "escolhaprodutos": {"GB": "Select items to pay", "ES": "Elija los productos a pagar", "FR": "Sélectionnez les articles à payer", "DE": "Produkte zum Bezahlen auswählen"},
    "escolher": {"GB": "Select", "ES": "Elegir", "FR": "Choisir", "DE": "Auswählen"},
    "esgotado": {"GB": "Sold out", "ES": "Agotado", "FR": "Épuisé", "DE": "Ausverkauft"},
    "fecharconta": {"GB": "Close bill", "ES": "Cerrar cuenta", "FR": "Clôturer l'addition", "DE": "Rechnung schließen"},
    "feedbackdescription": {"GB": "Rate your experience", "ES": "Deje su valoración", "FR": "Donnez votre avis", "DE": "Bewerten Sie Ihre Erfahrung"},
    "feedbacktitle": {"GB": "Did you enjoy your visit?", "ES": "¿Le gustó la experiencia?", "FR": "Avez-vous apprécié votre visite ?", "DE": "Hat es Ihnen gefallen?"},
    "fidelizacao": {"GB": "Loyalty", "ES": "Fidelización", "FR": "Fidélité", "DE": "Treueprogramm"},
    "finalizar": {"GB": "Checkout", "ES": "Finalizar", "FR": "Terminer", "DE": "Abschließen"},
    "gluten": {"GB": "Gluten-free", "ES": "Sin gluten", "FR": "Sans gluten", "DE": "Glutenfrei"},
    "gratificacao": {"GB": "Tip", "ES": "Propina", "FR": "Pourboire", "DE": "Trinkgeld"},
    "hintname": {"GB": "Enter your name here", "ES": "Escriba aquí su nombre", "FR": "Entrez votre nom ici", "DE": "Namen hier eingeben"},
    "hintnif": {"GB": "Enter Tax ID (NIF) here", "ES": "Escriba aquí su NIF/CIF", "FR": "Entrez votre numéro fiscal ici", "DE": "Steuernummer hier eingeben"},
    "hintphone": {"GB": "Enter your phone number", "ES": "Escriba aquí su número de teléfono", "FR": "Entrez votre numéro de téléphone", "DE": "Telefonnummer hier eingeben"},
    "informacoes": {"GB": "Information", "ES": "Información", "FR": "Informations", "DE": "Informationen"},
    "introdadosfiscais": {"GB": "Enter invoice details", "ES": "Introduzca los datos para la factura", "FR": "Entrez les détails de la facture", "DE": "Rechnungsdaten eingeben"},
    "introphone": {"GB": "Enter your mobile number", "ES": "Introduzca su número de teléfono", "FR": "Entrez votre numéro de téléphone mobile", "DE": "Handynummer eingeben"},
    "itens": {"GB": "Order Summary", "ES": "Resumen del pedido", "FR": "Récapitulatif de la commande", "DE": "Bestellübersicht"},
    "lactose": {"GB": "Lactose-free", "ES": "Sin lactosa", "FR": "Sans lactose", "DE": "Laktosefrei"},
    "meiadose": {"GB": "Half Portion", "ES": "Media ración", "FR": "Demi-portion", "DE": "Halbe Portion"},
    "nome": {"GB": "Name", "ES": "Nombre", "FR": "Nom", "DE": "Name"},
    "numpessoas": {"GB": "Please select number of guests.", "ES": "Por favor seleccione el número de personas.", "FR": "Veuillez sélectionner le nombre de personnes.", "DE": "Bitte Personenanzahl auswählen."},
    "obrigado": {"GB": "Thank you", "ES": "Gracias", "FR": "Merci", "DE": "Danke"},
    "ok": {"GB": "OK", "ES": "OK", "FR": "OK", "DE": "OK"},
    "opiniao": {"GB": "Your opinion", "ES": "Su opinión", "FR": "Votre avis", "DE": "Ihre Meinung"},
    "pagamento": {"GB": "Payment", "ES": "Pago", "FR": "Paiement", "DE": "Zahlung"},
    "pagamentoefectuado": {"GB": "Payment completed successfully.", "ES": "El pago se realizó con éxito.", "FR": "Paiement effectué avec succès.", "DE": "Zahlung erfolgreich abgeschlossen."},
    "pedAnterior": {"GB": "Previous Order", "ES": "Pedido anterior", "FR": "Commande précédente", "DE": "Vorherige Bestellung"},
    "pedidoenviado": {"GB": "Order sent. Please wait for staff.", "ES": "Pedido enviado. Por favor espere al camarero.", "FR": "Commande envoyée. Veuillez attendre le serveur.", "DE": "Bestellung gesendet. Bitte auf Mitarbeiter warten."},
    "pedidos": {"GB": "Orders", "ES": "Pedidos", "FR": "Commandes", "DE": "Bestellungen"},
    "pedidosconfirmar": {"GB": "There are still unconfirmed orders.", "ES": "Aún hay pedidos por confirmar.", "FR": "Il y a des commandes non confirmées.", "DE": "Es gibt noch unbestätigte Bestellungen."},
    "pedidospendentes": {"GB": "Pending orders", "ES": "Pedidos pendientes", "FR": "Commandes en attente", "DE": "Ausstehende Bestellungen"},
    "pedidosrealizar": {"GB": "Orders to process", "ES": "Pedidos por realizar", "FR": "Commandes à réaliser", "DE": "Auszuführende Bestellungen"},
    "pedirajuda": {"GB": "Call Staff", "ES": "Pedir ayuda", "FR": "Appeler un serveur", "DE": "Kellner rufen"},
    "pergDose": {"GB": "Product has half portion option.\nWhich do you want to add?", "ES": "Producto con opción de media ración.\n¿Cuál desea añadir?", "FR": "Article avec option demi-portion.\nLequel souhaitez-vous ajouter ?", "DE": "Produkt mit Option für halbe Portion.\nWelche möchten Sie hinzufügen?"},
    "pessoas": {"GB": "Guests", "ES": "Personas", "FR": "Personnes", "DE": "Personen"},
    "picante": {"GB": "Spicy", "ES": "Picante", "FR": "Épicé", "DE": "Scharf"},
    "preparacao": {"GB": "Preparing", "ES": "En preparación", "FR": "En préparation", "DE": "In Zubereitung"},
    "remove": {"GB": "Remove this item from your order?", "ES": "¿Desea eliminar este produto de su pedido?", "FR": "Voulez-vous retirer cet article de la commande ?", "DE": "Möchten Sie dieses Produkt aus der Bestellung entfernen?"},
    "resumo": {"GB": "Summary", "ES": "Resumen", "FR": "Résumé", "DE": "Zusammenfassung"},
    "sair": {"GB": "Exit", "ES": "Salir", "FR": "Quitter", "DE": "Beenden"},
    "sal": {"GB": "Salt-free", "ES": "Sin sal", "FR": "Sans sel", "DE": "Salzfrei"},
    "seguinte": {"GB": "Next", "ES": "Siguiente", "FR": "Suivant", "DE": "Weiter"},
    "semgratificacao": {"GB": "No tip", "ES": "Sin propina", "FR": "Sans pourboire", "DE": "Ohne Trinkgeld"},
    "sugestoes": {"GB": "Suggestions", "ES": "Sugerencias", "FR": "Suggestions", "DE": "Empfehlungen"},
    "taptostart": {"GB": "Tap to view menu", "ES": "Toque para ver el menú", "FR": "Appuyez pour voir le menu", "DE": "Tippen zum Speisekarte anzeigen"},
    "tempo": {"GB": "Prep Time", "ES": "Tiempo", "FR": "Temps", "DE": "Zubereitungszeit"},
    "total": {"GB": "Total", "ES": "Total", "FR": "Total", "DE": "Gesamt"},
    "totPedido": {"GB": "Order Total", "ES": "Total del pedido", "FR": "Total de la commande", "DE": "Bestellsumme"},
    "validarpedido": {"GB": "Validate order", "ES": "Validar pedido", "FR": "Valider la commande", "DE": "Bestellung bestätigen"},
    "vegetariano": {"GB": "Vegetarian", "ES": "Vegetariano", "FR": "Végétarien", "DE": "Vegetarisch"},
    "voltar": {"GB": "Back", "ES": "Volver", "FR": "Retour", "DE": "Zurück"}
}


def auto_populate_general_translations(target_langs: Optional[List[str]] = None) -> Tuple[bool, str, int]:
    """Preenche automaticamente as 82 Traduções Gerais (typeid=0) para os idiomas selecionados (GB, ES, FR, DE)."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        ensure_traducoes_table(cursor)
        schema = _schema(cursor)
        if "ementa_digital_traducoes" not in schema:
            return False, "Tabela dbo.ementa_digital_traducoes não disponível.", 0

        langs = [l.upper() for l in (target_langs or ["GB", "ES", "FR", "DE"])]
        inserted_or_updated = 0

        for field, translations in GENERAL_UI_TRANSLATIONS_DICT.items():
            for c_code in langs:
                val = translations.get(c_code)
                if not val:
                    continue
                cursor.execute("""
                    SELECT 1 FROM dbo.ementa_digital_traducoes
                    WHERE id_country = ? AND typeid = 0 AND id1 = 0 AND id2 = 0 AND field = ?
                """, (c_code, field))
                if cursor.fetchone():
                    cursor.execute("""
                        UPDATE dbo.ementa_digital_traducoes
                        SET value = ?
                        WHERE id_country = ? AND typeid = 0 AND id1 = 0 AND id2 = 0 AND field = ?
                    """, (val, c_code, field))
                    inserted_or_updated += 1
                else:
                    cursor.execute("""
                        INSERT INTO dbo.ementa_digital_traducoes (id_country, typeid, id1, id2, field, value)
                        VALUES (?, 0, 0, 0, ?, ?)
                    """, (c_code, field, val))
                    inserted_or_updated += 1

        conn.commit()
        return True, f"Preenchidas {inserted_or_updated} traduções gerais com sucesso para os idiomas {', '.join(langs)}.", inserted_or_updated
    except Exception as e:
        conn.rollback()
        return False, f"Erro ao preencher traduções gerais: {str(e)}", 0
    finally:
        conn.close()


def import_csv_data(req: EmentaImportCsvRequest) -> EmentaImportResponse:
    """Importa artigos a partir de texto CSV para dbo.produtos e dbo.ementa_digital_produtos."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "ementa_digital_produtos" not in schema:
            return EmentaImportResponse(
                success=False,
                imported_count=0,
                message="A tabela dbo.ementa_digital_produtos não existe nesta base de dados."
            )

        reader = csv.reader(io.StringIO(req.csv_text.strip()))
        rows = [r for r in reader if any(r)]
        if not rows:
            return EmentaImportResponse(
                success=False,
                imported_count=0,
                message="CSV vazio ou inválido."
            )

        header = [c.strip().lower() for c in rows[0]]
        if "família" in header or "familia" in header or "artigo" in header:
            data_rows = rows[1:]
        else:
            data_rows = rows

        if not data_rows:
            return EmentaImportResponse(
                success=False,
                imported_count=0,
                message="Nenhum dado encontrado no CSV."
            )

        family_map = {}
        cursor.execute("SELECT codigo, descricao FROM dbo.familias")
        for code, desc in cursor.fetchall():
            if desc:
                family_map[desc.strip().lower()] = code

        cursor.execute("SELECT ISNULL(MAX(codigo), 0) FROM dbo.familias")
        max_fam_code = cursor.fetchone()[0] or 0

        unique_families = list(dict.fromkeys(r[0].strip() for r in data_rows if len(r) > 0 and r[0].strip()))
        for f_name in unique_families:
            k = f_name.lower()
            if k not in family_map:
                max_fam_code += 1
                family_map[k] = max_fam_code
                try:
                    cursor.execute(
                        "INSERT INTO dbo.familias (id, codigo, descricao, descricao_loja, frontoffice, posicaofront, posicaoprint, fundo, letra, tipo) VALUES (1, ?, ?, ?, 1, NULL, NULL, 8421504, 16777215, 0)",
                        (max_fam_code, f_name, f_name)
                    )
                except Exception:
                    pass

        has_ed_fam = "ementa_digital_familias" in schema
        ed_fam_map = {}
        if has_ed_fam:
            ensure_ementa_digital_hierarchy(cursor)
            cursor.execute("SELECT codigo, descricao FROM dbo.ementa_digital_familias")
            for code, desc in cursor.fetchall():
                if desc:
                    ed_fam_map[desc.strip().lower()] = code
            cursor.execute("SELECT ISNULL(MAX(codigo), 0) FROM dbo.ementa_digital_familias")
            max_ed_fam = cursor.fetchone()[0] or 0
            for f_name in unique_families:
                k = f_name.lower()
                if k not in ed_fam_map:
                    max_ed_fam += 1
                    ed_fam_map[k] = max_ed_fam
                    try:
                        cursor.execute(
                            "INSERT INTO dbo.ementa_digital_familias (codigo, seccao, descricao, visivel, posicao) VALUES (?, 1, ?, 1, ?)",
                            (max_ed_fam, f_name, max_ed_fam)
                        )
                    except Exception:
                        pass

        start_code = req.start_code or 700001
        imported_count = 0

        try:
            codes_to_check = list(range(start_code, start_code + len(data_rows)))
            placeholders = ",".join("?" for _ in codes_to_check)
            cursor.execute(f"SELECT * FROM dbo.ementa_digital_produtos WHERE cod_produto IN ({placeholders})", codes_to_check)
            desc = [c[0].lower() for c in cursor.description]
            prev_snapshot = [dict(zip(desc, row)) for row in cursor.fetchall()]
            create_backup_snapshot(
                products=[],
                description=f"Importação em massa CSV ({len(data_rows)} artigos)",
                ementa_digital=prev_snapshot
            )
        except Exception:
            pass

        for idx, r in enumerate(data_rows):
            code = start_code + idx
            fam_name = r[0].strip() if len(r) > 0 else ""
            artigo_nome = r[1].strip()[:250] if len(r) > 1 else ""
            desc_text = r[2].strip() if len(r) > 2 else ""
            if desc_text in ("—", "-"):
                desc_text = ""
            price_raw = r[3] if len(r) > 3 else "0"
            price_str = price_raw.replace('€', '').replace(',', '.').strip()
            try:
                price_val = float(price_str)
            except ValueError:
                price_val = 0.0

            fam_code = family_map.get(fam_name.lower(), 1)
            ed_fam_code = ed_fam_map.get(fam_name.lower(), fam_code) if has_ed_fam else fam_code

            cursor.execute("SELECT codigo FROM dbo.produtos WHERE codigo = ?", (code,))
            prod_exists = cursor.fetchone()
            if prod_exists:
                cursor.execute(
                    "UPDATE dbo.produtos SET descricao = ?, precovenda = ?, familia = ? WHERE codigo = ?",
                    (artigo_nome, price_val, fam_code, code)
                )
            else:
                pvp_v = float(price_val or 0.0)
                pvp_s = round(pvp_v / 1.23, 4)
                cursor.execute(
                    """
                    INSERT INTO dbo.produtos (
                        id, codigo, descricao, familia, subfam, unidade, iva, fornecedor, foto, precocompra, precovenda, 
                        dataultcompra, ultprecocompra, datacriacao, obs, retalho, composto, ultprecovenda, topo, cozinha, grupo, 
                        referencia, ivacompra, balanca, prodstock, qtdstock, compra, stocks, meiadose, precomeia, qtdmeia, 
                        ordemtop, ordem, ordemlocal, listseparado, codbarras, armazem, tempoprep, maxopcoes, iva2, tara, 
                        prepagamento, fundo, letra, descricaocurta, promocao, percentprom, margembruta, codigopp, revenda, 
                        precorevenda, ivarevenda, autoquebra, pvp2, pvp3, pvp4, pvp5, pvpmeia2, pvpmeia3, pvpmeia4, pvpmeia5, 
                        consumominimo, precominimo, excluirdescontos, vendersemstock, dosedesc, meiadosedesc, restricted, 
                        pvp6, pvp7, pvp8, pvp9, pvp10, pvpmeia6, pvpmeia7, pvpmeia8, pvpmeia9, pvpmeia10, categoria, subcategoria, 
                        retencao, percentagemretencao, isencao, pvp1siva, pvp2siva, pvp3siva, pvp4siva, pvp5siva, pvp6siva, pvp7siva, 
                        pvp8siva, pvp9siva, pvp10siva, pvpmeia1siva, pvpmeia2siva, pvpmeia3siva, pvpmeia4siva, pvpmeia5siva, 
                        pvpmeia6siva, pvpmeia7siva, pvpmeia8siva, pvpmeia9siva, pvpmeia10siva, tiposaft, uncompra, uninventario, 
                        ordempedido, image_url, min_complementos, max_complementos, codigo_alf, edicao, transferivel, politicapreco, unrelacao
                    ) VALUES (
                        1, ?, ?, ?, 0, 1, 23.0000, 0, CONVERT(VARBINARY, ''), 0.0000, ?, 
                        '1899-12-30 00:00:00.000', 0.0000, GETDATE(), '', 1, 0, 0.0000, 0, 0, 0, 
                        '', 23.0000, 0, ?, 1.0000, 0, 1, 0, 0.0000, 0.0000, 
                        9999, ?, 9999, 0, '', 0, '1899-12-30 00:00:00.000', 0, 23.0000, 0.0000, 
                        0, 12632256, 16777215, '', 0, 0.0000, 0.0000, 0, 0, 
                        0.0000, 23.0000, 0, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 
                        0, 0.0000, 0, 1, '', '', 0, 
                        0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0, 0, 
                        0, 0.0000, '', ?, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 
                        0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 'P', 1, 1, 
                        0, NULL, 0.0000, 0.0000, 0, 0, 1, 0, 0
                    )
                    """,
                    (code, artigo_nome, fam_code, pvp_v, code, idx + 1, pvp_s)
                )

            try:
                cursor.execute("IF NOT EXISTS (SELECT 1 FROM dbo.produtosfamilias WHERE produto = ? AND familia = ?) INSERT INTO dbo.produtosfamilias (produto, familia) VALUES (?, ?)", (code, fam_code, code, fam_code))
            except Exception:
                pass

            try:
                cursor.execute("INSERT INTO dbo.produtos_historico (codigo, user_alt, op_alt, web_alt, api_alt, datahora, tipo, sync) VALUES (?, 1, NULL, NULL, NULL, GETDATE(), 1, 0)", (code,))
            except Exception:
                pass

            cursor.execute("SELECT cod_produto FROM dbo.ementa_digital_produtos WHERE cod_produto = ?", (code,))
            ed_exists = cursor.fetchone()
            if ed_exists:
                cursor.execute(
                    "UPDATE dbo.ementa_digital_produtos SET produto = ?, descricao = ?, familia = ?, visivel = ?, posicao = ? WHERE cod_produto = ?",
                    (artigo_nome, desc_text, ed_fam_code, 1, idx + 1, code)
                )
            else:
                cursor.execute(
                    "INSERT INTO dbo.ementa_digital_produtos (cod_produto, familia, produto, descricao, visivel, posicao) VALUES (?, ?, ?, ?, 1, ?)",
                    (code, ed_fam_code, artigo_nome, desc_text, idx + 1)
                )

            imported_count += 1

        conn.commit()
        return EmentaImportResponse(
            success=True,
            imported_count=imported_count,
            message=f"{imported_count} artigos importados com sucesso com códigos entre {start_code} e {start_code + imported_count - 1}."
        )
    except Exception as e:
        conn.rollback()
        return EmentaImportResponse(
            success=False,
            imported_count=0,
            message=f"Erro ao importar CSV: {str(e)}"
        )
    finally:
        conn.close()

