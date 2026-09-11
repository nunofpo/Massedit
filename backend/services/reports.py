from typing import List, Dict, Any, Optional, Tuple
from backend.db import db_manager, SchemaInfo
from backend.models import DataQualityCheck, DataQualityGroup


def _has_table(schema: SchemaInfo, table: str) -> bool:
    return table.lower() in schema


def _has_col(schema: SchemaInfo, table: str, col: str) -> bool:
    t = schema.get(table.lower())
    return bool(t and col.lower() in t)


def _cap_codes(codes: List[int], max_codes: int = 5000) -> Tuple[List[int], bool]:
    if len(codes) > max_codes:
        return codes[:max_codes], True
    return codes, False


# 1. Códigos de barras repetidos
def check_duplicate_barcode(cursor, schema: SchemaInfo) -> DataQualityCheck:
    check_id = "duplicate_barcode"
    title = "Códigos de barras repetidos"
    desc = "O mesmo código de barras está atribuído a mais do que um artigo."
    if not _has_col(schema, "produtos", "codbarras"):
        return DataQualityCheck(
            id=check_id, title=title, description=desc, severity="error",
            count=0, codes=[], available=False,
            unavailable_reason="A coluna 'codbarras' não existe na tabela dbo.produtos."
        )

    sql = """
        SELECT p.codigo, LTRIM(RTRIM(p.codbarras)) AS val
        FROM dbo.produtos p
        JOIN (
            SELECT LTRIM(RTRIM(codbarras)) AS dup_val
            FROM dbo.produtos
            WHERE codbarras IS NOT NULL AND LTRIM(RTRIM(codbarras)) <> ''
            GROUP BY LTRIM(RTRIM(codbarras))
            HAVING COUNT(*) > 1
        ) d ON LTRIM(RTRIM(p.codbarras)) = d.dup_val
        ORDER BY d.dup_val, p.codigo
    """
    cursor.execute(sql)
    rows = cursor.fetchall()
    groups_dict: Dict[str, List[int]] = {}
    all_codes: List[int] = []
    for code_raw, key_raw in rows:
        code = int(code_raw)
        key = str(key_raw or "").strip()
        groups_dict.setdefault(key, []).append(code)
        all_codes.append(code)

    capped, truncated = _cap_codes(all_codes)
    groups = [DataQualityGroup(key=k, codes=v) for k, v in groups_dict.items()]
    return DataQualityCheck(
        id=check_id, title=title, description=desc, severity="error",
        count=len(all_codes), codes=capped, groups=groups,
        available=True, truncated=truncated
    )


# 2. PLUs repetidos
def check_duplicate_plu(cursor, schema: SchemaInfo) -> DataQualityCheck:
    check_id = "duplicate_plu"
    title = "Códigos PLU repetidos"
    desc = "O mesmo código PLU (balança/teclado) está associado a mais do que um artigo."
    if not _has_col(schema, "produtos", "codigo_alf"):
        return DataQualityCheck(
            id=check_id, title=title, description=desc, severity="error",
            count=0, codes=[], available=False,
            unavailable_reason="A coluna 'codigo_alf' (PLU) não existe na tabela dbo.produtos."
        )

    sql = """
        SELECT p.codigo, p.codigo_alf
        FROM dbo.produtos p
        JOIN (
            SELECT codigo_alf
            FROM dbo.produtos
            WHERE codigo_alf IS NOT NULL AND codigo_alf > 0
            GROUP BY codigo_alf
            HAVING COUNT(*) > 1
        ) d ON p.codigo_alf = d.codigo_alf
        ORDER BY d.codigo_alf, p.codigo
    """
    cursor.execute(sql)
    rows = cursor.fetchall()
    groups_dict: Dict[str, List[int]] = {}
    all_codes: List[int] = []
    for code_raw, plu_raw in rows:
        code = int(code_raw)
        key = f"PLU #{int(plu_raw)}"
        groups_dict.setdefault(key, []).append(code)
        all_codes.append(code)

    capped, truncated = _cap_codes(all_codes)
    groups = [DataQualityGroup(key=k, codes=v) for k, v in groups_dict.items()]
    return DataQualityCheck(
        id=check_id, title=title, description=desc, severity="error",
        count=len(all_codes), codes=capped, groups=groups,
        available=True, truncated=truncated
    )


