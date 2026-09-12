# Database Reference — ZoneSoft (ZSRest)

This document provides a comprehensive reference of the ZoneSoft SQL Server database schema.

## Core Tables

### `armazens`
| Column | Details |
| --- | --- |
| codigo |    int |
| descricao | varchar(50) |
| sync |      int |

### `armazens_apagar`
| Column | Details |
| --- | --- |
| codigo | int |

### `caixa`
| Column | Details |
| --- | --- |
| id |           int |
| idcx |         int |
| caixa |        int |
| data |         datetime |
| dataopen |     datetime |
| opencx |       varchar(50) |
| dataclose |    datetime |
| closecx |      varchar(50) |
| saldoinicial | money |
| saldofinal |   money |
| saidascx |     money |
| vd |           money |
| tk |           money |
| cc |           money |
| ci |           money |
| nc |           money |
| rc |           money |
| ad |           money |
| movimento |    money |
| num |          money |
| chq |          money |
| deb |          money |
| crd |          money |
| entradascx |   money |
| enc |          money |
| adi |          money |
| contado |      int |
| empid |        int |
| status |       int |
| cartoes |      money |
| etk |          money |
| contnum |      money |
| contchq |      money |
| contdeb |      money |
| contcrd |      money |
| contetk |      money |
| fs |           money |
| meowallet |    money |
| seamless |     money |
| mbway |        money |
| periodo |      int default 0                         not null |
| comissaomb |   money |
| user_ff |      varchar(50) |
| estado_ff |    int |
| datahora_ff |  datetime |
| ft |           money |

### `caixa_detalhes`
| Column | Details |
| --- | --- |
| idcx |           int      not null |
| data |           datetime not null |
| pagamento |      int      not null |
| valor |          money |
| comissao |       money |
| editavel |       int |
| ffdia_valor |    money         default 0 |
| ffdia_comissao | money         default 0 |
| obs |            varchar(1024) default '' |
| teorico |        money |
| constraint | PK__caixa_detalhes |

### `caixadia`
| Column | Details |
| --- | --- |
| id |           int |
| data |         datetime |
| dataopen |     datetime |
| aberto |       int |
| opencx |       varchar(50) |
| dataclose |    datetime |
| closecx |      varchar(50) |
| saidascx |     money |
| vd |           money |
| tk |           money |
| cc |           money |
| ci |           money |
| nc |           money |
| rc |           money |
| ad |           money |
| movimento |    money |
| num |          money |
| chq |          money |
| deb |          money |
| crd |          money |
| entradascx |   money |
| enc |          money |
| adi |          money |
| cartoes |      money |
| etk |          money |
| comissaomb |   money |
| fs |           money |
| caixa |        int |
| numordem |     int |
| meowallet |    money |
| seamless |     money |
| mbway |        money |
| ft |           money |
| num_deposito | varchar(30) |

### `caixadia_detalhes`
| Column | Details |
| --- | --- |
| caixa |     int      not null |
| periodo |   int      not null |
| data |      datetime not null |
| pagamento | int      not null |
| valor |     money |
| comissao |  money |
| obs |       varchar(1024) default '' |
| constraint | PK__caixadia__A9A709FBC3632FF6 |

### `caixas`
| Column | Details |
| --- | --- |
| id |        int |
| codigo |    int |
| descricao | varchar(50) |

### `caixas_apagar`
| Column | Details |
| --- | --- |
| codigo | int |

