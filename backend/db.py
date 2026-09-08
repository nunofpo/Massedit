import pyodbc
from typing import Optional, List, Dict, Any, Tuple
from backend.models import DatabaseConfig


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


def int_color_to_hex(color_int: Optional[int]) -> str:
    """Converte inteiro BGR do Windows/Delphi TColor para string HEX (#RRGGBB)."""
    if color_int is None or color_int < 0:
        return "#000000"
    r = color_int & 0xFF
    g = (color_int >> 8) & 0xFF
    b = (color_int >> 16) & 0xFF
    return f"#{r:02X}{g:02X}{b:02X}"


class DatabaseManager:
    def __init__(self, config: Optional[DatabaseConfig] = None):
        self.config = config or DatabaseConfig()
        self.use_mock = False  # Modo demo totalmente desativado

    def build_connection_string(self) -> str:
        cfg = self.config
        if cfg.trusted_connection:
            return (
                f"DRIVER={{{cfg.driver}}};"
                f"SERVER={cfg.server},{cfg.port};"
                f"DATABASE={cfg.database};"
                f"Trusted_Connection=yes;"
                f"Encrypt=no;"
            )
        else:
            return (
                f"DRIVER={{{cfg.driver}}};"
                f"SERVER={cfg.server},{cfg.port};"
                f"DATABASE={cfg.database};"
                f"UID={cfg.username};"
                f"PWD={cfg.password};"
                f"Encrypt=no;"
            )

    def test_connection(self) -> Tuple[bool, str]:
        """Testa se a conexão ao SQL Server está operacional."""
        try:
            conn_str = self.build_connection_string()
            conn = pyodbc.connect(conn_str, timeout=3)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM sys.tables WHERE name='produtos'")
            row = cursor.fetchone()
            conn.close()
            self.use_mock = False
            return True, f"Conectado com sucesso ao SQL Server '{self.config.server}' (Base de Dados: {self.config.database})."
        except Exception as e:
            self.use_mock = False
            return False, f"Falha de Conexão SQL Server ({self.config.server}:{self.config.port}): {str(e)}"

    def get_connection(self):
        conn_str = self.build_connection_string()
        return pyodbc.connect(conn_str, timeout=5)

db_manager = DatabaseManager()
