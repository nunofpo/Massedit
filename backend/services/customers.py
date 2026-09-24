import re
import urllib.request
import urllib.parse
import json
from typing import List, Dict, Any, Optional, Tuple
from backend.db import db_manager, SchemaInfo
from backend.models import (
    CustomerItem, CustomerAuditResponse, NifLookupResponse, BulkCustomerUpdateRequest,
    BulkEditPreviewResponse, ProductDiff, FieldDiff
)
from backend.services.products import _chunks, create_backup_snapshot

def validate_pt_nif(nif_str: Optional[str]) -> Tuple[bool, str]:
    """
    Valida um NIF português através do algoritmo de módulo 11.
    Retorna (is_valid, tipo/descrição).
    """
    if not nif_str:
        return False, "NIF Vazio"
    
    clean = re.sub(r'[^0-9]', '', str(nif_str).strip())
    if len(clean) != 9:
        return False, f"Tamanho incorreto ({len(clean)} dígitos, esperado 9)"
    
    first = clean[0]
    first_two = clean[:2]
    
    if clean == "999999990":
        return True, "Consumidor Final"
    
    valid_starts = {'1', '2', '3', '5', '6', '8'}
    valid_two_starts = {'45', '70', '71', '72', '77', '78', '79', '90', '91', '98', '99'}
    
    if first not in valid_starts and first_two not in valid_two_starts:
        return False, f"Prefixo '{first_two}' desconhecido em Portugal"
    
    # Cálculo do dígito de controlo
    total = 0
    for i in range(8):
        total += int(clean[i]) * (9 - i)
    
    remainder = total % 11
    if remainder in (0, 1):
        expected_check = 0
    else:
        expected_check = 11 - remainder
    
    actual_check = int(clean[8])
    if actual_check != expected_check:
        return False, f"Dígito de controlo inválido (esperado {expected_check}, obtido {actual_check})"
    
    if first in ('1', '2', '3'):
        tipo = "Pessoa Singular"
    elif first == '5':
        tipo = "Pessoa Coletiva (Empresa)"
    elif first == '6':
        tipo = "Administração Pública"
    elif first_two in ('90', '91'):
        tipo = "Condomínio"
    else:
        tipo = "Entidade"
        
    return True, tipo


def lookup_nif_pt(nif: str, api_key: Optional[str] = None) -> NifLookupResponse:
    """
    Consulta os dados da empresa via API do NIF.pt.
    """
    clean_nif = re.sub(r'[^0-9]', '', str(nif).strip())
    is_valid, tipo = validate_pt_nif(clean_nif)
    if not is_valid:
        return NifLookupResponse(
            nif=clean_nif,
            is_valid=False,
            validation_message=tipo,
            raw_data=None
        )
    
    url = f"https://www.nif.pt/?json=1&q={clean_nif}"
    if api_key and api_key.strip():
        url += f"&key={urllib.parse.quote(api_key.strip())}"
    
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MassEdit-POS/1.0"
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=6) as response:
            data = json.loads(response.read().decode('utf-8'))
            
            if data.get("result") == "error":
                return NifLookupResponse(
                    nif=clean_nif,
                    is_valid=True,
                    validation_message=f"NIF válido, mas API NIF.pt: {data.get('message', 'Sem resposta')}",
                    raw_data=data
                )
            
            records = data.get("records", {})
            rec = records.get(clean_nif)
            if not rec and records:
                rec = list(records.values())[0]
            
            if not rec:
                return NifLookupResponse(
                    nif=clean_nif,
                    is_valid=True,
                    validation_message=f"NIF {clean_nif} matematicamente válido ({tipo}), sem registo público no diretório NIF.pt.",
                    raw_data=data
                )
            
            pc4 = str(rec.get("pc4") or "").strip()
            pc3 = str(rec.get("pc3") or "").strip()
            cod_postal = f"{pc4}-{pc3}" if pc4 and pc3 else (pc4 or str(rec.get("postal_code") or ""))
            
            return NifLookupResponse(
                nif=clean_nif,
                is_valid=True,
                validation_message=f"Dados encontrados com sucesso ({tipo})",
                nome=rec.get("title") or rec.get("name"),
                morada=rec.get("address"),
                localidade=rec.get("city"),
                codpostal=cod_postal,
                telefone=rec.get("phone"),
                email=rec.get("email"),
                atividade=rec.get("activity"),
                raw_data=rec
            )
            
    except Exception as e:
        return NifLookupResponse(
            nif=clean_nif,
            is_valid=True,
            validation_message=f"NIF matematicamente válido ({tipo}), mas falhou ligação à API NIF.pt: {str(e)}",
            raw_data=None
        )


