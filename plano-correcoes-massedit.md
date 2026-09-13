# MassEdit POS — Plano de correções (para implementação)

Baseado na revisão do commit `669486c` (13/09/2026). Destina-se a ser seguido por um agente de programação, tarefa a tarefa.
Leia primeiro a secção **0** — resume as regras do projeto que não podem ser quebradas e como verificar cada commit.

| # | Correção | Severidade | Esforço |
|---|----------|-----------|---------|
| 1 | Arranque da aplicação (`Any` em falta) | Bloqueador | Trivial |
| 2 | Dependências dos builds (`python-multipart`, `pypdf`, `requirements.txt`) | Bloqueador | Baixo |
| 3 | Simulação da ementa digital devolve 500 | Bloqueador | Médio |
| 4 | CORS aberto e password devolvida em claro | Segurança | Baixo |
| 5 | Travessia de caminhos em `serve_spa` | Segurança | Trivial |
| 6 | Clientes gravados sem simulação nem backup | Pilar de segurança | Médio |
| 7 | `configpostos` alterado sem aviso na reordenação POS | Pilar de segurança | Baixo |
| 8 | `isencao` fora do motor de alterações e do restauro | Pilar de segurança | Médio |
| 9 | Blocos e limites de texto no apply da ementa | Regra 7 / robustez | Médio |
| 10 | Rede de segurança mínima (testes + verificação no build) | Prevenção | Baixo |

Ordem obrigatória: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10**. Um commit por tarefa, mensagem em português.

---

## 0. Regras e verificação

### 0.1 Regras que não podem ser quebradas
1. **Python 3.9** (o build de macOS usa 3.9): nada de `X | Y` em anotações nem `match`. Usar `Optional`, `List`, `Dict` de `typing`.
2. **Nunca assumir tabelas ou colunas.** Verificar sempre com `db_manager.get_schema(cursor)` e os auxiliares `_has_optional_int_col`, `_text_limit`, `_has_table_cols`. Sem a coluna, a função degrada-se com mensagem clara — nunca rebenta.
3. **Todas as gravações:** simulação sem gravar → `create_backup_snapshot(...)` (se falhar, não se grava nada) → uma única transação (`commit`/`rollback`, ligação de `db_manager.get_connection()` já com `autocommit=False`) → `sync = 1` nos registos alterados quando a coluna existe.
4. **Designação de artigos com vendas nunca é alterada**; `has_sales` é *fail-safe* e assim fica.
5. **Simulação e gravação usam a mesma função de cálculo.** Nada de dois motores para a mesma operação.
6. **SQL só com parâmetros `?`.** Nomes de colunas só de listas fixas no código ou do esquema lido da BD.
7. **Limite de 2100 parâmetros do SQL Server:** listas `IN (...)` sempre com `_chunks(...)`.
8. `dbo.produtos.iva` guarda a **taxa** (23), não o código de `dbo.iva`. Cores `fundo`/`letra` são inteiros BGR.
9. **Backups:** formato `format_version = 2`; o restauro tem de continuar a aceitar v1 e v2. Dados novos entram com chaves novas e opcionais.
10. **Interface em português de Portugal**, estilo Tailwind existente. Sem dependências novas no frontend.
11. **Não incluir no git:** `config.json`, `backups/`, `dist/`, `build/`, `frontend/dist/`, `ementa_images/`, `importacoes/`. Nunca nomes de clientes nem credenciais — o repositório é público.

### 0.2 Verificação obrigatória antes de cada commit
```bash
cd frontend && npm run build          # tsc + vite, sem erros
python -c "import backend.app"        # tem de importar sem exceções
python main.py                        # tem de arrancar e servir a interface
```
Funções a confirmar manualmente sempre que se mexe no motor de alterações: pesquisa, simulação e gravação em massa, importação, restauro de backup. **Testes só contra uma base de dados SQL Server de teste — nunca em produção de um cliente.**

---