### `clientes`
| Column | Details |
| --- | --- |
| id |                  int |
| codigo |              int                   not null |
| nome |                varchar(100) |
| morada |              varchar(250) |
| codpostal |           varchar(20) |
| codpostal1 |          varchar(20) |
| localidade |          varchar(50) |
| telefone |            varchar(50) |
| fax |                 varchar(50) |
| telemovel |           varchar(50) |
| email |               varchar(50) |
| web |                 varchar(50) |
| obs |                 varchar(250) |
| datacriacao |         datetime |
| valormov |            money |
| valordivida |         money |
| contribuinte |        varchar(20) |
| limitecredito |       money |
| desconto |            money |
| saldo |               money |
| foto |                image |
| mododesconto |        int |
| impressao |           int |
| datanascimento |      datetime |
| nomecontacto |        varchar(50) |
| bloqueado |           int         default 0 not null |
| rfid |                varchar(50) |
| retencao |            int |
| isento |              smallint |
| motivo |              varchar(5) |
| sujeitopassivo |      int |
| ivacaixa |            int |
| ivacaixainicio |      datetime |
| ivacaixafim |         datetime |
| pais |                varchar(3) |
| matricula |           varchar(20) default NULL |
| imprimeobs |          int |
| percentagemretencao | decimal(19, 4) |
| opcaopagamento |      int         default 0 not null |
| obsaviso |            varchar(255) |
| esquecido |           int |

### `clientes_apagar`
| Column | Details |
| --- | --- |
| codigo | int |

### `clientes_logs`
| Column | Details |
| --- | --- |
| id |         int identity |
| cliente |    int      not null |
| datahora |   datetime not null |
| emp |        int |
| utilizador | int |
| tipo |       int      not null |

### `clientes_matriculas`
| Column | Details |
| --- | --- |
| codigo |    int         not null |
| cliente |   int         not null |
| matricula | varchar(20) not null |
| descricao | varchar(50) |
| constraint | pk_cliente_matriculas |

### `clientes_moradas`
| Column | Details |
| --- | --- |
| codigo |        int not null |
| cliente |       int not null |
| morada |        varchar(255) |
| codpostal4 |    varchar(20) |
| codpostal3 |    varchar(20) |
| localidade |    varchar(255) |
| telefone |      varchar(50) |
| fax |           varchar(50) |
| telemovel |     varchar(50) |
| nome_contacto | varchar(255) |
| tipo |          int |
| constraint | pk_cliente_moradas |

### `clientes_opcoes`
| Column | Details |
| --- | --- |
| codigo | int          not null |
| opcao |  varchar(255) not null |
| valor |  varchar(255) not null |
| constraint | pk_clientes_opcoes |

### `clientes_reserva_produtos`
| Column | Details |
| --- | --- |
| clienteid |   int             not null |
| produtoid |   int             not null |
| qtd |         money default 0 not null |
| datainicial | datetime        not null |
| datafinal |   datetime |
| seg |         int   default 0 not null |
| ter |         int   default 0 not null |
| qua |         int   default 0 not null |
| qui |         int   default 0 not null |
| sex |         int   default 0 not null |
| sab |         int   default 0 not null |
| dom |         int   default 0 not null |
| constraint | PK_clientes_reserva_produtos |

### `clientesview`
| Column | Details |
| --- | --- |
| sessao |   int |
| codigo |   int |
| nome |     varchar(50) |
| telefone | varchar(50) |

### `documentos`
| Column | Details |
| --- | --- |
| id |                     int |
| data |                   datetime |
| numero |                 int                            not null |
| doc |                    char(10)                       not null |
| cliente |                int |
| nome |                   varchar(100) |
| liquido |                money |
| total |                  money |
| anulado |                int |
| emp |                    int |
| pago |                   int |
| datapag |                datetime |
| tipo |                   int |
| pagamento |              int |
| datahora |               datetime |
| deve |                   money |
| idcx |                   int |
| mesa |                   int |
| mesaidx |                int |
| lugar |                  int |
| contribuinte |           varchar(20) |
| morada |                 text |
| cartao |                 int |
| docext |                 int |
| compdoc |                int |
| descricao |              text |
| doccomp |                varchar(3) |
| levantamento |           datetime |
| dataentrega |            datetime |
| telefone |               varchar(50) |
| impressao |              int |
| hash |                   varchar(255) |
| hashcontrol |            int |
| serie |                  varchar(20) default '' |
| ljorigem |               int |
| armorigem |              int |
| ljdestino |              int |
| armdestino |             int |
| empanulado |             int |
| descanulado |            varchar(1024) |
| carga |                  varchar(255) |
| descarga |               varchar(255) |
| datacarga |              datetime |
| horacarga |              datetime |
| datadescarga |           datetime |
| horadescarga |           datetime |
| carga_localidade |       varchar(45) |
| carga_codigo_postal |    varchar(45) |
| descarga_localidade |    varchar(45) |
| descarga_codigo_postal | varchar(45) |
| viatura |                varchar(20) |
| peso |                   varchar(10) |
| ATDocCodeID |            varchar(200) |
| ATDocCodeSource |        varchar(2) |
| motivo_isencao |         varchar(255) |
| isencao |                varchar(5) |
| data_alteracao |         datetime |
| CashVATScheme |          int |
| dpercent |               money |
| descontos |              money |
| ivaincluido |            int |
| docforn |                varchar(50) |
| numpag |                 varchar(50) |
| liqorigem |              varchar(5) |
| tipodoc |                int |
| datadoc |                datetime |
| datapagamento |          datetime |
| diaspagamento |          int |
| arredondamento |         money |
| observacoes |            text |
| hashcontrol2 |           varchar(25) |
| countrycode |            varchar(3) |
| referencia_pagamento |   varchar(50) |
| sync_at |                int |
| freebeecupao |           varchar(1024) |
| numero_manual |          int |
| serie_manual |           varchar(20) |

