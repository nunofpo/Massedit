import io
import os
import json
import math
import base64
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image, ImageDraw

from backend.db import db_manager, get_app_dir, int_color_to_hex, hex_to_int_color
from backend.services.products import _schema

MESAS_BACKUP_DIR = os.path.join(get_app_dir(), "backups", "mesas_map")

# Paleta do preset "Claro Moderno"
FILL = (250, 249, 246, 255)
BORDER = (196, 190, 176, 255)
SEAT = (176, 168, 150, 255)
SEAT_BORDER = (140, 132, 114, 255)
BG_BASE = (243, 241, 236)
BG_DOT = (225, 221, 211)

SEAT_ANGLES = {
    1: [270], 2: [270, 90], 3: [270, 30, 150],
    4: [270, 90, 0, 180], 5: [270, 342, 54, 126, 198],
    6: [270, 330, 30, 90, 150, 210],
}


def _darken(rgb: Tuple[int, int, int], factor: float = 0.72) -> Tuple[int, int, int]:
    return tuple(max(0, int(c * factor)) for c in rgb)


def _round_table_icon(size: int, seats: int, fill_rgb: Optional[Tuple[int, int, int]] = None) -> Image.Image:
    fill = (fill_rgb + (255,)) if fill_rgb else FILL
    border = (_darken(fill_rgb) + (255,)) if fill_rgb else BORDER
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
        sd.rounded_rectangle([0, 0, seat_w - 1, seat_h - 1], radius=seat_h * 0.45, fill=SEAT, outline=SEAT_BORDER, width=2)
        seat_im = seat_im.rotate(-a + 90, expand=True)
        im.alpha_composite(seat_im, (int(sx - seat_im.width / 2), int(sy - seat_im.height / 2)))
    d.ellipse(box, fill=fill, outline=border, width=4)
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


def _bench_icon(w: int, h: int) -> Image.Image:
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([w * 0.03, h * 0.25, w * 0.97, h * 0.85], radius=h * 0.22, fill=FILL, outline=BORDER, width=3)
    for i in range(5):
        x = w * 0.1 + i * (w * 0.8 / 4)
        d.line([x, h * 0.3, x, h * 0.8], fill=BORDER, width=2)
    return im


def _bg_tile(size: int = 100) -> Image.Image:
    im = Image.new("RGB", (size, size), BG_BASE)
    d = ImageDraw.Draw(im)
    for y in range(0, size, 20):
        for x in range(0, size, 20):
            d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=BG_DOT)
    return im


def _nearest_seat_count(lugares: Optional[int]) -> int:
    if not lugares or lugares <= 0:
        return 4
    options = sorted(SEAT_ANGLES.keys())
    return min(options, key=lambda o: abs(o - lugares))


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


def _generate_icon_for_object(tipoobjecto: int, lugares: Optional[int], largura: Optional[int], altura: Optional[int],
                               fill_hex: Optional[str] = None) -> Image.Image:
    w = largura if largura and largura > 0 else 150
    h = altura if altura and altura > 0 else 150
    fill_rgb = _hex_to_rgb(fill_hex)
    if tipoobjecto == 1:
        # Objeto decorativo: forma alongada -> bancada; senão -> planta
        if w > 0 and h > 0 and w > h * 1.6:
            return _bench_icon(w, h)
        return _plant_icon(max(w, h, 60))
    size = max(w, h, 80)
    return _round_table_icon(size, _nearest_seat_count(lugares), fill_rgb)