## 1. Arranque da aplicação

**Ficheiro:** `backend/app.py`, linha 7.

`from typing import List, Optional, Dict` não inclui `Any`, mas a linha 504 (`def save_section_endpoint(data: Dict[str, Any])`) usa-o. O erro dá-se no import do módulo: `NameError: name 'Any' is not defined`. A aplicação não arranca em nenhuma plataforma.

**Correção:** `from typing import List, Optional, Dict, Any`.

**Critérios de aceitação**
- [ ] `python -c "import backend.app"` termina sem erro.
- [ ] `python main.py` arranca e a interface abre no browser.

---

## 2. Dependências dos builds

**Ficheiros:** `Criar-Versao-Mac.sh` (linha 25), `Criar-Versao-PenDrive.bat` (linha 37), novo `requirements.txt`.

Ambos os scripts instalam apenas `fastapi uvicorn pydantic pyodbc pyinstaller`. Faltam:
- **`python-multipart`** — obrigatório para o endpoint `POST /api/ementa-digital/upload-image/{cod_produto}` (`UploadFile = File(...)`). Sem ele o FastAPI levanta `RuntimeError: Form data requires "python-multipart" to be installed.` **no arranque**, não no uso.
- **`pypdf`** — usado em `backend/services/menu_ai.py::extract_text_from_pdf`. A falta dele é silenciosa (`except Exception: return ""`): qualquer PDF com texto passa a ser tratado como ilegível.

**Correção**
1. Criar `requirements.txt` com versões fixas (fastapi, uvicorn, pydantic, pyodbc, pypdf, python-multipart, pyinstaller) e passar os dois scripts a `pip install -q -r requirements.txt`.
2. Em `menu_ai.extract_text_from_pdf`, separar o `ImportError` do resto e devolver uma mensagem explícita ("Leitura de PDF indisponível: falta a biblioteca pypdf") em vez de texto vazio.
3. Confirmar `MassEdit-Portable.spec` — acrescentar a `hiddenimports` o que o PyInstaller não apanhe sozinho.

**Critérios de aceitação**
- [ ] Num ambiente virtual limpo, `pip install -r requirements.txt` seguido de `python -c "import backend.app"` funciona.
- [ ] O executável gerado arranca e o upload de imagem da ementa funciona.
- [ ] Um PDF com texto continua a ser lido sem erro; sem `pypdf`, a mensagem explica porquê.

---

## 3. Simulação da ementa digital devolve sempre 500

**Ficheiro:** `backend/services/ementa_digital.py`, `preview_ementa_bulk_edit` (linhas 741–925).

A função constrói modelos com campos que não existem:

| Constrói | Modelo real (`backend/models.py`) |
|---|---|
| `BulkEditPreviewResponse(affected_count=, blocked_count=, protected_count=, diffs=)` (linhas 744, 754, 920) | `total_selected`, `total_affected`, `blocked_descriptions_count`, `previews` |
| `ProductDiff(field=, old_value=, new_value=, status=, reason=)` (13 ocorrências, linhas 758–914) | `codigo`, `descricao`, `has_sales`, `diffs: List[FieldDiff]` |

Pydantic v2 rejeita por campos obrigatórios em falta, o endpoint `/api/ementa-digital/preview` devolve 500 e o `EmentaDigitalModal` mostra "Falha ao simular alterações" — a edição em massa da ementa nunca grava nada.

**Correção (preferida):** agrupar as diferenças **por artigo** e devolver a estrutura correta — um `ProductDiff(codigo, descricao, has_sales=False, diffs=[FieldDiff(field_name, field_label, old_value, new_value, blocked, reason), ...])` por artigo, dentro de `previews`, e `BulkEditPreviewResponse(total_selected, total_affected, blocked_descriptions_count, previews)`. Assim o `PreviewModal` existente mostra a ementa como mostra os artigos, sem alterações no frontend.

