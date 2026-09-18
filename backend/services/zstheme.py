import io
import base64
import tarfile
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple

# Componentes do ZS FrontOffice Designer que suportam cor de fundo/texto e cantos arredondados
COLORABLE_TAGS = ("ZSFunctionButton", "ZSFolderButton", "ZSPaymentButton", "ZSProductButton")
ROUNDABLE_TAGS = COLORABLE_TAGS + ("ZSProductList",)


def _tag_base(tag: str) -> str:
    """Remove o sufixo numérico de instância (ex: ZSFunctionButton_3 -> ZSFunctionButton)."""
    if "_" in tag:
        base, _, suffix = tag.rpartition("_")
        if suffix.isdigit():
            return base
    return tag


from backend.services.xdl import decrypt, detect_and_decrypt_text, is_xdl_encrypted


def _read_zstheme(file_bytes: bytes) -> Tuple[ET.Element, Optional[bytes]]:
    # Tentar ler como arquivo .zstheme (tar.gz)
    try:
        with tarfile.open(fileobj=io.BytesIO(file_bytes)) as tar:
            names = tar.getnames()
            if "layout.xml" in names:
                xml_bytes = tar.extractfile("layout.xml").read()
                thumbnail_bytes = tar.extractfile("__thumbnail.png").read() if "__thumbnail.png" in names else None
                root = ET.fromstring(xml_bytes)
                return root, thumbnail_bytes
    except Exception:
        pass

    # Tentar ler como ficheiro .xdl (encriptado ou XML direto)
    xml_text = detect_and_decrypt_text(file_bytes)
    root = ET.fromstring(xml_text)
    return root, None


def _write_zstheme(root: ET.Element, thumbnail_bytes: Optional[bytes]) -> bytes:
    new_xml_bytes = ET.tostring(root, encoding="utf-8")
    out_buf = io.BytesIO()
    with tarfile.open(fileobj=out_buf, mode="w", format=tarfile.USTAR_FORMAT) as tar:
        info = tarfile.TarInfo(name="layout.xml")
        info.size = len(new_xml_bytes)
        tar.addfile(info, io.BytesIO(new_xml_bytes))
        if thumbnail_bytes:
            info2 = tarfile.TarInfo(name="__thumbnail.png")
            info2.size = len(thumbnail_bytes)
            tar.addfile(info2, io.BytesIO(thumbnail_bytes))
    return out_buf.getvalue()


def analyze_zstheme(file_bytes: bytes) -> Dict[str, Any]:
    """Lê um .zstheme e devolve os grupos de cor detetados (para o utilizador escolher o que alterar)."""
    root, thumbnail_bytes = _read_zstheme(file_bytes)

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

    thumbnail_base64 = base64.b64encode(thumbnail_bytes).decode("ascii") if thumbnail_bytes else None
    return {"groups": groups, "thumbnail_base64": thumbnail_base64}


def transform_zstheme(
    file_bytes: bytes,
    color_rules: List[Dict[str, Any]],
    rounding: Optional[int] = None,
) -> bytes:
    """
    Aplica alterações de cor (por grupo detetado em analyze_zstheme) e/ou arredondamento
    global aos componentes que ainda não têm um valor de Rounding definido.
    """
    root, thumbnail_bytes = _read_zstheme(file_bytes)

    rule_map: Dict[Tuple[str, Optional[str], Optional[str], Optional[str]], Dict[str, Any]] = {}
    for r in color_rules:
        key = (r.get("element_type"), r.get("color"), r.get("color_to"), r.get("font_color"))
        rule_map[key] = r

    def walk(el: ET.Element):
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
                if color_el is not None and rule.get("new_color"):
                    color_el.text = rule["new_color"]
                if colorto_el is not None and rule.get("new_color_to"):
                    colorto_el.text = rule["new_color_to"]
                if fontcolor_el is not None and rule.get("new_font_color"):
                    fontcolor_el.text = rule["new_font_color"]

        if rounding is not None and tag in ROUNDABLE_TAGS:
            rounding_el = el.find("Rounding")
            if rounding_el is None:
                rounding_el = ET.SubElement(el, "Rounding")
            rounding_el.text = str(rounding)

        for child in list(el):
            walk(child)

    walk(root)
    return _write_zstheme(root, thumbnail_bytes)
