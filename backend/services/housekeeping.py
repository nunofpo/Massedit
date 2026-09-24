import time
import logging
from typing import Dict, Any, List, Optional
from backend.db import db_manager

logger = logging.getLogger("massedit.housekeeping")


def get_db_housekeeping_status() -> Dict[str, Any]:
    """
    Obtém informação de diagnóstico de armazenamento e desempenho da base de dados SQL Server:
    - Ficheiros .mdf (dados) e .ldf (log de transações), tamanhos e espaço livre.
    - Modelo de recuperação (Recovery Model).
    - Top tabelas que mais espaço ocupam.
    - Deteção de log inflacionado (bloat).
    """
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        db_name = db_manager.config.database

        # 1. Ficheiros da Base de Dados
        cursor.execute("""
            SELECT 
                file_id,
                type_desc,
                name,
                physical_name,
                size * 8.0 / 1024.0 AS size_mb,
                FILEPROPERTY(name, 'SpaceUsed') * 8.0 / 1024.0 AS used_mb
            FROM sys.database_files
        """)
        files = []
        data_size_mb = 0.0
        data_used_mb = 0.0
        log_size_mb = 0.0
        log_used_mb = 0.0
        log_file_name = ""

        for r in cursor.fetchall():
            fid = int(r[0])
            ftype = str(r[1]).upper()
            fname = str(r[2])
            fpath = str(r[3])
            fsize = float(r[4] or 0.0)
            fused = float(r[5] or 0.0)
            ffree = max(0.0, fsize - fused)

            item = {
                "id": fid,
                "type": ftype,
                "logical_name": fname,
                "physical_path": fpath,
                "size_mb": round(fsize, 2),
                "used_mb": round(fused, 2),
                "free_mb": round(ffree, 2)
            }
            files.append(item)

            if ftype == "ROWS":
                data_size_mb += fsize
                data_used_mb += fused
            elif ftype == "LOG":
                log_size_mb += fsize
                log_used_mb += fused
                if not log_file_name:
                    log_file_name = fname

        # 2. Recovery Model
        recovery_model = "UNKNOWN"
        try:
            cursor.execute("SELECT recovery_model_desc FROM sys.databases WHERE name = ?", (db_name,))
            row = cursor.fetchone()
            if row:
                recovery_model = str(row[0])
        except Exception:
            pass

        # 3. Top tabelas por espaço
        top_tables = []
        try:
            cursor.execute("""
                SELECT TOP 8
                    t.name AS table_name,
                    p.rows AS row_count,
                    SUM(a.total_pages) * 8.0 / 1024.0 AS total_mb,
                    SUM(a.used_pages) * 8.0 / 1024.0 AS used_mb
                FROM sys.tables t
                INNER JOIN sys.indexes i ON t.object_id = i.object_id
                INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
                INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
                WHERE t.schema_id = SCHEMA_ID('dbo') AND i.index_id <= 1
                GROUP BY t.name, p.rows
                ORDER BY total_mb DESC
            """)
            for tr in cursor.fetchall():
                top_tables.append({
                    "name": tr[0],
                    "rows": int(tr[1] or 0),
                    "total_mb": round(float(tr[2] or 0.0), 2),
                    "used_mb": round(float(tr[3] or 0.0), 2)
                })
        except Exception as ex:
            logger.warning(f"Não foi possível obter top tabelas: {ex}")

        # Avaliação de saúde do Log
        log_bloated = log_size_mb > 150.0 and (log_size_mb > data_size_mb * 0.8 or log_size_mb - log_used_mb > 100.0)

        return {
            "database_name": db_name,
            "recovery_model": recovery_model,
            "data_size_mb": round(data_size_mb, 2),
            "data_used_mb": round(data_used_mb, 2),
            "data_free_mb": round(max(0.0, data_size_mb - data_used_mb), 2),
            "log_size_mb": round(log_size_mb, 2),
            "log_used_mb": round(log_used_mb, 2),
            "log_free_mb": round(max(0.0, log_size_mb - log_used_mb), 2),
            "log_file_name": log_file_name,
            "log_bloated": log_bloated,
            "files": files,
            "top_tables": top_tables
        }
    finally:
        conn.close()


def shrink_log_file() -> Dict[str, Any]:
    """
    Executa a redução segura (shrink) do ficheiro de registo de transações (.ldf) do SQL Server.
    Passos:
    1. CHECKPOINT para descarregar páginas sujas para o disco.
    2. DBCC SHRINKFILE com o nome lógico do ficheiro de log para 10 MB.
    """
    status_before = get_db_housekeeping_status()
    log_name = status_before.get("log_file_name")
    initial_log_mb = status_before.get("log_size_mb", 0.0)

    if not log_name:
        return {
            "success": False,
            "message": "Ficheiro de log de transações não identificado.",
            "freed_mb": 0.0
        }

    conn = db_manager.get_connection()
    try:
        conn.autocommit = True
        cursor = conn.cursor()
        # Forçar checkpoint
        cursor.execute("CHECKPOINT")
        # Encolher ficheiro de log
        cursor.execute(f"DBCC SHRINKFILE ({log_name}, 10)")
    except Exception as e:
        return {
            "success": False,
            "message": f"Erro ao encolher ficheiro de log: {str(e)}",
            "freed_mb": 0.0
        }
    finally:
        conn.close()

    status_after = get_db_housekeeping_status()
    new_log_mb = status_after.get("log_size_mb", 0.0)
    freed_mb = max(0.0, initial_log_mb - new_log_mb)

    return {
        "success": True,
        "message": f"Ficheiro de registo encolhido com sucesso! Libertados {round(freed_mb, 1)} MB de espaço em disco.",
        "initial_mb": initial_log_mb,
        "new_mb": new_log_mb,
        "freed_mb": round(freed_mb, 2)
    }


def optimize_indexes() -> Dict[str, Any]:
    """
    Desfragmenta e reorganiza índices e atualiza estatísticas nas principais tabelas do ZoneSoft:
    - dbo.produtos
    - dbo.vendas / vendasprod / movimentos
    - dbo.familias / subfamilias
    - dbo.ementa_digital_produtos
    Melhora a rapidez de pesquisas, ecrã de venda e fecho de contas.
    """
    target_tables = [
        "produtos", "vendas", "vendasprod", "movimentos",
        "familias", "subfamilias", "ementa_digital_produtos", "clientes"
    ]

    conn = db_manager.get_connection()
    optimized = []
    start_time = time.time()

    try:
        cursor = conn.cursor()
        schema = db_manager.get_schema(cursor)

        for table in target_tables:
            if table.lower() in schema:
                try:
                    cursor.execute(f"ALTER INDEX ALL ON dbo.{table} REORGANIZE")
                    cursor.execute(f"UPDATE STATISTICS dbo.{table}")
                    conn.commit()
                    optimized.append(f"dbo.{table}")
                except Exception as ex:
                    logger.warning(f"Aviso ao otimizar dbo.{table}: {ex}")
                    try:
                        conn.rollback()
                    except Exception:
                        pass
    finally:
        conn.close()

    duration = round(time.time() - start_time, 2)
    return {
        "success": True,
        "optimized_tables": optimized,
        "count": len(optimized),
        "duration_seconds": duration,
        "message": f"Otimização concluída com sucesso em {len(optimized)} tabelas ({duration}s)."
    }
