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


def _text_score(data: bytes) -> float:
    """Fração de bytes ASCII imprimíveis (ou espaço/quebra de linha) nos primeiros 1024 bytes."""
    if data.startswith((b'\xff\xfe', b'\xfe\xff')):  # UTF-16 com BOM: os nulos são esperados
        return 1.0
    sample = data[:1024]
    if not sample:
        return 0.0
    good = sum(1 for b in sample if b in (9, 10, 13) or 32 <= b <= 126)
    return good / len(sample)


def is_xdl_encrypted(data: bytes) -> bool:
    """
    Verifica se o buffer está cifrado em XDL ou se já é texto/XML em claro.
    Desencripta uma amostra e compara qual das duas versões parece texto legível, o que
    funciona qualquer que seja o início do conteúdo (`<?xml`, `<Config>`, etc.).
    Em caso de empate assume-se texto em claro.
    """
    if not data:
        return False
    return _text_score(decrypt(data[:1024])) > _text_score(data)


def detect_and_decrypt_text(data: bytes) -> str:
    """
    Desencripta e converte bytes para texto com deteção automática de encoding:
    UTF-8 com BOM, UTF-8 simples ou Windows-1252 (ANSI).
    Sanitiza carateres nulos e de controlo não-imprimíveis.
    """
    plain_bytes = decrypt(data) if is_xdl_encrypted(data) else data

    if plain_bytes.startswith(b'\xef\xbb\xbf'):
        raw_text = plain_bytes[3:].decode('utf-8', errors='replace')
    elif plain_bytes.startswith(b'\xff\xfe'):
        raw_text = plain_bytes[2:].decode('utf-16le', errors='replace')
    else:
        try:
            raw_text = plain_bytes.decode('utf-8')
        except UnicodeDecodeError:
            raw_text = plain_bytes.decode('cp1252', errors='replace')

    # Remover bytes nulos e carateres de controlo não imprimíveis (exceto \n, \r, \t)
    cleaned_chars = [c for c in raw_text if c in ('\n', '\r', '\t') or 32 <= ord(c) <= 126 or ord(c) >= 160]
    return ''.join(cleaned_chars)


import re
import xml.etree.ElementTree as ET
from typing import Dict, Any, List

# Evita que "GUID=" seja lido como "UID=", "LinkedServer=" como "Server=", etc.
_KEY_START = r'(?<![A-Za-z0-9_])'

# Nomes de tags XML (em minúsculas) que identificam cada parâmetro, por ordem de prioridade:
# "UserPassword" é a palavra-passe, "DatabaseServer" é o servidor.
_XML_FIELDS = (
    ("password", {"password", "pwd", "pass", "palavrapasse", "pin"}),
    ("username", {"username", "user", "userid", "uid", "utilizador"}),
    ("server", {"server", "host", "datasource", "ip", "servidor"}),
    ("database", {"database", "dbname", "catalog", "initialcatalog", "basedados", "db", "bd"}),
)


def _tag_words(tag: str) -> set:
    """Divide o nome de uma tag em palavras (camelCase, '_', '-'), ex: 'ServerIP' -> {'server', 'ip'}."""
    tag = tag.rsplit('}', 1)[-1]  # remove o namespace {uri}
    spaced = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', tag)
    spaced = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', spaced)
    words = {w.lower() for w in re.split(r'[^A-Za-z0-9]+', spaced) if w}
    words.add(re.sub(r'[^a-z0-9]', '', tag.lower()))  # nome completo, ex: 'datasource'
    return words


def _xml_field(tag: str) -> str:
    """Devolve o parâmetro ('password', 'username', 'server', 'database') a que a tag corresponde, ou ''."""
    words = _tag_words(tag)
    for field, names in _XML_FIELDS:
        if words & names:
            return field
    return ""


def parse_xdl_db_config(data: bytes) -> Dict[str, Any]:
    """
    Desencripta um ficheiro .xdl, .udl, .dsn ou de configuração do ZoneSoft/Windows,
    extrai o texto em claro e deteta automaticamente os parâmetros de ligação
    à base de dados SQL Server (Servidor, BD, Utilizador e Palavra-Passe).
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

    def add_password(value: str) -> None:
        if value not in passwords_found:
            passwords_found.append(value)

    # 1. Parse UDL / OLE DB / Connection String (ex: Data Source=.\ZONESOFTSQL;Initial Catalog=nuno;User ID=sa;Password=secret)
    udl_srv = re.search(_KEY_START + r'(?:Data Source|Server|Host|Servidor)\s*=\s*([^;`"\r\n]+)', plain_text, re.IGNORECASE)
    if udl_srv:
        config["server"] = udl_srv.group(1).strip()

    udl_db = re.search(_KEY_START + r'(?:Initial Catalog|Database|Catalog|DBName|BaseDados)\s*=\s*([^;`"\r\n]+)', plain_text, re.IGNORECASE)
    if udl_db:
        config["database"] = udl_db.group(1).strip()

    udl_usr = re.search(_KEY_START + r'(?:User ID|Username|User|UID|Utilizador)\s*=\s*([^;`"\r\n]+)', plain_text, re.IGNORECASE)
    if udl_usr:
        config["username"] = udl_usr.group(1).strip()

    udl_pwd = re.search(_KEY_START + r'(?:Password|PWD|Pass|PalavraPasse)\s*=\s*([^;`"\r\n]+)', plain_text, re.IGNORECASE)
    if udl_pwd:
        config["password"] = udl_pwd.group(1).strip()
        add_password(config["password"])

    # 2. Tentar parse como XML caso não seja UDL / Connection String puro
    if not (config["server"] and config["database"] and config["password"]):
        try:
            root = ET.fromstring(plain_text)
            for el in root.iter():
                text = (el.text or "").strip()
                if not text:
                    continue

                field = _xml_field(el.tag)
                if not field:
                    continue
                if field == "password":
                    if not config["password"]:
                        config["password"] = text
                    add_password(text)
                elif not config[field]:
                    config[field] = text
        except Exception:
            pass

    # 3. Regex Fallback para tags XML mal formatadas ou chave-valor variados
    if not config["password"]:
        pwd_match = re.search(_KEY_START + r'(?:password|pwd|pass|palavrapasse)\s*[:=><"]+\s*([^"\'<>\s;]+)', plain_text, re.IGNORECASE)
        if pwd_match:
            config["password"] = pwd_match.group(1).strip()
            add_password(config["password"])

    if not config["server"]:
        srv_match = re.search(_KEY_START + r'(?:server|host|datasource|servidor)\s*[:=><"]+\s*([^"\'<>\s;]+)', plain_text, re.IGNORECASE)
        if srv_match:
            config["server"] = srv_match.group(1).strip()

    if not config["database"]:
        db_match = re.search(_KEY_START + r'(?:database|dbname|catalog|basedados)\s*[:=><"]+\s*([^"\'<>\s;]+)', plain_text, re.IGNORECASE)
        if db_match:
            config["database"] = db_match.group(1).strip()

    if not config["username"]:
        usr_match = re.search(_KEY_START + r'(?:user|username|userid|utilizador)\s*[:=><"]+\s*([^"\'<>\s;]+)', plain_text, re.IGNORECASE)
        if usr_match:
            config["username"] = usr_match.group(1).strip()

    return {
        "plain_text": plain_text,
        "config": config,
        "passwords_found": passwords_found,
    }