### `documentos_apagar`
| Column | Details |
| --- | --- |
| doc |    varchar(10) |
| numero | int |
| serie |  varchar(20) |

### `documentos_assinado`
| Column | Details |
| --- | --- |
| id |                     bigint identity |
| doc |                    varchar(10)                not null |
| serie |                  varchar(20)                not null |
| numero |                 int                        not null |
| email_cliente |          varchar(100)               not null |
| nome_cliente |           varchar(100)               not null |
| loja |                   varchar(10)                not null |
| posto |                  varchar(10)                not null |
| tipo_fidelizacao |       int      default 0 |
| nome_documento |         varchar(50)                not null |
| id_safe |                varchar(max)               not null |
| status |                 int                        not null |
| com_files_id |           bigint                     not null |
| documento_enviado |      int                        not null |
| date_created |           datetime default getdate() not null |
| email_sending_attempts | int      default 0 |
| date_last_attempt |      datetime |

### `documentos_fe_ap`
| Column | Details |
| --- | --- |
| id |         int default 0 |
| doc |        varchar(10) not null |
| serie |      varchar(20) not null |
| numero |     int         not null |
| service_id | varchar(255) |
| estado |     varchar(255) |
| resposta |   text |
| data |       datetime |
| constraint | PK_doc_fe_ap |

### `documentos_hotel`
| Column | Details |
| --- | --- |
| doc |            varchar(10) not null |
| serie |          varchar(20) |
| numero |         int         not null |
| id_order |       varchar(255) |
| room_number |    varchar(20) |
| customer_id |    varchar(50) |
| area_code |      int |
| outlet |         varchar(50) |
| reservation_id | varchar(255) |

### `documentos_info`
| Column | Details |
| --- | --- |
| doc |    varchar(10) not null |
| serie |  varchar(20) not null |
| numero | int         not null |
| chave |  varchar(50) not null |
| valor |  varchar(1000) |
| primary | key (doc, serie, numero, chave) |

### `documentos_orderids`
| Column | Details |
| --- | --- |
| mesa |                  int                    not null |
| lugar |                 int                    not null |
| order_id |              varchar(255) |
| doc |                   varchar(255) |
| serie |                 varchar(255) |
| numero |                int                    not null |
| total |                 money        default 0 not null |
| pagamento |             int          default 0 not null |
| referencia |            varchar(255) default '' |
| datahora |              datetime |
| order_created_at |      datetime |
| order_created_emp |     int |
| order_created_pessoas | int |

### `documentos_pessoas`
| Column | Details |
| --- | --- |
| idcx |           int      not null |
| data |           datetime not null |
| datahora |       datetime not null |
| posto |          int      not null |
| mesa |           int      not null |
| pessoas |        int |
| comerambeberam | int |
| comeram |        int |
| beberam |        int |
| semactividade |  int |
| countrycode |    varchar(2) |
| doc |            varchar(5) |
| serie |          varchar(20) |
| numero |         int |
| zona |           int |
| primary | key (idcx, data, datahora, posto, mesa) |

