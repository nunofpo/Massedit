# MassEdit POS — Especificação: Editor de Mapa de Mesas

## Contexto

O "Mapa de Mesas" do ZS Rest (documentado em `ZS_Rest Mapa de Mesas ver 22.3.1.pdf`) tem um
editor nativo muito datado (Delphi, sem redimensionar janela, biblioteca de imagens clipart
dos anos 2000 — mesas em xadrez, texturas de madeira/mármore falsas, decorações garridas).
Ao contrário do tema dos botões (`.zstheme`, ficheiro à parte), o mapa de mesas **vive
inteiramente na base de dados SQL Server** — não há ficheiro nenhum a exportar/importar.
Isto significa que o MassEdit já tem acesso direto a tudo o que é preciso para o editar.

Confirmado por leitura direta da base de dados de teste (`nuno`) e do manual oficial.

## Como o ZoneSoft guarda isto

### `dbo.zonas` — uma linha por zona/sala (ex: "Interior", "Fora")

| Coluna | Tipo | Uso |
|---|---|---|
| `id` | int | chave interna |
| `codigo` | int | código da zona (referenciado por `mapamesas.zona`) |
| `descricao` | varchar(50) | nome da zona |
| `background` | image (BLOB) | **imagem de fundo da sala, em BMP bruto** (bytes `BM...`) |
| `width`, `height` | int | tamanho do canvas do mapa de mesas (a imagem de fundo é feita *tile* dentro deste tamanho) |
| `tabelaiva`, `printerdocs`, `printercontas`, `precozona`, `centroproducao`, `pagamento_mesas`, `taxaservico`, `taxaservicopercent`, `interno`, `processa_taxa_sdr` | — | configuração de negócio da zona, não relacionada com o desenho |

Confirmado na base de teste: zona "Interior" tem `width=639`, `height=535` e um `background`
de 128 054 bytes (BMP 320×100, aplicado em *tile*, não esticado).

### `dbo.mapamesas` — uma linha por objeto desenhado (mesa, banco, planta, etc.)

| Coluna | Tipo | Uso |
|---|---|---|
| `id` | int | código da mesa (liga a `dbo.mesas.mesa` quando `tipoobjecto=0`) |
| `nomeobjecto` | varchar(50) | texto mostrado sobre o objeto (normalmente o número da mesa) |
| `posx`, `posy` | int | posição no canvas da zona |
| `altura`, `largura` | int | tamanho do ícone (0 = usa o tamanho nativo da imagem) |
| `imagem` | image (BLOB) | **ícone do objeto, em BMP bruto**, com fundo transparente por *color key* (ver abaixo) |
| `extensao` | varchar(10) | normalmente vazio na prática |
| `zona` | int | liga a `zonas.codigo` |
| `tipoobjecto` | int | `0` = mesa normal, `1` = objeto decorativo/outro (banco, planta, balcão) |
| `lugares` | int | nº de lugares da mesa |
| `fntname`, `fntsize`, `fntcolor`, `fontx`, `fonty`, `fontstyle` | — | tipo de letra do nome sobre o objeto |
| `corgrupo`, `grupo` | int (BGR, igual ao `fundo`/`letra` de `dbo.produtos`) | cor de agrupamento; **não** é o estado (livre/ocupada) — isso é pintado em tempo real pelo FrontOffice por cima do ícone (ponto verde = livre, conforme o manual) |
| `estado`, `reserva`, `bloqueada`, `empregado`, `subcontas`, `pedidosretidos`, `modo_pagamento` | — | estado operacional, não visual |

Confirmado na base de teste: 58 objetos na zona "Interior", `tipoobjecto=0` em 54 (mesas),
`tipoobjecto=1` em 4 (banco + 3 plantas decorativas). 20 objetos têm imagem própria; os
restantes usam o ícone por omissão do tipo de mesa.

### Biblioteca de imagens nativa do ZS Rest (para referência, não usada pelo editor da app)

