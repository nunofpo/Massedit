# MassEdit POS 🚀

**MassEdit POS** é uma ferramenta profissional de elevado desempenho e segurança para gestão e edição em massa de dados em sistemas de ponto de venda (**ZoneSoft ZSRest / ZSPOS** sobre Microsoft SQL Server).

Desenvolvido para técnicos, consultores de POS e proprietários de restauração e retalho, permite realizar em minutos alterações complexas de preços, famílias, botões do POS, ementa digital com imagens e traduções, com salvaguarda transacional e sem riscos fiscais.

---

## 🛡️ Pilares Obrigatórios de Segurança (Zero Riscos)

O MassEdit foi concebido com proteções ativas que tornam impossível danificar a integridade da base de dados do cliente:

1. **Inviolabilidade Fiscal (Artigos com Vendas)**:
   - A designação fiscal (`dbo.produtos.descricao`) de artigos que já tenham histórico de vendas **nunca é alterada**, cumprindo escrupulosamente os requisitos da Autoridade Tributária. A verificação é *fail-safe* (se houver dúvida, o artigo é considerado vendido e protegido).
2. **Simulação Prévia Obrigatória (Dry-Run)**:
   - Nenhuma gravação é feita sem antes passar por um painel de simulação detalhado (`PreviewModal`), onde são discriminados todos os campos alterados, artigos bloqueados e artigos protegidos.
3. **Cópia de Segurança Automática (Snapshots com Undo)**:
   - Antes de qualquer instrução SQL ser executada, é gerado um snapshot JSON com o estado anterior em `backups/`. Se a gravação da cópia falhar, nenhuma alteração é feita. Qualquer alteração pode ser revertida com 1 clique no menu de Backups.
4. **Transações Atómicas (`conn.commit()` / `conn.rollback()`)**:
   - Todas as gravações operam em modo estritamente transacional (`autocommit = False`). Se ocorrer qualquer erro, toda a operação é revertida sem deixar registos corrompidos.
5. **Sincronização Cloud Automática**:
   - Em todos os registos atualizados é automaticamente marcado `sync = 1` para propagação imediata aos postos móveis e à nuvem ZoneSoft.

---

## ✨ Principais Módulos e Funcionalidades

### 1. ⚡ Edição em Massa de Artigos
- **Preços de Venda**: Atualização dos preços PVP 1 a PVP 10 por percentagem (+/- %), valor fixo ou margem, com regras de arredondamento inteligente (.00, .05, .90, .95, etc.).
- **Famílias e Subfamílias**: Reatribuição rápida de famílias e subfamílias em lote.
- **Taxas de IVA**: Atualização de taxas de IVA respeitando as taxas em vigor.
- **Centros de Produção e Impressoras**: Atribuição em lote para encaminhamento de pedidos à cozinha, copa ou bar.
- **Cores dos Botões**: Definição das cores de fundo e letra dos botões no ecrã de vendas.
- **PLUs e Códigos de Barras**: Atribuição direta ou sequencial de códigos.
- **Seleção Global**: Permite selecionar todos os artigos correspondentes a um filtro de pesquisa, mesmo entre várias páginas de resultados.

### 2. 📱 Editor da Ementa Digital (ZoneSoft QR)
Gestão direta da tabela `dbo.ementa_digital_produtos` para ementas digitais acedidas por QR Code:
- **Descrições Detalhadas de Artigos**:
  - Editor individual com caixa de texto ampla e confortável.
  - **Assistente de Sugestões Culinárias (Varinha Mágica)**: Gera propostas gastronómicas apelativas com base no tipo de prato (peixes, carnes nobres, francesinhas, sopas, sobremesas).
  - **Atalhos Rápidos**: Botões de 1 clique para acrescentar notas frequentes (`+ Grelhado na brasa`, `+ Acompanha batata frita e arroz`, `+ Ideal para partilhar`).
  - Edição e cópia de descrições curtas do POS em massa.
- **Colocação e Gestão de Imagens**:
  - Miniaturas na tabela de artigos.
  - Upload de imagens do computador (JPG, PNG, WebP) ou indicação de link externo (`image_url`), gravadas de forma otimizada.
- **Importação do ZoneSoft**:
  - Sincronização direta de artigos de `dbo.produtos` para `dbo.ementa_digital_produtos` em 1 clique (por família ou artigos selecionados).
- **Visibilidade, Destaques e Alergénios**:
  - Toggles rápidos para tornar visível/oculto, marcar destaques e indicar alergénios e dietas (🌾 Glúten, 🥛 Lactose, 🥗 Vegetariano, 🌶️ Picante).

### 3. 🌍 Assistente de Tradução Multilíngue de Ementas
Gestão da tabela `dbo.ementa_digital_traducoes`:
- **Idiomas Suportados**: Inglês 🇬🇧 (`EN`), Espanhol 🇪🇸 (`ES`), Francês 🇫🇷 (`FR`) e Alemão 🇩🇪 (`DE`).
- **Motor Culinário Especializado**: Dicionário gastronómico integrado com vocabulário de restauração portuguesa (pratos típicos, confeções, acompanhamentos, carnes e peixes).
- **Substituição Inteligente em Passo Único**: Suporta pratos compostos mantendo coerência e evitando duplicações.
- **Editor Multilíngue**: Permite afinar manualmente os textos traduzidos antes de gravar.

