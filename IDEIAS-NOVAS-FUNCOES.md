# MassEdit POS — Especificação de novas funções (para implementação)

Este documento descreve **5 funções a implementar** no MassEdit POS, para ser seguido por um agente de programação.
Leia primeiro a secção **0. Regras obrigatórias**: resumem proteções que já existem no código e que não podem ser quebradas.

| # | Função | Esforço estimado |
|---|--------|------------------|
| 1 | Selecionar todos os resultados do filtro | Baixo |
| 2 | Relatório de problemas nos dados (ponto 5 da lista original) | Médio |
| 3 | Pré-visualização e reordenação dos botões do POS (ponto 11) | Médio/Alto |
| 4 | Editor da ementa digital (ponto 13) | Médio |
| 5 | Importar ementas do cliente (PDF, fotos, manuscritas) | Alto |

Ordem de implementação recomendada: **1 → 2 → 3 → 4 → 5**. Faça um commit por função.

---

## 0. Contexto e regras obrigatórias

### 0.1 Arquitetura atual
- **Backend:** Python + FastAPI + pyodbc, SQL Server da ZoneSoft.
  - `backend/app.py`: endpoints `/api/...`.
  - `backend/db.py`: `DatabaseManager` (ligação, `config.json`, `get_schema()` com colunas, tipos e tamanhos de todas as tabelas `dbo`).
  - `backend/models.py`: modelos Pydantic v2.
  - `backend/services/products.py`: toda a lógica (pesquisa, motor de alterações, backups, importação).
- **Frontend:** React 18 + TypeScript + Vite + Tailwind + `lucide-react`, em `frontend/src` (`App.tsx`, `components/*`, `types.ts`).
- **Build:** `Criar-Versao-Mac.sh` (macOS) e `Criar-Versao-PenDrive.bat` (Windows), com PyInstaller (`MassEdit-Portable.spec`).

### 0.2 Regras que não podem ser quebradas
1. **Python 3.9.** O build de macOS usa Python 3.9. Nada de `X | Y` em anotações, `match`, ou outras funcionalidades de 3.10+. Use `Optional`, `List` e `Dict` de `typing`.
2. **Nunca assumir colunas.** Tabelas e colunas opcionais verificam-se sempre com o esquema: `db_manager.get_schema(cursor)`, `_has_optional_int_col(schema, col)`, `_text_limit(schema, tabela, col)`, `_has_table_cols(...)`. Se uma coluna não existir, a função tem de se degradar com uma mensagem clara, sem dar erro.
3. **Todas as gravações seguem o mesmo fluxo:**
   1. simulação (pré-visualização) sem gravar;
   2. cópia de segurança com `create_backup_snapshot(...)`; **se falhar, não se grava nada**;
   3. uma única transação (`conn.commit()` / `conn.rollback()`), com a ligação de `db_manager.get_connection()` (já vem com `autocommit = False`);
   4. `sync = 1` nos registos alterados, quando a coluna `sync` existe.
4. **Designação de artigos com vendas nunca é alterada.** `ProductItem.has_sales` é *fail-safe*: se não for possível verificar, o artigo conta como vendido. Não altere este comportamento.
5. **Reutilizar o motor de alterações.** Use a classe `Change` e `_apply_changes(...)` em `products.py`. A simulação e a gravação têm de usar a mesma função de cálculo.
6. **SQL só com parâmetros `?`.** Nunca concatenar valores do utilizador. Nomes de colunas só a partir de listas fixas no código ou do esquema lido da base de dados.
7. **Limite de 2100 parâmetros do SQL Server.** Listas `IN (...)` sempre em blocos com `_chunks(...)` (máx. 2000 parâmetros por instrução).
8. **IVA:** `dbo.produtos.iva` guarda a **taxa** (ex.: 23), não o código de `dbo.iva`.
9. **Cores:** `fundo`/`letra` são inteiros BGR (TColor do Delphi). Use `int_color_to_hex` e `hex_to_int_color` de `db.py`.
10. **Backups:** o formato atual é `format_version = 2`. O restauro (`restore_backup`) tem de continuar a aceitar backups v1 e v2. Se acrescentar dados ao backup, faça-o com chaves novas e opcionais, e trate-as no restauro.
11. **Interface em português de Portugal**, no estilo visual existente (Tailwind, cartões brancos, `indigo` para ações, `amber` para avisos). Evite dependências novas no frontend. Se uma for mesmo necessária, justifique no commit.
12. **Não incluir no git:** `config.json`, `backups/`, `dist/`, `build/`, `frontend/dist/`. Nunca incluir nomes de clientes nem credenciais: o repositório é público.