def get_customers(search: Optional[str] = None, only_invalid: bool = False, limit: int = 300) -> CustomerAuditResponse:
    """
    Lista e audita os clientes registados em dbo.clientes no SQL Server.
    """
    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = db_manager.get_schema(cursor)
        if "clientes" not in schema:
            return CustomerAuditResponse(
                total=0,
                valid_count=0,
                invalid_count=0,
                customers=[]
            )
        
        c_cols = schema["clientes"]
        nif_col = "contribuinte" if "contribuinte" in c_cols else ("nif" if "nif" in c_cols else None)
        
        cols_select = ["codigo"]
        cols_select.append("nome" if "nome" in c_cols else "'' AS nome")
        cols_select.append(f"{nif_col} AS nif" if nif_col else "'' AS nif")
        cols_select.append("morada" if "morada" in c_cols else "'' AS morada")
        cols_select.append("localidade" if "localidade" in c_cols else "'' AS localidade")
        cols_select.append("codpostal" if "codpostal" in c_cols else "'' AS codpostal")
        cols_select.append("telefone" if "telefone" in c_cols else "'' AS telefone")
        cols_select.append("email" if "email" in c_cols else "'' AS email")
        cols_select.append("codpostal1" if "codpostal1" in c_cols else "'' AS codpostal1")
        cols_select.append("pais" if "pais" in c_cols else "'PT' AS pais")
        cols_select.append("telemovel" if "telemovel" in c_cols else "'' AS telemovel")
        cols_select.append("web" if "web" in c_cols else "'' AS web")
        cols_select.append("fax" if "fax" in c_cols else "'' AS fax")
        cols_select.append("nomecontacto" if "nomecontacto" in c_cols else "'' AS nomecontacto")
        cols_select.append("desconto" if "desconto" in c_cols else "0.0 AS desconto")
        cols_select.append("limitecredito" if "limitecredito" in c_cols else "0.0 AS limitecredito")
        cols_select.append("saldo" if "saldo" in c_cols else "0.0 AS saldo")
        cols_select.append("valordivida" if "valordivida" in c_cols else "0.0 AS valordivida")
        cols_select.append("obs" if "obs" in c_cols else "'' AS obs")
        cols_select.append("obsaviso" if "obsaviso" in c_cols else "'' AS obsaviso")
        cols_select.append("bloqueado" if "bloqueado" in c_cols else "0 AS bloqueado")
        cols_select.append("CONVERT(VARCHAR(19), datacriacao, 120) AS datacriacao" if "datacriacao" in c_cols else "NULL AS datacriacao")
        
        # Vendas associadas ao cliente (dbo.documentos e dbo.cf)
        sales_subqueries = []
        if "documentos" in schema and "cliente" in schema["documentos"]:
            sales_subqueries.append("(SELECT COUNT(*) FROM dbo.documentos d WHERE d.cliente = dbo.clientes.codigo)")
        if "cf" in schema and "cliente" in schema["cf"]:
            sales_subqueries.append("(SELECT COUNT(*) FROM dbo.cf f WHERE f.cliente = dbo.clientes.codigo)")
        
        if sales_subqueries:
            sales_expr = f"({' + '.join(sales_subqueries)}) AS sales_count"
        else:
            sales_expr = "0 AS sales_count"
        cols_select.append(sales_expr)

        where_clauses = []
        params = []
        if search and search.strip():
            s = f"%{search.strip()}%"
            # Só se pesquisa nas colunas que existem mesmo nesta base de dados (tal como no SELECT acima).
            search_cols = ["nome"] if "nome" in c_cols else []
            if nif_col:
                search_cols.append(nif_col)
            search_cols.extend(c for c in ("telefone", "telemovel", "email") if c in c_cols)
            like_parts = [f"{c} LIKE ?" for c in search_cols] + ["CAST(codigo AS VARCHAR(20)) LIKE ?"]
            where_clauses.append("(" + " OR ".join(like_parts) + ")")
            params.extend([s] * len(like_parts))
            
        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        sql = f"SELECT {', '.join(cols_select)} FROM dbo.clientes {where_sql} ORDER BY codigo ASC"
        
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        
        items: List[CustomerItem] = []
        valid_cnt = 0
        invalid_cnt = 0
        
        for r in rows:
            code = int(r[0])
            nome = str(r[1] or "").strip()
            raw_nif = str(r[2] or "").strip()
            morada = str(r[3] or "").strip()
            localidade = str(r[4] or "").strip()
            codpostal = str(r[5] or "").strip()
            telefone = str(r[6] or "").strip()
            email = str(r[7] or "").strip()
            codpostal1 = str(r[8] or "").strip() if len(r) > 8 else ""
            pais = str(r[9] or "PT").strip() if len(r) > 9 else "PT"
            telemovel = str(r[10] or "").strip() if len(r) > 10 else ""
            web = str(r[11] or "").strip() if len(r) > 11 else ""
            fax = str(r[12] or "").strip() if len(r) > 12 else ""
            nomecontacto = str(r[13] or "").strip() if len(r) > 13 else ""
            desconto = float(r[14] or 0.0) if len(r) > 14 else 0.0
            limitecredito = float(r[15] or 0.0) if len(r) > 15 else 0.0
            saldo = float(r[16] or 0.0) if len(r) > 16 else 0.0
            valordivida = float(r[17] or 0.0) if len(r) > 17 else 0.0
            obs = str(r[18] or "").strip() if len(r) > 18 else ""
            obsaviso = str(r[19] or "").strip() if len(r) > 19 else ""
            bloqueado = int(r[20] or 0) if len(r) > 20 else 0
            datacriacao = str(r[21]) if len(r) > 21 and r[21] else None
            sales_count = int(r[22] or 0) if len(r) > 22 and r[22] is not None else 0
            has_sales = (sales_count > 0)
            can_delete = (code > 1 and not has_sales)
            
            clean_nif = re.sub(r'[^0-9]', '', raw_nif)
            if not clean_nif:
                is_valid = False
                val_msg = "Sem NIF preenchido"
                invalid_cnt += 1
            else:
                is_valid, val_msg = validate_pt_nif(clean_nif)
                if is_valid:
                    valid_cnt += 1
                else:
                    invalid_cnt += 1
                    
            if only_invalid and is_valid:
                continue
                
            if len(items) < limit:
                items.append(CustomerItem(
                    codigo=code,
                    nome=nome,
                    nif=raw_nif,
                    morada=morada,
                    localidade=localidade,
                    codpostal=codpostal,
                    codpostal1=codpostal1,
                    pais=pais,
                    telefone=telefone,
                    telemovel=telemovel,
                    email=email,
                    web=web,
                    fax=fax,
                    nomecontacto=nomecontacto,
                    desconto=desconto,
                    limitecredito=limitecredito,
                    saldo=saldo,
                    valordivida=valordivida,
                    obs=obs,
                    obsaviso=obsaviso,
                    bloqueado=bloqueado,
                    datacriacao=datacriacao,
                    is_valid_nif=is_valid,
                    nif_validation_message=val_msg,
                    sales_count=sales_count,
                    has_sales=has_sales,
                    can_delete=can_delete
                ))
                
        return CustomerAuditResponse(
            total=len(rows),
            valid_count=valid_cnt,
            invalid_count=invalid_cnt,
            customers=items
        )
    finally:
        conn.close()


