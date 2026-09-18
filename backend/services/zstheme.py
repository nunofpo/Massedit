import io
import base64
import tarfile
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple

COLORABLE_TAGS = ("ZSFunctionButton", "ZSFolderButton", "ZSPaymentButton", "ZSProductButton")
ROUNDABLE_TAGS = COLORABLE_TAGS + ("ZSProductList",)


def _tag_base(tag: str) -> str:
    """Remove o sufixo numérico de instância (ex: ZSFunctionButton_3 -> ZSFunctionButton)."""
    if "_" in tag:
        base, _, suffix = tag.rpartition("_")
        if suffix.isdigit():
            return base
    return tag


def _find_next_tag_name(root: ET.Element, tag_base: str) -> str:
    """Gera um nome de tag único com sufixo numérico (ex: ZSFunctionButton_12)."""
    max_idx = 0
    for child in root.iter():
        if child.tag.startswith(tag_base):
            if "_" in child.tag:
                _, _, suffix = child.tag.rpartition("_")
                if suffix.isdigit():
                    max_idx = max(max_idx, int(suffix))
            else:
                max_idx = max(max_idx, 1)
    return f"{tag_base}_{max_idx + 1}"


def _set_or_update_text(parent: ET.Element, child_tag: str, text_val: Any):
    if text_val is None:
        return
    el = parent.find(child_tag)
    if el is None:
        el = ET.SubElement(parent, child_tag)
    el.text = str(text_val)


def _read_zstheme(file_bytes: bytes) -> Tuple[ET.Element, Dict[str, bytes]]:
    """Lê o tar.gz (.zstheme) e devolve o XML layout.xml e um dicionário com todos os ficheiros adicionais."""
    extra_files: Dict[str, bytes] = {}
    layout_bytes: Optional[bytes] = None

    with tarfile.open(fileobj=io.BytesIO(file_bytes)) as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            content = tar.extractfile(member).read()
            if member.name == "layout.xml":
                layout_bytes = content
            else:
                extra_files[member.name] = content

    if layout_bytes is None:
        raise ValueError("Ficheiro .zstheme inválido: não contém layout.xml.")

    root = ET.fromstring(layout_bytes)
    return root, extra_files


def _write_zstheme(root: ET.Element, extra_files: Dict[str, bytes]) -> bytes:
    """Empacota layout.xml e todos os ficheiros adicionais num novo arquivo tar.gz (.zstheme)."""
    new_xml_bytes = ET.tostring(root, encoding="utf-8")
    out_buf = io.BytesIO()

    with tarfile.open(fileobj=out_buf, mode="w", format=tarfile.USTAR_FORMAT) as tar:
        # Adicionar layout.xml
        info = tarfile.TarInfo(name="layout.xml")
        info.size = len(new_xml_bytes)
        tar.addfile(info, io.BytesIO(new_xml_bytes))

        # Adicionar extra files (imagens, thumbnail, etc)
        for fname, content in extra_files.items():
            info_extra = tarfile.TarInfo(name=fname)
            info_extra.size = len(content)
            tar.addfile(info_extra, io.BytesIO(content))

    return out_buf.getvalue()


def analyze_zstheme(file_bytes: bytes) -> Dict[str, Any]:
    """Lê um .zstheme e devolve os grupos de cor detetados e metadados."""
    root, extra_files = _read_zstheme(file_bytes)

    combos: Dict[Tuple[str, Optional[str], Optional[str], Optional[str]], int] = {}

    def walk(el: ET.Element):
        tag = _tag_base(el.tag)
        if tag in COLORABLE_TAGS:
            color = el.findtext("Color")
            colorto = el.findtext("ColorTo")
            fontcolor = el.findtext("FontColor")
            if color or colorto or fontcolor:
                key = (tag, color, colorto, fontcolor)
                combos[key] = combos.get(key, 0) + 1
        for child in el:
            walk(child)

    walk(root)

    groups = [
        {"element_type": k[0], "color": k[1], "color_to": k[2], "font_color": k[3], "count": v}
        for k, v in sorted(combos.items(), key=lambda kv: -kv[1])
    ]

    thumbnail_bytes = extra_files.get("__thumbnail.png")
    thumbnail_base64 = base64.b64encode(thumbnail_bytes).decode("ascii") if thumbnail_bytes else None

    # Informação sobre fundo existente
    bg_info = {
        "color": root.findtext("Color"),
        "opacity": root.findtext("Opacity"),
        "background": root.findtext("Background"),
    }

    return {"groups": groups, "thumbnail_base64": thumbnail_base64, "background": bg_info}