Aproveitar para cumprir a regra 2 no `SELECT` do preview (linhas 772–792): hoje lê `ed.highlight`, `ed.gluten`, `ed.lactose`, `ed.vegetariano`, `ed.picante` sem verificar que existem — numa BD ZoneSoft mais antiga o preview rebenta enquanto o apply (que verifica) funcionaria. Montar a lista de colunas a partir do esquema.

E cumprir a regra 5: extrair o cálculo para uma função única (ex.: `_compute_ementa_changes(row, req.actions, ed_cols, schema)`) usada pelo preview **e** pelo apply — hoje a lógica está duplicada nas linhas ~800–915 e ~960–1030 e já divergiu.

**Critérios de aceitação**
- [ ] `/api/ementa-digital/preview` devolve 200 com uma lista de artigos e os respetivos campos alterados.
- [ ] O `PreviewModal` mostra as alterações da ementa e o botão de confirmar grava-as.
- [ ] Numa BD sem as colunas `highlight`/`gluten`/`lactose`/`vegetariano`/`picante`, o preview funciona e essas ações aparecem indisponíveis.
- [ ] Preview e apply partilham a mesma função de cálculo (uma alteração à regra reflete-se nos dois).

---

## 4. CORS aberto e password devolvida em claro

**Ficheiro:** `backend/app.py`, linhas 60–67 e 70–92.

`allow_origins=["*"]` (o comentário por cima diz o contrário) e `GET /api/config` devolve `db_manager.config.model_dump()`, que inclui `password`. A API não tem autenticação e ouve em `127.0.0.1`. Com o MassEdit aberto, qualquer página que o utilizador visite no mesmo browser pode ler as credenciais SQL do cliente e chamar `/api/products/apply` ou `/api/backups/restore`.

**Correção**
1. `allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"]` (apenas o servidor de desenvolvimento do Vite).
2. Nunca devolver a password: nas respostas de `GET /api/config` e `POST /api/config`, substituir o campo por `"password": ""` e acrescentar `"password_saved": bool(db_manager.config.save_password and db_manager.config.password)`. Ajustar o `ConfigModal` para mostrar "palavra-passe guardada" em vez de a preencher.

**Critérios de aceitação**
- [ ] `GET /api/config` não contém a password em lado nenhum da resposta.
- [ ] O `ConfigModal` continua a permitir ligar, testar e guardar, e indica quando já existe password guardada.
- [ ] Um pedido de outra origem (ex.: `https://exemplo.com`) é recusado pelo browser.

---

## 5. Travessia de caminhos em `serve_spa`

**Ficheiro:** `backend/app.py`, linhas 708–714.

```python
file_path = os.path.join(DIST_DIR, full_path)
if os.path.exists(file_path) and os.path.isfile(file_path):
    return FileResponse(file_path)
```

`full_path` chega já descodificado, por isso `GET /%2e%2e/config.json` serve o `config.json` que está ao lado do executável.

**Correção:** normalizar com `os.path.realpath` e confirmar que o resultado fica dentro de `os.path.realpath(DIST_DIR)`; caso contrário devolver o `index.html`. O padrão correto já existe no projeto, em `products.py::_resolve_backup_path`.

**Critérios de aceitação**
- [ ] `curl --path-as-is "http://127.0.0.1:8000/%2e%2e/config.json"` não devolve o ficheiro.
- [ ] A interface e os ficheiros de `assets/` continuam a ser servidos normalmente.

---

## 6. Clientes gravados sem simulação nem backup

**Ficheiro:** `backend/services/customers.py`, `update_customer_data` (linhas 239–298).

Altera `nome`, `nif`, `morada`, `localidade`, `codpostal`, `telefone` e `email` em `dbo.clientes` — dados que saem em faturas — sem simulação, sem cópia de segurança e sem forma de reverter: o `restore_backup` nem conhece a tabela.

