import os
import json
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

from backend.db import db_manager, TEXT_TYPES, SchemaInfo
from backend.models import (
    TableItem, TableUpdateItem, BulkTableUpdateRequest,
    BulkEditPreviewResponse, ProductDiff, FieldDiff
)

# Mock tables when DB is disconnected or table does not exist
MOCK_SALAS = [
    {"codigo": 1, "descricao": "Sala Principal"},
    {"codigo": 2, "descricao": "Esplanada"},
    {"codigo": 3, "descricao": "Zona VIP"}
]

MOCK_TABLES = [
    {"codigo": 1, "descricao": "Mesa 1", "sala": 1, "sala_desc": "Sala Principal", "posicao": 1, "bloqueada": 0},
    {"codigo": 2, "descricao": "Mesa 2", "sala": 1, "sala_desc": "Sala Principal", "posicao": 2, "bloqueada": 0},
    {"codigo": 3, "descricao": "Mesa 3", "sala": 1, "sala_desc": "Sala Principal", "posicao": 3, "bloqueada": 0},
    {"codigo": 4, "descricao": "Mesa 4", "sala": 1, "sala_desc": "Sala Principal", "posicao": 4, "bloqueada": 0},
    {"codigo": 5, "descricao": "Esplanada 101", "sala": 2, "sala_desc": "Esplanada", "posicao": 101, "bloqueada": 0},
    {"codigo": 6, "descricao": "Esplanada 102", "sala": 2, "sala_desc": "Esplanada", "posicao": 102, "bloqueada": 0},
    {"codigo": 7, "descricao": "Esplanada 103", "sala": 2, "sala_desc": "Esplanada", "posicao": 103, "bloqueada": 0},
    {"codigo": 8, "descricao": "Mesa VIP 1", "sala": 3, "sala_desc": "Zona VIP", "posicao": 201, "bloqueada": 0},
    {"codigo": 9, "descricao": "Mesa VIP 2", "sala": 3, "sala_desc": "Zona VIP", "posicao": 202, "bloqueada": 0},
]


def _get_salas_dict(cursor, schema: SchemaInfo) -> Dict[int, str]:
    salas_map: Dict[int, str] = {}
    if "salas" in schema:
        try:
            cursor.execute("SELECT codigo, descricao FROM dbo.salas")
            for r in cursor.fetchall():
                if r[0] is not None:
                    salas_map[int(r[0])] = str(r[1] or "").strip()
        except Exception:
            pass
    return salas_map


def _detect_table_config(schema: SchemaInfo) -> Tuple[str, str, str, Optional[str], Optional[str], Optional[str]]:
    """
    Deteta as tabelas e colunas de mesas do ZoneSoft POS (prioridade a dbo.mapamesas com nomeobjecto).
    Retorna (table_name, code_col, name_col, sala_col, pos_col, bloq_col).
    """
    if "mapamesas" in schema:
        cols = schema["mapamesas"]
        t_name = "mapamesas"
        name_col = "nomeobjecto" if "nomeobjecto" in cols else ("descricao" if "descricao" in cols else "nome")
        code_col = "codigo" if "codigo" in cols else ("codobjecto" if "codobjecto" in cols else ("objecto" if "objecto" in cols else "codigo"))
        sala_col = "sala" if "sala" in cols else ("codsala" if "codsala" in cols else None)
        pos_col = "posicao" if "posicao" in cols else ("ordem" if "ordem" in cols else None)
        bloq_col = "bloqueada" if "bloqueada" in cols else ("status" if "status" in cols else ("bloqueado" if "bloqueado" in cols else None))
        return t_name, code_col, name_col, sala_col, pos_col, bloq_col
    else:
        cols = schema.get("mesas", {})
        t_name = "mesas"
        name_col = "descricao" if "descricao" in cols else ("nomeobjecto" if "nomeobjecto" in cols else "descricao")
        code_col = "codigo"
        sala_col = "sala" if "sala" in cols else None
        pos_col = "posicao" if "posicao" in cols else ("ordem" if "ordem" in cols else None)
        bloq_col = "bloqueada" if "bloqueada" in cols else ("status" if "status" in cols else ("bloqueado" if "bloqueado" in cols else None))
        return t_name, code_col, name_col, sala_col, pos_col, bloq_col