### 0.3 Verificação obrigatória antes de cada commit
- `cd frontend && npm run build` sem erros (inclui `tsc`).
- Backend arranca com `python main.py` e as funções novas foram testadas contra uma base de dados SQL Server de teste, **nunca em produção de um cliente**.
- Confirmar que as funções existentes continuam a funcionar: pesquisa, simulação e gravação em massa, importação, restauro de backup.

---

## 1. Selecionar todos os resultados do filtro

### Problema
A seleção só permite marcar os artigos da página visível (50 por página). O painel de edição em massa (`BulkEditPanel`) recebe `selectedProductsList = products.filter(p => selectedCodes.has(p.codigo))`, ou seja, **só os artigos selecionados que estão na página atual**. Artigos selecionados noutras páginas são ignorados em silêncio.

### Backend
1. **`ProductFilter`** (`models.py`): acrescentar `codes: Optional[List[int]] = None`. Em `_build_product_where`, se `codes` vier preenchido, filtrar por esses códigos (em blocos, ou com `EXISTS` sobre uma lista parametrizada; respeitar o limite de parâmetros). É também usado pela função 2.
2. **Novo endpoint `POST /api/products/codes`**
   - Entrada: `ProductFilter` (ignora `page`/`page_size`).
   - Saída: `{ "codes": [int], "total": int, "truncated": bool }`.
   - Ordenação igual à da pesquisa. Limite de segurança de 20 000 códigos (`truncated = true` se houver mais).
3. **Novo endpoint `POST /api/products/selection-summary`**
   - Entrada: `{ "product_codes": [int] }`.
   - Saída: `{ "count": int, "with_sales_count": int, "sales_check_ok": bool, "sample": ProductItem | null }`.
   - Usa `get_sales_codes(cursor, codes)` (que já trabalha em blocos). `sample` é o primeiro artigo, usado na pré-visualização do botão no separador Cores.

### Frontend
1. **`ProductTable`:** quando a página inteira está selecionada e `totalCount > pageSize`, mostrar uma faixa por cima da tabela:
   - "Os 50 artigos desta página estão selecionados. **Selecionar todos os N artigos do filtro**";
   - depois de selecionar: "Todos os N artigos do filtro estão selecionados. **Limpar seleção**".
2. **`App.tsx`:** `handleSelectAllFiltered()` chama `/api/products/codes` com os filtros atuais e junta os códigos a `selectedCodes`. Se `truncated`, mostrar aviso.
3. **`BulkEditPanel`:** deixar de depender de `selectedProducts`.
   - Nova prop `selectedCodes: number[]`; `product_codes` passa a ser `selectedCodes`.
   - Contagens (`selectedCount`, `hasSalesCount`, `allHaveSales`) vêm de `/api/products/selection-summary`. Chamar sempre que a seleção muda, com *debounce* de ~300 ms.
   - A pré-visualização do botão (hoje `selectedProducts[0]`) usa `summary.sample`.
4. **Seleção visível:** mostrar sempre "N selecionados (M fora desta página)", para o utilizador saber que há artigos selecionados que não está a ver.
5. **`PreviewModal`:** com muitos artigos, renderizar no máximo os primeiros 200 cartões e mostrar "… e mais X artigos com alterações". Os totais continuam a vir da resposta completa.
6. **Etiquetas:** se a seleção tiver mais de 300 artigos, pedir confirmação antes de gerar.