### `documentos_sat_xml`
| Column | Details |
| --- | --- |
| doc |                         varchar(5) not null |
| serie |                       varchar(20) |
| numero |                      int        not null |
| sat_xml |                     text |
| sat_xml_cancelamento |        text |
| sat_xml_contingencia |        text |
| chavedfe |                    varchar(100) |
| numerodfe |                   int |
| seriedfe |                    int |
| cstat |                       int |
| tipoemissao |                 int |
| dataemissao |                 datetime |
| numerosessao_sat |            int |
| cancelar |                    char |
| justificativa_cancelar |      varchar(255) |
| id_xml_original_substituido | int |
| id_xml_original_cancelado |   int |

### `documentos_zicket`
| Column | Details |
| --- | --- |
| id |                bigint identity |
| doc |               varchar(10) |
| serie |             varchar(20) |
| numero |            int |
| email_cliente |     varchar(100) |
| nome_cliente |      varchar(100) |
| loja |              varchar(10)                not null |
| posto |             varchar(10)                not null |
| id_zicket |         int                        not null |
| status |            int      default 0         not null |
| com_files_id |      bigint                     not null |
| order_id |          varchar(50)                not null |
| documento_enviado | int |
| date_created |      datetime default getdate() not null |
| date_expiration |   datetime                   not null |
| date_last_attempt | datetime |

### `movimentos`
| Column | Details |
| --- | --- |
| sync |       int |
| cartao |     int |
| codigo |     int |
| pos |        int |
| emp |        int |
| nome |       varchar(200) |
| data |       datetime |
| datahora |   datetime |
| valor |      money |
| descricao |  varchar(200) |
| qtd |        money |
| processado | int |
| serie |      int |
| codprom |    int |
| id_loja |    int identity |

### `movimentos_propriedades`
| Column | Details |
| --- | --- |
| id |                int         not null |
| doc |               varchar(4)  not null |
| numero |            int         not null |
| serie |             varchar(30) not null |
| idproduto |         int         not null |
| uid_propriedade |   int         not null |
| idpropriedade |     int         not null |
| valor_propriedade | varchar(59) not null |
| quantidade |        money |

### `produtos`
| Column | Details |
| --- | --- |
| id |                  int |
| codigo |              int             not null |
| descricao |           varchar(255) |
| familia |             int |
| subfam |              int |
| unidade |             int |
| iva |                 money |
| fornecedor |          int |
| foto |                image |
| precocompra |         money |
| precovenda |          money |
| dataultcompra |       datetime |
| ultprecocompra |      money |
| datacriacao |         datetime |
| obs |                 varchar(250) |
| retalho |             int |
| composto |            int |
| ultprecovenda |       money |
| topo |                int |
| cozinha |             int |
| grupo |               int |
| referencia |          varchar(50) |
| ivacompra |           money |
| balanca |             int |
| prodstock |           int |
| qtdstock |            money |
| compra |              int |
| stocks |              int |
| meiadose |            int |
| precomeia |           money |
| qtdmeia |             money |
| ordemtop |            int |
| ordem |               int |
| ordemlocal |          int |
| listseparado |        int |
| codbarras |           varchar(20) |
| armazem |             int |
| tempoprep |           datetime |
| maxopcoes |           int |
| iva2 |                money |
| tara |                money |
| prepagamento |        int |
| fundo |               int |
| letra |               int |
| descricaocurta |      varchar(255) |
| promocao |            int |
| percentprom |         money |
| margembruta |         money |
| codigopp |            int |
| revenda |             int |
| precorevenda |        money |
| ivarevenda |          money |
| autoquebra |          int |
| pvp2 |                money |
| pvp3 |                money |
| pvp4 |                money |
| pvp5 |                money |
| pvpmeia2 |            money |
| pvpmeia3 |            money |
| pvpmeia4 |            money |
| pvpmeia5 |            money |
| consumominimo |       int |
| precominimo |         money |
| excluirdescontos |    int |
| vendersemstock |      int   default 1 not null |
| dosedesc |            varchar(50) |
| meiadosedesc |        varchar(50) |
| restricted |          int |
| pvp6 |                money |
| pvp7 |                money |
| pvp8 |                money |
| pvp9 |                money |
| pvp10 |               money |
| pvpmeia6 |            money |
| pvpmeia7 |            money |
| pvpmeia8 |            money |
| pvpmeia9 |            money |
| pvpmeia10 |           money |
| categoria |           int |
| subcategoria |        int |
| retencao |            int |
| percentagemretencao | decimal(19, 4) |
| isencao |             varchar(5) |
| pvp1siva |            money |
| pvp2siva |            money |
| pvp3siva |            money |
| pvp4siva |            money |
| pvp5siva |            money |
| pvp6siva |            money |
| pvp7siva |            money |
| pvp8siva |            money |
| pvp9siva |            money |
| pvp10siva |           money |
| pvpmeia1siva |        money |
| pvpmeia2siva |        money |
| pvpmeia3siva |        money |
| pvpmeia4siva |        money |
| pvpmeia5siva |        money |
| pvpmeia6siva |        money |
| pvpmeia7siva |        money |
| pvpmeia8siva |        money |
| pvpmeia9siva |        money |
| pvpmeia10siva |       money |
| tiposaft |            varchar(2) |
| uncompra |            int |
| uninventario |        int |
| ordempedido |         int |
| image_url |           varchar(500) |
| min_complementos |    money default 0 |
| max_complementos |    money default 0 |
| codigo_alf |          int   default 0 |
| edicao |              int   default 0 |
| transferivel |        int   default 1 |
| politicapreco |       int   default 0 |
| unrelacao |           int |