# 3. Família em falta ou inválida
def check_missing_family(cursor, schema: SchemaInfo) -> DataQualityCheck:
    check_id = "missing_family"
    title = "Família em falta ou inexistente"
    desc = "Artigos sem família atribuída (nula ou 0) ou cuja família não existe em dbo.familias."
    if not _has_col(schema, "produtos", "familia") or not _has_table(schema, "familias"):
        return DataQualityCheck(
            id=check_id, title=title, description=desc, severity="error",
            count=0, codes=[], available=False,
            unavailable_reason="A tabela dbo.familias ou a coluna 'familia' não existem."
        )

    sql = """
        SELECT p.codigo
        FROM dbo.produtos p
        WHERE p.familia IS NULL OR p.familia = 0
           OR NOT EXISTS (SELECT 1 FROM dbo.familias f WHERE f.codigo = p.familia)
        ORDER BY p.codigo
    """
    cursor.execute(sql)
    codes = [int(r[0]) for r in cursor.fetchall()]
    capped, truncated = _cap_codes(codes)
    return DataQualityCheck(
        id=check_id, title=title, description=desc, severity="error",
        count=len(codes), codes=capped, available=True, truncated=truncated
    )


# 4. Subfamília inexistente
def check_missing_subfamily(cursor, schema: SchemaInfo) -> DataQualityCheck:
    check_id = "missing_subfamily"
    title = "Subfamília inexistente"
    desc = "Artigos com subfamília preenchida (> 0) que não existe na tabela dbo.subfamilias."
    if not _has_col(schema, "produtos", "subfam") or not _has_table(schema, "subfamilias"):
        return DataQualityCheck(
            id=check_id, title=title, description=desc, severity="warning",
            count=0, codes=[], available=False,
            unavailable_reason="A tabela dbo.subfamilias ou a coluna 'subfam' não existem."
        )

    sql = """
        SELECT p.codigo
        FROM dbo.produtos p
        WHERE p.subfam IS NOT NULL AND p.subfam > 0
          AND NOT EXISTS (SELECT 1 FROM dbo.subfamilias sf WHERE sf.codigo = p.subfam)
        ORDER BY p.codigo
    """
    cursor.execute(sql)
    codes = [int(r[0]) for r in cursor.fetchall()]
    capped, truncated = _cap_codes(codes)
    return DataQualityCheck(
        id=check_id, title=title, description=desc, severity="warning",
        count=len(codes), codes=capped, available=True, truncated=truncated
    )


# 5. Subfamília pertencente a outra família
def check_subfamily_wrong_family(cursor, schema: SchemaInfo) -> DataQualityCheck:
    check_id = "subfamily_wrong_family"
    title = "Subfamília de outra família"
    desc = "A subfamília do artigo está associada a uma família diferente da família do próprio artigo."
    if not (_has_col(schema, "produtos", "subfam") and _has_col(schema, "produtos", "familia")
            and _has_table(schema, "subfamilias") and _has_col(schema, "subfamilias", "familia")):
        return DataQualityCheck(
            id=check_id, title=title, description=desc, severity="warning",
            count=0, codes=[], available=False,
            unavailable_reason="Colunas 'familia'/'subfam' ou tabela dbo.subfamilias inexistentes."
        )

    sql = """
        SELECT p.codigo
        FROM dbo.produtos p
        JOIN dbo.subfamilias sf ON p.subfam = sf.codigo
        WHERE p.subfam IS NOT NULL AND p.subfam > 0
          AND (p.familia IS NULL OR sf.familia <> p.familia)
        ORDER BY p.codigo
    """
    cursor.execute(sql)
    codes = [int(r[0]) for r in cursor.fetchall()]
    capped, truncated = _cap_codes(codes)
    return DataQualityCheck(
        id=check_id, title=title, description=desc, severity="warning",
        count=len(codes), codes=capped, available=True, truncated=truncated
    )