def get_tables(search: str = "", sala: Optional[int] = None) -> Dict[str, Any]:
    """
    Retorna a lista de mesas e salas da base de dados ZoneSoft (dbo.mapamesas com nomeobjecto, ou dbo.mesas).
    Se a ligação à BD não estiver disponível ou a tabela não existir, devolve os dados mock.
    """
    tables_list: List[TableItem] = []
    salas_list: List[Dict[str, Any]] = []

    try:
        conn = db_manager.get_connection()
    except Exception:
        conn = None

    if conn is not None:
        try:
            cursor = conn.cursor()
            schema = db_manager.get_schema(cursor)

            if "mapamesas" in schema or "mesas" in schema:
                salas_map = _get_salas_dict(cursor, schema)
                for s_code, s_desc in salas_map.items():
                    salas_list.append({"codigo": s_code, "descricao": s_desc})

                t_name, code_col, name_col, sala_col, pos_col, bloq_col = _detect_table_config(schema)

                select_cols = [code_col, name_col]
                if sala_col:
                    select_cols.append(sala_col)
                else:
                    select_cols.append("NULL as sala")

                if pos_col:
                    select_cols.append(pos_col)
                else:
                    select_cols.append("0 as posicao")

                if bloq_col:
                    select_cols.append(bloq_col)
                else:
                    select_cols.append("0 as bloqueada")

                query = f"SELECT {', '.join(select_cols)} FROM dbo.{t_name}"
                cursor.execute(query)

                for r in cursor.fetchall():
                    if r[0] is None:
                        continue
                    code = int(r[0])
                    desc = str(r[1] or "").strip()
                    s_id = int(r[2]) if r[2] is not None else None
                    pos = int(r[3]) if r[3] is not None else 0
                    bloq = int(r[4]) if r[4] is not None else 0

                    s_desc = salas_map.get(s_id, f"Sala {s_id}") if s_id is not None else ""

                    tables_list.append(TableItem(
                        codigo=code,
                        descricao=desc,
                        sala=s_id,
                        sala_desc=s_desc,
                        posicao=pos,
                        bloqueada=bloq
                    ))
        except Exception as e:
            tables_list = []
        finally:
            conn.close()

    # Fallback para dados mock se não obteve mesas da BD
    if not tables_list:
        salas_list = MOCK_SALAS
        for m in MOCK_TABLES:
            tables_list.append(TableItem(**m))

    # Filtragem
    if search and search.strip():
        term = search.strip().lower()
        tables_list = [
            t for t in tables_list
            if term in t.descricao.lower() or term in str(t.codigo) or (t.sala_desc and term in t.sala_desc.lower())
        ]

    if sala is not None:
        tables_list = [t for t in tables_list if t.sala == sala]

    return {
        "tables": [t.model_dump() for t in tables_list],
        "salas": salas_list,
        "total": len(tables_list)
    }


def preview_table_updates(req: BulkTableUpdateRequest) -> BulkEditPreviewResponse:
    """
    Pré-visualiza as alterações solicitadas a nomes de mesas.
    """
    current_data = get_tables()
    table_map = {t["codigo"]: t for t in current_data["tables"]}

    previews: List[ProductDiff] = []
    affected = 0
    blocked = 0

    for item in req.tables:
        code = item.codigo
        cur = table_map.get(code)
        if not cur:
            blocked += 1
            previews.append(ProductDiff(
                codigo=code,
                descricao="N/A",
                has_sales=False,
                diffs=[FieldDiff(
                    field_name="codigo",
                    field_label="Mesa",
                    old_value="Inexistente",
                    new_value="Inexistente",
                    blocked=True,
                    reason=f"Mesa #{code} não foi encontrada na base de dados."
                )]
            ))
            continue

        diffs: List[FieldDiff] = []
        cur_desc = cur["descricao"]
        new_desc = item.descricao.strip() if item.descricao else ""

        if new_desc != cur_desc:
            if not new_desc:
                diffs.append(FieldDiff(
                    field_name="descricao",
                    field_label="Nome da Mesa (nomeobjecto)",
                    old_value=cur_desc,
                    new_value="(Vazio)",
                    blocked=True,
                    reason="O nome da mesa não pode ficar em branco."
                ))
            elif len(new_desc) > 50:
                diffs.append(FieldDiff(
                    field_name="descricao",
                    field_label="Nome da Mesa (nomeobjecto)",
                    old_value=cur_desc,
                    new_value=new_desc,
                    blocked=True,
                    reason=f"O nome excedeu o limite máximo (máx. 50 caracteres, recebido {len(new_desc)})."
                ))
            else:
                diffs.append(FieldDiff(
                    field_name="descricao",
                    field_label="Nome da Mesa (nomeobjecto)",
                    old_value=cur_desc,
                    new_value=new_desc,
                    blocked=False
                ))

        if item.sala is not None and item.sala != cur.get("sala"):
            diffs.append(FieldDiff(
                field_name="sala",
                field_label="Sala / Zona",
                old_value=cur.get("sala_desc") or f"Sala {cur.get('sala')}",
                new_value=f"Sala #{item.sala}",
                blocked=False
            ))

        if diffs:
            is_blocked = any(d.blocked for d in diffs)
            if is_blocked:
                blocked += 1
            else:
                affected += 1
            previews.append(ProductDiff(
                codigo=code,
                descricao=cur_desc,
                has_sales=False,
                diffs=diffs
            ))

    return BulkEditPreviewResponse(
        total_selected=len(req.tables),
        total_affected=affected,
        blocked_descriptions_count=blocked,
        previews=previews
    )