### Critérios de aceitação
- [ ] Com o filtro "Família = X" (ex.: 1500 artigos), "Selecionar todos" seleciona os 1500, e a simulação e a gravação aplicam-se aos 1500.
- [ ] Mudar de página não perde a seleção; o contador mostra quantos estão fora da página.
- [ ] O aviso "artigos com vendas" e o bloqueio da designação usam as contagens do resumo (todos os selecionados, não só a página).
- [ ] Selecionar 5000 artigos não bloqueia a interface; a simulação mostra no máximo 200 cartões.
- [ ] Exportar CSV e etiquetas usam a seleção completa.

---

## 2. Relatório de problemas nos dados

### Objetivo
Ecrã **só de leitura** que analisa a base de dados e lista problemas, cada um com atalho para ver ou selecionar os artigos em causa e corrigi-los com a edição em massa existente.

### Backend
**Novo endpoint `GET /api/reports/data-quality`**, com parâmetro opcional `short_desc_max` (int, predefinição 20).

Saída: lista de verificações.
```json
[
  {
    "id": "duplicate_barcode",
    "title": "Códigos de barras repetidos",
    "description": "O mesmo código de barras está atribuído a mais do que um artigo.",
    "severity": "error | warning | info",
    "count": 12,
    "codes": [101, 205],
    "groups": [{ "key": "5601234567890", "codes": [101, 205] }],
    "available": true,
    "unavailable_reason": null
  }
]
```
- `codes`: todos os códigos afetados, até 5000 (acima disso, indicar `truncated`).
- `groups`: só nas verificações de duplicados.
- Se a verificação depende de uma coluna ou tabela que não existe, devolver `available: false` e o motivo, em vez de dar erro.

**Verificações a implementar** (cada uma numa função pequena, com SQL parametrizado):

| id | Verificação | Severidade | Notas |
|----|-------------|-----------|-------|
| `duplicate_barcode` | `codbarras` não vazio (após `LTRIM/RTRIM`) repetido | error | agrupar por código |
| `duplicate_plu` | `codigo_alf > 0` repetido | error | agrupar por PLU |
| `missing_family` | `familia` nula, 0 ou inexistente em `dbo.familias` | error | |
| `missing_subfamily` | `subfam > 0` inexistente em `dbo.subfamilias` | warning | |
| `subfamily_wrong_family` | `subfamilias.familia` ≠ `produtos.familia` | warning | |
| `invalid_vat` | `produtos.iva` sem taxa correspondente em `dbo.iva.factor` (tolerância 0,001) | error | |
| `no_production_center` | artigo sem linhas em `dbo.produtoscentrosprod` | info | ver nota |
| `invalid_production_center` | linha em `produtoscentrosprod` com `centro` inexistente em `dbo.centrosprod` | warning | |
| `orphan_production_center_rows` | linha em `produtoscentrosprod` com `codigo` inexistente em `dbo.produtos` | info | só contagem, sem seleção |
| `zero_price_visible` | `ISNULL(precovenda,0) = 0`, visível no POS e não bloqueado | warning | `frontoffice`/`bloqueado` só se as colunas existirem |
| `empty_short_desc` | `descricaocurta` nula ou vazia | info | |
| `long_short_desc` | `LEN(descricaocurta) > short_desc_max` | info | |
| `whitespace_desc` | `descricao` com espaços no início ou fim, ou espaços duplos | info | corrigível com o modo "Ortografia" (atenção a artigos com vendas) |

Nota sobre `no_production_center`: nem todos os artigos precisam de centro de produção (bebidas servidas ao balcão, por exemplo). Na interface, mostrar a lista agrupada por família, para o utilizador perceber rapidamente onde é que falta.