def _bmp_bytes(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.convert("RGB").save(buf, format="BMP")
    return buf.getvalue()


def _b64(data: Optional[bytes]) -> Optional[str]:
    return base64.b64encode(data).decode("ascii") if data else None


def _tile_background(width: int, height: int, tile: Image.Image) -> Image.Image:
    canvas = Image.new("RGB", (width, height), BG_BASE)
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
        cursor.execute("SELECT codigo, descricao, ISNULL(width,0), ISNULL(height,0), DATALENGTH(background) FROM dbo.zonas ORDER BY codigo")
        return [
            {
                "codigo": int(r[0]),
                "descricao": r[1] or f"Zona {r[0]}",
                "width": int(r[2] or 0),
                "height": int(r[3] or 0),
                "has_background": bool(r[4]),
            }
            for r in cursor.fetchall()
        ]
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


def _render_zona(width: int, height: int, background_bytes: Optional[bytes], objetos: List[Dict[str, Any]],
                  icon_lookup) -> bytes:
    """Compõe fundo + objetos nas posições reais e devolve um PNG (para pré-visualização)."""
    if background_bytes:
        try:
            tile = Image.open(io.BytesIO(background_bytes)).convert("RGB")
        except Exception:
            tile = _bg_tile()
    else:
        tile = _bg_tile()
    canvas = _tile_background(max(width, 1), max(height, 1), tile)

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


def preview_preset(codigo: int) -> Dict[str, Any]:
    """Gera as imagens 'antes' (fundo/ícones atuais) e 'depois' (preset Claro Moderno), sem gravar nada."""
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
        return _generate_icon_for_object(obj["tipoobjecto"], obj["lugares"], obj["largura"], obj["altura"])

    bg_bytes = base64.b64decode(detail["background_base64"]) if detail.get("background_base64") else None

    antes_png = _render_zona(width, height, bg_bytes, objetos, current_icon)
    depois_png = _render_zona(width, height, None, objetos, preset_icon)  # None -> usa o novo fundo claro

    return {
        "available": True,
        "codigo": codigo,
        "descricao": detail["descricao"],
        "antes_base64": base64.b64encode(antes_png).decode("ascii"),
        "depois_base64": base64.b64encode(depois_png).decode("ascii"),
        "objetos_count": len(objetos),
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


def apply_preset(codigo: int) -> Tuple[bool, str]:
    """Aplica o preset 'Claro Moderno' (fundo + ícones) a uma zona, com cópia de segurança e transação."""
    detail = get_zona_detail(codigo)
    if not detail.get("available"):
        return False, detail.get("message") or f"Zona #{codigo} não disponível."

    try:
        backup_name = _save_mesas_backup(codigo, detail)
    except Exception as e:
        return False, f"Não foi possível criar a cópia de segurança ({e}). Nada foi alterado."

    width, height = detail["width"] or 640, detail["height"] or 480
    new_bg_bytes = _bmp_bytes(_tile_background(width, height, _bg_tile()))

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE dbo.zonas SET background = ? WHERE codigo = ?", (new_bg_bytes, codigo))

        for obj in detail["objetos"]:
            icon = _generate_icon_for_object(obj["tipoobjecto"], obj["lugares"], obj["largura"], obj["altura"])
            icon_bytes = _bmp_bytes(icon)
            cursor.execute("UPDATE dbo.mapamesas SET imagem = ? WHERE id = ? AND zona = ?", (icon_bytes, obj["id"], codigo))

        _trigger_zonesoft_sync(cursor, codigo)

        conn.commit()
        return True, f"Preset 'Claro Moderno' aplicado à zona '{detail['descricao']}' ({len(detail['objetos'])} objetos). Cópia de segurança: {backup_name}"
    except Exception as e:
        conn.rollback()
        return False, f"Falha ao aplicar o preset (a zona não foi alterada): {str(e)}"
    finally:
        conn.close()


def _trigger_zonesoft_sync(cursor, codigo: int) -> None:
    """Marca a sincronização cloud pendente. Não regista em dbo.produtos_historico aqui:
    'codigo' é o código da zona/objeto do mapa de mesas, não um dbo.produtos.codigo real -
    inserir aí faria a cloud pensar (sem necessidade) que um produto com esse código mudou."""
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
                         altura: Optional[int] = None) -> Tuple[bool, str]:
    """Atualiza lugares/cor/tamanho de uma mesa e regenera o seu ícone para corresponder."""
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

    icon = _generate_icon_for_object(obj["tipoobjecto"], new_lugares, new_largura, new_altura, new_cor_hex)
    icon_bytes = _bmp_bytes(icon)

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE dbo.mapamesas SET lugares = ?, largura = ?, altura = ?, corgrupo = ?, imagem = ? WHERE id = ? AND zona = ?",
            (new_lugares, new_largura, new_altura, new_cor_int, icon_bytes, objeto_id, codigo)
        )
        _trigger_zonesoft_sync(cursor, codigo)
        conn.commit()
        return True, f"Mesa '{obj['nome']}' atualizada. Cópia de segurança: {backup_name}"
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