def transform_zstheme(
    file_bytes: bytes,
    color_rules: Optional[List[Dict[str, Any]]] = None,
    rounding: Optional[int] = None,
    background: Optional[Dict[str, Any]] = None,
    shortcut_buttons: Optional[List[Dict[str, Any]]] = None,
    panels: Optional[Dict[str, Any]] = None,
) -> bytes:
    """
    Aplica alterações avançadas a um ficheiro .zstheme:
    - Cores por grupo e arredondamento global de cantos
    - Imagem de fundo e definições de cor/opacidade
    - Injeção de botões de atalho parametrizados (Desconto, Link, Exe, Funções POS)
    - Injeção de painéis rápidos (Retalho, Funções, Pagamentos)
    """
    root, extra_files = _read_zstheme(file_bytes)

    # 1. Aplicar regras de cores
    if color_rules:
        rule_map: Dict[Tuple[str, Optional[str], Optional[str], Optional[str]], Dict[str, Any]] = {}
        for r in color_rules:
            key = (r.get("element_type"), r.get("color"), r.get("color_to"), r.get("font_color"))
            rule_map[key] = r

        def walk_colors(el: ET.Element):
            tag = _tag_base(el.tag)
            if tag in COLORABLE_TAGS:
                color_el = el.find("Color")
                colorto_el = el.find("ColorTo")
                fontcolor_el = el.find("FontColor")
                key = (
                    tag,
                    color_el.text if color_el is not None else None,
                    colorto_el.text if colorto_el is not None else None,
                    fontcolor_el.text if fontcolor_el is not None else None,
                )
                rule = rule_map.get(key)
                if rule:
                    if rule.get("new_color"):
                        _set_or_update_text(el, "Color", rule["new_color"])
                    if rule.get("new_color_to"):
                        _set_or_update_text(el, "ColorTo", rule["new_color_to"])
                    if rule.get("new_font_color"):
                        _set_or_update_text(el, "FontColor", rule["new_font_color"])

            for child in list(el):
                walk_colors(child)

        walk_colors(root)

    # 2. Arredondamento global de cantos
    if rounding is not None:
        def walk_rounding(el: ET.Element):
            tag = _tag_base(el.tag)
            if tag in ROUNDABLE_TAGS:
                _set_or_update_text(el, "Rounding", rounding)
            for child in list(el):
                walk_rounding(child)

        walk_rounding(root)

    # 3. Configuração de imagem/cor de fundo
    if background:
        if background.get("color"):
            _set_or_update_text(root, "Color", background["color"])
        if background.get("opacity") is not None:
            _set_or_update_text(root, "Opacity", background["opacity"])
        if background.get("stretch") is not None:
            _set_or_update_text(root, "BackgroundStretch", 1 if background["stretch"] else 0)

        # Tratar upload de imagem de fundo
        img_b64 = background.get("image_base64")
        if img_b64:
            if "," in img_b64:
                img_b64 = img_b64.split(",", 1)[1]
            try:
                img_bytes = base64.b64decode(img_b64)
                bg_filename = "bg_custom.png"
                extra_files[bg_filename] = img_bytes
                _set_or_update_text(root, "Background", bg_filename)
            except Exception:
                pass

    # 4. Injeção de botões de atalho
    if shortcut_buttons:
        for btn in shortcut_buttons:
            tag_name = _find_next_tag_name(root, "ZSFunctionButton")
            btn_el = ET.SubElement(root, tag_name)

            _set_or_update_text(btn_el, "Caption", btn.get("caption") or "Atalho")
            if btn.get("color"):
                _set_or_update_text(btn_el, "Color", btn["color"])
            if btn.get("color_to"):
                _set_or_update_text(btn_el, "ColorTo", btn["color_to"])
            if btn.get("font_color"):
                _set_or_update_text(btn_el, "FontColor", btn["font_color"])

            _set_or_update_text(btn_el, "Left", btn.get("left", 10))
            _set_or_update_text(btn_el, "Top", btn.get("top", 10))
            _set_or_update_text(btn_el, "Width", btn.get("width", 130))
            _set_or_update_text(btn_el, "Height", btn.get("height", 60))

            b_type = btn.get("button_type", "function")
            func_id = btn.get("function_id")
            func_name = btn.get("function_name")
            params = btn.get("parameters")

            # Mapeamento para tipos especiais de botão
            if b_type == "discount":
                func_id = 179
                func_name = "Desconto Directo em Valor"
            elif b_type == "link":
                func_id = 217
                func_name = "Abrir Link Externo"
            elif b_type == "exe":
                func_id = 128
                func_name = "Função Externa"

            if func_id is not None or func_name:
                func_el = ET.SubElement(btn_el, "ZSFunction")
                if func_id is not None:
                    _set_or_update_text(func_el, "ID", func_id)
                if func_name:
                    _set_or_update_text(func_el, "Name", func_name)

            if params:
                _set_or_update_text(btn_el, "Parameters", params)

    # 5. Injeção de Painéis Especiais
    if panels:
        if panels.get("add_retail_panel"):
            p_name = _find_next_tag_name(root, "ZSRetailPOSPanel")
            p_el = ET.SubElement(root, p_name)
            _set_or_update_text(p_el, "Left", 10)
            _set_or_update_text(p_el, "Top", 10)
            _set_or_update_text(p_el, "Width", 300)
            _set_or_update_text(p_el, "Height", 400)

        if panels.get("add_function_panel"):
            p_name = _find_next_tag_name(root, "ZSFunctionPanel")
            p_el = ET.SubElement(root, p_name)
            _set_or_update_text(p_el, "Left", 320)
            _set_or_update_text(p_el, "Top", 10)
            _set_or_update_text(p_el, "Width", 300)
            _set_or_update_text(p_el, "Height", 400)

        if panels.get("add_payment_panel"):
            p_name = _find_next_tag_name(root, "ZSPaymentPanel")
            p_el = ET.SubElement(root, p_name)
            _set_or_update_text(p_el, "Left", 640)
            _set_or_update_text(p_el, "Top", 10)
            _set_or_update_text(p_el, "Width", 300)
            _set_or_update_text(p_el, "Height", 400)

    return _write_zstheme(root, extra_files)