def update_tables(req: BulkTableUpdateRequest) -> Dict[str, Any]:
    """
    Aplica as alterações de nomes de mesas à base de dados SQL Server (dbo.mapamesas -> nomeobjecto e dbo.mesas -> descricao)
    marcando sync = 1 para atualização nos postos POS ZoneSoft.
    """
    preview = preview_table_updates(req)
    blocked_items = [p for p in preview.previews if any(d.blocked for d in p.diffs)]
    if blocked_items:
        reasons = "; ".join([d.reason for p in blocked_items for d in p.diffs if d.reason])
        return {
            "success": False,
            "updated_count": 0,
            "message": f"Não foi possível aplicar as alterações: {reasons}"
        }

    updates_to_apply = [item for item in req.tables if any(p.codigo == item.codigo for p in preview.previews)]
    if not updates_to_apply:
        return {
            "success": True,
            "updated_count": 0,
            "message": "Nenhuma alteração a aplicar."
        }

    try:
        conn = db_manager.get_connection()
    except Exception:
        conn = None

    if conn is None:
        # Modo mock / sem ligação à BD
        for item in updates_to_apply:
            for m in MOCK_TABLES:
                if m["codigo"] == item.codigo:
                    if item.descricao:
                        m["descricao"] = item.descricao.strip()
                    if item.sala is not None:
                        m["sala"] = item.sala
        return {
            "success": True,
            "updated_count": len(updates_to_apply),
            "message": f"{len(updates_to_apply)} mesa(s) atualizada(s) com sucesso em modo demonstração."
        }

    try:
        cursor = conn.cursor()
        schema = db_manager.get_schema(cursor)
        
        has_mapamesas = "mapamesas" in schema
        has_mesas = "mesas" in schema

        updated_count = 0

        # 1. Atualizar dbo.mapamesas (nomeobjecto) se a tabela existir
        if has_mapamesas:
            cols = schema["mapamesas"]
            name_col = "nomeobjecto" if "nomeobjecto" in cols else ("descricao" if "descricao" in cols else "nome")
            code_col = "codigo" if "codigo" in cols else ("codobjecto" if "codobjecto" in cols else "codigo")
            has_sala = "sala" in cols or "codsala" in cols
            sala_col = "sala" if "sala" in cols else ("codsala" if "codsala" in cols else None)
            has_sync = "sync" in cols

            for item in updates_to_apply:
                sets = [f"{name_col} = ?"]
                params = [item.descricao.strip()]

                if "descricao" in cols and name_col != "descricao":
                    sets.append("descricao = ?")
                    params.append(item.descricao.strip())

                if has_sala and sala_col and item.sala is not None:
                    sets.append(f"{sala_col} = ?")
                    params.append(item.sala)

                if has_sync:
                    sets.append("sync = 1")

                params.append(item.codigo)
                sql = f"UPDATE dbo.mapamesas SET {', '.join(sets)} WHERE {code_col} = ?"
                cursor.execute(sql, params)
                updated_count += cursor.rowcount

        # 2. Atualizar também dbo.mesas (descricao e sync = 1) se a tabela existir
        if has_mesas:
            cols = schema["mesas"]
            has_desc = "descricao" in cols
            has_nomeobj = "nomeobjecto" in cols
            has_sync = "sync" in cols
            has_sala = "sala" in cols

            for item in updates_to_apply:
                sets = []
                params = []

                if has_desc:
                    sets.append("descricao = ?")
                    params.append(item.descricao.strip())

                if has_nomeobj:
                    sets.append("nomeobjecto = ?")
                    params.append(item.descricao.strip())

                if has_sala and item.sala is not None:
                    sets.append("sala = ?")
                    params.append(item.sala)

                if has_sync:
                    sets.append("sync = 1")

                if sets:
                    params.append(item.codigo)
                    sql = f"UPDATE dbo.mesas SET {', '.join(sets)} WHERE codigo = ?"
                    cursor.execute(sql, params)
                    if not has_mapamesas:
                        updated_count += cursor.rowcount

        conn.commit()
        return {
            "success": True,
            "updated_count": updated_count,
            "message": f"{updated_count} mesa(s) / mapa de mesas atualizado(s) com sucesso na base de dados ZoneSoft (mapamesas.nomeobjecto & mesas.descricao)."
        }
    except Exception as e:
        if conn:
            conn.rollback()
        return {
            "success": False,
            "updated_count": 0,
            "message": f"Erro ao atualizar mapa de mesas no SQL Server: {str(e)}"
        }
    finally:
        if conn:
            conn.close()
