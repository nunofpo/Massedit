import os
import re
import json
import mimetypes
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

from backend.db import db_manager, get_app_dir
from backend.models import (
    EmentaProductItem, EmentaProductFilter, EmentaProductResponse,
    EmentaImportFromPosRequest, EmentaImportResponse,
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
        for tbl in ["ementa_digital_produtos", "ementa_digital_traducoes", "ementa_digital_paises", "ementa_digital_familias"]:
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
            "tables": tables_info
        }
    finally:
        conn.close()


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

        if filter_req.has_ementa_filter == "with_ementa":
            conditions.append("ed.cod_produto IS NOT NULL")
        elif filter_req.has_ementa_filter == "without_ementa":
            conditions.append("ed.cod_produto IS NULL")

        if filter_req.visivel_filter == "visible":
            conditions.append("(ed.cod_produto IS NOT NULL AND ed.visivel = 1)")
        elif filter_req.visivel_filter == "hidden":
            conditions.append("(ed.cod_produto IS NOT NULL AND ed.visivel = 0)")

        where_clause = " AND ".join(conditions)

        # Contagem total
        count_sql = f"""
            SELECT COUNT(*)
            FROM dbo.produtos p
            LEFT JOIN dbo.ementa_digital_produtos ed ON p.codigo = ed.cod_produto
            WHERE {where_clause}
        """ if has_ementa else f"""
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

        query_sql = f"""
            SELECT p.codigo,
                   ISNULL(p.descricao, ''),
                   p.familia,
                   ISNULL(f.descricao, ''),
                   p.subfam,
                   ISNULL(sf.descricao, ''),
                   ISNULL(p.precovenda, 0.0),
                   CASE WHEN ed.cod_produto IS NOT NULL THEN 1 ELSE 0 END,
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
                   { "ISNULL(ed.tempo, 0)" if has_tempo else "0" }
            FROM dbo.produtos p
            LEFT JOIN dbo.familias f ON p.familia = f.codigo
            LEFT JOIN dbo.subfamilias sf ON p.subfam = sf.codigo
            LEFT JOIN dbo.ementa_digital_produtos ed ON p.codigo = ed.cod_produto
            WHERE {where_clause}
            ORDER BY p.codigo ASC
            OFFSET {offset} ROWS FETCH NEXT {filter_req.page_size} ROWS ONLY
        """ if has_ementa else f"""
            SELECT p.codigo,
                   ISNULL(p.descricao, ''),
                   p.familia,
                   ISNULL(f.descricao, ''),
                   p.subfam,
                   ISNULL(sf.descricao, ''),
                   ISNULL(p.precovenda, 0.0),
                   0, '', '', 0, 0, 0, '', 0, 0, 0, 0, 0, 0, 0
            FROM dbo.produtos p
            LEFT JOIN dbo.familias f ON p.familia = f.codigo
            LEFT JOIN dbo.subfamilias sf ON p.subfam = sf.codigo
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
                tempo=int(row[20] or 0)
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

        if not req.overwrite:
            where_parts.append("ed.cod_produto IS NULL")

        where_sql = " AND ".join(where_parts)
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
        for code, pos_name, pos_short, fam, ordem in to_import:
            # Verifica se já existe
            cursor.execute("SELECT cod_produto FROM dbo.ementa_digital_produtos WHERE cod_produto = ?", (code,))
            existing = cursor.fetchone()

            menu_name = (pos_name or "").strip()[:250]
            menu_desc = (pos_short or "").strip()

            if existing:
                if req.overwrite:
                    update_sql = f"UPDATE dbo.ementa_digital_produtos SET produto = ?, familia = ?, visivel = ? WHERE cod_produto = ?"
                    cursor.execute(update_sql, (menu_name, fam, req.default_visivel, code))
                    imported_count += 1
            else:
                vals = [code, fam, menu_name, menu_desc, req.default_visivel, ordem or 0]
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

        if update_data.produto is not None:
            sets.append("produto = ?")
            params.append(update_data.produto.strip()[:250])
        if update_data.descricao is not None:
            sets.append("descricao = ?")
            params.append(update_data.descricao.strip())
        if update_data.visivel is not None:
            sets.append("visivel = ?")
            params.append(update_data.visivel)
        if update_data.highlight is not None and "highlight" in ed_cols:
            sets.append("highlight = ?")
            params.append(update_data.highlight)

        for f, val in [
            ("gluten", update_data.gluten),
            ("lactose", update_data.lactose),
            ("vegetariano", update_data.vegetariano),
            ("picante", update_data.picante),
            ("sal", update_data.sal),
            ("calorias", update_data.calorias),
            ("tempo", update_data.tempo),
        ]:
            if val is not None and f in ed_cols:
                sets.append(f"{f} = ?")
                params.append(val)

        if not prev_data:
            cursor.execute("SELECT familia, descricao, descricaocurta, ordem FROM dbo.produtos WHERE codigo = ?", (cod_produto,))
            pos_info = cursor.fetchone()
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
    {"id": "EN", "name": "Inglês 🇬🇧", "code": "en"},
    {"id": "ES", "name": "Espanhol 🇪🇸", "code": "es"},
    {"id": "FR", "name": "Francês 🇫🇷", "code": "fr"},
    {"id": "DE", "name": "Alemão 🇩🇪", "code": "de"},
]


