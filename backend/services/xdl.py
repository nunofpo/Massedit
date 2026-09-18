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
