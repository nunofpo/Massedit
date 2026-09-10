from typing import Dict, Any, List, Optional
from backend.db import db_manager

def discover_ementa_schema() -> Dict[str, Any]:
    """Inspeciona a base de dados em modo só de leitura à procura de tabelas relacionadas com a ementa digital."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()

        # 1. Procurar tabelas com 'ementa' no nome em sys.tables (schema dbo)
        cursor.execute("""
            SELECT t.name, t.object_id
            FROM sys.tables t
            WHERE t.schema_id = SCHEMA_ID('dbo') AND t.name LIKE '%ementa%'
            ORDER BY t.name ASC
        """)
        ementa_tables = cursor.fetchall()

        if not ementa_tables:
            # Também verificar se existe alguma tabela com ementa sem ser no schema dbo
            cursor.execute("""
                SELECT SCHEMA_NAME(t.schema_id), t.name
                FROM sys.tables t
                WHERE t.name LIKE '%ementa%'
            """)
            other_tables = cursor.fetchall()
            return {
                "available": False,
                "reason": "Nenhuma tabela com o termo 'ementa' encontrada no schema 'dbo'.",
                "tables_found": [f"{r[0]}.{r[1]}" for r in other_tables],
                "tables": []
            }

        tables_info: List[Dict[str, Any]] = []

        for tab_name, obj_id in ementa_tables:
            # 2. Obter colunas, tipos, tamanhos, nulidade e se faz parte da chave primária
            col_query = """
                SELECT 
                    c.name AS column_name,
                    ty.name AS data_type,
                    c.max_length,
                    c.is_nullable,
                    ISNULL(pk.is_pk, 0) AS is_primary_key
                FROM sys.columns c
                JOIN sys.types ty ON ty.user_type_id = c.user_type_id
                LEFT JOIN (
                    SELECT ic.column_id, 1 AS is_pk
                    FROM sys.indexes i
                    JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                    WHERE i.object_id = ? AND i.is_primary_key = 1
                ) pk ON pk.column_id = c.column_id
                WHERE c.object_id = ?
                ORDER BY c.column_id ASC
            """
            cursor.execute(col_query, (obj_id, obj_id))
            col_rows = cursor.fetchall()
            columns = [
                {
                    "name": r[0],
                    "type": r[1],
                    "max_length": r[2],
                    "is_nullable": bool(r[3]),
                    "is_primary_key": bool(r[4])
                }
                for r in col_rows
            ]

            # 3. Contagem total de registos
            try:
                cursor.execute(f"SELECT COUNT(*) FROM dbo.[{tab_name}]")
                count_row = cursor.fetchone()
                total_rows = count_row[0] if count_row else 0
            except Exception as e:
                total_rows = f"Erro ao contar linhas: {str(e)}"

            # 4. Amostra de até 5 registos (TOP 5)
            sample_rows: List[Dict[str, Any]] = []
            try:
                cursor.execute(f"SELECT TOP 5 * FROM dbo.[{tab_name}]")
                sample_col_names = [d[0] for d in cursor.description]
                for s_row in cursor.fetchall():
                    row_dict = {}
                    for col_idx, col_n in enumerate(sample_col_names):
                        val = s_row[col_idx]
                        # Serializar tipos não-JSON nativos
                        if hasattr(val, "isoformat"):
                            val = val.isoformat()
                        elif isinstance(val, bytes):
                            val = f"<bytes {len(val)}>"
                        row_dict[col_n] = val
                    sample_rows.append(row_dict)
            except Exception as e:
                sample_rows = [{"_error": f"Não foi possível obter linhas de exemplo: {str(e)}"}]

            tables_info.append({
                "table_name": tab_name,
                "total_rows": total_rows,
                "columns": columns,
                "sample_rows": sample_rows
            })

        return {
            "available": True,
            "target_table_found": any(t["table_name"].lower() == "ementa_digital_produtos" for t in tables_info),
            "tables": tables_info
        }
    finally:
        conn.close()
