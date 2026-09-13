import io
import os
import json
import math
import base64
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFilter

from backend.db import db_manager, get_app_dir, int_color_to_hex, hex_to_int_color
from backend.services.products import _schema

MESAS_BACKUP_DIR = os.path.join(get_app_dir(), "backups", "mesas_map")

# Paletas de Presets de Temas Visuais de Luxo
THEMES = {
    "claro": {
        "key": "claro",
        "name": "Claro Moderno",
        "bg_base": (243, 241, 236),
        "bg_dot": (225, 221, 211),
        "fill": (250, 249, 246, 255),
        "border": (196, 190, 176, 255),
        "seat": (176, 168, 150, 255),
        "seat_border": (140, 132, 114, 255),
    },
    "escuro": {
        "key": "escuro",
        "name": "Cyber Lounge / Neon VIP",
        "bg_base": (15, 23, 42),
        "bg_dot": (30, 41, 59),
        "fill": (30, 41, 59, 255),
        "border": (56, 189, 248, 255),  # Cyan neon
        "seat": (51, 65, 85, 255),
        "seat_border": (147, 51, 234, 255),  # Purple neon
    },
    "rustico": {
        "key": "rustico",
        "name": "Rústico Madeira",
        "bg_base": (222, 205, 185),
        "bg_dot": (195, 175, 150),
        "fill": (160, 120, 85, 255),
        "border": (110, 80, 50, 255),
        "seat": (190, 150, 110, 255),
        "seat_border": (130, 95, 60, 255),
    },
    "minimalista": {
        "key": "minimalista",
        "name": "Bistro Fine Dining",
        "bg_base": (248, 249, 250),
        "bg_dot": (220, 224, 230),
        "fill": (255, 255, 255, 255),
        "border": (212, 175, 55, 255),  # Brass / Gold
        "seat": (230, 235, 240, 255),
        "seat_border": (100, 110, 120, 255),
    },
}

SEAT_ANGLES = {
    1: [270], 2: [270, 90], 3: [270, 30, 150],
    4: [270, 90, 0, 180], 5: [270, 342, 54, 126, 198],
    6: [270, 330, 30, 90, 150, 210], 8: [0, 45, 90, 135, 180, 225, 270, 315]
}


def _darken(rgb: Tuple[int, int, int], factor: float = 0.72) -> Tuple[int, int, int]:
    return tuple(max(0, int(c * factor)) for c in rgb)


def _hex_to_rgb(hex_str: Optional[str]) -> Optional[Tuple[int, int, int]]:
    if not hex_str:
        return None
    h = hex_str.strip().lstrip("#")
    if len(h) != 6:
        return None
    try:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    except ValueError:
        return None


def _round_table_icon(size: int, seats: int, fill_rgb: Optional[Tuple[int, int, int]] = None,
                      theme_key: str = "claro") -> Image.Image:
    t = THEMES.get(theme_key, THEMES["claro"])
    fill = (fill_rgb + (255,)) if fill_rgb else t["fill"]
    border = (_darken(fill_rgb) + (255,)) if fill_rgb else t["border"]
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = size * 0.20
    box = [pad, pad, size - pad, size - pad]
    cx, cy = size / 2, size / 2
    rr = (size - 2 * pad) / 2
    seat_w = size * 0.18
    seat_h = size * 0.10
    angles = SEAT_ANGLES.get(seats, SEAT_ANGLES[4])
    for a in angles:
        rad = math.radians(a)
        sx = cx + (rr + seat_h * 0.55) * math.cos(rad)
        sy = cy + (rr + seat_h * 0.55) * math.sin(rad)
        seat_im = Image.new("RGBA", (int(seat_w), int(seat_h)), (0, 0, 0, 0))
        sd = ImageDraw.Draw(seat_im)
        sd.rounded_rectangle([0, 0, seat_w - 1, seat_h - 1], radius=seat_h * 0.45, fill=t["seat"], outline=t["seat_border"], width=2)
        seat_im = seat_im.rotate(-a + 90, expand=True)
        im.alpha_composite(seat_im, (int(sx - seat_im.width / 2), int(sy - seat_im.height / 2)))
    d.ellipse(box, fill=fill, outline=border, width=4)
    return im