# 6. Taxa de IVA inválida
def check_invalid_vat(cursor, schema: SchemaInfo) -> DataQualityCheck:
    check_id = "invalid_vat"
    title = "Taxa de IVA não parametrizada"
    desc = "Artigos com valor de IVA que não corresponde a nenhuma taxa existente em dbo.iva."
    if not _has_col(schema, "produtos", "iva") or not _has_table(schema, "iva") or not _has_col(schema, "iva", "factor"):
        return DataQualityCheck(
            id=check_id, title=title, description=desc, severity="error",
            count=0, codes=[], available=False,
            unavailable_reason="A tabela dbo.iva ou coluna 'factor'/'iva' não existem."
        )

    sql = """
        SELECT p.codigo
        FROM dbo.produtos p
        WHERE p.iva IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM dbo.iva v WHERE ABS(v.factor - p.iva) < 0.001)
        ORDER BY p.codigo
    """
    cursor.execute(sql)
    codes = [int(r[0]) for r in cursor.fetchall()]
    capped, truncated = _cap_codes(codes)
    return DataQualityCheck(
        id=check_id, title=title, description=desc, severity="error",
        count=len(codes), codes=capped, available=True, truncated=truncated
    )


# 7. Artigo sem centro de produção
def check_no_production_center(cursor, schema: SchemaInfo) -> DataQualityCheck:
    check_id = "no_production_center"
    title = "Sem centro de produção atribuído"
    desc = "Artigos sem qualquer encaminhamento para Centro de Produção (Cozinha/Bar). Agrupado por família."
    if not _has_table(schema, "produtoscentrosprod"):
        return DataQualityCheck(
            id=check_id, title=title, description=desc, severity="info",
            count=0, codes=[], available=False,
            unavailable_reason="A tabela dbo.produtoscentrosprod não existe nesta base de dados."
        )

    sql = """
        SELECT p.codigo, ISNULL(f.descricao, 'Sem Família') AS fam_desc
        FROM dbo.produtos p
        LEFT JOIN dbo.familias f ON p.familia = f.codigo
        WHERE NOT EXISTS (SELECT 1 FROM dbo.produtoscentrosprod pcp WHERE pcp.codigo = p.codigo)
        ORDER BY f.descricao, p.codigo
    """
    cursor.execute(sql)
    rows = cursor.fetchall()
    groups_dict: Dict[str, List[int]] = {}
    all_codes: List[int] = []
    for code_raw, fam_raw in rows:
        code = int(code_raw)
        key = str(fam_raw or "Sem Família").strip()
        groups_dict.setdefault(key, []).append(code)
        all_codes.append(code)

    capped, truncated = _cap_codes(all_codes)
    groups = [DataQualityGroup(key=k, codes=v) for k, v in groups_dict.items()]
    return DataQualityCheck(
        id=check_id, title=title, description=desc, severity="info",
        count=len(all_codes), codes=capped, groups=groups,
        available=True, truncated=truncated
    )


# 8. Centro de produção inválido
def check_invalid_production_center(cursor, schema: SchemaInfo) -> DataQualityCheck:
    check_id = "invalid_production_center"
    title = "Centro de produção inexistente"
    desc = "Associação em produtoscentrosprod a um centro que não existe na tabela dbo.centrosprod."
    if not _has_table(schema, "produtoscentrosprod") or not _has_table(schema, "centrosprod"):
        return DataQualityCheck(
            id=check_id, title=title, description=desc, severity="warning",
            count=0, codes=[], available=False,
            unavailable_reason="Tabelas dbo.produtoscentrosprod ou dbo.centrosprod não existem."
        )

    sql = """
        SELECT DISTINCT pcp.codigo
        FROM dbo.produtoscentrosprod pcp
        WHERE pcp.centro IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM dbo.centrosprod cp WHERE cp.codigo = pcp.centro)
        ORDER BY pcp.codigo
    """
    cursor.execute(sql)
    codes = [int(r[0]) for r in cursor.fetchall()]
    capped, truncated = _cap_codes(codes)
    return DataQualityCheck(
        id=check_id, title=title, description=desc, severity="warning",
        count=len(codes), codes=capped, available=True, truncated=truncated
    )


# 9. Linhas órfãs em centros de produção
def check_orphan_production_center_rows(cursor, schema: SchemaInfo) -> DataQualityCheck:
    check_id = "orphan_production_center_rows"
    title = "Registos órfãos em centros de produção"
    desc = "Linhas em dbo.produtoscentrosprod cujo código de artigo não existe em dbo.produtos."
    if not _has_table(schema, "produtoscentrosprod"):
        return DataQualityCheck(
            id=check_id, title=title, description=desc, severity="info",
            count=0, codes=[], available=False,
            unavailable_reason="A tabela dbo.produtoscentrosprod não existe nesta base de dados."
        )

    sql = """
        SELECT COUNT(*)
        FROM dbo.produtoscentrosprod pcp
        WHERE NOT EXISTS (SELECT 1 FROM dbo.produtos p WHERE p.codigo = pcp.codigo)
    """
    cursor.execute(sql)
    row = cursor.fetchone()
    count = int(row[0]) if row else 0
    return DataQualityCheck(
        id=check_id, title=title, description=desc, severity="info",
        count=count, codes=[], available=True, truncated=False
    )