### Frontend
1. **`Header`:** novo botão "Relatório" (ícone `ClipboardCheck` ou `AlertTriangle` do `lucide-react`) que abre `DataQualityModal`.
2. **`DataQualityModal`:**
   - botão "Analisar" (a análise só corre a pedido, pode demorar em bases de dados grandes);
   - campo para `short_desc_max`;
   - lista de cartões por verificação: título, descrição, contagem e severidade por cor (`rose` erro, `amber` aviso, `slate` info); verificações indisponíveis aparecem esbatidas, com o motivo;
   - nos duplicados, lista expansível dos grupos (valor → códigos);
   - ações por verificação:
     - **"Ver artigos":** fecha o modal e aplica o filtro `codes` (novo campo de `ProductFilter`, ver função 1) com a lista de códigos; mostrar na barra de filtros uma etiqueta "Filtro: relatório — <título> ✕" para voltar;
     - **"Selecionar artigos":** junta os códigos à seleção (reutiliza a lógica da função 1);
   - botão "Exportar relatório (CSV)": uma linha por artigo afetado, com as colunas verificação, código, designação, detalhe.

### Critérios de aceitação
- [ ] O relatório não altera nada na base de dados (só `SELECT`).
- [ ] Numa base de dados sem as colunas `bloqueado`/`frontoffice`, `zero_price_visible` funciona com o critério reduzido e indica-o.
- [ ] "Ver artigos" mostra exatamente os artigos da verificação, com paginação correta.
- [ ] Com 50 000 artigos, a análise completa demora menos de ~10 s num SQL Server Express local (usar consultas agregadas, sem ciclos em Python por artigo).

---

## 3. Pré-visualização e reordenação dos botões do POS

### Objetivo
Mostrar, por família, uma grelha que se aproxima do aspeto dos botões no ZSRest (cor de fundo, cor do texto, texto, ordem), e permitir **reordenar por arrastar**, gravando a coluna `dbo.produtos.ordem` com o fluxo seguro (simulação → backup → transação → `sync = 1`).

> **Aviso para o utilizador:** a grelha é uma aproximação. O número de colunas e o texto mostrado no ZSRest podem variar com a configuração do posto. Isto tem de estar escrito no ecrã.

### Backend
1. **`GET /api/pos-layout/families`:** famílias por `ISNULL(posicaofront,0), codigo`, com `codigo`, `descricao`, `fundo_hex`, `letra_hex`, `frontoffice`, `posicaofront` e `products_count`. Pode reutilizar `get_families_detailed()`.
2. **`GET /api/pos-layout/family/{familia}`:** artigos da família, ordenados por `ISNULL(ordem,0), codigo`, com `codigo`, `descricao`, `descricaocurta`, `fundo_hex`, `letra_hex`, `ordem`, `pvp1`, `bloqueado`, `frontoffice` (os dois últimos só se as colunas existirem; caso contrário 0 e 1) e `subfamilia`/`subfamilia_desc`. Parâmetro opcional `include_hidden` (predefinição `false`).
3. **`POST /api/pos-layout/preview`** e **`POST /api/pos-layout/apply`**
   - Entrada: `{ "familia": int, "order": [codigo1, codigo2, ...], "step": 1, "mark_cloud_sync": true }`.
   - Cálculo: nova `ordem` = `(índice + 1) * step`. Só geram alteração os artigos cuja `ordem` muda.
   - Validações:
     - todos os códigos pertencem à família (se não, erro 400);
     - sem códigos repetidos;
     - artigos da família que não vêm na lista (ex.: ocultos) não são alterados.
   - **Usar o motor existente:** criar `Change("posicaofront", "Posição POS", old, new, column="ordem", value=new)` por artigo e aplicar com `_apply_changes`. A resposta de preview segue o formato `BulkEditPreviewResponse`, para reutilizar o `PreviewModal`.
   - Backup com `create_backup_snapshot(produtos_afetados, "Reordenação POS — família X")`. O restauro já repõe `posicaofront → ordem`.
4. **(Opcional, fase 2) Reordenar famílias** (`dbo.familias.posicaofront`): o snapshot de famílias hoje só guarda `fundo`/`letra`. Para implementar é preciso:
   - acrescentar `posicaofront` a `_read_family_colors` (ou criar `_read_families_snapshot`);
   - tratá-lo em `restore_backup`, só quando a chave existe no backup, para manter compatibilidade;
   - só depois disso criar o endpoint de gravação.