### `produtos_apagar`
| Column | Details |
| --- | --- |
| codigo | int |

### `produtos_caracteristicas`
| Column | Details |
| --- | --- |
| cod_produto |          int     not null |
| valor_caracteristica | int     not null |
| uid |                  int     not null |
| estado |               tinyint not null |
| constraint | PK_produtos_caracteristicas |

### `produtos_caracteristicas_val`
| Column | Details |
| --- | --- |
| cod_produto |     int          not null |
| uid |             int          not null |
| preco_compra |    money        not null |
| var_preco_venda | money        not null |
| cod_barras |      varchar(100) not null |
| estado |          tinyint      not null |
| posicao |         int          not null |

### `produtos_disponibilidade`
| Column | Details |
| --- | --- |
| codigo |         int             not null |
| tipo |           int   default 0 not null |
| qtd_default |    money default 0 not null |
| qtd |            money default 0 not null |
| data_alteracao | datetime        not null |
| empregado |      int             not null |

### `produtos_edicoes`
| Column | Details |
| --- | --- |
| produto |          int                     not null |
| addon |            nvarchar(5) default '0' not null |
| edicao |           int         default 0   not null |
| semana_devolucao | int         default 0   not null |
| ano_devolucao |    int         default 0   not null |
| validade |         datetime |
| datahora |         datetime |
| sync |             int         default 1   not null |
| descricao |        varchar(200) |
| pvenda |           money       default 0   not null |
| publicacaoData |   datetime |
| constraint | PK_produtos_edicoes |

### `produtos_historico`
| Column | Details |
| --- | --- |
| id |       bigint identity |
| codigo |   int           not null |
| user_alt | int |
| op_alt |   int |
| web_alt |  int |
| api_alt |  int |
| datahora | datetime      not null |
| tipo |     int           not null |
| sync |     int default 1 not null |
| constraint | PK__produtos__561C721FCEACF6CE |

### `produtos_opcoes`
| Column | Details |
| --- | --- |
| codigo | int          not null |
| opcao |  varchar(255) not null |
| valor |  varchar(255) not null |

### `produtos_packs`
| Column | Details |
| --- | --- |
| id |        int         not null |
| codigo |    int         not null |
| descricao | varchar(50) not null |
| qtd |       money       not null |
| total |     money       not null |