### 4. 🖥️ Visualizador e Reordenador dos Botões do POS (ZSRest)
- Simula a grelha tátil real do ZSRest / ZSPOS por família.
- Permite arrastar ou utilizar setas para reordenar botões no ecrã.
- Alerta visual para combinações de cor de fundo/letra com baixo contraste de leitura.

### 5. 📊 Relatório de Qualidade e Diagnóstico dos Dados
Análise preventiva que deteta inconsistências antes de causarem erros em caixa:
- Artigos sem preço de venda (PVP1 = 0).
- Artigos sem taxa de IVA atribuída.
- Códigos de barras duplicados ou inválidos.
- Artigos sem família ou subfamília.
- Botões de POS com texto ilegível (baixo contraste).
- Botão direto para selecionar todos os artigos com problemas e corrigi-los de imediato.

### 6. 📑 Importação de Ementas Externas (PDF, Fotos, Texto)
- Extração de secções, artigos e preços a partir de ficheiros PDF ou notas de texto.
- Assistente de correspondência automática e pesquisa difusa com artigos já existentes em `dbo.produtos`.

### 7. 🏷️ Etiquetas de Prateleira e Exportação Excel
- Geração de etiquetas de prateleira prontas a imprimir em folhas A4.
- Exportação completa para CSV formatado em ponto e vírgula, compatível com Microsoft Excel.

---

## 🏗️ Arquitetura Técnica

```
Massedit/
├── backend/                  # Servidor Python FastAPI
│   ├── app.py                # Endpoints REST da API
│   ├── db.py                 # Conector SQL Server pyodbc e leitura dinâmica de esquema
│   ├── models.py             # Modelos de validação Pydantic v2 (compatíveis Python 3.9)
│   └── services/
│       ├── products.py       # Motor de edições em massa, simulação e backups
│       ├── ementa_digital.py # Ementa digital, imagens, descrições e traduções
│       ├── pos_layout.py     # Layout e ordenação de botões do POS
│       ├── reports.py        # Diagnóstico e qualidade dos dados
│       └── menu_ai.py        # Importação e correspondência de ementas
├── frontend/                 # Interface Web Moderna (SPA)
│   └── src/
│       ├── App.tsx           # Ponto de entrada e orquestração de modais
│       ├── components/       # Modais e componentes da interface (Tailwind + Lucide)
│       └── types.ts          # Tipos e interfaces TypeScript
├── dist/                     # Ficheiros compilados da versão portátil
├── Criar-Versao-Mac.sh       # Script de build PyInstaller para macOS
├── Criar-Versao-PenDrive.bat # Script de build PyInstaller para Windows
└── main.py                   # Inicializador portátil com arranque de browser automático
```

- **Linguagem Backend:** Python 3.9 (estritamente compatível, tipagem `typing.Optional`, `typing.List`, etc.).
- **Framework Web:** FastAPI + Uvicorn.
- **Acesso à Base de Dados:** `pyodbc` sobre Microsoft ODBC Driver for SQL Server (17 / 18).
- **Interface Frontend:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite.
- **Empacotamento:** PyInstaller (`MassEdit-Portable.spec`).

---

## 🚀 Como Executar

### Pré-requisitos
- **Driver ODBC da Microsoft para SQL Server** (17 ou 18).
  - No Windows com ZoneSoft já se encontra normalmente instalado.
  - No macOS: `brew tap microsoft/mssql-release && brew install msodbcsql18`.
- Python 3.9+ e Node.js 18+ (apenas se correr a partir do código fonte).

### Execução a partir do Código Fonte

1. **Configurar o Ambiente Python**:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate   # No Windows: .venv\Scripts\activate
   pip install -r requirements.txt  # ou instalar fastapi, uvicorn, pyodbc, pydantic
   ```

2. **Compilar os Ficheiros do Frontend**:
   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

3. **Arrancar a Aplicação**:
   ```bash
   python main.py
   ```
   A aplicação arranca e abre automaticamente o navegador em `http://127.0.0.1:8000`.

---

## 💾 Criar Versão Portátil (Pen Drive / Standalone)

Para gerar uma versão independente que **não necessita de Python nem de Node.js instalados** no computador de destino:

- **No Windows**:
  Execute o script `Criar-Versao-PenDrive.bat`. O executável final é gerado em `dist/MassEdit-Portable/MassEdit-Portable.exe`.
- **No macOS**:
  Execute `./Criar-Versao-Mac.sh`. A aplicação é gerada em `dist/MassEdit-Portable/MassEdit-Portable`.

Basta copiar a pasta `MassEdit-Portable` para uma Pen Drive e executar diretamente em qualquer computador ligado à rede do POS.

---

## 🔒 Privacidade e Segurança de Dados

- O ficheiro `config.json` e a pasta `backups/` são ignorados no repositório (`.gitignore`).
- As palavras-passe de base de dados só são guardadas se o utilizador selecionar explicitamente essa opção.
- Nenhuma informação comercial ou fiscal sai da máquina onde o software está a correr.

---

## 📄 Licença
Distribuído sob licença proprietária para uso em ambientes ZoneSoft POS. Todos os direitos reservados.