### Frontend
1. **`Header`:** botão "Botões POS" (ícone `LayoutGrid`) que abre `PosLayoutModal` (ecrã grande, quase inteiro).
2. **`PosLayoutModal`:**
   - **Coluna esquerda:** lista de famílias com a cor de cada uma; clicar carrega os artigos.
   - **Área principal:** grelha de botões.
     - Cada botão: fundo `fundo_hex`, texto `letra_hex`, texto = `descricaocurta` (ou `descricao` se vazia; seletor "Texto: Descrição curta / Designação"), preço PVP1 opcional (interruptor).
     - Colunas configuráveis (predefinição 5, entre 3 e 10) e interruptor "Mostrar ocultos/bloqueados" (esbatidos, com ícone de cadeado ou olho).
     - **Arrastar e largar** com a API nativa de *drag and drop* do HTML5 (sem bibliotecas novas).
     - Alternativa sem rato: ao clicar num botão, campo "Mover para posição N" e setas ←/→.
     - Indicador "Ordem alterada (não gravada)" e botões "Repor" e "Simular & Gravar".
   - "Simular & Gravar" chama `/api/pos-layout/preview`, mostra o `PreviewModal` e, ao confirmar, chama `/api/pos-layout/apply`.
   - Filtro opcional por subfamília dentro da família. Ao reordenar com filtro ativo, só se reordena o subconjunto visível e os restantes mantêm a `ordem` (validar esta regra no backend).
3. **Contraste:** se a combinação fundo/texto tiver contraste baixo (rácio < 3:1), mostrar um pequeno aviso no botão.

### Critérios de aceitação
- [ ] A grelha mostra as cores corretas (confirmar com um artigo de `letra = 0`, texto preto).
- [ ] Arrastar um botão e gravar altera só a `ordem` dos artigos que mudaram de posição, com backup e `sync = 1`.
- [ ] Restaurar o backup criado repõe a ordem anterior.
- [ ] Artigos ocultos não visíveis na grelha não são alterados.
- [ ] Funciona numa base de dados sem as colunas `bloqueado`/`frontoffice` (todos são tratados como ativos e visíveis).

---

## 4. Editor da ementa digital (Removido a pedido do utilizador)

> **Nota:** Esta funcionalidade foi completamente removida da aplicação a pedido do utilizador.

> **A estrutura desta tabela não está documentada neste projeto.** Não assumir nomes de colunas. A implementação tem **duas fases** e a fase B **só começa depois de o Nuno confirmar** o mapeamento das colunas.

### Fase A — Descoberta (só leitura)
1. **`GET /api/ementa-digital/schema`**
   - Se a tabela não existir, devolver `{ "available": false }`.
   - Caso contrário, devolver:
     - colunas, tipos e tamanhos (`sys.columns` + `sys.types`), nulidade e se fazem parte da chave primária (`sys.indexes`/`sys.index_columns`);
     - outras tabelas `dbo` com `ementa` no nome, com as mesmas informações;
     - 5 linhas de exemplo (`SELECT TOP 5 *`) e o número total de linhas.
2. **Ecrã "Ementa digital › Estrutura"** (dentro do novo modal) que mostra este resultado, com botão "Copiar para a área de transferência" em texto/JSON, para enviar ao Nuno.
3. **Parar aqui e pedir confirmação** de:
   - a coluna que liga a `dbo.produtos.codigo` (ex.: `codigo`, `produto`, `id_produto`…);
   - as colunas editáveis e o significado de cada uma (designação na ementa, descrição longa, visibilidade, ordem, destaque, alergénios…);
   - se existe coluna de sincronização (`sync` ou equivalente) e como a ZoneSoft deteta alterações para publicar a ementa.

### Fase B — Edição (depois da confirmação)
1. **Configuração explícita no código** (`backend/services/ementa_digital.py`, módulo novo):
   ```python
   EMENTA_TABLE = "ementa_digital_produtos"
   EMENTA_KEY_COLUMN = "<confirmado>"   # liga a dbo.produtos.codigo
   EMENTA_EDITABLE_COLUMNS = {
       # coluna: {"label": "...", "kind": "text" | "bool" | "int"}
   }
   EMENTA_SYNC_COLUMN = "<confirmado ou None>"
   ```
   No arranque, validar contra o esquema: colunas em falta → funções indisponíveis, com mensagem.