# Dicionário gastronómico português especializado para restauração
CULINARY_DICTIONARY: Dict[str, Dict[str, str]] = {
    # Pratos e ingredientes típicos
    "bacalhau a bras": {
        "en": "Salt cod with shredded potatoes, onions and scrambled eggs",
        "es": "Bacalao dorado con patatas paja y huevos revueltos",
        "fr": "Morue à la Brás aux pommes paille et œufs brouillés",
        "de": "Stockfisch nach Brás-Art mit Kartoffelstroh und Rührei"
    },
    "bacalhau com broa": {
        "en": "Baked salt cod topped with cornbread crust",
        "es": "Bacalao al horno con costra de pan de maíz",
        "fr": "Morue au four en croûte de pain de maïs",
        "de": "Überbackener Stockfisch mit Maisbrotkruste"
    },
    "bacalhau com natas": {
        "en": "Salt cod gratin with potatoes and cream",
        "es": "Bacalao gratinado con patatas y nata",
        "fr": "Gratin de morue aux pommes de terre et crème",
        "de": "Stockfisch-Gratin mit Kartoffeln und Sahne"
    },
    "polvo a lagareiro": {
        "en": "Roasted octopus with smashed potatoes and garlic olive oil",
        "es": "Pulpo al horno con patatas machacadas y aceite de oliva",
        "fr": "Poulpe rôti à l'huile d'olive et pommes de terre écrasées",
        "de": "Gegrillter Oktopus mit Ofenkartoffeln und Knoblauch-Olivenöl"
    },
    "francesinha": {
        "en": "Porto-style Francesinha sandwich with melted cheese and spicy beer sauce",
        "es": "Francesinha estilo Oporto con queso fundido y salsa picante",
        "fr": "Sandwich Francesinha gratiné à la sauce piquante à la bière",
        "de": "Francesinha-Sandwich mit geschmolzenem Käse und Biersauce"
    },
    "bitoque": {
        "en": "Minute steak with fried egg, french fries and rice",
        "es": "Filete de ternera con huevo frito, patatas fritas y arroz",
        "fr": "Steak minute surmonté d'un œuf au plat, frites et riz",
        "de": "Minutensteak mit Spiegelei, Pommes Frites und Reis"
    },
    "bife da vazia": {
        "en": "Sirloin steak",
        "es": "Bife de chorizo / Entrecot",
        "fr": "Entrecôte de bœuf",
        "de": "Rumpsteak"
    },
    "bife do lombo": {
        "en": "Beef tenderloin fillet",
        "es": "Solomillo de ternera",
        "fr": "Filet de bœuf",
        "de": "Rinderfilet"
    },
    "arroz de marisco": {
        "en": "Seafood stew with rice",
        "es": "Arroz caldoso de marisco",
        "fr": "Riz aux fruits de mer en sauce",
        "de": "Meeresfrüchte-Reiseintopf"
    },
    "arroz de tamboril": {
        "en": "Monkfish and prawn rice stew",
        "es": "Arroz caldoso de rape con langostinos",
        "fr": "Riz crémeux à la lotte et crevettes",
        "de": "Seeteufel-Reiseintopf"
    },
    "sopa do dia": {
        "en": "Soup of the day",
        "es": "Sopa del día",
        "fr": "Soupe du jour",
        "de": "Tagessuppe"
    },
    "caldo verde": {
        "en": "Traditional kale and potato soup with chorizo",
        "es": "Caldo verde tradicional con col rizada y chorizo",
        "fr": "Bouillon vert traditionnel au chou frisé et chorizo",
        "de": "Traditionelle Grünkohlsuppe mit Chouriço"
    },
    "prego no prato": {
        "en": "Sirloin steak on the plate with fried egg and fries",
        "es": "Bistec al plato con huevo frito y patatas",
        "fr": "Steak minute à l'assiette avec œuf au plat et frites",
        "de": "Rindersteak auf dem Teller mit Spiegelei und Pommes"
    },
    "prego no pao": {
        "en": "Traditional garlic steak sandwich",
        "es": "Bocadillo de ternera al ajo",
        "fr": "Sandwich au steak et à l'ail",
        "de": "Rindersteak-Sandwich mit Knoblauch"
    },
    "mousse de chocolate": {
        "en": "Chocolate mousse",
        "es": "Mousse de chocolate",
        "fr": "Mousse au chocolat",
        "de": "Schokoladenmousse"
    },
    "pudim de ovos": {
        "en": "Egg caramel flan",
        "es": "Flan de huevo",
        "fr": "Flan aux œufs et caramel",
        "de": "Eier-Karamellpudding"
    },

    # Termos gerais, confeções e carnes/peixes
    "grelhado": {"en": "grilled", "es": "a la parrilla", "fr": "grillé", "de": "gegrillt"},
    "grelhada": {"en": "grilled", "es": "a la parrilla", "fr": "grillée", "de": "gegrillt"},
    "assado": {"en": "roasted", "es": "asado", "fr": "rôti", "de": "gebraten"},
    "assada": {"en": "roasted", "es": "asada", "fr": "rôtie", "de": "gebraten"},
    "cozido": {"en": "boiled / stewed", "es": "cocido", "fr": "bouilli / mijoté", "de": "gekocht"},
    "frito": {"en": "fried", "es": "frito", "fr": "frit", "de": "gebraten / frittiert"},
    "frita": {"en": "fried", "es": "frita", "fr": "frite", "de": "frittiert"},
    "fritas": {"en": "french fries", "es": "patatas fritas", "fr": "frites", "de": "Pommes Frites"},
    "salada": {"en": "salad", "es": "ensalada", "fr": "salade", "de": "Salat"},
    "legumes": {"en": "vegetables", "es": "verduras", "fr": "légumes", "de": "Gemüse"},
    "arroz": {"en": "rice", "es": "arroz", "fr": "riz", "de": "Reis"},
    "batata": {"en": "potato", "es": "patata", "fr": "pomme de terre", "de": "Kartoffel"},
    "carne": {"en": "meat", "es": "carne", "fr": "viande", "de": "Fleisch"},
    "vaca": {"en": "beef", "es": "ternera", "fr": "bœuf", "de": "Rindfleisch"},
    "porco": {"en": "pork", "es": "cerdo", "fr": "porc", "de": "Schweinefleisch"},
    "frango": {"en": "chicken", "es": "pollo", "fr": "poulet", "de": "Hähnchen"},
    "peixe": {"en": "fish", "es": "pescado", "fr": "poisson", "de": "Fisch"},
    "salmao": {"en": "salmon", "es": "salmón", "fr": "saumon", "de": "Lachs"},
    "dourada": {"en": "sea bream", "es": "dorada", "fr": "dorade", "de": "Dorade"},
    "robalo": {"en": "sea bass", "es": "lubina", "fr": "bar", "de": "Wolfsbarsch"},
    "sardinha": {"en": "sardine", "es": "sardina", "fr": "sardine", "de": "Sardine"},
    "gambas": {"en": "prawns", "es": "gambas", "fr": "crevettes", "de": "Garnelen"},
    "camarao": {"en": "shrimp / prawn", "es": "langostino / gamba", "fr": "crevette", "de": "Garnele"},
    "sobremesa": {"en": "dessert", "es": "postre", "fr": "dessert", "de": "Dessert"},
    "agua": {"en": "water", "es": "agua", "fr": "eau", "de": "Wasser"},
    "batata frita": {"en": "french fries", "es": "patatas fritas", "fr": "frites", "de": "Pommes Frites"},
    "batatas fritas": {"en": "french fries", "es": "patatas fritas", "fr": "frites", "de": "Pommes Frites"},
    "batatas a murro": {"en": "punched roasted potatoes", "es": "patatas asadas aplastadas", "fr": "pommes de terre écrasées", "de": "Quetschkartoffeln"},
    "com": {"en": "with", "es": "con", "fr": "avec", "de": "mit"},
    "e": {"en": "and", "es": "y", "fr": "et", "de": "und"},
    "molho": {"en": "sauce", "es": "salsa", "fr": "sauce", "de": "Sauce"},
    "queijo": {"en": "cheese", "es": "queso", "fr": "fromage", "de": "Käse"},
    "presunto": {"en": "cured ham", "es": "jamón serrano", "fr": "jambon cru", "de": "Schinken"},
    "fiambre": {"en": "ham", "es": "jamón cocido", "fr": "jambon blanc", "de": "Kochschinken"},
    "ovo": {"en": "egg", "es": "huevo", "fr": "œuf", "de": "Ei"},
    "azeite": {"en": "olive oil", "es": "aceite de oliva", "fr": "huile d'olive", "de": "Olivenöl"},
    "alho": {"en": "garlic", "es": "ajo", "fr": "ail", "de": "Knoblauch"},
    "cebola": {"en": "onion", "es": "cebolla", "fr": "oignon", "de": "Zwiebel"},
    "tomate": {"en": "tomato", "es": "tomate", "fr": "tomate", "de": "Tomate"},
    "marisco": {"en": "seafood", "es": "marisco", "fr": "fruits de mer", "de": "Meeresfrüchte"},
    "ameijoas": {"en": "clams", "es": "almejas", "fr": "palourdes", "de": "Muscheln"},
    "vinho da casa": {"en": "house wine", "es": "vino de la casa", "fr": "vin de la maison", "de": "Hauswein"},
    "sobremesa do dia": {"en": "dessert of the day", "es": "postre del día", "fr": "dessert du jour", "de": "Dessert des Tages"},
    "pao": {"en": "bread", "es": "pan", "fr": "pain", "de": "Brot"},
    "manteiga": {"en": "butter", "es": "mantequilla", "fr": "beurre", "de": "Butter"},
    "azeitonas": {"en": "olives", "es": "aceitunas", "fr": "olives", "de": "Oliven"},
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


def translate_menu_texts(req: EmentaTranslateRequest) -> EmentaTranslateResponse:
    """Gera traduções automáticas para artigos e descrições gastronómicas."""
    results: Dict[str, Dict[str, str]] = {}

    target_langs = [l.lower() for l in req.target_langs]
    sorted_terms = sorted(CULINARY_DICTIONARY.keys(), key=len, reverse=True)
    combined_pattern = re.compile(
        '|'.join(_build_accent_regex(t) for t in sorted_terms if len(t) > 2 or t in ("e", "com")),
        flags=re.IGNORECASE
    )

    for text in req.texts:
        if not text or not text.strip():
            continue

        raw = text.strip()
        cleaned = _clean_key(raw)
        tr_map: Dict[str, str] = {}

        # 1. Correspondência direta ou exata no dicionário gastronómico
        if cleaned in CULINARY_DICTIONARY:
            for lang in target_langs:
                tr_map[lang] = CULINARY_DICTIONARY[cleaned].get(lang, raw)
        else:
            # 2. Heurística composta por substituição num único passo (evita re-substituições)
            for lang in target_langs:
                def replacer(match):
                    m_text = match.group(0)
                    k = _clean_key(m_text)
                    val = CULINARY_DICTIONARY.get(k, {}).get(lang)
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

    return EmentaTranslateResponse(translations=results)


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
            WHERE id1 = ? AND typeid = 1
        """, (cod_produto,))

        translations: Dict[str, Dict[str, str]] = {}
        for row in cursor.fetchall():
            country = (row[0] or "").upper()
            field = row[1] or ""
            val = row[2] or ""
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

        # Para cada idioma e campo, faz UPSERT
        for country, fields in req.translations.items():
            c_code = country.upper()
            for field, val in fields.items():
                if not val or not str(val).strip():
                    cursor.execute("""
                        DELETE FROM dbo.ementa_digital_traducoes
                        WHERE id_country = ? AND typeid = 1 AND id1 = ? AND id2 = 0 AND field = ?
                    """, (c_code, req.cod_produto, field))
                else:
                    cursor.execute("""
                        SELECT 1 FROM dbo.ementa_digital_traducoes
                        WHERE id_country = ? AND typeid = 1 AND id1 = ? AND id2 = 0 AND field = ?
                    """, (c_code, req.cod_produto, field))
                    if cursor.fetchone():
                        cursor.execute("""
                            UPDATE dbo.ementa_digital_traducoes
                            SET value = ?
                            WHERE id_country = ? AND typeid = 1 AND id1 = ? AND id2 = 0 AND field = ?
                        """, (val, c_code, req.cod_produto, field))
                    else:
                        cursor.execute("""
                            INSERT INTO dbo.ementa_digital_traducoes (id_country, typeid, id1, id2, field, value)
                            VALUES (?, 1, ?, 0, ?, ?)
                        """, (c_code, req.cod_produto, field, val))

        conn.commit()
        return True, "Traduções gravadas com sucesso."
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao gravar traduções: {str(e)}"
    finally:
        conn.close()