**Correção**
1. Ler o estado anterior dos clientes afetados (`SELECT` em blocos com `_chunks`) e gravá-lo no snapshot com uma chave nova e opcional `"clientes": [...]`, mantendo `format_version = 2` e a compatibilidade v1/v2 (regra 9).
2. Tratar essa chave em `restore_backup`, só quando existe, dentro da mesma transação e apenas nas colunas que ainda existem no esquema.
3. Criar `preview_customer_update(...)` com a mesma função de cálculo do apply e ligá-la ao `PreviewModal`, como nos artigos.
4. Corrigir o efeito lateral: quando nenhum campo vem preenchido, `sets` fica só com `sync = 1` e o cliente é contado como atualizado — não deve gerar `UPDATE` nenhum.
5. Validar o NIF com `validate_pt_nif` antes de gravar e bloquear na simulação os que não passam, com o motivo.

**Critérios de aceitação**
- [ ] Nenhuma gravação de clientes ocorre sem simulação confirmada e backup criado.
- [ ] Restaurar esse backup repõe os dados anteriores dos clientes.
- [ ] Um cliente sem campos alterados não aparece como atualizado.
- [ ] Backups antigos (sem a chave `clientes`) continuam a restaurar sem erro.

---

## 7. `configpostos` alterado sem aviso na reordenação POS

**Ficheiro:** `backend/services/pos_layout.py`, linhas 226–227.

```python
cursor.execute("UPDATE dbo.configpostos SET valor = '1' WHERE chave = 'ORDEM NO FRONTOFFICE'")
```

Altera a configuração de **todos os postos** do cliente, não aparece na simulação, não entra no backup e não é revertida pelo restauro. Além disso assume tabela e colunas: numa BD sem `configpostos` a instrução falha e faz `rollback` de toda a reordenação.

**Correção**
1. Passar a ação a opção explícita: novo campo `set_ordem_frontoffice: bool = False` em `PosLayoutApplyRequest` e uma caixa no `PosLayoutModal` ("Definir a ordem dos botões do POS por posição em todos os postos"), desligada por defeito e com o alcance explicado.
2. Só executar se `_has_table_cols(schema, "configpostos", ("chave", "valor"))`; caso contrário, mensagem clara e o resto da reordenação segue.
3. Guardar o valor anterior no snapshot (chave nova e opcional) e repô-lo no restauro.
4. Mostrar a alteração na simulação como uma linha própria.

**Critérios de aceitação**
- [ ] Com a opção desligada, `dbo.configpostos` não é tocada.
- [ ] Com a opção ligada, a alteração aparece na simulação, entra no backup e é revertida pelo restauro.
- [ ] Numa BD sem `configpostos`, a reordenação dos botões funciona na mesma.

---

## 8. `isencao` fora do motor de alterações e do restauro

**Ficheiro:** `backend/services/products.py`, `_apply_changes` (linhas 1336–1343) e `RESTORE_FIELDS` (linhas 1547–1569).

Quando o IVA muda, o apply acrescenta `isencao = ''` (taxa > 0) ou `isencao = 'M07'` (taxa 0) diretamente no `UPDATE`: não passa por nenhum `Change`, não aparece na simulação, não verifica se a coluna existe (regra 2) e o `RESTORE_FIELDS` não inclui `isencao` — restaurar o backup repõe o IVA e deixa o motivo de isenção trocado.

**Correção**
1. Criar o `Change` correspondente dentro de `_iva_change` (ou logo a seguir, em `_compute_bulk_changes`), com `column="isencao"`, para que apareça na simulação e seja gravado pelo caminho normal.
2. Só o gerar se `"isencao" in _prod_cols(schema)`.
3. Acrescentar `("isencao", "isencao", "text")` a `RESTORE_FIELDS` (já protegido pelo filtro `if f[1] in prod_cols`) e incluir o campo em `ProductItem` e no `SELECT` de `_product_select_sql`, para o snapshot o guardar.
4. O `M07` está fixo no código: usar o valor de `dbo.motivos_isencao` (já existe `get_motivos_isencao`) quando a tabela existir, com `M07` como recurso.
5. Confirmar o mesmo comportamento no caminho da importação (`apply_import`, linhas ~2179–2183).

