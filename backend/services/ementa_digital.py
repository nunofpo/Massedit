from typing import Dict, Any, List, Optional
from backend.db import db_manager

def _mock_ementa_schema() -> Dict[str, Any]:
    return {
        "available": True,
        "target_table_found": True,
        "tables": [
            {
                "table_name": "ementa_digital_seccoes",
                "total_rows": 3,
                "columns": [
                    {"name": "codigo", "type": "int", "max_length": 4, "is_nullable": False, "is_primary_key": True},
                    {"name": "descricao", "type": "nvarchar", "max_length": 100, "is_nullable": False, "is_primary_key": False},
                    {"name": "visivel", "type": "int", "max_length": 4, "is_nullable": False, "is_primary_key": False},
                    {"name": "posicao", "type": "int", "max_length": 4, "is_nullable": True, "is_primary_key": False}
                ],
                "sample_rows": [
                    {"codigo": 1, "descricao": "Bebidas", "visivel": 1, "posicao": 1},
                    {"codigo": 2, "descricao": "Comidas", "visivel": 1, "posicao": 2},
                    {"codigo": 3, "descricao": "Menu", "visivel": 1, "posicao": 3}
                ]
            },
            {
                "table_name": "ementa_digital_familias",
                "total_rows": 2,
                "columns": [
                    {"name": "codigo", "type": "int", "max_length": 4, "is_nullable": False, "is_primary_key": True},
                    {"name": "cod_seccao", "type": "int", "max_length": 4, "is_nullable": False, "is_primary_key": False},
                    {"name": "descricao", "type": "nvarchar", "max_length": 100, "is_nullable": False, "is_primary_key": False},
                    {"name": "visivel", "type": "int", "max_length": 4, "is_nullable": False, "is_primary_key": False},
                    {"name": "posicao", "type": "int", "max_length": 4, "is_nullable": True, "is_primary_key": False}
                ],
                "sample_rows": [
                    {"codigo": 1, "cod_seccao": 1, "descricao": "Cafetaria", "visivel": 1, "posicao": 1},
                    {"codigo": 2, "cod_seccao": 1, "descricao": "Refrigerantes", "visivel": 1, "posicao": 2}
                ]
            },
            {
                "table_name": "ementa_digital_produtos",
                "total_rows": 2,
                "columns": [
                    {"name": "cod_produto", "type": "int", "max_length": 4, "is_nullable": False, "is_primary_key": True},
                    {"name": "produto", "type": "nvarchar", "max_length": 100, "is_nullable": False, "is_primary_key": False},
                    {"name": "preco", "type": "float", "max_length": 8, "is_nullable": True, "is_primary_key": False},
                    {"name": "preco_meia_dose", "type": "float", "max_length": 8, "is_nullable": True, "is_primary_key": False},
                    {"name": "visivel", "type": "int", "max_length": 4, "is_nullable": False, "is_primary_key": False},
                    {"name": "highlight", "type": "int", "max_length": 4, "is_nullable": False, "is_primary_key": False}
                ],
                    {"cod_produto": 1, "produto": "Cafe", "preco": 1.25, "preco_meia_dose": 0.5, "visivel": 1, "highlight": 0},
                    {"cod_produto": 700003, "produto": "Café", "preco": 0.00, "preco_meia_dose": 0.0, "visivel": 1, "highlight": 0}
                ]
            },
            {
                "table_name": "ementa_digital_idiomas",
                "total_rows": 4,
                "columns": [
                    {"name": "codigo", "type": "int", "max_length": 4, "is_nullable": False, "is_primary_key": True},
                    {"name": "idioma", "type": "nvarchar", "max_length": 50, "is_nullable": False, "is_primary_key": False},
                    {"name": "sigla", "type": "varchar", "max_length": 5, "is_nullable": False, "is_primary_key": False},
                    {"name": "ativo", "type": "int", "max_length": 4, "is_nullable": False, "is_primary_key": False}
                ],
                "sample_rows": [
                    {"codigo": 1, "idioma": "Português", "sigla": "PT", "ativo": 1},
                    {"codigo": 2, "idioma": "Inglês", "sigla": "EN", "ativo": 1},
                    {"codigo": 3, "idioma": "Espanhol", "sigla": "ES", "ativo": 1},
                    {"codigo": 4, "idioma": "Francês", "sigla": "FR", "ativo": 1}
                ]
            },
            {
                "table_name": "ementa_digital_traducoes",
                "total_rows": 4,
                "columns": [
                    {"name": "cod_idioma", "type": "int", "max_length": 4, "is_nullable": False, "is_primary_key": True},
                    {"name": "tabela_alvo", "type": "nvarchar", "max_length": 50, "is_nullable": False, "is_primary_key": True},
                    {"name": "cod_registo", "type": "int", "max_length": 4, "is_nullable": False, "is_primary_key": True},
                    {"name": "campo", "type": "nvarchar", "max_length": 50, "is_nullable": False, "is_primary_key": True},
                    {"name": "texto_traduzido", "type": "nvarchar", "max_length": 250, "is_nullable": True, "is_primary_key": False}
                ],
                "sample_rows": [
                    {"cod_idioma": 2, "tabela_alvo": "familias", "cod_registo": 1, "campo": "descricao", "texto_traduzido": "Coffee & Bakery"},
                    {"cod_idioma": 2, "tabela_alvo": "produtos", "cod_registo": 1, "campo": "descricao", "texto_traduzido": "Espresso Coffee"},
                    {"cod_idioma": 3, "tabela_alvo": "familias", "cod_registo": 1, "campo": "descricao", "texto_traduzido": "Cafetería"},
                    {"cod_idioma": 3, "tabela_alvo": "produtos", "cod_registo": 1, "campo": "descricao", "texto_traduzido": "Café Solo"}
                ]
            }
        ]
    }


def discover_ementa_schema() -> Dict[str, Any]:
    """Inspeciona a base de dados em modo só de leitura à procura de tabelas relacionadas com a ementa digital."""
    if db_manager.use_mock:
        return _mock_ementa_schema()
    try:
        conn = db_manager.get_connection()
    except Exception:
        return _mock_ementa_schema()

    try:
        cursor = conn.cursor()

        # 1. Procurar tabelas com 'ementa', 'trad' ou 'idiom' no nome em sys.tables (schema dbo)
        cursor.execute("""
            SELECT t.name, t.object_id
            FROM sys.tables t
            WHERE t.schema_id = SCHEMA_ID('dbo') 
              AND (t.name LIKE '%ementa%' OR t.name LIKE '%trad%' OR t.name LIKE '%idiom%')
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