### `produtos_propriedades`
| Column | Details |
| --- | --- |
| cod_produto |     int     not null |
| cod_propriedade | int     not null |
| uid |             int     not null |
| estado |          tinyint not null |
| primary | key (cod_produto, cod_propriedade, uid) |

### `produtos_seccao`
| Column | Details |
| --- | --- |
| codigo |    int |
| seccao |    int |
| produto |   varchar(200) |
| descricao | varchar(200) |
| preco |     money |
| precomeia | money |

### `produtos_suplementos`
| Column | Details |
| --- | --- |
| suplementoid | int |
| produtoid |    int not null |
| prodaddon |    nvarchar(5) |
| supaddon |     nvarchar(5) |

### `produtos_taxas`
| Column | Details |
| --- | --- |
| produto | int not null |
| taxa |    int |

### `produtos_taxas_br`
| Column | Details |
| --- | --- |
| codigo |                  int             not null |
| codigo_ncm |              varchar(10) |
| nacional |                int |
| icms |                    int |
| icms_quota |              money |
| pis |                     int |
| pis_quota |               money |
| cofins |                  int |
| cofins_quota |            money |
| cfop |                    int |
| cest |                    varchar(10) |
| taxaservico |             int   default 0 not null |
| taxaservicopercent |      money default 0 not null |
| perc_redbase |            money |
| fecp_quota |              money |
| beneficiofiscal |         varchar(100) |
| idmotivodesoneracaoicms | numeric |
| ean |                     varchar(20) |
| eanTrib |                 varchar(20) |

### `produtoscentrosprod`
| Column | Details |
| --- | --- |
| codigo |      int |
| centro |      int |
| informativo | int |

### `produtosfamilias`
| Column | Details |
| --- | --- |
| produto | int |
| familia | int |

### `produtosimpressoras`
| Column | Details |
| --- | --- |
| codigo |     int |
| impressora | int |

### `vendas`
| Column | Details |
| --- | --- |
| id |                 int identity |
| data |               datetime |
| numero |             int |
| doc |                char(10) |
| codigo |             int |
| descricao |          varchar(200) |
| iva |                money |
| qtd |                money |
| punit |              money |
| valor |              money |
| desconto |           money |
| desconto2 |          money |
| total |              money |
| hideqtd |            int |
| posto |              int |
| empid |              int |
| datahora |           datetime |
| armazem |            int |
| prodstock |          int |
| qtdstock |           money |
| origem |             int |
| codprom |            int |
| serie |              varchar(20) |
| lote |               varchar(255) |
| desperdicio |        float |
| motivo_isencao |     varchar(255) |
| isencao |            varchar(5) |
| descforn |           varchar(50) |
| referencia |         varchar(50) |
| refforn |            varchar(50) |
| ddoc |               money |
| dpercent |           money |
| dvalor |             money |
| dextenso |           money |
| obs |                text |
| pvp |                money |
| validade |           datetime |
| qtdunidades |        money |
| precoliquido |       money |
| unidade |            int |
| ljorigem |           int |
| armorigem |          int |
| ljdestino |          int |
| armdestino |         int |
| uid |                int |
| uid_caracteristica | int |
| uid_propriedade |    int |
| tipo |               int         default 0 |
| prodorigem |         int         default 0 |
| liquido |            money |
| addon |              nvarchar(5) default '0' |
| edicao |             int         default 0 |
| precomenu |          money |

### `vendas_devolucao`
| Column | Details |
| --- | --- |
| id |                 int identity |
| doc |                varchar(10)  not null |
| serie |              varchar(20) |
| numero |             int          not null |
| codigo |             int          not null |
| descricao |          varchar(200) not null |
| iva |                money        not null |
| qtd |                money |
| total |              money |
| valor |              money |
| punit |              money |
| uid_caracteristica | int |
| uid_propriedade |    int |
| hideqtd |            int |
| prodstock |          int |
| qtdstock |           money |
| desconto2 |          money |
| addon |              varchar(5) |
| posto |              int |
| empid |              int |
| datahora |           datetime |
| armazem |            int |
| isencao |            varchar(5) |
| motivo_isencao |     varchar(255) |
| prodorigem |         int |
| tipo |               int |