def _square_table_icon(size: int, seats: int, fill_rgb: Optional[Tuple[int, int, int]] = None,
                       theme_key: str = "claro") -> Image.Image:
    t = THEMES.get(theme_key, THEMES["claro"])
    fill = (fill_rgb + (255,)) if fill_rgb else t["fill"]
    border = (_darken(fill_rgb) + (255,)) if fill_rgb else t["border"]
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = size * 0.20
    box = [pad, pad, size - pad, size - pad]
    d.rounded_rectangle(box, radius=size * 0.08, fill=fill, outline=border, width=4)

    seat_w = size * 0.22
    seat_h = size * 0.10
    if seats in [1, 2, 4]:
        d.rounded_rectangle([size * 0.39, pad - seat_h - 2, size * 0.61, pad - 2], radius=3, fill=t["seat"], outline=t["seat_border"], width=2)
    if seats in [2, 4]:
        d.rounded_rectangle([size * 0.39, size - pad + 2, size * 0.61, size - pad + seat_h + 2], radius=3, fill=t["seat"], outline=t["seat_border"], width=2)
    if seats == 4:
        d.rounded_rectangle([pad - seat_h - 2, size * 0.39, pad - 2, size * 0.61], radius=3, fill=t["seat"], outline=t["seat_border"], width=2)
        d.rounded_rectangle([size - pad + 2, size * 0.39, size - pad + seat_h + 2, size * 0.61], radius=3, fill=t["seat"], outline=t["seat_border"], width=2)
    return im


def _rectangle_table_icon(w: int, h: int, seats: int, fill_rgb: Optional[Tuple[int, int, int]] = None,
                          theme_key: str = "claro") -> Image.Image:
    t = THEMES.get(theme_key, THEMES["claro"])
    fill = (fill_rgb + (255,)) if fill_rgb else t["fill"]
    border = (_darken(fill_rgb) + (255,)) if fill_rgb else t["border"]
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad_x = w * 0.15
    pad_y = h * 0.20
    box = [pad_x, pad_y, w - pad_x, h - pad_y]
    d.rounded_rectangle(box, radius=min(w, h) * 0.1, fill=fill, outline=border, width=4)

    side_seats = max(1, seats // 2)
    seat_w = (w - 2 * pad_x) / (side_seats + 0.5)
    seat_h = h * 0.12

    for i in range(side_seats):
        sx = pad_x + (i + 0.25) * ((w - 2 * pad_x) / side_seats)
        d.rounded_rectangle([sx, pad_y - seat_h - 2, sx + seat_w, pad_y - 2], radius=3, fill=t["seat"], outline=t["seat_border"], width=2)
        d.rounded_rectangle([sx, h - pad_y + 2, sx + seat_w, h - pad_y + seat_h + 2], radius=3, fill=t["seat"], outline=t["seat_border"], width=2)
    return im


def _plant_icon(size: int) -> Image.Image:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pot_col = (176, 141, 112, 255)
    leaf_col = (122, 158, 108, 255)
    leaf_dark = (94, 130, 82, 255)
    d.rounded_rectangle([size * 0.35, size * 0.68, size * 0.65, size * 0.92], radius=max(2, size * 0.04), fill=pot_col)
    cx, cy = size * 0.5, size * 0.55
    for i, a in enumerate([250, 290, 330, 10, 50, 90, 130, 170, 210]):
        rad = math.radians(a)
        lx = cx + size * 0.28 * math.cos(rad)
        ly = cy + size * 0.28 * math.sin(rad)
        col = leaf_col if i % 2 == 0 else leaf_dark
        d.ellipse([lx - size * 0.11, ly - size * 0.09, lx + size * 0.11, ly + size * 0.09], fill=col)
    d.ellipse([cx - size * 0.09, cy - size * 0.09, cx + size * 0.09, cy + size * 0.09], fill=leaf_dark)
    return im


def _bench_icon(w: int, h: int, theme_key: str = "claro") -> Image.Image:
    t = THEMES.get(theme_key, THEMES["claro"])
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([w * 0.03, h * 0.25, w * 0.97, h * 0.85], radius=h * 0.22, fill=t["fill"], outline=t["border"], width=3)
    for i in range(5):
        x = w * 0.1 + i * (w * 0.8 / 4)
        d.line([x, h * 0.3, x, h * 0.8], fill=t["border"], width=2)
    return im


def _counter_icon(w: int, h: int, theme_key: str = "claro") -> Image.Image:
    t = THEMES.get(theme_key, THEMES["claro"])
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([2, 2, w - 3, h - 3], radius=min(w, h) * 0.15, fill=t["fill"], outline=t["border"], width=4)
    d.line([w * 0.15, h * 0.5, w * 0.85, h * 0.5], fill=t["border"], width=3)
    return im


def _wall_icon(w: int, h: int, theme_key: str = "claro") -> Image.Image:
    t = THEMES.get(theme_key, THEMES["claro"])
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([1, 1, w - 2, h - 2], radius=2, fill=t["border"], outline=t["seat_border"], width=1)
    return im


def _bg_tile(size: int = 100, theme_key: str = "claro") -> Image.Image:
    t = THEMES.get(theme_key, THEMES["claro"])
    im = Image.new("RGB", (size, size), t["bg_base"])
    d = ImageDraw.Draw(im)
    for y in range(0, size, 20):
        for x in range(0, size, 20):
            d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=t["bg_dot"])
    return im


