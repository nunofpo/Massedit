import unittest
from unittest.mock import MagicMock, patch
from backend.models import ProductFilter, ProductItem
from backend.services.reports import check_missing_vat_exemption_reason
from backend.services.housekeeping import get_db_housekeeping_status, shrink_log_file, optimize_indexes
from backend.services.products import get_dead_products_summary, inactivate_dead_products, search_products


class TestNewFeatures(unittest.TestCase):

    def test_product_filter_descontinuado_and_large_pagesize(self):
        f = ProductFilter(descontinuado=1, page_size=10000)
        self.assertEqual(f.descontinuado, 1)
        self.assertEqual(f.page_size, 10000)

        f_ativo = ProductFilter(descontinuado=0)
        self.assertEqual(f_ativo.descontinuado, 0)

    def test_check_missing_vat_exemption_reason(self):
        cursor = MagicMock()
        schema = {
            "produtos": {"codigo": ("int", None), "iva": ("money", None), "isencao": ("varchar", 10), "familia": ("int", None)},
            "motivos_isencao": {"codigo": ("varchar", 10), "descricao": ("varchar", 100)}
        }
        cursor.fetchall.return_value = [(101, "Bebidas"), (102, "Cafetaria")]
        res = check_missing_vat_exemption_reason(cursor, schema)
        self.assertEqual(res.id, "missing_vat_exemption_reason")
        self.assertEqual(res.severity, "error")
        self.assertEqual(res.count, 2)
        self.assertIn(101, res.codes)

    @patch("backend.services.housekeeping.db_manager")
    def test_housekeeping_status_and_shrink(self, mock_db):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_db.get_connection.return_value = mock_conn
        mock_db.config.database = "zs_test"

        # Mock sys.database_files (3 chamadas: status isolado, shrink antes, shrink depois)
        mock_cursor.fetchall.side_effect = [
            # 1. status isolado
            [
                (1, "ROWS", "zs_data", "C:\\data.mdf", 500.0, 300.0),
                (2, "LOG", "zs_log", "C:\\log.ldf", 2000.0, 50.0)
            ],
            [("produtos", 5000, 120.0, 100.0)],  # top tables
            # 2. shrink_log_file (antes)
            [
                (1, "ROWS", "zs_data", "C:\\data.mdf", 500.0, 300.0),
                (2, "LOG", "zs_log", "C:\\log.ldf", 2000.0, 50.0)
            ],
            [("produtos", 5000, 120.0, 100.0)],
            # 3. shrink_log_file (depois)
            [
                (1, "ROWS", "zs_data", "C:\\data.mdf", 500.0, 300.0),
                (2, "LOG", "zs_log", "C:\\log.ldf", 10.0, 5.0)
            ],
            [("produtos", 5000, 120.0, 100.0)]
        ]
        mock_cursor.fetchone.return_value = ("SIMPLE",)

        status = get_db_housekeeping_status()
        self.assertEqual(status["database_name"], "zs_test")
        self.assertEqual(status["data_size_mb"], 500.0)
        self.assertEqual(status["log_size_mb"], 2000.0)
        self.assertTrue(status["log_bloated"])

        shrink_res = shrink_log_file()
        self.assertTrue(shrink_res["success"])
        self.assertGreater(shrink_res["freed_mb"], 1000.0)

    @patch("backend.services.housekeeping.db_manager")
    def test_housekeeping_optimize_indexes(self, mock_db):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_db.get_connection.return_value = mock_conn
        mock_db.get_schema.return_value = {
            "produtos": {"codigo": ("int", None)},
            "vendas": {"codigo": ("int", None)}
        }

        res = optimize_indexes()
        self.assertTrue(res["success"])
        self.assertEqual(res["count"], 2)
        self.assertIn("dbo.produtos", res["optimized_tables"])

    def test_product_item_new_article_properties(self):
        p = ProductItem(
            codigo=200,
            descricao="Bitoque de Vaca",
            pvp1=12.00,
            meiadose=1,
            precomeia=7.50,
            meiadosedesc="1/2 Dose",
            dosedesc="1 Dose",
            vendersemstock=0,
            autoquebra=1,
            tiposaft="P",
            precocompra=4.20
        )
        self.assertEqual(p.meiadose, 1)
        self.assertEqual(p.precomeia, 7.50)
        self.assertEqual(p.meiadosedesc, "1/2 Dose")
        self.assertEqual(p.dosedesc, "1 Dose")
        self.assertEqual(p.vendersemstock, 0)
        self.assertEqual(p.autoquebra, 1)
        self.assertEqual(p.tiposaft, "P")
        self.assertEqual(p.precocompra, 4.20)

    def test_compute_bulk_changes_meiadose_and_precomeia(self):
        from backend.models import BulkEditRequest
        from backend.services.products import _compute_bulk_changes

        p = ProductItem(
            codigo=201,
            descricao="Bacalhau à Brás",
            pvp1=10.00,
            meiadose=0,
            precomeia=0.0,
            meiadosedesc="",
            dosedesc=""
        )

        schema = {
            "produtos": {
                "codigo": ("int", None),
                "meiadose": ("int", None),
                "precomeia": ("money", None),
                "meiadosedesc": ("varchar", 50),
                "dosedesc": ("varchar", 50),
            }
        }
        mock_lookups = MagicMock()
        mock_lookups.families = {}
        mock_lookups.subfamilies = {}
        mock_lookups.centers = {}

        req = BulkEditRequest(
            product_codes=[201],
            apply_meiadose=True,
            new_meiadose=1,
            apply_precomeia=True,
            precomeia_mode="percent_pvp1",
            precomeia_pct_pvp1=65.0,  # 65% de 10.00 = 6.50
            apply_meiadosedesc=True,
            new_meiadosedesc="1/2 Dose",
            apply_dosedesc=True,
            new_dosedesc="Dose Inteira"
        )

        changes = _compute_bulk_changes(p, req, schema, mock_lookups, {201: 0})
        change_map = {c.field_name: c for c in changes}

        self.assertIn("meiadose", change_map)
        self.assertEqual(change_map["meiadose"].value, 1)
        self.assertFalse(change_map["meiadose"].blocked)

        self.assertIn("precomeia", change_map)
        self.assertEqual(change_map["precomeia"].value, 6.50)
        self.assertFalse(change_map["precomeia"].blocked)

        self.assertIn("meiadosedesc", change_map)
        self.assertEqual(change_map["meiadosedesc"].value, "1/2 Dose")

        self.assertIn("dosedesc", change_map)
        self.assertEqual(change_map["dosedesc"].value, "Dose Inteira")

    def test_compute_bulk_changes_stock_and_saft_and_cost(self):
        from backend.models import BulkEditRequest
        from backend.services.products import _compute_bulk_changes

        p = ProductItem(
            codigo=202,
            descricao="Consultoria",
            pvp1=50.00,
            vendersemstock=1,
            autoquebra=0,
            tiposaft="P",
            precocompra=0.0
        )

        schema = {
            "produtos": {
                "codigo": ("int", None),
                "vendersemstock": ("int", None),
                "autoquebra": ("int", None),
                "tiposaft": ("varchar", 2),
                "precocompra": ("money", None),
            }
        }
        mock_lookups = MagicMock()
        mock_lookups.families = {}
        mock_lookups.subfamilies = {}
        mock_lookups.centers = {}

        req = BulkEditRequest(
            product_codes=[202],
            apply_vendersemstock=True,
            new_vendersemstock=0,
            apply_autoquebra=True,
            new_autoquebra=1,
            apply_tiposaft=True,
            new_tiposaft="S",
            apply_precocompra=True,
            new_precocompra=15.00
        )

        changes = _compute_bulk_changes(p, req, schema, mock_lookups, {202: 0})
        change_map = {c.field_name: c for c in changes}

        self.assertIn("vendersemstock", change_map)
        self.assertEqual(change_map["vendersemstock"].value, 0)

        self.assertIn("autoquebra", change_map)
        self.assertEqual(change_map["autoquebra"].value, 1)

        self.assertIn("tiposaft", change_map)
        self.assertEqual(change_map["tiposaft"].value, "S")

        self.assertIn("precocompra", change_map)
        self.assertEqual(change_map["precocompra"].value, 15.00)

    def test_format_zones_display(self):
        from backend.services.products import format_zones_display
        self.assertEqual(format_zones_display([]), "")
        self.assertEqual(format_zones_display(["SALA", "SALABAIXO"]), "SALA, SALABAIXO")
        self.assertEqual(format_zones_display(["Delivery"]), "Delivery")
        # Sequential prefixes compressed
        zones = ["TAKE AWAY 1", "TAKE AWAY 2", "TAKE AWAY 3", "TAKE AWAY 4", "TAKE AWAY 5", "TAKE AWAY 6", "ENCOMENDAS"]
        self.assertEqual(format_zones_display(zones), "TAKE AWAY (1 a 6), ENCOMENDAS")

    @patch("backend.services.products.db_manager")
    def test_get_price_zones_mapping(self, mock_db):
        from backend.services.products import get_price_zones_mapping
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_db.get_connection.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cursor

        # Mock schema inspection to return zonas table
        with patch("backend.services.products._schema", return_value={"zonas": {"codigo": None, "descricao": None, "precozona": None}}):
            mock_cursor.fetchall.return_value = [
                (2, "SALA", 0),
                (10, "SALABAIXO", 0),
                (3, "TAKE AWAY 1", 1),
                (4, "TAKE AWAY 2", 1),
                (8, "Delivery", 2),
                (1, "Uber", 4),
                (11, "Glovo", 4),
            ]
            mapping = get_price_zones_mapping()
            self.assertEqual(mapping["1"]["display"], "SALA, SALABAIXO")
            self.assertEqual(mapping["2"]["display"], "TAKE AWAY 1, TAKE AWAY 2")
            self.assertEqual(mapping["3"]["display"], "Delivery")
            self.assertEqual(mapping["4"]["display"], "")
            self.assertEqual(mapping["5"]["display"], "Uber, Glovo")

    @patch("backend.services.customers.db_manager")
    def test_get_customers_with_contribuinte_column(self, mock_db):
        from backend.services.customers import get_customers
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_db.get_connection.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cursor
        mock_db.get_schema.return_value = {
            "clientes": {
                "codigo": None, "nome": None, "contribuinte": None, "morada": None,
                "localidade": None, "codpostal": None, "telefone": None, "email": None
            }
        }
        # Mock rows: one valid NIF (Consumidor final), one valid corporate NIF, one invalid
        mock_cursor.fetchall.return_value = [
            (1, "Cliente A", "999999990", "Rua 1", "Porto", "4000-001", "910000000", "a@test.pt"),
            (2, "Cliente B", "501234560", "Rua 2", "Lisboa", "1000-001", "920000000", "b@test.pt"),
            (3, "Cliente C", "123456788", "Rua 3", "Braga", "4700-001", "930000000", "c@test.pt"),
        ]
        res = get_customers(limit=10)
        self.assertEqual(res.total, 3)
        self.assertEqual(res.valid_count, 2)
        self.assertEqual(res.invalid_count, 1)
        self.assertTrue(res.customers[0].is_valid_nif)
        self.assertEqual(res.customers[0].nif, "999999990")
        self.assertTrue(res.customers[1].is_valid_nif)
        self.assertEqual(res.customers[1].nif, "501234560")
        self.assertFalse(res.customers[2].is_valid_nif)

    def test_single_product_endpoints(self):
        from fastapi.testclient import TestClient
        from backend.app import app
        from backend.models import ProductItem
        client = TestClient(app)

        mock_prod = ProductItem(
            codigo=999,
            descricao="Artigo de Teste",
            pvp1=5.00,
            has_sales=True,
            can_edit_description=False
        )

        with patch("backend.app.get_products_by_codes") as mock_get:
            mock_get.return_value = [mock_prod]
            # 1. Test GET /api/products/999
            res = client.get("/api/products/999")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["descricao"], "Artigo de Teste")

            # 2. Test GET non-existent
            mock_get.return_value = []
            res_404 = client.get("/api/products/88888")
            self.assertEqual(res_404.status_code, 404)

        with patch("backend.app.update_single_product") as mock_update:
            # 3. Test PUT success
            mock_update.return_value = (True, "Artigo atualizado.", mock_prod)
            res_put = client.put("/api/products/999", json={"pvp1": 6.50})
            self.assertEqual(res_put.status_code, 200)
            self.assertTrue(res_put.json()["success"])

            # 4. Test PUT failure (e.g. description blocked)
            mock_update.return_value = (False, "Descrição bloqueada por vendas.", None)
            res_fail = client.put("/api/products/999", json={"descricao": "Novo Nome"})
            self.assertEqual(res_fail.status_code, 400)

    def test_menu_detection_and_structure(self):
        from backend.models import ProductItem, ProductFilter
        from backend.services.products import _build_product_where, get_menu_structure

        # 1. Model tests
        normal_item = ProductItem(codigo=10, descricao="Café", composto=0)
        self.assertFalse(normal_item.is_menu)

        menu_item = ProductItem(codigo=20, descricao="Menu Francesinha", composto=2, is_menu=True)
        self.assertTrue(menu_item.is_menu)

        # 2. Filter / Where clause test
        schema = {"produtos": {"composto": ("int", None)}}
        where_menu, params_menu = _build_product_where(ProductFilter(is_menu=True), schema)
        self.assertIn("p.composto AS INT), 0) = 2", where_menu)

        where_non_menu, _ = _build_product_where(ProductFilter(is_menu=False), schema)
        self.assertIn("p.composto AS INT), 0) <> 2", where_non_menu)

        # 3. get_menu_structure test
        mock_cursor = MagicMock()
        with patch("backend.services.products._schema") as mock_sch:
            mock_sch.return_value = {"niveismenu": {}, "niveismenuext": {}}
            mock_cursor.fetchall.side_effect = [
                # First fetchall: niveismenu
                [(1, "Prato", 1, 0), (2, "Bebida", 0, 1)],
                # Second fetchall: niveismenuext
                [(1, 101, "Francesinha", 0.0, 0, 1), (2, 201, "Refrigerante", 0.5, 1, 0)]
            ]
            levels = get_menu_structure(mock_cursor, 20)
            self.assertEqual(len(levels), 2)
            self.assertEqual(levels[0]["descricao"], "Prato")
            self.assertTrue(levels[0]["obrigatorio"])
            self.assertEqual(len(levels[0]["options"]), 1)
            self.assertEqual(levels[0]["options"][0]["descricao"], "Francesinha")
            self.assertEqual(levels[1]["descricao"], "Bebida")
            self.assertFalse(levels[1]["obrigatorio"])
            self.assertEqual(levels[1]["options"][0]["preco"], 0.5)

    def test_vat_data_quality_checks(self):
        from backend.services.reports import (
            check_suspect_vat_alcohol,
            check_suspect_vat_soda,
            check_suspect_vat_food_at_23,
            check_null_vat
        )

        schema = {
            "produtos": {
                "codigo": ("int", None),
                "descricao": ("varchar", 100),
                "iva": ("money", None),
                "familia": ("int", None)
            },
            "familias": {
                "codigo": ("int", None),
                "descricao": ("varchar", 100)
            }
        }

        # 1. Test check_suspect_vat_alcohol
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [
            (10, "Vinho Tinto Alentejano", 13.0, "Vinhos"),
            (11, "Cerveja Sagres 33cl", 13.0, "Cervejas"),
            (12, "Caldo Verde Minhoto", 13.0, "Sopas"),          # excluded by food exclusion
            (13, "Tripas a Moda do Porto", 13.0, "Pratos"),      # excluded by food exclusion
            (14, "Agua Mineral das Pedras", 13.0, "Aguas")       # non-alcoholic
        ]
        res_alc = check_suspect_vat_alcohol(mock_cursor, schema)
        self.assertEqual(res_alc.id, "suspect_vat_alcohol")
        self.assertEqual(res_alc.severity, "error")
        self.assertEqual(res_alc.category, "iva")
        self.assertEqual(res_alc.count, 2)
        self.assertEqual(res_alc.codes, [10, 11])

        # 2. Test check_suspect_vat_soda
        mock_cursor.fetchall.return_value = [
            (20, "Coca-Cola Zero 33cl", 13.0, "Bebidas"),
            (21, "Fanta Ananas", 13.0, "Bebidas"),
            (22, "Agua do Luso", 13.0, "Bebidas")                # not soda
        ]
        res_soda = check_suspect_vat_soda(mock_cursor, schema)
        self.assertEqual(res_soda.id, "suspect_vat_soda")
        self.assertEqual(res_soda.severity, "error")
        self.assertEqual(res_soda.category, "iva")
        self.assertEqual(res_soda.count, 2)
        self.assertEqual(res_soda.codes, [20, 21])

        # 3. Test check_suspect_vat_food_at_23
        mock_cursor.fetchall.return_value = [
            (30, "Bife de Alcatra na Brasa", "Carnes", 11),
            (31, "Café Expresso Chavena", "Cafetaria", 15),
            (32, "Super Bock Mini 20cl", "Cervejas", 16),      # alcohol, rightfully 23%
            (33, "Coca Cola 33cl", "Bebidas", 16)              # soda, rightfully 23%
        ]
        res_food = check_suspect_vat_food_at_23(mock_cursor, schema)
        self.assertEqual(res_food.id, "suspect_vat_food_at_23")
        self.assertEqual(res_food.severity, "warning")
        self.assertEqual(res_food.category, "iva")
        self.assertEqual(res_food.count, 2)
        self.assertEqual(res_food.codes, [30, 31])

        # 4. Test check_null_vat
        mock_cursor.fetchall.return_value = [
            (40, "Sobremesa Sem IVA"),
            (41, "Artigo Avulso")
        ]
        res_null = check_null_vat(mock_cursor, schema)
        self.assertEqual(res_null.id, "null_vat")
        self.assertEqual(res_null.severity, "error")
        self.assertEqual(res_null.category, "iva")
        self.assertEqual(res_null.count, 2)
        self.assertEqual(res_null.codes, [40, 41])

    @patch("backend.services.customers.db_manager")
    def test_customer_full_data_and_locked_nif(self, mock_db):
        from backend.models import CustomerItem, CustomerUpdateItem, BulkCustomerUpdateRequest
        from backend.services.customers import get_customers, preview_customer_update, update_customer_data

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_db.get_connection.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cursor

        schema = {
            "clientes": {
                "codigo": ("int", None), "nome": ("varchar", 100), "contribuinte": ("varchar", 20),
                "morada": ("varchar", 250), "localidade": ("varchar", 50), "codpostal": ("varchar", 20),
                "codpostal1": ("varchar", 20), "pais": ("varchar", 3), "telefone": ("varchar", 50),
                "telemovel": ("varchar", 50), "email": ("varchar", 50), "web": ("varchar", 50),
                "fax": ("varchar", 50), "nomecontacto": ("varchar", 50), "desconto": ("money", None),
                "limitecredito": ("money", None), "saldo": ("money", None), "valordivida": ("money", None),
                "obs": ("varchar", 250), "obsaviso": ("varchar", 255), "bloqueado": ("int", None),
                "datacriacao": ("datetime", None), "sync": ("int", None)
            }
        }
        mock_db.get_schema.return_value = schema

        # 1. Test get_customers returning complete fields
        mock_cursor.fetchall.return_value = [
            (
                10, "Empresa Alpha Lda", "501234560", "Rua Industrial 100", "Maia",
                "4470", "229000000", "geral@alpha.pt", "001", "PT", "912345678",
                "www.alpha.pt", "229000001", "Sr. Manuel", 5.0, 1500.0,
                0.0, 250.0, "Cliente habitual", "Verificar encomenda", 0, "2024-01-15 10:30:00"
            )
        ]
        audit = get_customers(limit=10)
        self.assertEqual(len(audit.customers), 1)
        cust = audit.customers[0]
        self.assertEqual(cust.codigo, 10)
        self.assertEqual(cust.nome, "Empresa Alpha Lda")
        self.assertEqual(cust.nif, "501234560")
        self.assertEqual(cust.telemovel, "912345678")
        self.assertEqual(cust.desconto, 5.0)
        self.assertEqual(cust.limitecredito, 1500.0)
        self.assertEqual(cust.valordivida, 250.0)
        self.assertEqual(cust.obsaviso, "Verificar encomenda")
        self.assertEqual(cust.pais, "PT")

        # 2. Test preview_customer_update with locked NIF
        # When attempting to alter NIF, it must be marked as blocked!
        mock_cursor.description = [
            ("codigo",), ("nome",), ("contribuinte",), ("morada",), ("localidade",), ("desconto",)
        ]
        mock_cursor.fetchall.return_value = [
            (10, "Empresa Alpha Lda", "501234560", "Rua Industrial 100", "Maia", 5.0)
        ]

        # Request trying to change NIF
        req_change_nif = BulkCustomerUpdateRequest(customers=[
            CustomerUpdateItem(codigo=10, nif="999999990", nome="Novo Nome")
        ])
        prev = preview_customer_update(req_change_nif)
        self.assertEqual(prev.blocked_descriptions_count, 1)
        diff_nif = next(d for d in prev.previews[0].diffs if d.field_name == "nif")
        self.assertTrue(diff_nif.blocked)
        self.assertIn("NIF", diff_nif.reason)

        # 3. Test update_customer_data rejects changing NIF
        success, msg, count = update_customer_data(req_change_nif)
        self.assertFalse(success)
        self.assertIn("NIF", msg)

        # 4. Test update_customer_data successfully updates other fields
        req_valid_edit = BulkCustomerUpdateRequest(customers=[
            CustomerUpdateItem(
                codigo=10,
                nome="Empresa Alpha Reformulada Lda",
                morada="Nova Morada 200",
                telemovel="919999999",
                desconto=10.0,
                obs="Nova nota",
                bloqueado=1
            )
        ])
        success_edit, msg_edit, count_edit = update_customer_data(req_valid_edit)
        self.assertTrue(success_edit)
        self.assertEqual(count_edit, 1)


if __name__ == "__main__":
    unittest.main()


