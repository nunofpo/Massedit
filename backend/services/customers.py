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
        has_nif = "nif" in c_cols
        has_nome = "nome" in c_cols
        has_morada = "morada" in c_cols
        has_localidade = "localidade" in c_cols
        has_codpostal = "codpostal" in c_cols
        has_telefone = "telefone" in c_cols
        has_email = "email" in c_cols
        
        cols_select = ["codigo"]
        cols_select.append("nome" if has_nome else "'' AS nome")
        cols_select.append("nif" if has_nif else "'' AS nif")
        cols_select.append("morada" if has_morada else "'' AS morada")
        cols_select.append("localidade" if has_localidade else "'' AS localidade")
        cols_select.append("codpostal" if has_codpostal else "'' AS codpostal")
        cols_select.append("telefone" if has_telefone else "'' AS telefone")
        cols_select.append("email" if has_email else "'' AS email")
        
        where_clauses = []
        params = []
        if search and search.strip():
            s = f"%{search.strip()}%"
            where_clauses.append("(nome LIKE ? OR nif LIKE ? OR CAST(codigo AS VARCHAR(20)) LIKE ?)")
            params.extend([s, s, s])
            
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
                    telefone=telefone,
                    email=email,
                    is_valid_nif=is_valid,
                    nif_validation_message=val_msg
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

            # Se NIF for alterado ou fornecido, validar NIF português com validate_pt_nif
            if cust.nif is not None and "nif" in c_cols:
                clean_nif = re.sub(r'[^0-9]', '', cust.nif.strip())
                is_valid, nif_msg = validate_pt_nif(clean_nif)
                cur_nif = str(cur.get("nif") or "").strip()
                if not is_valid and clean_nif != "999999990":
                    is_blocked = True
                    diffs.append(FieldDiff(
                        field_name="nif",
                        field_label="NIF",
                        old_value=cur_nif,
                        new_value=cust.nif,
                        blocked=True,
                        reason=f"NIF português inválido: {nif_msg}"
                    ))
                elif cur_nif != clean_nif:
                    diffs.append(FieldDiff(
                        field_name="nif",
                        field_label="NIF",
                        old_value=cur_nif,
                        new_value=clean_nif,
                        blocked=False
                    ))

            field_mappings = [
                ("nome", "Nome", cust.nome),
                ("morada", "Morada", cust.morada),
                ("localidade", "Localidade", cust.localidade),
                ("codpostal", "Código Postal", cust.codpostal),
                ("telefone", "Telefone", cust.telefone),
                ("email", "Email", cust.email),
            ]

            for field_name, field_label, new_val in field_mappings:
                if new_val is not None and field_name in c_cols:
                    clean_val = new_val.strip()
                    cur_val = str(cur.get(field_name) or "").strip()
                    if cur_val != clean_val:
                        diffs.append(FieldDiff(
                            field_name=field_name,
                            field_label=field_label,
                            old_value=cur_val or "(vazio)",
                            new_value=clean_val,
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
                description=f"Atualização em massa de {len(prev_customers)} cliente(s)",
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

            # Validar NIF se fornecido/alterado
            if "nif" in c_cols and cust.nif is not None:
                clean_nif = re.sub(r'[^0-9]', '', cust.nif.strip())
                is_valid, nif_msg = validate_pt_nif(clean_nif)
                if not is_valid and clean_nif != "999999990":
                    conn.rollback()
                    return False, f"Alteração cancelada: NIF inválido para o cliente #{cust.codigo} ({nif_msg}).", 0
                if str(prev.get("nif") or "").strip() != clean_nif:
                    sets.append("nif = ?")
                    params.append(clean_nif)

            fields = [
                ("nome", cust.nome),
                ("morada", cust.morada),
                ("localidade", cust.localidade),
                ("codpostal", cust.codpostal),
                ("telefone", cust.telefone),
                ("email", cust.email),
            ]

            for col_name, val in fields:
                if val is not None and col_name in c_cols:
                    clean_v = val.strip()
                    if str(prev.get(col_name) or "").strip() != clean_v:
                        sets.append(f"{col_name} = ?")
                        params.append(clean_v)

            # Corrigido o efeito secundário: apenas efetua UPDATE se houver alterações reais nos campos
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
