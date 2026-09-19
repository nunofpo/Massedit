"""
Módulo de Desencriptação de Ficheiros XDL (ZoneSoft / POS Layouts).
Algoritmo de cifra de fluxo simétrica de 16 bits (Classic Delphi/Turbo Pascal LCG stream cipher).
"""

KEY0 = 0x00AA
C1 = 0x2A26
C2 = 0xB211


def decrypt(data: bytes) -> bytes:
    """Desencripta um buffer de bytes .xdl."""
    out = bytearray(len(data))
    key = KEY0
    for i, c in enumerate(data):
        out[i] = c ^ (key >> 8)
        key = ((key + c) * C1 + C2) & 0xFFFF
    return bytes(out)


def is_xdl_encrypted(data: bytes) -> bool:
    """
    Verifica se o buffer parece estar cifrado em XDL ou se já é texto/XML em claro.
    Como o byte alto da chave inicial é 0x00, o 1.º byte de '<?xml' cifrado é '<' (0x3C)
    e o 2.º byte é 0xAF (0x3F ^ 0x8F).
    """
    if len(data) >= 2 and data[0] == 0x3C:
        if data[1] == 0xAF:
            return True
        if data[1] in (0x3F, 0x5A, 0x46, 0x4C, 0x73):  # '?', 'Z', 'F', 'L', 's'
            return False
    return False


def detect_and_decrypt_text(data: bytes) -> str:
    """
    Desencripta e converte bytes para texto com deteção automática de encoding:
    UTF-8 com BOM, UTF-8 simples ou Windows-1252 (ANSI).
    """
    plain_bytes = decrypt(data) if is_xdl_encrypted(data) else data

    if plain_bytes.startswith(b'\xef\xbb\xbf'):
        return plain_bytes[3:].decode('utf-8', errors='replace')
    if plain_bytes.startswith(b'\xff\xfe'):
        return plain_bytes[2:].decode('utf-16le', errors='replace')

    try:
        return plain_bytes.decode('utf-8')
    except UnicodeDecodeError:
        return plain_bytes.decode('cp1252', errors='replace')


import re
import xml.etree.ElementTree as ET
from typing import Dict, Any, List


def parse_xdl_db_config(data: bytes) -> Dict[str, Any]:
    """
    Desencripta um ficheiro .xdl de configuração do ZoneSoft,
    extrai o texto XML em claro e deteta automaticamente os parâmetros de ligação
    à base de dados (Servidor, BD, Utilizador e Palavra-Passe).
    """
    plain_text = detect_and_decrypt_text(data)

    config = {
        "server": "",
        "database": "",
        "username": "",
        "password": "",
        "port": None,
    }
    passwords_found: List[str] = []

    # 1. Tentar parse como XML
    try:
        root = ET.fromstring(plain_text)
        for el in root.iter():
            tag = el.tag.lower()
            text = (el.text or "").strip()
            if not text:
                continue

            if any(k in tag for k in ("server", "host", "datasource", "ip", "servidor")):
                if not config["server"]:
                    config["server"] = text
            elif any(k in tag for k in ("database", "dbname", "catalog", "basedados", "bd")):
                if not config["database"]:
                    config["database"] = text
            elif any(k in tag for k in ("user", "username", "userid", "uid", "utilizador")):
                if not config["username"]:
                    config["username"] = text
            elif any(k in tag for k in ("password", "pwd", "pass", "palavra-passe", "palavrapasse", "pin")):
                if not config["password"]:
                    config["password"] = text
                if text not in passwords_found:
                    passwords_found.append(text)
    except Exception:
        pass

    # 2. Regex fallback para pares Chave=Valor ou tags XML via regex (caso o XML não seja bem formatado)
    if not config["password"]:
        pwd_match = re.search(r'(?:password|pwd|pass|palavrapasse)\s*[:=><"]+\s*([^"\'<>\s;]+)', plain_text, re.IGNORECASE)
        if pwd_match:
            config["password"] = pwd_match.group(1)
            if config["password"] not in passwords_found:
                passwords_found.append(config["password"])

    if not config["server"]:
        srv_match = re.search(r'(?:server|host|datasource|servidor)\s*[:=><"]+\s*([^"\'<>\s;]+)', plain_text, re.IGNORECASE)
        if srv_match:
            config["server"] = srv_match.group(1)

    if not config["database"]:
        db_match = re.search(r'(?:database|dbname|catalog|basedados)\s*[:=><"]+\s*([^"\'<>\s;]+)', plain_text, re.IGNORECASE)
        if db_match:
            config["database"] = db_match.group(1)

    if not config["username"]:
        usr_match = re.search(r'(?:user|username|userid|utilizador)\s*[:=><"]+\s*([^"\'<>\s;]+)', plain_text, re.IGNORECASE)
        if usr_match:
            config["username"] = usr_match.group(1)

    return {
        "plain_text": plain_text,
        "config": config,
        "passwords_found": passwords_found,
    }