### `vendasclientes`
| Column | Details |
| --- | --- |
| sessao |  int |
| codigo |  int |
| nome |    varchar(50) |
| tipodoc | char(10) |
| numero |  int |
| total |   money |
| data |    datetime |
| pago |    char(10) |

### `vendasemp`
| Column | Details |
| --- | --- |
| sessao | int |
| codigo | int |
| nome |   varchar(50) |
| data |   datetime |
| valor |  money |

### `vendasprod`
| Column | Details |
| --- | --- |
| sessao |    int |
| codigo |    int |
| descricao | varchar(200) |
| qtd |       money |
| total |     money |
| iva |       money |

### `vendastemp`
| Column | Details |
| --- | --- |
| sessao |   int |
| data |     datetime |
| doc |      char(10) |
| iva |      money |
| qtd |      int |
| punit |    money |
| valor |    money |
| total |    money |
| valoriva | money |
| desconto | money |
| ganho |    money |

## Product & Inventory

### `categorias`
| Column | Details |
| --- | --- |
| sync |      int not null |
| codigo |    int not null |
| descricao | varchar(50) |

### `categorias_alfandega`
| Column | Details |
| --- | --- |
| codigo |    int        not null |
| codigoca |  varchar(5) not null |
| descricao | varchar(50) |
| constraint | PK__categorias_alfandega |

### `categorias_apagar`
| Column | Details |
| --- | --- |
| codigo | int |

### `existencias`
| Column | Details |
| --- | --- |
| codigo |     int |
| stkmin |     money |
| stkmax |     money |
| existencia | money |
| sync |       money |
| armazem |    int |

### `familias`
| Column | Details |
| --- | --- |
| id |             int |
| codigo |         int           not null |
| descricao |      varchar(50) |
| frontoffice |    int |
| posicaofront |   int |
| posicaoprint |   int |
| fundo |          int |
| letra |          int |
| tipo |           int default 0 not null |
| descricao_loja | varchar(50) |

### `familias_apagar`
| Column | Details |
| --- | --- |
| codigo | int |

### `familias_hotel`
| Column | Details |
| --- | --- |
| familia |                int not null |
| codigo_categoria_hotel | varchar(50) |
| nome_categoria_hotel |   varchar(50) |
| subfam |                 int default 0 |
| zona |                   int default 0 |

### `iva`
| Column | Details |
| --- | --- |
| id |        int |
| codigo |    int not null |
| descricao | varchar(50) |
| factor |    money |
| idx |       int identity |

### `iva_apagar`
| Column | Details |
| --- | --- |
| codigo | int |

### `ivacaixa`
| Column | Details |
| --- | --- |
| sessao |     int   not null |
| taxa |       money not null |
| total |      money not null |
| incidencia | money not null |

### `ivatemp`
| Column | Details |
| --- | --- |
| sessao |     int |
| taxa |       int |
| descricao |  varchar(50) |
| incidencia | money |
| iva |        money |

### `precoshh`
| Column | Details |
| --- | --- |
| codigo |   int |
| hh |       int |
| valor |    money |
| meiadose | money |

### `precoszona`
| Column | Details |
| --- | --- |
| id |       int |
| codigo |   int |
| zona |     int |
| valor |    money |
| meiadose | money |

### `precoszonatmp`
| Column | Details |
| --- | --- |
| codigo |    int |
| descricao | varchar(255) |
| precomeia | money |
| codzona |   int |
| desczona |  varchar(50) |
| preco |     money |

### `stocktemp`
| Column | Details |
| --- | --- |
| codigo |     int |
| stkmin |     int |
| stkmax |     int |
| existencia | int |
| total |      float |
| precoun |    float |
| produto |    varchar(50) |
| sessao |     int |

### `stocktmp`
| Column | Details |
| --- | --- |
| sessao |     int |
| armazem |    int |
| codigo |     int |
| stkmin |     money |
| stkmax |     money |
| existencia | money |
| descarm |    nvarchar(50) |