def _nearest_seat_count(lugares: Optional[int]) -> int:
    if not lugares or lugares <= 0:
        return 4
    options = sorted(SEAT_ANGLES.keys())
    return min(options, key=lambda o: abs(o - lugares))


def _generate_icon_for_object(tipoobjecto: int, lugares: Optional[int], largura: Optional[int], altura: Optional[int],
                               fill_hex: Optional[str] = None, forma: Optional[str] = None,
                               theme_key: str = "claro") -> Image.Image:
    w = largura if largura and largura > 0 else 120
    h = altura if altura and altura > 0 else 120
    fill_rgb = _hex_to_rgb(fill_hex)
    seats = _nearest_seat_count(lugares)

    if tipoobjecto == 1:
        if forma == "wall":
            return _wall_icon(w, h, theme_key)
        elif forma == "bench" or (w > 0 and h > 0 and w > h * 1.6):
            return _bench_icon(w, h, theme_key)
        elif forma == "counter":
            return _counter_icon(w, h, theme_key)
        return _plant_icon(max(w, h, 60))

    if forma == "square":
        return _square_table_icon(max(w, h, 80), seats, fill_rgb, theme_key)
    elif forma == "rectangle" or (w != h and abs(w - h) > 30):
        return _rectangle_table_icon(w, h, seats, fill_rgb, theme_key)

    size = max(w, h, 80)
    return _round_table_icon(size, seats, fill_rgb, theme_key)


def _bmp_bytes(im: Image.Image, bg_rgb: Tuple[int, int, int] = (243, 241, 236)) -> bytes:
    buf = io.BytesIO()
    if im.mode == "RGBA":
        # Compõe a transparência sobre a cor do fundo da zona em vez de fundo preto
        canvas = Image.new("RGB", im.size, bg_rgb)
        canvas.paste(im, mask=im.split()[3])
        canvas.save(buf, format="BMP")
        return buf.getvalue()
    im.convert("RGB").save(buf, format="BMP")
    return buf.getvalue()


def _b64(data: Optional[bytes]) -> Optional[str]:
    return base64.b64encode(data).decode("ascii") if data else None


def _tile_background(width: int, height: int, tile: Image.Image, theme_key: str = "claro") -> Image.Image:
    t = THEMES.get(theme_key, THEMES["claro"])
    canvas = Image.new("RGB", (width, height), t["bg_base"])
    tw, th = tile.size
    for y in range(0, height, th):
        for x in range(0, width, tw):
            canvas.paste(tile, (x, y))
    return canvas


def get_mesas_zonas() -> List[Dict[str, Any]]:
    """Lista as zonas do mapa de mesas (dbo.zonas)."""
    try:
        conn = db_manager.get_connection()
    except Exception:
        return []
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "zonas" not in schema:
            return []
        cursor.execute("""
            SELECT codigo, descricao, ISNULL(width,0), ISNULL(height,0), DATALENGTH(background),
                   ISNULL(precozona,1), ISNULL(tabelaiva,1), ISNULL(centroproducao,0)
            FROM dbo.zonas ORDER BY codigo
        """)
        return [
            {
                "codigo": int(r[0]),
                "descricao": r[1] or f"Zona {r[0]}",
                "width": int(r[2] or 0),
                "height": int(r[3] or 0),
                "has_background": bool(r[4]),
                "precozona": int(r[5] or 1),
                "tabelaiva": int(r[6] or 1),
                "centroproducao": int(r[7] or 0)
            }
            for r in cursor.fetchall()
        ]
    finally:
        conn.close()


