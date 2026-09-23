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


if __name__ == "__main__":
    unittest.main()