# 10. Preço zero visível no POS
def check_zero_price_visible(cursor, schema: SchemaInfo) -> DataQualityCheck:
    check_id = "zero_price_visible"
    title = "Artigos com preço 0,00 € visíveis no POS"
    desc = "Artigos com PVP 1 igual a 0,00 €, marcados como visíveis no POS e não bloqueados."

    has_bloqueado = _has_col(schema, "produtos", "bloqueado")
    has_frontoffice = _has_col(schema, "produtos", "frontoffice")

    extra_clauses = []
    notes = []
    if has_bloqueado:
        extra_clauses.append("ISNULL(CAST(p.bloqueado AS INT), 0) = 0")
    else:
        notes.append("coluna 'bloqueado' ausente")

    if has_frontoffice:
        extra_clauses.append("ISNULL(CAST(p.frontoffice AS INT), 1) = 1")
    else:
        notes.append("coluna 'frontoffice' ausente")

    where_sql = "WHERE ISNULL(p.precovenda, 0) = 0"
    if extra_clauses:
        where_sql += " AND " + " AND ".join(extra_clauses)

    sql = f"SELECT p.codigo FROM dbo.produtos p {where_sql} ORDER BY p.codigo"
    cursor.execute(sql)
    codes = [int(r[0]) for r in cursor.fetchall()]
    capped, truncated = _cap_codes(codes)

    reason = f"Critério reduzido ({', '.join(notes)})" if notes else None
    return DataQualityCheck(
        id=check_id, title=title, description=desc, severity="warning",
        count=len(codes), codes=capped, available=True,
        unavailable_reason=reason, truncated=truncated
    )


# 11. Descrição curta vazia
def check_empty_short_desc(cursor, schema: SchemaInfo) -> DataQualityCheck:
    check_id = "empty_short_desc"
    title = "Descrição curta do POS vazia"
    desc = "Artigos sem descrição curta definida (usada nos botões do ecrã de venda do ZSRest)."
    if not _has_col(schema, "produtos", "descricaocurta"):
        return DataQualityCheck(
            id=check_id, title=title, description=desc, severity="info",
            count=0, codes=[], available=False,
            unavailable_reason="A coluna 'descricaocurta' não existe na tabela dbo.produtos."
        )

    sql = """
        SELECT p.codigo
        FROM dbo.produtos p
        WHERE p.descricaocurta IS NULL OR LTRIM(RTRIM(p.descricaocurta)) = ''
        ORDER BY p.codigo
    """
    cursor.execute(sql)
    codes = [int(r[0]) for r in cursor.fetchall()]
    capped, truncated = _cap_codes(codes)
    return DataQualityCheck(
        id=check_id, title=title, description=desc, severity="info",
        count=len(codes), codes=capped, available=True, truncated=truncated
    )


# 12. Descrição curta demasiado longa
def check_long_short_desc(cursor, schema: SchemaInfo, short_desc_max: int = 20) -> DataQualityCheck:
    check_id = "long_short_desc"
    title = f"Descrição curta com mais de {short_desc_max} caracteres"
    desc = f"Artigos cuja descrição curta excede {short_desc_max} caracteres (pode ficar truncada nos botões do POS)."
    if not _has_col(schema, "produtos", "descricaocurta"):
        return DataQualityCheck(
            id=check_id, title=title, description=desc, severity="info",
            count=0, codes=[], available=False,
            unavailable_reason="A coluna 'descricaocurta' não existe na tabela dbo.produtos."
        )

    sql = """
        SELECT p.codigo
        FROM dbo.produtos p
        WHERE p.descricaocurta IS NOT NULL AND LEN(p.descricaocurta) > ?
        ORDER BY p.codigo
    """
    cursor.execute(sql, (short_desc_max,))
    codes = [int(r[0]) for r in cursor.fetchall()]
    capped, truncated = _cap_codes(codes)
    return DataQualityCheck(
        id=check_id, title=title, description=desc, severity="info",
        count=len(codes), codes=capped, available=True, truncated=truncated
    )