def preview_customer_update(req: BulkCustomerUpdateRequest) -> BulkEditPreviewResponse:
    """Simula as alterações em clientes antes de as gravar na base de dados."""
    if not req.customers:
        return BulkEditPreviewResponse(
            total_selected=0, total_affected=0, blocked_descriptions_count=0, previews=[]
        )

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = db_manager.get_schema(cursor)
        if "clientes" not in schema:
            return BulkEditPreviewResponse(
                total_selected=len(req.customers),
                total_affected=0,
                blocked_descriptions_count=len(req.customers),
                previews=[
                    ProductDiff(
                        codigo=c.codigo,
                        descricao="N/A",
                        has_sales=False,
                        diffs=[
                            FieldDiff(
                                field_name="clientes",
                                field_label="Tabela Clientes",
                                old_value="N/A",
                                new_value="N/A",
                                blocked=True,
                                reason="A tabela dbo.clientes não existe nesta base de dados."
                            )
                        ]
                    ) for c in req.customers
                ]
            )

        c_cols = schema["clientes"]
        nif_col = "contribuinte" if "contribuinte" in c_cols else ("nif" if "nif" in c_cols else None)
        codes = [c.codigo for c in req.customers]

        # Ler estado atual dos clientes em chunks
        current_data: Dict[int, Dict[str, Any]] = {}
        for chunk in _chunks(codes, 500):
            placeholders = ",".join("?" for _ in chunk)
            cursor.execute(f"SELECT * FROM dbo.clientes WHERE codigo IN ({placeholders})", chunk)
            desc = [col[0].lower() for col in cursor.description]
            for row in cursor.fetchall():
                row_dict = dict(zip(desc, row))
                current_data[int(row_dict["codigo"])] = row_dict

        previews: List[ProductDiff] = []
        affected = 0
        blocked = 0

        for cust in req.customers:
            cur = current_data.get(cust.codigo)
            if not cur:
                blocked += 1
                previews.append(ProductDiff(
                    codigo=cust.codigo,
                    descricao="N/A",
                    has_sales=False,
                    diffs=[FieldDiff(
                        field_name="codigo",
                        field_label="Registo de Cliente",
                        old_value="Inexistente",
                        new_value="Inexistente",
                        blocked=True,
                        reason=f"Cliente #{cust.codigo} não existe na base de dados."
                    )]
                ))
                continue

            diffs: List[FieldDiff] = []
            is_blocked = False
            cur_nome = str(cur.get("nome") or "").strip()

            # Proteger NIF: não é permitida a alteração de NIF (salvaguarda fiscal SAF-T)
            if cust.nif is not None and nif_col:
                clean_nif = re.sub(r'[^0-9]', '', cust.nif.strip())
                cur_nif = re.sub(r'[^0-9]', '', str(cur.get(nif_col) or "").strip())
                if clean_nif and cur_nif and clean_nif != cur_nif:
                    is_blocked = True
                    diffs.append(FieldDiff(
                        field_name="nif",
                        field_label="NIF",
                        old_value=cur_nif,
                        new_value=clean_nif,
                        blocked=True,
                        reason="O NIF do cliente não pode ser alterado para garantir a integridade fiscal (SAF-T)."
                    ))

            field_mappings = [
                ("nome", "Nome", cust.nome),
                ("morada", "Morada", cust.morada),
                ("localidade", "Localidade", cust.localidade),
                ("codpostal", "Código Postal", cust.codpostal),
                ("codpostal1", "Extensão Cód. Postal", cust.codpostal1),
                ("pais", "País", cust.pais),
                ("telefone", "Telefone", cust.telefone),
                ("telemovel", "Telemóvel", cust.telemovel),
                ("email", "Email", cust.email),
                ("web", "Website", cust.web),
                ("fax", "Fax", cust.fax),
                ("nomecontacto", "Nome de Contacto", cust.nomecontacto),
                ("obs", "Observações", cust.obs),
                ("obsaviso", "Aviso no POS", cust.obsaviso),
            ]

            for field_name, field_label, new_val in field_mappings:
                if new_val is not None and field_name in c_cols:
                    clean_val = str(new_val).strip()
                    cur_val = str(cur.get(field_name) or "").strip()
                    if cur_val != clean_val:
                        diffs.append(FieldDiff(
                            field_name=field_name,
                            field_label=field_label,
                            old_value=cur_val or "(vazio)",
                            new_value=clean_val,
                            blocked=False
                        ))

            if cust.desconto is not None and "desconto" in c_cols:
                try:
                    cur_d = round(float(cur.get("desconto") or 0.0), 2)
                    new_d = round(float(cust.desconto), 2)
                    if cur_d != new_d:
                        diffs.append(FieldDiff(
                            field_name="desconto",
                            field_label="Desconto (%)",
                            old_value=f"{cur_d:.2f} %",
                            new_value=f"{new_d:.2f} %",
                            blocked=False
                        ))
                except (ValueError, TypeError):
                    pass

            if cust.limitecredito is not None and "limitecredito" in c_cols:
                try:
                    cur_l = round(float(cur.get("limitecredito") or 0.0), 2)
                    new_l = round(float(cust.limitecredito), 2)
                    if cur_l != new_l:
                        diffs.append(FieldDiff(
                            field_name="limitecredito",
                            field_label="Limite de Crédito (€)",
                            old_value=f"{cur_l:.2f} €",
                            new_value=f"{new_l:.2f} €",
                            blocked=False
                        ))
                except (ValueError, TypeError):
                    pass

            if cust.bloqueado is not None and "bloqueado" in c_cols:
                cur_b = int(cur.get("bloqueado") or 0)
                new_b = 1 if cust.bloqueado else 0
                if cur_b != new_b:
                    diffs.append(FieldDiff(
                        field_name="bloqueado",
                        field_label="Estado Bloqueado",
                        old_value="Bloqueado" if cur_b else "Ativo",
                        new_value="Bloqueado" if new_b else "Ativo",
                        blocked=False
                    ))

            if is_blocked:
                blocked += 1
                previews.append(ProductDiff(
                    codigo=cust.codigo,
                    descricao=cur_nome,
                    has_sales=False,
                    diffs=diffs
                ))
            elif diffs:
                affected += 1
                previews.append(ProductDiff(
                    codigo=cust.codigo,
                    descricao=cur_nome,
                    has_sales=False,
                    diffs=diffs
                ))

        return BulkEditPreviewResponse(
            total_selected=len(req.customers),
            total_affected=affected,
            blocked_descriptions_count=blocked,
            previews=previews
        )
    finally:
        conn.close()