2. **`POST /api/ementa-digital/search`:** lista ligada a `dbo.produtos` (código, designação do POS, família, PVP1) e às colunas editáveis. Filtros: pesquisa, família, "sem registo na ementa", "diferente da designação do POS". Com paginação, como `search_products`.
3. **`POST /api/ementa-digital/preview`** e **`POST /api/ementa-digital/apply`.** Operações em massa sobre uma lista de códigos:
   - texto: definir valor, e transformações `transform_text_case` (maiúsculas, minúsculas, primeira letra, ortografia, sem acentos), validando o tamanho da coluna com o esquema;
   - "copiar designação do POS" (`produtos.descricao`) ou "copiar descrição curta" para uma coluna de texto;
   - booleano/inteiro: definir valor (ex.: visível sim/não).
   - Só **`UPDATE`** de linhas existentes. **Não criar nem apagar** linhas nesta versão; artigos sem registo aparecem na simulação como bloqueados, com o motivo "sem registo na ementa digital".
   - Resposta no formato `BulkEditPreviewResponse`, para reutilizar o `PreviewModal`.
4. **Backup e restauro:**
   - no snapshot, acrescentar a chave opcional `"ementa_digital": [ {<chave>: ..., <colunas editáveis>: ...} ]` (com `products: []` se só a ementa mudou);
   - em `restore_backup`, se a chave existir, repor essas colunas por `UPDATE ... WHERE <chave> = ?`, só nas colunas que ainda existem no esquema e dentro da mesma transação;
   - a cópia de segurança "estado antes do restauro" também tem de incluir a ementa digital;
   - backups v1/v2 sem esta chave continuam a funcionar.
5. **`sync`:** se `EMENTA_SYNC_COLUMN` estiver definido e existir, marcar nas linhas alteradas.
6. **Frontend:** botão "Ementa digital" no `Header` (ícone `QrCode`) → `EmentaDigitalModal`, com:
   - separador "Estrutura" (fase A);
   - separador "Editar": tabela paginada com colunas editáveis, seleção (reutilizar a lógica da função 1) e painel de ações em massa → `PreviewModal` → gravar.

### Critérios de aceitação
- [ ] Sem a tabela `ementa_digital_produtos`, o botão mostra "Esta base de dados não tem ementa digital" e nada falha.
- [ ] A fase A não escreve nada na base de dados.
- [ ] Na fase B, todas as gravações têm simulação, backup, transação e (se existir) `sync`.
- [ ] Um texto maior que o tamanho da coluna aparece bloqueado na simulação e não é gravado.
- [ ] Restaurar o backup repõe os valores anteriores da ementa digital.
- [ ] Nenhuma alteração da ementa digital mexe em `dbo.produtos.descricao`.

---

## 5. Importar ementas enviadas pelo cliente (PDF, fotos, manuscritas)

### Objetivo
Transformar a ementa que o cliente envia (PDF com texto, PDF digitalizado, fotografia, folha escrita à mão) numa **tabela de artigos revista pelo utilizador**. Essa tabela é usada para:
- **(A)** gerar o ficheiro de importação de artigos do ZoneSoft, para artigos novos;
- **(B)** atualizar artigos que já existem (preços, descrição curta, família), com a simulação e a gravação seguras que já existem.

### Princípios (obrigatórios)
1. **A extração nunca grava nada diretamente.** Passa sempre por um ecrã de revisão, onde o utilizador vê a imagem original ao lado da tabela extraída e corrige.
2. **A leitura automática erra**, sobretudo em manuscritos e fotos tortas (ex.: 6,50 lido como 8,50, "Bitoque" lido como "Bifoque"). A interface tem de destacar os campos com baixa confiança, e nenhum preço é aceite sem estar visível na revisão.
3. **Não criar artigos diretamente em `dbo.produtos` nesta versão.** Criar artigos pela base de dados exige conhecer todas as colunas obrigatórias, a geração de códigos e as tabelas relacionadas da ZoneSoft. Artigos novos saem **em ficheiro de importação** para o importador oficial da ZoneSoft (caminho A). Só os artigos que já existem são atualizados pela aplicação (caminho B).
4. **Privacidade e custos:** o envio de imagens para um serviço externo de IA tem de ser explícito (aviso no ecrã, na primeira utilização). Sem chave de API configurada, a função mostra-se indisponível, com a explicação, e o resto da aplicação funciona normalmente.

