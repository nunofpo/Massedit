import os
import sys
import json
import threading
from typing import Optional, Dict, Tuple

import pyodbc

from backend.models import DatabaseConfig


def get_app_dir() -> str:
    """Pasta da aplicação (ao lado do executável quando empacotado com PyInstaller)."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


CONFIG_FILE = os.path.join(get_app_dir(), "config.json")

# Tipos de texto do SQL Server (para validar comprimentos e comparar códigos)
TEXT_TYPES = {"varchar", "nvarchar", "char", "nchar", "text", "ntext"}

# schema: {tabela: {coluna: (tipo, max_caracteres ou None)}}
SchemaInfo = Dict[str, Dict[str, Tuple[str, Optional[int]]]]


def hex_to_int_color(hex_str: Optional[str]) -> int:
    """Converte string HEX (#RRGGBB) para inteiro BGR do Windows/Delphi TColor."""
    if not hex_str:
        return 0
    hex_clean = hex_str.lstrip('#')
    if len(hex_clean) != 6:
        return 0
    try:
        r = int(hex_clean[0:2], 16)
        g = int(hex_clean[2:4], 16)
        b = int(hex_clean[4:6], 16)
        return r + (g << 8) + (b << 16)
    except ValueError:
        return 0


def is_valid_hex_color(hex_str: Optional[str]) -> bool:
    if not hex_str:
        return False
    hex_clean = hex_str.strip().lstrip('#')
    if len(hex_clean) != 6:
        return False
    try:
        int(hex_clean, 16)
        return True
    except ValueError:
        return False


def int_color_to_hex(color_int: Optional[int]) -> str:
    """Converte inteiro BGR do Windows/Delphi TColor para string HEX (#RRGGBB)."""
    if color_int is None or color_int < 0:
        return "#000000"
    r = color_int & 0xFF
    g = (color_int >> 8) & 0xFF
    b = (color_int >> 16) & 0xFF
    return f"#{r:02X}{g:02X}{b:02X}"


def _odbc_braced(value: Optional[str]) -> str:
    """Envolve um valor da connection string em chavetas (suporta ; } = na password)."""
    text = "" if value is None else str(value)
    return "{" + text.replace("}", "}}") + "}"


class DatabaseManager:
    def __init__(self, config: Optional[DatabaseConfig] = None):
        self.config = config or self._load_config()
        self.use_mock = False  # Modo demo totalmente desativado
        self._schema: Optional[SchemaInfo] = None
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Configuração persistente (config.json ao lado do executável)
    # ------------------------------------------------------------------
    @staticmethod
    def _load_config() -> DatabaseConfig:
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return DatabaseConfig(**data)
        except FileNotFoundError:
            pass
        except Exception as e:
            print(f"Aviso: não foi possível ler {CONFIG_FILE}: {e}")
        return DatabaseConfig()

    def save_config(self) -> Optional[str]:
        """Grava a configuração em disco. Devolve mensagem de erro ou None."""
        data = self.config.model_dump()
        if not self.config.save_password:
            data["password"] = ""
        tmp_path = CONFIG_FILE + ".tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            os.replace(tmp_path, CONFIG_FILE)
            return None
        except Exception as e:
            return f"Não foi possível gravar a configuração em {CONFIG_FILE}: {e}"

    def set_config(self, cfg: DatabaseConfig) -> Optional[str]:
        with self._lock:
            self.config = cfg
            self._schema = None
        return self.save_config()

    # ------------------------------------------------------------------
    # Ligação
    # ------------------------------------------------------------------
    def build_connection_string(self) -> str:
        cfg = self.config
        server = (cfg.server or "").strip()
        # Instâncias nomeadas (SERVIDOR\INSTANCIA) usam o SQL Browser: não forçar a porta por defeito
        if cfg.port and not ("\\" in server and cfg.port == 1433):
            server = f"{server},{cfg.port}"

        parts = [
            f"DRIVER={_odbc_braced(cfg.driver)}",
            f"SERVER={server}",
            f"DATABASE={_odbc_braced(cfg.database)}",
        ]
        if cfg.trusted_connection:
            parts.append("Trusted_Connection=yes")
        else:
            parts.append(f"UID={_odbc_braced(cfg.username)}")
            parts.append(f"PWD={_odbc_braced(cfg.password)}")
        parts.append("Encrypt=no")
        parts.append("TrustServerCertificate=yes")
        return ";".join(parts) + ";"

    def test_connection(self) -> Tuple[bool, str]:
        """Testa se a conexão ao SQL Server está operacional e se a BD tem a tabela dbo.produtos."""
        try:
            conn = pyodbc.connect(self.build_connection_string(), timeout=3)
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM sys.tables WHERE name = 'produtos' AND schema_id = SCHEMA_ID('dbo')")
                row = cursor.fetchone()
            finally:
                conn.close()
            self.use_mock = False
            if not row or not row[0]:
                return False, (
                    f"Ligado ao SQL Server '{self.config.server}', mas a base de dados '{self.config.database}' "
                    f"não tem a tabela dbo.produtos. Confirme o nome da base de dados."
                )
            return True, f"Conectado com sucesso ao SQL Server '{self.config.server}' (Base de Dados: {self.config.database})."
        except Exception as e:
            self.use_mock = False
            return False, f"Falha de Conexão SQL Server ({self.config.server}:{self.config.port}): {str(e)}"

    def get_connection(self):
        """Abre ligação em modo transacional (autocommit desligado) com codificação correta para Latin1/UTF-8."""
        conn = pyodbc.connect(self.build_connection_string(), timeout=5)
        conn.setdecoding(pyodbc.SQL_CHAR, encoding='latin1')
        conn.setdecoding(pyodbc.SQL_WCHAR, encoding='utf-8')
        conn.setencoding(encoding='cp1252')
        conn.autocommit = False

        return conn

    # ------------------------------------------------------------------
    # Estrutura da base de dados (colunas existentes, tipos e tamanhos)
    # ------------------------------------------------------------------
    def get_schema(self, cursor) -> SchemaInfo:
        with self._lock:
            if self._schema is not None:
                return self._schema
        cursor.execute("""
            SELECT LOWER(t.name), LOWER(c.name), LOWER(ty.name), c.max_length
            FROM sys.tables t
            JOIN sys.columns c ON c.object_id = t.object_id
            JOIN sys.types ty ON ty.user_type_id = c.user_type_id
            WHERE t.schema_id = SCHEMA_ID('dbo')
        """)
        schema: SchemaInfo = {}
        for table, col, type_name, max_length in cursor.fetchall():
            max_chars: Optional[int] = None
            if type_name in TEXT_TYPES and max_length is not None and max_length > 0:
                max_chars = max_length // 2 if type_name in ("nvarchar", "nchar") else max_length
            schema.setdefault(table, {})[col] = (type_name, max_chars)
        with self._lock:
            self._schema = schema
        return schema

    def cached_schema(self) -> SchemaInfo:
        return self._schema or {}


db_manager = DatabaseManager()
