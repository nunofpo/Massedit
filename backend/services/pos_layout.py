import math
from typing import List, Dict, Any, Optional, Tuple

from backend.models import (
    PosLayoutProductItem, PosLayoutApplyRequest,
    BulkEditPreviewResponse, ProductDiff, FieldDiff, ProductItem
)
from backend.db import db_manager, int_color_to_hex, is_valid_hex_color, SchemaInfo
from backend.services.products import (
    _schema, _prod_cols, _fetch_products_by_codes, _apply_changes,
    create_backup_snapshot, Change, _unique_codes
)


def _relative_luminance(hex_color: str) -> float:
    """Calcula a luminância relativa WCAG 2.1 para uma cor hexadecimal #RRGGBB."""
    if not is_valid_hex_color(hex_color):
        return 0.0
    hex_clean = hex_color.lstrip("#")
    try:
        r = int(hex_clean[0:2], 16) / 255.0
        g = int(hex_clean[2:4], 16) / 255.0
        b = int(hex_clean[4:6], 16) / 255.0
    except Exception:
        return 0.0

    def adjust(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b)


def is_low_contrast(fundo_hex: str, letra_hex: str) -> bool:
    """Retorna True se o ratio de contraste for inferior a 3:1 (limiar de legibilidade para botões POS)."""
    l1 = _relative_luminance(fundo_hex)
    l2 = _relative_luminance(letra_hex)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    ratio = (lighter + 0.05) / (darker + 0.05)
    return ratio < 3.0