# 13. Espaços desnecessários na designação
def check_whitespace_desc(cursor, schema: SchemaInfo) -> DataQualityCheck:
    check_id = "whitespace_desc"
    title = "Espaços no início, fim ou duplos no nome"
    desc = "Artigos com espaços em branco nos extremos ou espaços duplos na designação (corrigível com 'Ortografia')."
    if not _has_col(schema, "produtos", "descricao"):
        return DataQualityCheck(
            id=check_id, title=title, description=desc, severity="info",
            count=0, codes=[], available=False,
            unavailable_reason="A coluna 'descricao' não existe na tabela dbo.produtos."
        )

    sql = """
        SELECT p.codigo
        FROM dbo.produtos p
        WHERE p.descricao LIKE ' %' OR p.descricao LIKE '% ' OR p.descricao LIKE '%  %'
        ORDER BY p.codigo
    """
    cursor.execute(sql)
    codes = [int(r[0]) for r in cursor.fetchall()]
    capped, truncated = _cap_codes(codes)
    return DataQualityCheck(
        id=check_id, title=title, description=desc, severity="info",
        count=len(codes), codes=capped, available=True, truncated=truncated
    )


def _mock_data_quality_report(short_desc_max: int = 20) -> List[DataQualityCheck]:
    return [
        DataQualityCheck(
            id="duplicate_barcode",
            title="Códigos de barras repetidos",
            description="O mesmo código de barras está atribuído a mais do que um artigo.",
            severity="error",
            count=2,
            codes=[3299, 3300],
            groups=[DataQualityGroup(key="1000000032994", codes=[3299, 3300])],
            available=True,
            truncated=False
        ),
        DataQualityCheck(
            id="duplicate_plu",
            title="PLUs / Códigos Alfa duplicados",
            description="O mesmo PLU / código de teclado está atribuído a mais do que um artigo.",
            severity="error",
            count=0,
            codes=[],
            available=True,
            truncated=False
        ),
        DataQualityCheck(
            id="missing_family",
            title="Artigos sem família associada",
            description="Artigos cuja família é nula, zero ou inexistente em dbo.familias.",
            severity="error",
            count=1,
            codes=[3308],
            available=True,
            truncated=False
        ),
        DataQualityCheck(
            id="empty_short_desc",
            title="Descrição curta vazia (sem texto no botão POS)",
            description="Artigos cuja descrição curta para os botões do POS está em branco.",
            severity="info",
            count=3,
            codes=[0, 1, 7001],
            available=True,
            truncated=False
        ),
        DataQualityCheck(
            id="long_short_desc",
            title=f"Descrição curta com mais de {short_desc_max} caracteres",
            description=f"Artigos cuja descrição curta ultrapassa o tamanho recomendado de {short_desc_max} caracteres.",
            severity="info",
            count=1,
            codes=[3298],
            available=True,
            truncated=False
        ),
        DataQualityCheck(
            id="whitespace_desc",
            title="Designações com espaços extra no início, fim ou duplos",
            description="Artigos com espaços desnecessários corrigíveis pelo modo Ortografia.",
            severity="info",
            count=1,
            codes=[7001],
            available=True,
            truncated=False
        )
    ]


def run_data_quality_report(short_desc_max: int = 20) -> List[DataQualityCheck]:
    """Executa todas as 13 verificações de qualidade de dados sobre a base de dados SQL Server."""
    if db_manager.use_mock:
        return _mock_data_quality_report(short_desc_max)
    try:
        conn = db_manager.get_connection()
    except Exception:
        return _mock_data_quality_report(short_desc_max)

    try:
        cursor = conn.cursor()
        schema = db_manager.get_schema(cursor)

        checks = [
            check_duplicate_barcode(cursor, schema),
            check_duplicate_plu(cursor, schema),
            check_missing_family(cursor, schema),
            check_missing_subfamily(cursor, schema),
            check_subfamily_wrong_family(cursor, schema),
            check_invalid_vat(cursor, schema),
            check_no_production_center(cursor, schema),
            check_invalid_production_center(cursor, schema),
            check_orphan_production_center_rows(cursor, schema),
            check_zero_price_visible(cursor, schema),
            check_empty_short_desc(cursor, schema),
            check_long_short_desc(cursor, schema, short_desc_max),
            check_whitespace_desc(cursor, schema),
        ]
        return checks
    finally:
        conn.close()