### `subcategorias`
| Column | Details |
| --- | --- |
| sync |      int not null |
| codigo |    int not null |
| descricao | varchar(50) |
| categoria | int not null |

### `subcategorias_apagar`
| Column | Details |
| --- | --- |
| codigo | int |

### `subfamilias`
| Column | Details |
| --- | --- |
| id |                 int |
| codigo |             int           not null |
| descricao |          varchar(50) |
| familia |            int |
| fundo |              int |
| letra |              int |
| posicao |            int |
| descricao_loja |     varchar(50) |
| subfamposicaoprint | int default 0 not null |

### `subfamilias_apagar`
| Column | Details |
| --- | --- |
| codigo | int |

### `unidades`
| Column | Details |
| --- | --- |
| id |        int |
| codigo |    int not null |
| descricao | varchar(50) |
| idx |       int identity |

### `unidades_apagar`
| Column | Details |
| --- | --- |
| codigo | int |

### `consumo`
| Column | Details |
| --- | --- |
| id |                   int                   not null |
| id2 |                  int |
| mesa |                 int |
| lugar |                int |
| codigo |               int |
| descricao |            varchar(200) |
| qtd |                  money |
| valor |                money |
| iva |                  money |
| preco |                money |
| desconto |             money |
| menuidx |              int |
| idobs |                int |
| obs |                  varchar(max) |
| suspenso |             int |
| impressora |           int |
| impstatus |            int |
| qtdstock |             money |
| prodstock |            int |
| listseparado |         int |
| stkupd |               int |
| podeapagar |           int |
| hideqtd |              int |
| posto |                int |
| empid |                int |
| datahora |             datetime |
| armazem |              int |
| origem |               int |
| sync |                 int |
| codprom |              int |
| lote |                 varchar(255) |
| nivelmenu |            int |
| uid |                  int |
| uid_caracteristica |   int |
| uid_propriedade |      int |
| tipo |                 int         default 0 |
| prodorigem |           int         default 0 |
| ordempedido |          int |
| addon |                nvarchar(5) default '0' |
| estrutura |            text |
| saidastatus |          int         default 0 |
| edicao |               int         default 0 |
| precomenu |            money |
| motivo_desconto |      int |
| motivo_desconto_desc | varchar(50) |
| complementarOrigem |   int         default 0 not null |
| empid_desc |           int |
| bkp_promocao |         varchar(1000) |
| total_dif |            money       default 0 |
| preco_anterior |       money |

### `consumo_doc`
| Column | Details |
| --- | --- |
| id |           int not null |
| id2 |          int |
| mesa |         int |
| lugar |        int |
| codigo |       int |
| descricao |    varchar(200) |
| qtd |          money |
| valor |        money |
| iva |          money |
| preco |        money |
| desconto |     int |
| menuidx |      int |
| idobs |        int |
| obs |          varchar(50) |
| suspenso |     int |
| impressora |   int |
| impstatus |    int |
| qtdstock |     money |
| prodstock |    int |
| listseparado | int |
| stkupd |       int |
| reopen |       int |
| numero |       int |
| doc |          varchar(2) |
| idcx |         int |
| hideqtd |      int |
| posto |        int |
| empid |        int |
| datahora |     datetime |
| armazem |      int |
| origem |       int |
| codprom |      int |
| lote |         varchar(255) |
| serie |        varchar(20) |

### `ementa_digital_produtos`
| Column | Details |
| --- | --- |
| cod_produto | int           not null |
| familia |     int           not null |
| produto |     varchar(255) |
| descricao |   text |
| imagem |      image |
| visivel |     int default 1 not null |
| highlight |   int |
| image_url |   varchar(500) |
| model_url |   varchar(255) |
| alergenios |  int default 0 not null |
| gluten |      int default 0 not null |
| sal |         int default 0 not null |
| lactose |     int default 0 not null |
| picante |     int default 0 not null |
| dieta |       int default 0 not null |
| vegetariano | int default 0 not null |
| pessoas |     int default 0 not null |
| calorias |    int default 0 not null |
| tempo |       int default 0 not null |
| posicao |     int default 0 not null |
| constraint | pk_ementa_produto |
