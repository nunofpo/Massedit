import unittest
from fastapi.testclient import TestClient
from backend.app import app
from backend.models import TableItem, TableUpdateItem, BulkTableUpdateRequest
from backend.services.tables import get_tables, preview_table_updates, update_tables

client = TestClient(app)

class TestTablesManagement(unittest.TestCase):

    def test_get_tables_service(self):
        data = get_tables()
        self.assertIn("tables", data)
        self.assertIn("salas", data)
        self.assertGreater(len(data["tables"]), 0)
        
        # Check first table model structure
        table_obj = data["tables"][0]
        self.assertIn("codigo", table_obj)
        self.assertIn("descricao", table_obj)

    def test_get_tables_api(self):
        response = client.get("/api/tables")
        self.assertEqual(response.status_code, 200)
        json_data = response.json()
        self.assertIn("tables", json_data)
        self.assertIn("salas", json_data)

    def test_preview_table_updates_valid(self):
        data = get_tables()
        first_table = data["tables"][0]
        code = first_table["codigo"]
        new_name = f"{first_table['descricao']} Teste"

        req = BulkTableUpdateRequest(tables=[
            TableUpdateItem(codigo=code, descricao=new_name)
        ])
        preview = preview_table_updates(req)
        self.assertEqual(preview.total_selected, 1)
        self.assertEqual(preview.total_affected, 1)
        self.assertEqual(preview.blocked_descriptions_count, 0)
        self.assertEqual(len(preview.previews), 1)
        self.assertEqual(preview.previews[0].diffs[0].new_value, new_name)

    def test_preview_table_updates_empty_description_blocked(self):
        data = get_tables()
        first_table = data["tables"][0]
        code = first_table["codigo"]

        req = BulkTableUpdateRequest(tables=[
            TableUpdateItem(codigo=code, descricao="")
        ])
        preview = preview_table_updates(req)
        self.assertEqual(preview.blocked_descriptions_count, 1)
        self.assertTrue(preview.previews[0].diffs[0].blocked)
        self.assertIn("não pode ficar em branco", preview.previews[0].diffs[0].reason)

    def test_update_tables_api_preview_and_apply(self):
        tables_res = client.get("/api/tables")
        self.assertEqual(tables_res.status_code, 200)
        tables = tables_res.json()["tables"]
        self.assertGreaterEqual(len(tables), 2)
        t1, t2 = tables[0], tables[1]

        orig_desc1 = t1["descricao"]
        orig_desc2 = t2["descricao"]

        req_payload = {
            "tables": [
                {"codigo": t1["codigo"], "descricao": f"{orig_desc1} Edit"},
                {"codigo": t2["codigo"], "descricao": f"{orig_desc2} Edit"}
            ]
        }
        # Test preview endpoint
        prev_res = client.post("/api/tables/preview", json=req_payload)
        self.assertEqual(prev_res.status_code, 200)
        self.assertEqual(prev_res.json()["total_affected"], 2)

        # Test update endpoint
        upd_res = client.post("/api/tables/update", json=req_payload)
        self.assertEqual(upd_res.status_code, 200)
        upd_json = upd_res.json()
        self.assertTrue(upd_json["success"])
        self.assertEqual(upd_json["updated_count"], 2)

        # Revert changes to keep DB intact
        revert_payload = {
            "tables": [
                {"codigo": t1["codigo"], "descricao": orig_desc1},
                {"codigo": t2["codigo"], "descricao": orig_desc2}
            ]
        }
        client.post("/api/tables/update", json=revert_payload)

if __name__ == "__main__":
    unittest.main()