def update_customer_data(req: BulkCustomerUpdateRequest) -> Tuple[bool, str, int]:
    """
    Atualiza dados de clientes em dbo.clientes com simulação, validação NIF, transação e backup.
    """
    if not req.customers:
        return False, "Nenhum cliente fornecido para atualização.", 0

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = db_manager.get_schema(cursor)
        if "clientes" not in schema:
            return False, "A tabela dbo.clientes não existe na base de dados.", 0

        c_cols = schema["clientes"]
        nif_col = "contribuinte" if "contribuinte" in c_cols else ("nif" if "nif" in c_cols else None)
        has_sync = "sync" in c_cols
        codes = [c.codigo for c in req.customers]

        # 1. Ler o estado anterior dos clientes afetados em blocos de 500 para o snapshot do backup
        prev_customers: List[Dict[str, Any]] = []
        for chunk in _chunks(codes, 500):
            placeholders = ",".join("?" for _ in chunk)
            cursor.execute(f"SELECT * FROM dbo.clientes WHERE codigo IN ({placeholders})", chunk)
            desc = [col[0].lower() for col in cursor.description]
            prev_customers.extend([dict(zip(desc, row)) for row in cursor.fetchall()])

        if not prev_customers:
            return False, "Nenhum dos clientes indicados foi encontrado na base de dados.", 0

        # 2. Criar cópia de segurança antes de alterar (Regra 3 e Regra 9)
        try:
            create_backup_snapshot(
                products=[],
                description=f"Atualização de {len(prev_customers)} cliente(s)",
                clientes=prev_customers
            )
        except Exception as e:
            return False, f"Falha ao criar cópia de segurança antes de alterar clientes: {e}", 0

        prev_map = {int(c["codigo"]): c for c in prev_customers}
        updated_count = 0

        # 3. Transação atómica de atualização
        for cust in req.customers:
            prev = prev_map.get(cust.codigo)
            if not prev:
                continue

            sets = []
            params = []

            # Proteger NIF: O NIF não pode ser alterado
            if nif_col and cust.nif is not None:
                clean_nif = re.sub(r'[^0-9]', '', cust.nif.strip())
                cur_nif = re.sub(r'[^0-9]', '', str(prev.get(nif_col) or "").strip())
                if clean_nif and cur_nif and clean_nif != cur_nif:
                    conn.rollback()
                    return False, f"Alteração de NIF não permitida para o cliente #{cust.codigo} (o NIF é bloqueado para salvaguarda fiscal).", 0

            fields = [
                ("nome", cust.nome),
                ("morada", cust.morada),
                ("localidade", cust.localidade),
                ("codpostal", cust.codpostal),
                ("codpostal1", cust.codpostal1),
                ("pais", cust.pais),
                ("telefone", cust.telefone),
                ("telemovel", cust.telemovel),
                ("email", cust.email),
                ("web", cust.web),
                ("fax", cust.fax),
                ("nomecontacto", cust.nomecontacto),
                ("obs", cust.obs),
                ("obsaviso", cust.obsaviso),
            ]

            for col_name, val in fields:
                if val is not None and col_name in c_cols:
                    clean_v = str(val).strip()
                    if str(prev.get(col_name) or "").strip() != clean_v:
                        sets.append(f"{col_name} = ?")
                        params.append(clean_v)

            if cust.desconto is not None and "desconto" in c_cols:
                try:
                    new_desc = round(float(cust.desconto), 2)
                    cur_desc = round(float(prev.get("desconto") or 0.0), 2)
                    if cur_desc != new_desc:
                        sets.append("desconto = ?")
                        params.append(new_desc)
                except (ValueError, TypeError):
                    pass

            if cust.limitecredito is not None and "limitecredito" in c_cols:
                try:
                    new_lim = round(float(cust.limitecredito), 2)
                    cur_lim = round(float(prev.get("limitecredito") or 0.0), 2)
                    if cur_lim != new_lim:
                        sets.append("limitecredito = ?")
                        params.append(new_lim)
                except (ValueError, TypeError):
                    pass

            if cust.bloqueado is not None and "bloqueado" in c_cols:
                new_bloq = 1 if cust.bloqueado else 0
                cur_bloq = int(prev.get("bloqueado") or 0)
                if cur_bloq != new_bloq:
                    sets.append("bloqueado = ?")
                    params.append(new_bloq)

            # Efetua UPDATE se houver alterações reais nos campos
            if sets:
                if has_sync:
                    sets.append("sync = 1")
                params.append(cust.codigo)
                sql = f"UPDATE dbo.clientes SET {', '.join(sets)} WHERE codigo = ?"
                cursor.execute(sql, params)
                updated_count += 1

        conn.commit()
        return True, f"{updated_count} cliente(s) atualizado(s) com sucesso no SQL Server.", updated_count
    except Exception as e:
        conn.rollback()
        return False, f"Erro ao atualizar clientes: {str(e)}", 0
    finally:
        conn.close()