def get_pos_layout_products(familia: int, include_hidden: bool = False) -> List[PosLayoutProductItem]:
    """Obtém os artigos de uma família ordenados por ISNULL(ordem, 0) ASC, codigo ASC."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        prod_cols = _prod_cols(schema)

        has_bloqueado = "bloqueado" in prod_cols
        has_frontoffice = "frontoffice" in prod_cols
        has_ordem = "ordem" in prod_cols
        has_fundo = "fundo" in prod_cols
        has_letra = "letra" in prod_cols
        has_desc_curta = "descricaocurta" in prod_cols
        has_subfam = "subfam" in prod_cols

        bloqueado_col = "ISNULL(p.bloqueado, 0)" if has_bloqueado else "0"
        frontoffice_col = "ISNULL(p.frontoffice, 1)" if has_frontoffice else "1"
        ordem_col = "ISNULL(p.ordem, 0)" if has_ordem else "0"
        fundo_col = "ISNULL(p.fundo, 0)" if has_fundo else "0"
        letra_col = "ISNULL(p.letra, 16777215)" if has_letra else "16777215"
        desc_curta_col = "p.descricaocurta" if has_desc_curta else "''"
        subfam_col = "p.subfam" if has_subfam else "NULL"

        where_conds = ["p.familia = ?"]
        params: List[Any] = [familia]

        if not include_hidden:
            if has_bloqueado:
                where_conds.append("ISNULL(p.bloqueado, 0) = 0")
            if has_frontoffice:
                where_conds.append("ISNULL(p.frontoffice, 1) = 1")

        query = f"""
            SELECT
                p.codigo,
                ISNULL(p.descricao, '') AS descricao,
                ISNULL({desc_curta_col}, '') AS descricaocurta,
                {fundo_col} AS fundo,
                {letra_col} AS letra,
                {ordem_col} AS ordem,
                ISNULL(p.precovenda, 0.0) AS pvp1,
                {bloqueado_col} AS bloqueado,
                {frontoffice_col} AS frontoffice,
                {subfam_col} AS subfamilia,
                ISNULL(sf.descricao, '') AS subfamilia_desc
            FROM dbo.produtos p
            LEFT JOIN dbo.subfamilias sf ON sf.codigo = {subfam_col}
            WHERE {' AND '.join(where_conds)}
            ORDER BY {ordem_col} ASC, p.codigo ASC
        """
        cursor.execute(query, params)
        rows = cursor.fetchall()
    finally:
        conn.close()

    result: List[PosLayoutProductItem] = []
    for r in rows:
        fundo_h = int_color_to_hex(r[3])
        letra_h = int_color_to_hex(r[4])
        result.append(PosLayoutProductItem(
            codigo=int(r[0]),
            descricao=r[1] or "",
            descricaocurta=r[2] or "",
            fundo_hex=fundo_h,
            letra_hex=letra_h,
            ordem=int(r[5] or 0),
            pvp1=float(r[6] or 0.0),
            bloqueado=int(r[7] or 0),
            frontoffice=int(r[8] or 1),
            subfamilia=int(r[9]) if r[9] is not None else None,
            subfamilia_desc=r[10] or "",
            low_contrast=is_low_contrast(fundo_h, letra_h)
        ))
    return result


def _compute_pos_layout_changes(
    cursor,
    req: PosLayoutApplyRequest
) -> Tuple[List[Tuple[ProductItem, List[Change]]], str]:
    """Calcula as alterações de ordem para a família com validações estritas."""
    codes = _unique_codes(req.order)
    if len(codes) != len(req.order):
        raise ValueError("A lista de códigos contém elementos duplicados.")
    if req.step < 1:
        raise ValueError("O passo de numeração (step) deve ser pelo menos 1.")

    # Obter nome da família
    cursor.execute("SELECT descricao FROM dbo.familias WHERE codigo = ?", (req.familia,))
    fam_row = cursor.fetchone()
    fam_desc = fam_row[0] if fam_row and fam_row[0] else f"#{req.familia}"

    if not codes:
        return [], fam_desc

    products = _fetch_products_by_codes(cursor, codes, with_sales=False, with_centros=False)
    prod_by_code: Dict[int, ProductItem] = {p.codigo: p for p in products}

    # Validação: todos os códigos pertencem à família?
    for c in codes:
        p = prod_by_code.get(c)
        if not p:
            raise ValueError(f"O artigo #{c} não foi encontrado na base de dados.")
        if p.familias != req.familia:
            raise ValueError(f"O artigo #{c} ('{p.descricao}') não pertence à família {fam_desc} (#{req.familia}).")

    plan: List[Tuple[ProductItem, List[Change]]] = []
    for idx, code in enumerate(codes):
        p = prod_by_code[code]
        new_order = (idx + 1) * req.step
        old_order = int(p.posicaofront or 0)
        if new_order != old_order:
            ch = Change(
                field_name="posicaofront",
                label="Posição POS",
                old=old_order,
                new=new_order,
                column="ordem",
                value=new_order
            )
            plan.append((p, [ch]))

    return plan, fam_desc


def preview_pos_layout(req: PosLayoutApplyRequest) -> BulkEditPreviewResponse:
    """Gera a simulação (dry-run) das alterações de ordem dos botões POS."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        plan, fam_desc = _compute_pos_layout_changes(cursor, req)
    finally:
        conn.close()

    previews: List[ProductDiff] = []
    for p, changes in plan:
        previews.append(ProductDiff(
            codigo=p.codigo,
            descricao=p.descricao,
            has_sales=p.has_sales,
            diffs=[c.to_diff() for c in changes]
        ))

    return BulkEditPreviewResponse(
        total_selected=len(req.order),
        total_affected=len(plan),
        blocked_descriptions_count=0,
        previews=previews
    )


def apply_pos_layout(req: PosLayoutApplyRequest) -> Tuple[bool, str, int]:
    """Aplica a nova ordenação dos botões POS com backup e transação atómica."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        try:
            plan, fam_desc = _compute_pos_layout_changes(cursor, req)
        except ValueError as ve:
            return False, str(ve), 0

        if not plan:
            return True, "A ordem dos botões já corresponde à pretendida. Nenhuma alteração foi necessária.", 0

        # Backup obrigatório
        affected_prods = [p for p, _ in plan]
        try:
            backup_name = create_backup_snapshot(
                affected_prods,
                f"Reordenação POS — família {fam_desc}"
            )
        except Exception as e:
            return False, f"Não foi possível criar a cópia de segurança ({e}). Nenhuma alteração foi gravada.", 0

        # Transação atómica
        try:
            affected_count = 0
            for p, changes in plan:
                if _apply_changes(cursor, schema, p.codigo, changes, req.mark_cloud_sync):
                    affected_count += 1
            conn.commit()
        except Exception as e:
            conn.rollback()
            return False, f"Erro ao aplicar reordenação na base de dados (transação revertida): {str(e)}", 0

        msg = (f"Reordenação de {affected_count} botão(ões) da família '{fam_desc}' "
               f"gravada com sucesso na base de dados! (Backup: {backup_name})")
        return True, msg, affected_count
    finally:
        conn.close()