**Critérios de aceitação**
- [ ] Alterar o IVA mostra na simulação, além da taxa, a alteração do motivo de isenção.
- [ ] Restaurar o backup repõe taxa **e** motivo de isenção.
- [ ] Numa BD sem a coluna `isencao`, a alteração de IVA funciona e o campo é ignorado.

---

## 9. Blocos e limites de texto no apply da ementa

**Ficheiro:** `backend/services/ementa_digital.py`, `apply_ementa_bulk_edit` (linhas 931–1046) e ainda as linhas 668, 947 e 2174.

- `WHERE cod_produto IN ({','.join('?' …)})` sem `_chunks`: acima de 2100 códigos rebenta o limite do SQL Server (regra 7). O preview já divide em blocos de 500; o apply não.
- Sem validação de comprimentos pelo esquema: `produto` é truncado com `[:250]` fixo e `descricao` não tem limite nenhum. Um texto maior que a coluna dá "String or binary data would be truncated" e aborta a operação inteira, em vez de aparecer bloqueado na simulação. Usar `_text_limit(schema, "ementa_digital_produtos", col)` (já importado no módulo) e bloquear, não truncar.
- As transformações de maiúsculas/minúsculas estão reimplementadas (linhas 857 e 984). Usar `transform_text_case` de `products.py`, que inclui a correção ortográfica PT.

**Critérios de aceitação**
- [ ] Uma seleção de 3000 artigos é processada sem erro de ODBC.
- [ ] Um texto maior que a coluna aparece bloqueado na simulação, com o motivo, e não é gravado.
- [ ] O modo "Ortografia" na ementa dá o mesmo resultado que nos artigos.

---

## 10. Rede de segurança mínima

Os problemas 1, 2 e 3 chegaram ao `main` porque nada os apanha automaticamente.

**Correção**
1. Criar `tests/test_contracts.py` (só `pytest`, sem base de dados): importa `backend.app` e constrói cada modelo de resposta com os argumentos que os serviços realmente usam. Apanha a classe de erro do ponto 3 em segundos.
2. Acrescentar ao fim dos dois scripts de build, antes do PyInstaller: `python -c "import backend.app"` — se falhar, o build pára com mensagem clara.
3. Acrescentar ao `README.md` a secção "Antes de commitar" com os três comandos da secção 0.2.

**Critérios de aceitação**
- [ ] `pytest` passa e falharia se algum serviço construísse um modelo com campos errados.
- [ ] Um erro de import faz o script de build parar em vez de gerar um executável que não arranca.

---

## 11. Fora deste plano (registar, não implementar agora)

- Dividir `ementa_digital.py` (2291 linhas) em `ementa/{structure,products,images,translations}.py` e `products.py` (2296 linhas) por áreas.
- Extrair um helper único de escrita (`with write_transaction(descricao, snapshot) as cur:`) que garanta backup, transação e `sync` por construção — o padrão está repetido em 15 sítios.
- `sort_map` duplicado em `search_products` e `get_filtered_product_codes`.
- Passar os códigos por `_unique_codes` antes do `INSERT` nas tabelas temporárias `#filter_codes_*` (a PK falha com repetidos).
- Cliente API central no frontend (`api.ts`) em vez de `fetch` cru em 15 componentes, e substituir os `alert()` por mensagens na interface.
- Limpar os ficheiros de `ementa_images/` quando a imagem é removida; rotação da pasta `backups/`.
- Alinhar o `README.md`: anuncia tradutor e leitura de ementas com IA, mas `translate_menu_texts` é um dicionário culinário com heurística e `menu_ai.py` não chama nenhum serviço de IA.
- `IDEIAS-NOVAS-FUNCOES.md` no repositório duplica o documento do projeto e pode divergir.