def delete_customer(codigo: int) -> Tuple[bool, str]:
    """
    Elimina um cliente com segurança e conformidade fiscal:
    - Impede eliminar clientes de sistema (código <= 1).
    - Impede eliminar clientes com vendas em dbo.documentos ou dbo.cf (integridade SAF-T).
    - Cria cópia de segurança antes da eliminação.
    - Remove registos das tabelas auxiliares (moradas, matrículas, saldos, etc.).
    - Elimina de dbo.clientes.
    - Regista a eliminação em dbo.clientes_apagar para replicação e sincronização cloud.
    """
    if codigo <= 1:
        return False, "Não é permitido eliminar clientes de sistema (Código 0 ou 1 / Consumidor Final)."

    conn = db_manager.get_connection()
    try:
        cursor = conn.cursor()
        schema = db_manager.get_schema(cursor)
        if "clientes" not in schema:
            return False, "A tabela dbo.clientes não existe nesta base de dados."

        # 1. Verificar se o cliente existe
        cursor.execute("SELECT codigo, nome FROM dbo.clientes WHERE codigo = ?", (codigo,))
        row = cursor.fetchone()
        if not row:
            return False, f"O cliente #{codigo} não foi encontrado na base de dados."
        cust_name = str(row[1] or "").strip()

        # 2. Verificar se tem vendas associadas (Regra de Salvaguarda Fiscal e SAF-T)
        sales_cnt = 0
        if "documentos" in schema and "cliente" in schema["documentos"]:
            cursor.execute("SELECT COUNT(*) FROM dbo.documentos WHERE cliente = ?", (codigo,))
            sales_cnt += int(cursor.fetchone()[0] or 0)
        if "cf" in schema and "cliente" in schema["cf"]:
            cursor.execute("SELECT COUNT(*) FROM dbo.cf WHERE cliente = ?", (codigo,))
            sales_cnt += int(cursor.fetchone()[0] or 0)

        if sales_cnt > 0:
            return False, (
                f"Não é possível eliminar o cliente #{codigo} ('{cust_name}') porque possui "
                f"{sales_cnt} documento(s) de venda associado(s). Para salvaguarda fiscal "
                f"e conformidade com a Autoridade Tributária (SAF-T), clientes com vendas não podem ser apagados."
            )

        # 3. Snapshot de segurança (Backup)
        try:
            cursor.execute("SELECT * FROM dbo.clientes WHERE codigo = ?", (codigo,))
            col_names = [col[0] for col in cursor.description]
            c_data = cursor.fetchone()
            backup_dict = dict(zip(col_names, c_data)) if c_data else {"codigo": codigo, "nome": cust_name}
            create_backup_snapshot(
                products=[],
                description=f"Eliminação do cliente #{codigo} ({cust_name})",
                clientes=[backup_dict]
            )
        except Exception as e:
            return False, f"Não foi possível criar a cópia de segurança antes de eliminar: {e}"

        # 4. Eliminação atómica de tabelas auxiliares e do cliente
        aux_tables = [
            ("clientes_moradas", "cliente"),
            ("clientes_matriculas", "cliente"),
            ("clientes_opcoes", "cliente"),
            ("clientes_reserva_produtos", "clienteid"),
            ("clientes_logs", "cliente"),
            ("saldosclientes", "cliente"),
            ("cartoes", "cliente"),
            ("taloesdesconto", "cliente"),
            ("promocoesclientes", "cliente"),
        ]
        for tbl, col in aux_tables:
            if tbl in schema and col in schema[tbl]:
                cursor.execute(f"DELETE FROM dbo.{tbl} WHERE {col} = ?", (codigo,))

        # Eliminar da tabela principal
        cursor.execute("DELETE FROM dbo.clientes WHERE codigo = ?", (codigo,))

        # 5. Registar em dbo.clientes_apagar para sincronização de terminais e cloud
        if "clientes_apagar" in schema and "codigo" in schema["clientes_apagar"]:
            cursor.execute(
                "IF NOT EXISTS (SELECT 1 FROM dbo.clientes_apagar WHERE codigo = ?) "
                "INSERT INTO dbo.clientes_apagar (codigo) VALUES (?)",
                (codigo, codigo)
            )

        conn.commit()
        return True, f"Cliente #{codigo} ('{cust_name}') eliminado com sucesso da base de dados."
    except Exception as e:
        conn.rollback()
        return False, f"Erro ao eliminar cliente #{codigo}: {str(e)}"
    finally:
        conn.close()

