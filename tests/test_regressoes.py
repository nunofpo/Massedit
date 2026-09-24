"""Regressões de bugs encontrados em auditoria ao código.

Cada teste documenta no docstring o comportamento errado que cobre.
"""
import unittest
from unittest.mock import MagicMock, patch


class TestRegressoes(unittest.TestCase):

    # ------------------------------------------------------------------
    # Ficha individual do artigo (PUT /api/products/{codigo})
    # ------------------------------------------------------------------

    def test_text_limit_aceita_valor_por_omissao(self):
        """_text_limit era chamado com 4 argumentos mas só aceitava 3 (TypeError)."""
        from backend.services.products import _text_limit
        schema = {"produtos": {"descricao": ("varchar", 100), "plu": ("int", None)}}
        self.assertEqual(_text_limit(schema, "produtos", "descricao"), 100)
        self.assertEqual(_text_limit(schema, "produtos", "descricao", 50), 100)
        # Coluna sem limite conhecido: devolve o valor por omissão (ou None sem ele)
        self.assertIsNone(_text_limit(schema, "produtos", "plu"))
        self.assertEqual(_text_limit(schema, "produtos", "plu", 30), 30)
        self.assertEqual(_text_limit(schema, "produtos", "inexistente", 20), 20)
        self.assertIsNone(_text_limit(schema, "inexistente", "seja_o_que_for"))

    def _update_single_product(self, schema, req, mock_fetch, mock_db_mgr):
        """Executa update_single_product com a BD simulada e devolve os UPDATE gerados."""
        from backend.services.products import update_single_product
        from backend.models import ProductItem

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.fetchone.return_value = None  # sem código de barras duplicado
        mock_db_mgr.get_connection.return_value = mock_conn
        mock_db_mgr.get_schema.return_value = schema

        prod = ProductItem(codigo=300, descricao="Francesinha", pvp1=12.5,
                           has_sales=False, can_edit_description=True)
        mock_fetch.return_value = [prod]

        succ, msg, _ = update_single_product(300, req)
        updates = [c.args[0] for c in mock_cursor.execute.call_args_list
                   if str(c.args[0]).startswith("UPDATE dbo.produtos SET")]
        return succ, msg, mock_conn, updates

    @patch("backend.services.products.db_manager")
    @patch("backend.services.products._fetch_products_by_codes")
    @patch("backend.services.products.create_backup_snapshot")
    def test_single_product_grava_campos_de_texto(self, mock_backup, mock_fetch, mock_db_mgr):
        """Gravar a ficha do artigo rebentava com TypeError em qualquer campo de texto."""
        from backend.models import SingleProductUpdateRequest

        schema = {"produtos": {
            "codigo": ("int", None), "descricao": ("varchar", 100),
            "descricaocurta": ("varchar", 20), "codbarras": ("varchar", 30),
            "referencia": ("varchar", 30), "meiadosedesc": ("varchar", 50),
            "dosedesc": ("varchar", 50), "sync": ("int", None),
        }}
        # Mesmo conjunto de campos de texto que o ProductDetailModal envia sempre
        req = SingleProductUpdateRequest(
            descricao="Francesinha Especial", descricaocurta="Francesinha",
            codbarras="5601234567890", referencia="REF-001",
            meiadosedesc="Meia dose", dosedesc="Dose",
        )
        succ, msg, mock_conn, updates = self._update_single_product(
            schema, req, mock_fetch, mock_db_mgr)

        self.assertTrue(succ, msg)
        mock_conn.commit.assert_called()
        self.assertEqual(len(updates), 1)
        for col in ("descricao", "descricaocurta", "codbarras", "referencia",
                    "meiadosedesc", "dosedesc"):
            self.assertIn(col + " = ?", updates[0])

    @patch("backend.services.products.db_manager")
    @patch("backend.services.products._fetch_products_by_codes")
    @patch("backend.services.products.create_backup_snapshot")
    def test_single_product_trunca_pelo_limite_da_coluna(self, mock_backup, mock_fetch, mock_db_mgr):
        """O texto tem de ser truncado pelo limite real da coluna."""
        from backend.models import SingleProductUpdateRequest

        schema = {"produtos": {"codigo": ("int", None), "descricaocurta": ("varchar", 10)}}
        req = SingleProductUpdateRequest(descricaocurta="Francesinha Especial da Casa")
        succ, msg, mock_conn, updates = self._update_single_product(
            schema, req, mock_fetch, mock_db_mgr)

        self.assertTrue(succ, msg)
        params = [c.args[1] for c in mock_conn.cursor.return_value.execute.call_args_list
                  if str(c.args[0]).startswith("UPDATE dbo.produtos SET")][0]
        self.assertEqual(params[0], "Francesinh")  # 10 caracteres

    @patch("backend.services.products.db_manager")
    @patch("backend.services.products._fetch_products_by_codes")
    @patch("backend.services.products.create_backup_snapshot")
    def test_visibilidade_no_pos_grava_descontinuado(self, mock_backup, mock_fetch, mock_db_mgr):
        """No ZSRest é `descontinuado` que esconde o artigo; `topo` era a coluna errada."""
        from backend.models import SingleProductUpdateRequest

        schema = {"produtos": {"codigo": ("int", None), "descontinuado": ("int", None),
                               "topo": ("int", None)}}
        succ, msg, _, updates = self._update_single_product(
            schema, SingleProductUpdateRequest(descontinuado=1), mock_fetch, mock_db_mgr)

        self.assertTrue(succ, msg)
        self.assertIn("descontinuado = ?", updates[0])
        self.assertNotIn("topo = ?", updates[0])
        self.assertNotIn("frontoffice = ?", updates[0])

    @patch("backend.services.products.db_manager")
    @patch("backend.services.products._fetch_products_by_codes")
    @patch("backend.services.products.create_backup_snapshot")
    def test_campo_frontoffice_obsoleto_nao_escreve_nada(self, mock_backup, mock_fetch, mock_db_mgr):
        """`frontoffice` não existe em dbo.produtos: o pedido é ignorado, nunca redirecionado."""
        from backend.models import SingleProductUpdateRequest

        schema = {"produtos": {"codigo": ("int", None), "topo": ("int", None),
                               "descontinuado": ("int", None)}}
        succ, msg, _, updates = self._update_single_product(
            schema, SingleProductUpdateRequest(frontoffice=0), mock_fetch, mock_db_mgr)

        self.assertTrue(succ, msg)
        self.assertEqual(updates, [])  # nenhum UPDATE emitido
        self.assertIn("Nenhuma alteração", msg)

    def test_edicao_em_massa_pode_descontinuar_artigos(self):
        """A edição em massa não tinha forma nenhuma de descontinuar (ocultar do POS)."""
        from backend.services.products import _compute_bulk_changes
        from backend.models import BulkEditRequest, ProductItem

        prod = ProductItem(codigo=1, descricao="Ovos Turcos", descontinuado=0)
        req = BulkEditRequest(product_codes=[1], apply_descontinuado=True, new_descontinuado=1)

        schema = {"produtos": {"codigo": ("int", None), "descontinuado": ("int", None)}}
        changes = _compute_bulk_changes(prod, req, schema, MagicMock(), {1: 0})

        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0].column, "descontinuado")
        self.assertEqual(changes[0].value, 1)
        self.assertFalse(changes[0].blocked)
        self.assertIn("oculto no POS", changes[0].new)

        # Numa base de dados sem a coluna, a simulação bloqueia e explica
        sem_col = {"produtos": {"codigo": ("int", None)}}
        bloqueada = _compute_bulk_changes(prod, req, sem_col, MagicMock(), {1: 0})
        self.assertTrue(bloqueada[0].blocked)
        self.assertIn("descontinuado", bloqueada[0].reason)

    @patch("backend.services.pos_layout._schema")
    @patch("backend.services.pos_layout.db_manager")
    def test_grelha_pos_esconde_descontinuados(self, mock_db_mgr, mock_schema):
        """A grelha de botões mostrava artigos descontinuados como se estivessem visíveis."""
        from backend.services.pos_layout import get_pos_layout_products

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_db_mgr.get_connection.return_value = mock_conn
        # Base sem `frontoffice` (como o ZSRest real), só com `descontinuado`
        mock_schema.return_value = {"produtos": {
            "codigo": ("int", None), "descricao": ("varchar", 100),
            "descontinuado": ("int", None), "ordem": ("int", None),
        }}
        mock_cursor.fetchall.return_value = []

        get_pos_layout_products(1, include_hidden=False)
        sql = mock_cursor.execute.call_args.args[0]
        self.assertIn("descontinuado", sql)
        self.assertNotIn("p.frontoffice", sql)
        # Sem include_hidden, os descontinuados são excluídos
        self.assertIn("ISNULL(CAST(p.descontinuado AS INT), 0) = 0", sql)

    # ------------------------------------------------------------------
    # int(0 or 1) == 1: estados "oculto" eram lidos como "visível"
    # ------------------------------------------------------------------

    @patch("backend.services.ementa_digital._schema")
    @patch("backend.services.ementa_digital.db_manager")
    def test_estrutura_ementa_mantem_familias_ocultas(self, mock_db_mgr, mock_schema):
        """Famílias e secções ocultas da ementa digital eram devolvidas como visíveis."""
        from backend.services.ementa_digital import get_ementa_digital_structure

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_db_mgr.get_connection.return_value = mock_conn
        mock_schema.return_value = {"ementa_digital_familias": {
            "codigo": ("int", None), "seccao": ("int", None), "descricao": ("varchar", 50),
            "visivel": ("int", None), "posicao": ("int", None), "dose": ("varchar", 20),
        }}
        # codigo, seccao, descricao, visivel, posicao, dose, meiadose
        mock_cursor.fetchall.return_value = [
            (1, 1, "Entradas", 1, 0, "", ""),
            (2, 1, "Oculta", 0, 1, "", ""),
        ]

        res = get_ementa_digital_structure()
        self.assertEqual({f["codigo"]: f["visivel"] for f in res["families"]}, {1: 1, 2: 0})

    @patch("backend.services.ementa_digital._schema")
    @patch("backend.services.ementa_digital.db_manager")
    def test_idiomas_desativados_nao_aparecem_ativos(self, mock_db_mgr, mock_schema):
        """Idiomas postos a visivel=0 voltavam a ser lidos como ativos."""
        from backend.services.ementa_digital import get_ementa_languages

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_db_mgr.get_connection.return_value = mock_conn
        mock_schema.return_value = {"ementa_digital_paises": {"id": ("varchar", 5)}}
        mock_cursor.fetchall.return_value = [("GB", "English", 1), ("FR", "French", 0)]

        langs = {l["id"]: l["visivel"] for l in get_ementa_languages()}
        self.assertEqual(langs, {"GB": 1, "FR": 0})

    @patch("backend.services.pos_layout._schema")
    @patch("backend.services.pos_layout.db_manager")
    def test_pos_layout_mantem_artigos_ocultos(self, mock_db_mgr, mock_schema):
        """Artigos ocultos no POS eram apresentados como visíveis na grelha de botões."""
        from backend.services.pos_layout import get_pos_layout_products

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_db_mgr.get_connection.return_value = mock_conn
        mock_schema.return_value = {"produtos": {
            "codigo": ("int", None), "descricao": ("varchar", 100),
            "frontoffice": ("int", None), "bloqueado": ("int", None), "ordem": ("int", None),
        }}
        # codigo, descricao, descricaocurta, fundo, letra, ordem, pvp1, bloqueado, frontoffice, subfam, subfam_desc
        mock_cursor.fetchall.return_value = [
            (10, "Visivel", "Vis", 0, 16777215, 1, 5.0, 0, 1, None, ""),
            (11, "Oculto", "Ocu", 0, 16777215, 2, 5.0, 0, 0, None, ""),
        ]

        itens = get_pos_layout_products(1, include_hidden=True)
        self.assertEqual({p.codigo: p.frontoffice for p in itens}, {10: 1, 11: 0})

    # ------------------------------------------------------------------
    # Pesquisa de clientes em bases sem colunas opcionais
    # ------------------------------------------------------------------

    @patch("backend.services.customers.db_manager")
    def test_pesquisa_clientes_sem_colunas_opcionais(self, mock_db_mgr):
        """A cláusula WHERE assumia telefone/telemovel mesmo quando não existiam."""
        from backend.services.customers import get_customers

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_db_mgr.get_connection.return_value = mock_conn
        mock_db_mgr.get_schema.return_value = {"clientes": {
            "codigo": ("int", None), "nome": ("varchar", 100), "contribuinte": ("varchar", 9),
        }}
        mock_cursor.fetchall.return_value = []

        get_customers(search="Alpha")
        sql = mock_cursor.execute.call_args.args[0]
        self.assertNotIn("telemovel LIKE", sql)
        self.assertNotIn("telefone LIKE", sql)
        self.assertIn("nome LIKE", sql)
        self.assertIn("contribuinte LIKE", sql)
        # Um marcador por cada coluna pesquisada
        self.assertEqual(sql.count("LIKE ?"), len(mock_cursor.execute.call_args.args[1]))

    # ------------------------------------------------------------------
    # Preços sem IVA (pvpNsiva) em sincronia com os preços de venda
    # ------------------------------------------------------------------

    def _aplicar(self, schema, changes, product):
        from backend.services.products import _apply_changes
        cursor = MagicMock()
        _apply_changes(cursor, schema, product.codigo, changes, mark_sync=False, product=product)
        chamada = next(c for c in cursor.execute.call_args_list
                       if str(c.args[0]).startswith("UPDATE dbo.produtos SET"))
        sql = chamada.args[0]
        colunas = [p.split(" = ")[0] for p in sql[len("UPDATE dbo.produtos SET "):].split(" WHERE ")[0].split(", ")]
        return dict(zip(colunas, chamada.args[1]))

    def _schema_com_siva(self):
        cols = {"codigo": ("int", None), "precovenda": ("money", None), "iva": ("money", None)}
        for i in range(1, 11):
            cols[f"pvp{i}"] = ("money", None)
            cols[f"pvp{i}siva"] = ("money", None)
        return {"produtos": cols}

    def test_preco_sem_iva_acompanha_alteracao_de_pvp(self):
        """Alterar o PVP deixava pvp1siva com o valor líquido antigo."""
        from backend.services.products import _price_change
        from backend.models import ProductItem

        prod = ProductItem(codigo=1, descricao="Bacalhau", iva=23.0, pvp1=10.0)
        valores = self._aplicar(self._schema_com_siva(),
                                [_price_change(1, "Preço PVP 1", 10.0, 12.30)], prod)

        self.assertAlmostEqual(valores["precovenda"], 12.30, places=4)
        self.assertAlmostEqual(valores["pvp1siva"], 10.0, places=4)  # 12.30 / 1.23
        # Os PVP não alterados não são tocados
        self.assertNotIn("pvp2siva", valores)

    def test_preco_sem_iva_recalcula_todos_quando_muda_o_iva(self):
        """Mudar a taxa afeta os dez preços sem IVA, não só os PVP alterados."""
        from backend.services.products import Change
        from backend.models import ProductItem

        prod = ProductItem(codigo=1, descricao="Bacalhau", iva=23.0, pvp1=12.30, pvp2=6.36)
        mudanca_iva = Change("iva", "Taxa de IVA", "23%", "6%", column="iva", value=6.0)
        valores = self._aplicar(self._schema_com_siva(), [mudanca_iva], prod)

        self.assertEqual(valores["iva"], 6.0)
        self.assertAlmostEqual(valores["pvp1siva"], round(12.30 / 1.06, 4), places=4)
        self.assertAlmostEqual(valores["pvp2siva"], round(6.36 / 1.06, 4), places=4)
        for i in range(1, 11):
            self.assertIn(f"pvp{i}siva", valores)

    def test_sem_colunas_siva_nao_se_inventam_colunas(self):
        """Bases de dados sem pvpNsiva não podem receber SQL com colunas inexistentes."""
        from backend.services.products import _price_change
        from backend.models import ProductItem

        schema = {"produtos": {"codigo": ("int", None), "precovenda": ("money", None)}}
        prod = ProductItem(codigo=1, descricao="Bacalhau", iva=23.0, pvp1=10.0)
        valores = self._aplicar(schema, [_price_change(1, "Preço PVP 1", 10.0, 12.30)], prod)

        self.assertEqual(list(valores), ["precovenda"])

    # ------------------------------------------------------------------
    # Ementa digital: criar o registo respeitando o que o utilizador escolheu
    # ------------------------------------------------------------------

    @patch("backend.services.ementa_digital._schema")
    @patch("backend.services.ementa_digital.db_manager")
    def test_novo_artigo_na_ementa_respeita_toggles(self, mock_db_mgr, mock_schema):
        """O INSERT gravava sempre visivel=1 e alergénios a 0, ignorando o pedido."""
        from backend.services.ementa_digital import update_single_ementa_product
        from backend.models import EmentaSingleProductUpdate

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_db_mgr.get_connection.return_value = mock_conn
        mock_schema.return_value = {"ementa_digital_produtos": {
            "cod_produto": ("int", None), "produto": ("varchar", 250),
            "descricao": ("varchar", 500), "visivel": ("int", None),
            "highlight": ("int", None), "gluten": ("int", None),
        }}
        mock_cursor.description = [("cod_produto",), ("produto",)]
        # 1.ª fetchone: registo ainda não existe. 2.ª: dados do artigo em dbo.produtos
        mock_cursor.fetchone.side_effect = [None, (5, "Bacalhau à Brás", "Bacalhau", 3)]

        succ, msg = update_single_ementa_product(
            900, EmentaSingleProductUpdate(visivel=0, gluten=1, ementa_familia=7))
        self.assertTrue(succ, msg)

        insert = next(c for c in mock_cursor.execute.call_args_list
                      if "INSERT INTO dbo.ementa_digital_produtos" in str(c.args[0]))
        params = insert.args[1]
        self.assertEqual(params[0], 900)        # cod_produto
        self.assertEqual(params[1], 7)          # familia da ementa escolhida
        self.assertEqual(params[2], "Bacalhau à Brás")
        self.assertEqual(params[4], 0)          # visivel = 0, como pedido
        self.assertEqual(params[6], 1)          # gluten = 1, como pedido

    # ------------------------------------------------------------------
    # Relatório de qualidade: falhar em vez de inventar erros fiscais
    # ------------------------------------------------------------------

    @patch("backend.services.reports.db_manager")
    def test_relatorio_qualidade_falha_em_vez_de_inventar(self, mock_db_mgr):
        """Sem ligação, o relatório devolvia erros fiscais fictícios com HTTP 200."""
        import pyodbc
        from fastapi.testclient import TestClient
        from backend.app import app

        mock_db_mgr.get_connection.side_effect = pyodbc.Error(
            "08001", "[08001] Não foi possível contactar o servidor")

        res = TestClient(app).get("/api/reports/data-quality")
        self.assertEqual(res.status_code, 503)
        self.assertIn("detail", res.json())
        self.assertNotIsInstance(res.json(), list)


if __name__ == "__main__":
    unittest.main()