### Extração
1. **PDF com texto** (exportações, PDFs feitos em Word): extrair o texto diretamente, sem IA, com `pdfplumber` ou `pypdfium2`. Se o texto extraído estiver vazio ou for ilegível, tratar como digitalizado.
2. **PDF digitalizado, fotografias (JPG/PNG/HEIC) e manuscritos:** converter cada página em imagem (`pypdfium2` para PDF) e enviá-la a um **modelo de IA com visão** (fornecedor configurável, ex.: Gemini ou Claude, por API), pedindo **JSON estruturado** conforme o esquema abaixo.
3. **Pré-processamento das imagens:** corrigir a rotação EXIF, reduzir para ~2000 px no lado maior e comprimir antes de enviar.
4. **Várias páginas ou várias fotos** da mesma ementa juntam-se numa única sessão de importação.
5. **Não usar OCR local (Tesseract)** como solução principal: é fraco em manuscritos e ementas com várias colunas, e aumenta muito o executável portátil.

**Esquema JSON pedido ao modelo** (validar com Pydantic; se a resposta não for válida, repetir uma vez e depois mostrar erro):
```json
{
  "secoes": [
    {
      "nome": "Pratos de Carne",
      "subsecao": null,
      "artigos": [
        {
          "nome": "Bitoque da Casa",
          "descricao": "com ovo, batata frita e salada",
          "precos": [{ "rotulo": "Sala", "valor": 9.50 }, { "rotulo": "Take Away", "valor": 8.50 }],
          "variantes": [{ "nome": "1/2 dose", "precos": [{ "rotulo": "Sala", "valor": 6.00 }] }],
          "confianca": 0.82,
          "notas": "preço corrigido à mão na folha"
        }
      ]
    }
  ],
  "rotulos_preco_encontrados": ["Sala", "Take Away"],
  "avisos": ["Página 2 parcialmente ilegível no canto inferior direito"]
}
```
- O prompt deve pedir: não inventar artigos nem preços; `valor: null` quando o preço não é legível; manter o nome como está escrito (sem traduzir nem "melhorar"); indicar `confianca` por artigo.
- Doses ou variantes ("1/2 dose", "dose", "grande") viram artigos separados na revisão: "Bitoque da Casa 1/2 dose". O utilizador pode desfazer a separação.

### Configuração
- Novo separador "IA / Importação de ementas" no ecrã de configuração: fornecedor, modelo e chave de API.
- A chave segue a mesma regra da palavra-passe: só é gravada no `config.json` se marcar "Guardar"; caso contrário fica só em memória.
- Botão "Testar chave".
- Todas as chamadas à API ficam num único módulo (`backend/services/menu_ai.py`), com *timeout*, máximo de páginas por importação (ex.: 20) e mensagem de erro clara quando não há internet.
- Dependências novas têm de ser compatíveis com Python 3.9 e com o PyInstaller; atualizar os scripts de build e o `MassEdit-Portable.spec` se for preciso.

### Ecrã de revisão (`MenuImportModal`)
1. **Passo 1 — Carregar:** arrastar ficheiros (PDF, JPG, PNG, HEIC), ver miniaturas e reordenar páginas. Botão "Ler ementa".
2. **Passo 2 — Rever:**
   - **à esquerda,** a página ou imagem original com zoom;
   - **à direita,** a tabela editável: secção, subsecção, nome, descrição curta (gerada a partir do nome, respeitando o tamanho da coluna `descricaocurta` lido do esquema), preços por rótulo e confiança;
   - linhas com `confianca < 0,8`, preço `null` ou preço fora do habitual (ex.: > 100 € ou 0) destacadas a `amber`;
   - ações: juntar e dividir linhas, apagar, acrescentar à mão, aplicar maiúsculas ou ortografia (reutilizar `transform_text_case`);
   - verificação de repetidos (mesmo nome na mesma secção).