- `C:\Zone Soft\ZSRest\Imagens\mesas\` — 45 ícones de mesa (mesas.quad.bmp, geral_mesa_4cadeiras.bmp, banco alto*.bmp, etc.)
- `C:\Zone Soft\ZSRest\Imagens\fundos\` — 69 texturas de fundo (fundos (1..47).bmp, geral_interno.bmp, Virt01..10.bmp, etc.)

Foram inspecionadas várias — todas no mesmo estilo datado da imagem atualmente em uso. Não há
vantagem em trocar de uma imagem antiga da biblioteca por outra; vale mais desenhar um
conjunto novo.

## Confirmação visual (feita nesta sessão)

Foi reconstruída, por composição direta das linhas da BD (fundo + cada `mapamesas` na sua
posição/tamanho reais), uma imagem idêntica à do editor nativo do ZS Rest — confirma que a
leitura do esquema está correta. Foi depois gerado um conjunto de ícones novos (SVG/PIL,
sem dependências pesadas): mesas redondas planas (2/4/6 lugares) com marcas de assento em
vez de cadeiras 3D falsas, um ícone de planta simplificado, uma bancada plana, e um fundo
claro com padrão de pontos subtil em vez da textura de madeira. A comparação lado-a-lado
("antes"/"depois") foi aprovada como direção visual a seguir (fundo claro, mesas planas
neutras — o estado livre/ocupada continua a ser pintado pelo FrontOffice em tempo real, não
faz parte do ícone).

## Funcionalidade a implementar: Editor de Mapa de Mesas no MassEdit

Objetivo: substituir a necessidade de abrir o editor antigo do ZS Rest para ajustar o
aspeto do mapa de mesas, e (fase 2) também para o desenhar/reorganizar.

### Fase A — Editor visual (recolorir/substituir ícones e fundo)

Backend (`backend/services/mesas_map.py`, novo módulo):

1. `GET /api/mesas-map/zonas` — lista `zonas.codigo, descricao, width, height` e se têm
   `background` definido.
2. `GET /api/mesas-map/zona/{codigo}` — devolve, para essa zona:
   - o `background` em base64 (ou `null` se vazio);
   - todos os objetos de `mapamesas` (id, nome, posx, posy, altura, largura, tipoobjecto,
     lugares, corgrupo em hex via `int_color_to_hex` — já existe em `backend/db.py` —,
     e a `imagem` também em base64).
3. `POST /api/mesas-map/zona/{codigo}/background` — recebe um PNG/BMP novo (upload), converte
   para BMP (Pillow `im.save(buf, format="BMP")`) e grava em `zonas.background`, dentro do
   fluxo seguro habitual (backup do valor anterior, transação, `sync` se a tabela tiver essa
   coluna — confirmar no esquema).
4. `POST /api/mesas-map/objeto/{id}/imagem` — idem, mas para `mapamesas.imagem` de um objeto.
5. `POST /api/mesas-map/preset/aplicar` — aplica um conjunto de ícones gerados (o preset
   "claro moderno" desenhado nesta sessão, ou outro) a todos os objetos de uma zona,
   escolhendo o ícone por `tipoobjecto` + `lugares` (mesma lógica usada no protótipo desta
   sessão). Devolve preview (base64) antes de gravar — reutilizar o padrão
   simulação → confirmação → transação já usado em todo o resto da app.

Frontend: novo `MesasMapModal.tsx` (mesmo padrão do `ZSThemeModal.tsx` já existente):
- seletor de zona;
- pré-visualização do mapa atual (fundo + objetos nas posições reais, tal como o mockup
  desta sessão);
- botão "Aplicar Preset Claro Moderno" com preview antes/depois;
- upload manual de um fundo ou ícone próprio, por objeto ou para todos de um tipo.

### Fase B (opcional, esforço maior) — Editor de posições

Haveria valor em, tal como o `PosLayoutModal` já faz para os botões do POS, permitir
arrastar os objetos no canvas e gravar `posx`/`posy` novos — isto tornaria desnecessário
abrir o ZS Rest para reorganizar a sala. Reutilizar a mesma mecânica de arrastar já usada em
`PosLayoutModal.tsx` (HTML5 drag and drop nativo, sem bibliotecas novas).

## Regras a respeitar (iguais às já estabelecidas no projeto)

1. Nunca escrever direto sem simulação/preview primeiro.
2. Cópia de segurança (`create_backup_snapshot` ou equivalente) antes de qualquer gravação —
   `zonas.background` e `mapamesas.imagem` são BLOBs grandes, o snapshot deve guardá-los
   inteiros para permitir reverter.
3. Transação única, com `sync = 1` se a tabela tiver essa coluna (confirmar — não visto no
   esquema listado acima; se não existir, confirmar com o Nuno se há outro mecanismo de
   sincronização do mapa de mesas com a cloud, tal como `dbo.fullsync` serve para produtos).
4. Nunca reduzir tabelas existentes sem confirmação (é a sala real do cliente).
5. Interface em português de Portugal, no estilo visual já existente.

## Por confirmar com o Nuno antes da Fase B

- Existe alguma coluna/tabela de sincronização específica do mapa de mesas com a cloud
  (equivalente ao `dbo.fullsync` dos produtos)? Sem isto, uma alteração ao mapa pode não
  chegar aos postos até um refresh manual.
- Confirmar se `tipoobjecto` tem mais valores possíveis para além de `0` (mesa) e `1`
  (decorativo/outro) — só foram vistos estes dois na base de teste.
