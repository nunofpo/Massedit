import os
import re
import io
import csv
import json
import base64
import difflib
import unicodedata
from typing import List, Dict, Any, Optional, Tuple

from backend.models import (
    MenuExtractionResponse, MenuSectionItem, MenuArticleItem,
    MenuPriceItem, MenuVariantItem, MenuReviewedRow,
    MenuMatchItem, MenuMatchResponse, ImportRow
)
from backend.db import db_manager, get_app_dir
from backend.services.products import (
    _schema, _prod_cols, _text_limit, _fetch_products_by_codes,
    remove_accents, create_family
)

SESSIONS_DIR = os.path.join(get_app_dir(), "importacoes")
os.makedirs(SESSIONS_DIR, exist_ok=True)


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Tenta extrair texto de um PDF nativo sem IA."""
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        full_text = []
        for page in reader.pages:
            t = page.extract_text() or ""
            if t.strip():
                full_text.append(t)
        return "\n".join(full_text)
    except Exception:
        return ""


def get_next_auto_code() -> int:
    try:
        conn = db_manager.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT ISNULL(MAX(codigo), 700000) FROM dbo.produtos WHERE codigo >= 700000 AND codigo < 800000")
        row = cursor.fetchone()
        next_c = (row[0] if row and row[0] >= 700000 else 700000) + 1
        conn.close()
        return max(700001, next_c)
    except Exception:
        return 700001


def parse_plain_text_menu(text: str) -> MenuExtractionResponse:
    """Faz parsing estruturado (CSV) ou heurístico de texto de ementa (secções, artigos e preços)."""
    next_code_start = get_next_auto_code()
    text_clean = (text or "").strip()
    if not text_clean:
        return MenuExtractionResponse(secoes=[], rotulos_preco_encontrados=["PVP"], avisos=["Texto vazio."], proximo_codigo=next_code_start)

    lines = [l.strip() for l in text_clean.splitlines() if l.strip()]
    if not lines:
        return MenuExtractionResponse(secoes=[], rotulos_preco_encontrados=["PVP"], avisos=["Texto vazio."], proximo_codigo=next_code_start)

    # Detetar se o texto é uma estrutura CSV/TSV (separador TAB \t, ; ou ,)
    first_line = lines[0]
    if ("\t" in first_line or "," in first_line or ";" in first_line) and len(lines) > 1:
        if "\t" in first_line:
            delimiter = "\t"
        elif ";" in first_line:
            delimiter = ";"
        else:
            delimiter = ","

        try:
            reader = list(csv.reader(io.StringIO(text_clean), delimiter=delimiter))
            if len(reader) > 1 and len(reader[0]) >= 2:
                header = [c.strip().lower() for c in reader[0]]
                is_header = any(h in ("família", "familia", "artigo", "nome", "designação", "preço", "preco", "pvp", "descrição", "descricao") for h in header)
                data_rows = reader[1:] if is_header else reader

                col_fam = 0
                col_subfam = 1 if len(reader[0]) > 3 else -1
                col_nome = 2 if len(reader[0]) > 3 else (1 if len(reader[0]) > 1 else 0)
                col_preco = 3 if len(reader[0]) > 3 else (2 if len(reader[0]) > 2 else -1)
                col_desc = -1

                # Mapeamento dinâmico de cabeçalho se existir
                for idx, h in enumerate(header):
                    if h in ("família", "familia", "secção", "seccao", "categoria"):
                        col_fam = idx
                    elif h in ("subfamília", "subfamilia", "subfam"):
                        col_subfam = idx
                    elif h in ("artigo", "nome", "designação", "designacao", "produto"):
                        col_nome = idx
                    elif h in ("preço", "preco", "pvp", "pvp1", "valor"):
                        col_preco = idx

                sections_dict: Dict[Tuple[str, str], List[MenuArticleItem]] = {}
                for r in data_rows:
                    if not r or not any(r):
                        continue
                    fam = r[col_fam].strip() if col_fam >= 0 and len(r) > col_fam and r[col_fam].strip() else "Geral"
                    subfam = r[col_subfam].strip() if col_subfam >= 0 and len(r) > col_subfam else ""
                    art = r[col_nome].strip() if col_nome >= 0 and len(r) > col_nome else ""
                    if not art:
                        continue

                    price_val = None
                    if col_preco >= 0 and len(r) > col_preco:
                        p_raw = r[col_preco].replace("€", "").replace(" ", "").replace(",", ".").strip()
                        try:
                            price_val = float(p_raw)
                        except ValueError:
                            price_val = None

                    key = (fam, subfam)
                    if key not in sections_dict:
                        sections_dict[key] = []

                    sections_dict[key].append(MenuArticleItem(
                        nome=art,
                        descricao="",
                        precos=[MenuPriceItem(rotulo="PVP", valor=price_val)],
                        variantes=[],
                        confianca=0.95,
                        notas=""
                    ))

                sections = [
                    MenuSectionItem(nome=fam, subsecao=subfam or None, artigos=arts)
                    for (fam, subfam), arts in sections_dict.items()
                ]
                if sections:
                    return MenuExtractionResponse(
                        secoes=sections,
                        rotulos_preco_encontrados=["PVP"],
                        avisos=[],
                        proximo_codigo=next_code_start
                    )
        except Exception:
            pass

    sections: List[MenuSectionItem] = []
    current_sec = MenuSectionItem(nome="Geral", subsecao=None, artigos=[])
    price_pattern = re.compile(r'(\d+[\.,]\d{2})\s*(?:€|eur)?', re.IGNORECASE)

    for line in lines:
        if line.isupper() and len(line) > 3 and not price_pattern.search(line):
            if current_sec.artigos:
                sections.append(current_sec)
            current_sec = MenuSectionItem(nome=line.title(), subsecao=None, artigos=[])
            continue

        prices = price_pattern.findall(line)
        if prices:
            try:
                price_val = float(prices[-1].replace(',', '.'))
            except ValueError:
                price_val = None

            name_part = price_pattern.sub('', line).strip(' -.:')
            if name_part:
                current_sec.artigos.append(MenuArticleItem(
                    nome=name_part,
                    descricao="",
                    precos=[MenuPriceItem(rotulo="PVP", valor=price_val)],
                    variantes=[],
                    confianca=0.9,
                    notas=""
                ))
        else:
            if len(line) > 2 and len(line) < 60:
                current_sec.artigos.append(MenuArticleItem(
                    nome=line,
                    descricao="",
                    precos=[MenuPriceItem(rotulo="PVP", valor=None)],
                    variantes=[],
                    confianca=0.7,
                    notas="Preço não detetado"
                ))

    if current_sec.artigos:
        sections.append(current_sec)

    return MenuExtractionResponse(
        secoes=sections,
        rotulos_preco_encontrados=["PVP"],
        avisos=["Texto extraído diretamente do ficheiro PDF sem recurso a IA."] if sections else ["Não foram identificados artigos estruturados no texto do ficheiro."],
        proximo_codigo=next_code_start
    )


def match_menu_articles(rows: List[MenuReviewedRow]) -> List[MenuMatchResponse]:
    """Procura correspondências exatas e aproximadas em dbo.produtos para cada linha da ementa."""
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT codigo, ISNULL(descricao, ''), ISNULL(descricaocurta, ''), familia, subfam, ISNULL(precovenda, 0.0) FROM dbo.produtos")
        all_prods = cursor.fetchall()
    finally:
        conn.close()

    # Prepara índice normalizado
    def norm(s: str) -> str:
        s = remove_accents(s or "").lower()
        return re.sub(r'[^a-z0-9]', '', s)

    prod_list = []
    for r in all_prods:
        c, desc, dcurta, fam, subfam, pvp1 = r[0], r[1] or "", r[2] or "", r[3], r[4], float(r[5] or 0.0)
        prod_list.append({
            "codigo": int(c),
            "descricao": desc,
            "descricaocurta": dcurta,
            "familia": int(fam) if fam is not None else None,
            "subfamilia": int(subfam) if subfam is not None else None,
            "pvp1": pvp1,
            "norm_desc": norm(desc),
            "norm_curta": norm(dcurta)
        })

    results: List[MenuMatchResponse] = []
    for idx, row in enumerate(rows):
        row_norm = norm(row.nome)
        if not row_norm:
            results.append(MenuMatchResponse(row_index=idx, matches=[]))
            continue

        matches: List[MenuMatchItem] = []
        for p in prod_list:
            if row_norm == p["norm_desc"] or row_norm == p["norm_curta"]:
                matches.append(MenuMatchItem(
                    codigo=p["codigo"],
                    descricao=p["descricao"],
                    descricaocurta=p["descricaocurta"],
                    familia=p["familia"],
                    subfamilia=p["subfamilia"],
                    pvp1=p["pvp1"],
                    similarity=1.0
                ))
            else:
                sim = difflib.SequenceMatcher(None, row_norm, p["norm_desc"]).ratio()
                if sim >= 0.85:
                    matches.append(MenuMatchItem(
                        codigo=p["codigo"],
                        descricao=p["descricao"],
                        descricaocurta=p["descricaocurta"],
                        familia=p["familia"],
                        subfamilia=p["subfamilia"],
                        pvp1=p["pvp1"],
                        similarity=round(sim, 2)
                    ))

        matches.sort(key=lambda m: m.similarity, reverse=True)
        results.append(MenuMatchResponse(row_index=idx, matches=matches[:5]))

    return results


def export_zs_import_template_csv(rows: List[MenuReviewedRow]) -> str:
    """Gera CSV compatível com o importador de artigos da ZoneSoft, criando famílias se necessário."""
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow([
        "codigo", "descricao", "familia", "subfam", "unidade", "iva",
        "ivacompra", "tiposaft", "fornecedor", "referencia", "codbarras",
        "precovenda", "precocompra", "descricaocurta", "pvp2"
    ])

    created_fam_cache: Dict[str, int] = {}

    for r in rows:
        if r.selected is False:
            continue
        pvp1 = r.precos.get("PVP1") or r.precos.get("PVP") or r.precos.get("Sala") or 0.0
        pvp2 = r.precos.get("PVP2") or r.precos.get("Take Away") or 0.0
        iva_val = r.selected_iva if r.selected_iva is not None else 23.0

        fam_val = r.selected_familia
        if (fam_val is None or fam_val < 0) and r.seccao and r.seccao.strip():
            sec_clean = r.seccao.strip()
            norm_sec = remove_accents(sec_clean).lower()
            if norm_sec in created_fam_cache:
                fam_val = created_fam_cache[norm_sec]
            else:
                fam_res = create_family(sec_clean)
                fam_val = fam_res["codigo"]
                created_fam_cache[norm_sec] = fam_val
                r.selected_familia = fam_val

        writer.writerow([
            r.matched_codigo or "",
            r.nome,
            fam_val if (fam_val and fam_val > 0) else (r.seccao or ""),
            r.selected_subfamilia or "",
            "UN",  # Unidade por omissão
            f"{iva_val:.1f}".replace('.', ','),
            f"{iva_val:.1f}".replace('.', ','),
            "M",  # Mercadorias
            "",   # Fornecedor
            "",   # Referencia
            "",   # Codbarras
            f"{float(pvp1 or 0):.2f}".replace('.', ','),
            "0,00",
            r.descricaocurta or "",
            f"{float(pvp2 or 0):.2f}".replace('.', ',') if pvp2 else ""
        ])

    return output.getvalue()


def convert_matched_to_import_rows(rows: List[MenuReviewedRow], price_mapping: Dict[str, str], include_new: bool = True) -> List[ImportRow]:
    """Converte linhas da ementa em ImportRow para apply_import, criando famílias novas se necessário."""
    import_rows: List[ImportRow] = []
    created_fam_cache: Dict[str, int] = {}

    auto_code = 700001
    try:
        conn = db_manager.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT ISNULL(MAX(codigo), 700000) FROM dbo.produtos WHERE codigo >= 700000 AND codigo < 800000")
        row_c = cursor.fetchone()
        auto_code = (row_c[0] if row_c and row_c[0] >= 700000 else 700000) + 1
        if auto_code < 700001:
            auto_code = 700001
        conn.close()
    except Exception:
        pass

    for r in rows:
        if r.selected is False:
            continue
        if not r.matched_codigo and not include_new:
            continue

        code = r.matched_codigo
        if not code:
            code = auto_code
            auto_code += 1

        item = ImportRow(codigo=code)
        if not r.matched_codigo:
            item.descricao = r.nome

        if r.descricaocurta:
            item.descricaocurta = r.descricaocurta

        fam_code = r.selected_familia
        if (fam_code is None or fam_code < 0) and r.seccao and r.seccao.strip():
            sec_clean = r.seccao.strip()
            norm_sec = remove_accents(sec_clean).lower()
            if norm_sec in created_fam_cache:
                fam_code = created_fam_cache[norm_sec]
            else:
                fam_res = create_family(sec_clean)
                fam_code = fam_res["codigo"]
                created_fam_cache[norm_sec] = fam_code
                r.selected_familia = fam_code

        if fam_code and fam_code > 0:
            item.familia = fam_code

        if r.selected_subfamilia:
            item.subfam = r.selected_subfamilia
        if r.selected_iva is not None:
            item.iva = float(r.selected_iva)

        for label, val in r.precos.items():
            if val is not None:
                target_pvp = price_mapping.get(label, "pvp1").lower()
                if hasattr(item, target_pvp):
                    setattr(item, target_pvp, float(val))

        import_rows.append(item)
    return import_rows