3. **Passo 3 — Mapear:**
   - **Rótulos de preço → PVP:** ex.: "Sala" → PVP1, "Take Away" → PVP2, "App" → PVP5. Obrigatório para cada rótulo usado.
   - **Secções → famílias e subfamílias existentes:** lista de escolha, ou "nova família (criar no ZoneSoft)".
   - **IVA por família:** proposta editável pelo utilizador; nunca definido automaticamente sem confirmação. Validar contra `dbo.iva`.
   - **Casamento com artigos existentes:** para cada linha, procurar um artigo pelo nome, primeiro exato e depois aproximado (sem acentos, maiúsculas ou espaços; semelhança ≥ 0,85). Estados: "Novo", "Corresponde a #123 (confirmar)" e "Várias correspondências (escolher)". **Correspondências aproximadas nunca são aceites sem confirmação** (ex.: "1/2 Bife" não é "Bife do Vazio").
4. **Passo 4 — Resultado:**
   - **(A) Artigos novos → "Gerar ficheiro de importação ZoneSoft".** Uma folha Produtos com as colunas do template de importação de artigos, por esta ordem: `codigo, descricao, familia, subfam, unidade, iva, ivacompra, tiposaft, fornecedor, referencia, codbarras, precovenda, precocompra, descricaocurta, pvp2`. Os valores por defeito de `unidade`, `ivacompra` e `tiposaft` **têm de ser confirmados pelo Nuno com um template real da ZoneSoft** antes de fixar no código. Formato de saída (`.xls` ou `.xlsx`) igualmente a confirmar com o importador.
   - **(B) Artigos existentes → "Atualizar artigos existentes".** Converte as linhas confirmadas em `ImportRow` e segue o fluxo já existente: `preview_import` → `PreviewModal` → `apply_import` (backup, transação, `sync = 1`, designação protegida em artigos com vendas).
   - Guardar a sessão de revisão num ficheiro JSON local (pasta `importacoes/`, fora do git), para continuar mais tarde sem repetir a leitura paga.

### Backend (resumo de endpoints)
| Endpoint | Função |
|----------|--------|
| `POST /api/menu-import/extract` | recebe ficheiros (multipart), devolve o JSON extraído + páginas em miniatura |
| `POST /api/menu-import/match` | recebe as linhas revistas, devolve correspondências com artigos existentes |
| `POST /api/menu-import/export-zs-template` | gera e devolve o ficheiro de importação ZoneSoft |
| `POST /api/menu-import/to-import-rows` | converte linhas confirmadas em `ImportRow` para `preview_import`/`apply_import` |
| `GET/POST /api/menu-import/sessions` | listar, gravar e abrir sessões de revisão |

### Critérios de aceitação
- [ ] Um PDF com texto é lido sem chamar a API de IA.
- [ ] Uma foto de uma ementa manuscrita produz uma tabela revista com os preços ilegíveis marcados (`null`), não inventados.
- [ ] Sem chave de API, a importação de PDFs com texto continua a funcionar e as imagens mostram "configure a chave de API".
- [ ] Nenhum preço ou artigo é gravado sem passar pelo ecrã de revisão e, no caminho B, pelo `PreviewModal`.
- [ ] O ficheiro de importação gerado é aceite pelo importador da ZoneSoft. Validar com o Nuno numa base de dados de teste.
- [ ] Correspondências aproximadas exigem confirmação explícita.
- [ ] Nenhuma imagem de cliente, sessão de importação ou chave de API fica no repositório git (acrescentar `importacoes/` ao `.gitignore`).

---

## 6. Fora de âmbito (não implementar agora)
Preço por fórmula entre tabelas de preço, "renomear" artigos com vendas, regras de IVA por família (além da proposta de IVA na função 5), comparação com outra base de dados (ZS/PHC), perfis de ligação por cliente, pacotes de alterações e histórico de alterações.