def create_zona(descricao: str, width: int = 800, height: int = 600, precozona: int = 1,
                tabelaiva: int = 1, centroproducao: int = 0) -> Tuple[bool, str, Optional[int]]:
    """Cria uma nova zona em dbo.zonas com um código único automático."""
    if not descricao or not descricao.strip():
        return False, "O nome da zona é obrigatório.", None
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT ISNULL(MAX(codigo), 0) + 1 FROM dbo.zonas")
        new_codigo = int(cursor.fetchone()[0])
        bg_bytes = _bmp_bytes(_tile_background(width, height, _bg_tile()))
        cursor.execute("""
            INSERT INTO dbo.zonas (codigo, descricao, width, height, precozona, tabelaiva, centroproducao, background)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (new_codigo, descricao.strip(), width, height, precozona, tabelaiva, centroproducao, bg_bytes))
        _trigger_zonesoft_sync(cursor, new_codigo)
        conn.commit()
        return True, f"Zona '{descricao.strip()}' (#{new_codigo}) criada com sucesso.", new_codigo
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao criar zona: {str(e)}", None
    finally:
        conn.close()


def update_zona_props(codigo: int, descricao: Optional[str] = None, width: Optional[int] = None,
                      height: Optional[int] = None, precozona: Optional[int] = None,
                      tabelaiva: Optional[int] = None, centroproducao: Optional[int] = None) -> Tuple[bool, str]:
    """Atualiza as propriedades de negócio e dimensões de uma zona."""
    detail = get_zona_detail(codigo)
    if not detail.get("available"):
        return False, detail.get("message") or f"Zona #{codigo} não encontrada."
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        if descricao is not None and descricao.strip():
            cursor.execute("UPDATE dbo.zonas SET descricao = ? WHERE codigo = ?", (descricao.strip(), codigo))
        if width is not None and width > 0:
            cursor.execute("UPDATE dbo.zonas SET width = ? WHERE codigo = ?", (width, codigo))
        if height is not None and height > 0:
            cursor.execute("UPDATE dbo.zonas SET height = ? WHERE codigo = ?", (height, codigo))
        if precozona is not None:
            cursor.execute("UPDATE dbo.zonas SET precozona = ? WHERE codigo = ?", (precozona, codigo))
        if tabelaiva is not None:
            cursor.execute("UPDATE dbo.zonas SET tabelaiva = ? WHERE codigo = ?", (tabelaiva, codigo))
        if centroproducao is not None:
            cursor.execute("UPDATE dbo.zonas SET centroproducao = ? WHERE codigo = ?", (centroproducao, codigo))
        _trigger_zonesoft_sync(cursor, codigo)
        conn.commit()
        return True, f"Zona #{codigo} atualizada."
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao atualizar zona: {str(e)}"
    finally:
        conn.close()


def delete_zona(codigo: int) -> Tuple[bool, str]:
    """Elimina uma zona de dbo.zonas e remove as suas mesas em dbo.mapamesas."""
    detail = get_zona_detail(codigo)
    if not detail.get("available"):
        return False, detail.get("message") or f"Zona #{codigo} não encontrada."
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM dbo.mapamesas WHERE zona = ?", (codigo,))
        cursor.execute("DELETE FROM dbo.zonas WHERE codigo = ?", (codigo,))
        _trigger_zonesoft_sync(cursor, codigo)
        conn.commit()
        return True, f"Zona #{codigo} e respetivas mesas eliminadas."
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao eliminar zona: {str(e)}"
    finally:
        conn.close()


def get_zona_detail(codigo: int) -> Dict[str, Any]:
    """Devolve o fundo e todos os objetos (mesas/decoração) de uma zona."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = _schema(cursor)
        if "zonas" not in schema or "mapamesas" not in schema:
            return {"available": False}

        cursor.execute("SELECT descricao, width, height, background FROM dbo.zonas WHERE codigo = ?", (codigo,))
        row = cursor.fetchone()
        if not row:
            return {"available": False, "message": f"Zona #{codigo} não encontrada."}
        descricao, width, height, background = row

        cursor.execute("""
            SELECT id, nomeobjecto, posx, posy, altura, largura, tipoobjecto, lugares, corgrupo, imagem
            FROM dbo.mapamesas WHERE zona = ?
            ORDER BY id
        """, (codigo,))
        objetos = []
        for oid, nome, posx, posy, altura, largura, tipoobjecto, lugares, corgrupo, imagem in cursor.fetchall():
            objetos.append({
                "id": int(oid),
                "nome": nome or "",
                "posx": int(posx or 0),
                "posy": int(posy or 0),
                "altura": int(altura or 0),
                "largura": int(largura or 0),
                "tipoobjecto": int(tipoobjecto or 0),
                "lugares": int(lugares or 0),
                "cor_hex": int_color_to_hex(corgrupo),
                "imagem_base64": _b64(imagem),
            })

        return {
            "available": True,
            "codigo": codigo,
            "descricao": descricao or f"Zona {codigo}",
            "width": int(width or 0),
            "height": int(height or 0),
            "background_base64": _b64(background),
            "objetos": objetos,
        }
    finally:
        conn.close()


def create_mesa_objeto(codigo_zona: int, nome: str, tipoobjecto: int = 0, lugares: int = 4,
                       forma: str = "round", posx: int = 60, posy: int = 60, largura: int = 100,
                       altura: int = 100, cor_hex: Optional[str] = None) -> Tuple[bool, str, Optional[int]]:
    """Cria uma nova mesa ou objeto decorativo na zona e regista em dbo.mesas e dbo.mapamesas."""
    detail = get_zona_detail(codigo_zona)
    if not detail.get("available"):
        return False, detail.get("message") or f"Zona #{codigo_zona} não disponível.", None
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        
        # Determina o ID numérico da mesa
        target_nome = nome.strip() if nome and nome.strip() else ""
        new_id = None
        if target_nome.isdigit():
            possible_id = int(target_nome)
            cursor.execute("SELECT 1 FROM dbo.mapamesas WHERE id = ? AND zona = ?", (possible_id, codigo_zona))
            if not cursor.fetchone():
                new_id = possible_id

        if new_id is None:
            cursor.execute("SELECT ISNULL(MAX(id), 0) + 1 FROM dbo.mapamesas")
            new_id = int(cursor.fetchone()[0])
            if not target_nome:
                target_nome = str(new_id)

        cor_int = hex_to_int_color(cor_hex) if cor_hex else 0
        icon = _generate_icon_for_object(tipoobjecto, lugares, largura, altura, cor_hex, forma)
        icon_bytes = _bmp_bytes(icon)

        cursor.execute("""
            INSERT INTO dbo.mapamesas (id, nomeobjecto, numeroobjecto, posx, posy, altura, largura, tipoobjecto, lugares, corgrupo, zona, imagem)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (new_id, target_nome, new_id, posx, posy, altura, largura, tipoobjecto, lugares, cor_int, codigo_zona, icon_bytes))

        if tipoobjecto == 0:
            # Garante o registo correspondente na tabela de negócio dbo.mesas para o FrontOffice abrir contas
            try:
                cursor.execute("SELECT 1 FROM dbo.mesas WHERE mesa = ?", (new_id,))
                if not cursor.fetchone():
                    cursor.execute("""
                        INSERT INTO dbo.mesas (mesa, nomemesa, pessoas, mesagrupo, lugar)
                        VALUES (?, ?, ?, 0, 0)
                    """, (new_id, target_nome, lugares))
                else:
                    cursor.execute("UPDATE dbo.mesas SET nomemesa = ?, pessoas = ? WHERE mesa = ?", (target_nome, lugares, new_id))
            except Exception:
                pass

        _trigger_zonesoft_sync(cursor, codigo_zona)
        conn.commit()
        return True, f"Mesa/Objeto '{target_nome}' (#{new_id}) criada com sucesso.", new_id
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao criar mesa: {str(e)}", None
    finally:
        conn.close()


def duplicate_mesa_objeto(codigo_zona: int, objeto_id: int) -> Tuple[bool, str, Optional[int]]:
    """Duplica um objeto existente da zona posicionando-o ao lado com nome incrementado."""
    detail = get_zona_detail(codigo_zona)
    if not detail.get("available"):
        return False, detail.get("message") or f"Zona #{codigo_zona} não disponível.", None
    obj = next((o for o in detail["objetos"] if o["id"] == objeto_id), None)
    if obj is None:
        return False, f"Objeto #{objeto_id} não encontrado na zona #{codigo_zona}.", None

    new_nome = f"{obj['nome']} (cópia)"
    if obj["nome"].isdigit():
        new_nome = str(int(obj["nome"]) + 1)

    new_x = min(obj["posx"] + 40, detail["width"] - 120)
    new_y = min(obj["posy"] + 40, detail["height"] - 120)

    return create_mesa_objeto(
        codigo_zona=codigo_zona,
        nome=new_nome,
        tipoobjecto=obj["tipoobjecto"],
        lugares=obj["lugares"],
        posx=new_x,
        posy=new_y,
        largura=obj["largura"],
        altura=obj["altura"],
        cor_hex=obj["cor_hex"]
    )


def delete_mesa_objeto(codigo_zona: int, objeto_id: int) -> Tuple[bool, str]:
    """Elimina um objeto de dbo.mapamesas."""
    detail = get_zona_detail(codigo_zona)
    if not detail.get("available"):
        return False, detail.get("message") or f"Zona #{codigo_zona} não disponível."
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM dbo.mapamesas WHERE id = ? AND zona = ?", (objeto_id, codigo_zona))
        _trigger_zonesoft_sync(cursor, codigo_zona)
        conn.commit()
        return True, f"Objeto #{objeto_id} eliminado."
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao eliminar objeto: {str(e)}"
    finally:
        conn.close()


def clear_zona_objetos(codigo_zona: int) -> Tuple[bool, str]:
    """Elimina TODOS os objetos/mesas da zona especificada, criando cópia de segurança prévia."""
    detail = get_zona_detail(codigo_zona)
    if not detail.get("available"):
        return False, detail.get("message") or f"Zona #{codigo_zona} não disponível."

    try:
        backup_name = _save_mesas_backup(codigo_zona, detail)
    except Exception as e:
        return False, f"Não foi possível criar a cópia de segurança ({e}). Nada foi removido."

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM dbo.mapamesas WHERE zona = ?", (codigo_zona,))
        _trigger_zonesoft_sync(cursor, codigo_zona)
        conn.commit()
        return True, f"Todos os objetos da zona #{codigo_zona} foram removidos com sucesso. Cópia de segurança: {backup_name}"
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao limpar objetos da zona: {str(e)}"
    finally:
        conn.close()


def clear_all_mapamesas(clear_zonas: bool = False) -> Tuple[bool, str]:
    """Elimina TODOS os objetos/mesas de TODAS as zonas da base de dados (e opcionalmente as próprias zonas)."""
    zonas = get_mesas_zonas()
    for z in zonas:
        detail = get_zona_detail(z["codigo"])
        if detail.get("available"):
            try:
                _save_mesas_backup(z["codigo"], detail)
            except Exception:
                pass

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM dbo.mapamesas")
        if clear_zonas:
            cursor.execute("DELETE FROM dbo.zonas")
        _trigger_zonesoft_sync(cursor, 0)
        conn.commit()
        msg = "Todos os objetos e salas/zonas do mapa de mesas foram limpos." if clear_zonas else "Todos os objetos de todas as zonas foram limpos."
        return True, msg
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao limpar o mapa de mesas: {str(e)}"
    finally:
        conn.close()



def _render_zona(width: int, height: int, background_bytes: Optional[bytes], objetos: List[Dict[str, Any]],
                  icon_lookup, theme_key: str = "claro") -> bytes:
    """Compõe fundo + objetos nas posições reais e devolve um PNG (para pré-visualização)."""
    if background_bytes:
        try:
            tile = Image.open(io.BytesIO(background_bytes)).convert("RGB")
        except Exception:
            tile = _bg_tile(theme_key=theme_key)
    else:
        tile = _bg_tile(theme_key=theme_key)
    canvas = _tile_background(max(width, 1), max(height, 1), tile, theme_key=theme_key)

    for obj in objetos:
        if obj["posx"] == 0 and obj["posy"] == 0:
            continue
        icon = icon_lookup(obj)
        if icon is None:
            continue
        w = obj["largura"] if obj["largura"] else icon.width
        h = obj["altura"] if obj["altura"] else icon.height
        resized = icon.resize((max(w, 1), max(h, 1))).convert("RGBA")
        canvas.paste(resized, (obj["posx"], obj["posy"]), resized)

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


def preview_preset(codigo: int, theme_key: str = "claro") -> Dict[str, Any]:
    """Gera as imagens 'antes' (fundo/ícones atuais) e 'depois' (preset selecionado), sem gravar nada."""
    detail = get_zona_detail(codigo)
    if not detail.get("available"):
        return detail

    width, height = detail["width"] or 640, detail["height"] or 480
    objetos = detail["objetos"]

    def current_icon(obj):
        if obj["imagem_base64"]:
            try:
                return Image.open(io.BytesIO(base64.b64decode(obj["imagem_base64"])))
            except Exception:
                return None
        return None

    def preset_icon(obj):
        return _generate_icon_for_object(obj["tipoobjecto"], obj["lugares"], obj["largura"], obj["altura"], theme_key=theme_key)

    bg_bytes = base64.b64decode(detail["background_base64"]) if detail.get("background_base64") else None

    antes_png = _render_zona(width, height, bg_bytes, objetos, current_icon)
    depois_png = _render_zona(width, height, None, objetos, preset_icon, theme_key=theme_key)

    return {
        "available": True,
        "codigo": codigo,
        "descricao": detail["descricao"],
        "antes_base64": base64.b64encode(antes_png).decode("ascii"),
        "depois_base64": base64.b64encode(depois_png).decode("ascii"),
        "objetos_count": len(objetos),
        "theme_name": THEMES.get(theme_key, THEMES["claro"])["name"]
    }


def _save_mesas_backup(codigo: int, detail: Dict[str, Any]) -> str:
    os.makedirs(MESAS_BACKUP_DIR, exist_ok=True)
    now = datetime.now()
    filename = f"backup_mesas_zona{codigo}_{now.strftime('%Y%m%d_%H%M%S')}_{now.microsecond:06d}.json"
    filepath = os.path.join(MESAS_BACKUP_DIR, filename)
    snapshot = {
        "timestamp": now.isoformat(),
        "codigo": codigo,
        "descricao": detail.get("descricao"),
        "width": detail.get("width"),
        "height": detail.get("height"),
        "background_base64": detail.get("background_base64"),
        "objetos": [{"id": o["id"], "imagem_base64": o["imagem_base64"]} for o in detail.get("objetos", [])],
    }
    tmp_path = filepath + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f)
    os.replace(tmp_path, filepath)
    return filename


def apply_preset(codigo: int, theme_key: str = "claro") -> Tuple[bool, str]:
    """Aplica o preset visual de tema (fundo + ícones) a uma zona, com cópia de segurança e transação."""
    detail = get_zona_detail(codigo)
    if not detail.get("available"):
        return False, detail.get("message") or f"Zona #{codigo} não disponível."

    t = THEMES.get(theme_key, THEMES["claro"])

    try:
        backup_name = _save_mesas_backup(codigo, detail)
    except Exception as e:
        return False, f"Não foi possível criar a cópia de segurança ({e}). Nada foi alterado."

    width, height = detail["width"] or 640, detail["height"] or 480
    new_bg_bytes = _bmp_bytes(_tile_background(width, height, _bg_tile(theme_key=theme_key), theme_key=theme_key))

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE dbo.zonas SET background = ? WHERE codigo = ?", (new_bg_bytes, codigo))

        for obj in detail["objetos"]:
            icon = _generate_icon_for_object(obj["tipoobjecto"], obj["lugares"], obj["largura"], obj["altura"], theme_key=theme_key)
            icon_bytes = _bmp_bytes(icon)
            cursor.execute("UPDATE dbo.mapamesas SET imagem = ? WHERE id = ? AND zona = ?", (icon_bytes, obj["id"], codigo))

        _trigger_zonesoft_sync(cursor, codigo)

        conn.commit()
        return True, f"Preset '{t['name']}' aplicado à zona '{detail['descricao']}' ({len(detail['objetos'])} objetos). Cópia de segurança: {backup_name}"
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao aplicar o preset (a zona não foi alterada): {str(e)}"
    finally:
        conn.close()


def _trigger_zonesoft_sync(cursor, codigo: int) -> None:
    """Marca a sincronização cloud pendente."""
    try:
        cursor.execute("UPDATE dbo.fullsync SET sync = 1, finished = 0")
    except Exception:
        pass


def update_posicoes(codigo: int, updates: List[Dict[str, int]]) -> Tuple[bool, str]:
    """Grava novas posições (posx/posy) de vários objetos de uma zona, em lote."""
    if not updates:
        return True, "Nada para gravar."

    detail = get_zona_detail(codigo)
    if not detail.get("available"):
        return False, detail.get("message") or f"Zona #{codigo} não disponível."
    valid_ids = {o["id"] for o in detail["objetos"]}

    try:
        backup_name = _save_mesas_backup(codigo, detail)
    except Exception as e:
        return False, f"Não foi possível criar a cópia de segurança ({e}). Nada foi alterado."

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        moved = 0
        for u in updates:
            oid = int(u.get("id"))
            if oid not in valid_ids:
                continue
            cursor.execute(
                "UPDATE dbo.mapamesas SET posx = ?, posy = ? WHERE id = ? AND zona = ?",
                (int(u.get("posx", 0)), int(u.get("posy", 0)), oid, codigo)
            )
            moved += 1
        _trigger_zonesoft_sync(cursor, codigo)
        conn.commit()
        return True, f"{moved} objeto(s) reposicionado(s). Cópia de segurança: {backup_name}"
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao gravar as posições (nada foi alterado): {str(e)}"
    finally:
        conn.close()


def update_objeto_props(codigo: int, objeto_id: int, lugares: Optional[int] = None,
                          cor_hex: Optional[str] = None, largura: Optional[int] = None,
                          altura: Optional[int] = None, forma: Optional[str] = None,
                          nome: Optional[str] = None, novo_id: Optional[int] = None) -> Tuple[bool, str]:
    """Atualiza número, nome, lugares, cor, tamanho e forma de uma mesa e regenera o seu ícone."""
    detail = get_zona_detail(codigo)
    if not detail.get("available"):
        return False, detail.get("message") or f"Zona #{codigo} não disponível."
    obj = next((o for o in detail["objetos"] if o["id"] == objeto_id), None)
    if obj is None:
        return False, f"Objeto #{objeto_id} não encontrado na zona #{codigo}."

    try:
        backup_name = _save_mesas_backup(codigo, detail)
    except Exception as e:
        return False, f"Não foi possível criar a cópia de segurança ({e}). Nada foi alterado."

    new_lugares = lugares if lugares is not None else obj["lugares"]
    new_largura = largura if largura is not None else obj["largura"]
    new_altura = altura if altura is not None else obj["altura"]
    new_cor_hex = cor_hex or obj["cor_hex"]
    new_cor_int = hex_to_int_color(new_cor_hex)
    new_nome = nome.strip() if nome and nome.strip() else obj["nome"]
    target_id = novo_id if (novo_id and novo_id > 0) else objeto_id

    icon = _generate_icon_for_object(obj["tipoobjecto"], new_lugares, new_largura, new_altura, new_cor_hex, forma)
    icon_bytes = _bmp_bytes(icon)

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        
        # Se alterou o ID (número oficial da mesa)
        if target_id != objeto_id:
            cursor.execute("UPDATE dbo.mapamesas SET id = ?, numeroobjecto = ? WHERE id = ? AND zona = ?", (target_id, target_id, objeto_id, codigo))
            if obj["tipoobjecto"] == 0:
                try:
                    cursor.execute("UPDATE dbo.mesas SET mesa = ? WHERE mesa = ?", (target_id, objeto_id))
                except Exception:
                    pass

        cursor.execute(
            "UPDATE dbo.mapamesas SET nomeobjecto = ?, lugares = ?, largura = ?, altura = ?, corgrupo = ?, imagem = ? WHERE id = ? AND zona = ?",
            (new_nome, new_lugares, new_largura, new_altura, new_cor_int, icon_bytes, target_id, codigo)
        )
        if obj["tipoobjecto"] == 0:
            try:
                cursor.execute("UPDATE dbo.mesas SET nomemesa = ?, pessoas = ? WHERE mesa = ?", (new_nome, new_lugares, target_id))
            except Exception:
                pass
        _trigger_zonesoft_sync(cursor, codigo)
        conn.commit()
        return True, f"Mesa '{new_nome}' (#{target_id}) atualizada. Cópia de segurança: {backup_name}"
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao atualizar a mesa (nada foi alterado): {str(e)}"
    finally:
        conn.close()


def upload_objeto_imagem(codigo: int, objeto_id: int, image_bytes: bytes) -> Tuple[bool, str]:
    """Substitui o ícone de um objeto por uma imagem própria (convertida para BMP)."""
    detail = get_zona_detail(codigo)
    if not detail.get("available"):
        return False, detail.get("message") or f"Zona #{codigo} não disponível."
    obj = next((o for o in detail["objetos"] if o["id"] == objeto_id), None)
    if obj is None:
        return False, f"Objeto #{objeto_id} não encontrado na zona #{codigo}."

    try:
        im = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        return False, f"Imagem inválida: {e}"

    try:
        backup_name = _save_mesas_backup(codigo, detail)
    except Exception as e:
        return False, f"Não foi possível criar a cópia de segurança ({e}). Nada foi alterado."

    bmp_bytes = _bmp_bytes(im)

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE dbo.mapamesas SET imagem = ? WHERE id = ? AND zona = ?", (bmp_bytes, objeto_id, codigo))
        _trigger_zonesoft_sync(cursor, codigo)
        conn.commit()
        return True, f"Imagem da mesa '{obj['nome']}' atualizada. Cópia de segurança: {backup_name}"
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao gravar a imagem (nada foi alterado): {str(e)}"
    finally:
        conn.close()


def upload_zona_background(codigo: int, image_bytes: bytes, tile: bool = False) -> Tuple[bool, str]:
    """Substitui o fundo de uma zona por uma imagem própria (convertida para BMP)."""
    detail = get_zona_detail(codigo)
    if not detail.get("available"):
        return False, detail.get("message") or f"Zona #{codigo} não disponível."

    try:
        im = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        return False, f"Imagem inválida: {e}"

    try:
        backup_name = _save_mesas_backup(codigo, detail)
    except Exception as e:
        return False, f"Não foi possível criar a cópia de segurança ({e}). Nada foi alterado."

    width, height = detail["width"] or im.width, detail["height"] or im.height
    if tile:
        final_im = _tile_background(width, height, im)
    else:
        final_im = im.resize((max(width, 1), max(height, 1)))
    bmp_bytes = _bmp_bytes(final_im)

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE dbo.zonas SET background = ? WHERE codigo = ?", (bmp_bytes, codigo))
        _trigger_zonesoft_sync(cursor, codigo)
        conn.commit()
        return True, f"Fundo da zona '{detail['descricao']}' atualizado. Cópia de segurança: {backup_name}"
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao gravar o fundo (nada foi alterado): {str(e)}"
    finally:
        conn.close()
