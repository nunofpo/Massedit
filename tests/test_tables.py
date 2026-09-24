import unittest
from unittest.mock import MagicMock, patch

import pyodbc
from fastapi.testclient import TestClient

from backend.app import app
from backend.models import TableUpdateItem, BulkTableUpdateRequest
from backend.services.tables import get_tables, preview_table_updates, update_tables

client = TestClient(app)

# Esquema mínimo de uma base ZoneSoft com dbo.mesas e dbo.salas
SCHEMA = {
    "salas": {"codigo": ("int", None), "descricao": ("varchar", 50)},
    "mesas": {
        "codigo": ("int", None), "descricao": ("varchar", 50),
        "sala": ("int", None), "posicao": ("int", None), "sync": ("int", None),
    },
}
SALAS_ROWS = [(1, "Sala Principal")]
# codigo, descricao, sala, posicao, bloqueada
MESAS_ROWS = [(1, "Mesa 1", 1, 1, 0), (2, "Mesa 2", 1, 2, 0)]

FAKE_TABLES = {
    "tables": [
        {"codigo": 1, "descricao": "Mesa 1", "sala": 1, "sala_desc": "Sala Principal",
         "posicao": 1, "bloqueada": 0},
        {"codigo": 2, "descricao": "Mesa 2", "sala": 1, "sala_desc": "Sala Principal",
         "posicao": 2, "bloqueada": 0},
    ],
    "salas": [{"codigo": 1, "descricao": "Sala Principal"}],
    "total": 2, "available": True, "message": "",
}


def _mock_db(mock_db_mgr):
    """Liga o db_manager simulado a um cursor que devolve salas e depois mesas."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    mock_db_mgr.get_connection.return_value = mock_conn
    mock_db_mgr.get_schema.return_value = SCHEMA
    mock_cursor.fetchall.side_effect = [SALAS_ROWS, MESAS_ROWS]
    return mock_conn, mock_cursor


class TestTablesManagement(unittest.TestCase):

    @patch("backend.services.tables.db_manager")
    def test_get_tables_service(self, mock_db_mgr):
        _mock_db(mock_db_mgr)
        data = get_tables()

        self.assertTrue(data["available"])
        self.assertEqual(data["total"], 2)
        self.assertEqual([t["codigo"] for t in data["tables"]], [1, 2])
        self.assertEqual(data["tables"][0]["sala_desc"], "Sala Principal")
        self.assertEqual(data["salas"], [{"codigo": 1, "descricao": "Sala Principal"}])

    @patch("backend.services.tables.db_manager")
    def test_get_tables_filtra_por_pesquisa(self, mock_db_mgr):
        _mock_db(mock_db_mgr)
        data = get_tables(search="Mesa 2")
        self.assertEqual([t["codigo"] for t in data["tables"]], [2])

    @patch("backend.services.tables.db_manager")
    def test_get_tables_api(self, mock_db_mgr):
        _mock_db(mock_db_mgr)
        response = client.get("/api/tables")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total"], 2)

    @patch("backend.services.tables.db_manager")
    def test_get_tables_sem_tabelas_de_mesas(self, mock_db_mgr):
        """Base de dados sem dbo.mesas/dbo.mapamesas: lista vazia e aviso, não dados fictícios."""
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = MagicMock()
        mock_db_mgr.get_connection.return_value = mock_conn
        mock_db_mgr.get_schema.return_value = {"produtos": {"codigo": ("int", None)}}

        data = get_tables()
        self.assertFalse(data["available"])
        self.assertEqual(data["tables"], [])
        self.assertIn("mapamesas", data["message"])

    @patch("backend.services.tables.get_tables", return_value=FAKE_TABLES)
    def test_preview_table_updates_valid(self, _mock_get):
        req = BulkTableUpdateRequest(tables=[TableUpdateItem(codigo=1, descricao="Mesa Principal 1")])
        preview = preview_table_updates(req)

        self.assertEqual(preview.total_selected, 1)
        self.assertEqual(preview.total_affected, 1)
        self.assertEqual(preview.blocked_descriptions_count, 0)
        self.assertEqual(preview.previews[0].diffs[0].new_value, "Mesa Principal 1")

    @patch("backend.services.tables.get_tables", return_value=FAKE_TABLES)
    def test_preview_table_updates_empty_description_blocked(self, _mock_get):
        req = BulkTableUpdateRequest(tables=[TableUpdateItem(codigo=1, descricao="")])
        preview = preview_table_updates(req)

        self.assertEqual(preview.blocked_descriptions_count, 1)
        self.assertTrue(preview.previews[0].diffs[0].blocked)
        self.assertIn("não pode ficar em branco", preview.previews[0].diffs[0].reason)

    @patch("backend.services.tables.db_manager")
    @patch("backend.services.tables.get_tables", return_value=FAKE_TABLES)
    def test_update_tables_grava_no_sql_server(self, _mock_get, mock_db_mgr):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.rowcount = 1
        mock_db_mgr.get_connection.return_value = mock_conn
        mock_db_mgr.get_schema.return_value = SCHEMA

        req = BulkTableUpdateRequest(tables=[
            TableUpdateItem(codigo=1, descricao="Mesa Renovada 1"),
            TableUpdateItem(codigo=2, descricao="Mesa Renovada 2"),
        ])
        res = update_tables(req)

        self.assertTrue(res["success"])
        self.assertEqual(res["updated_count"], 2)
        mock_conn.commit.assert_called()
        updates = [c.args[0] for c in mock_cursor.execute.call_args_list
                   if str(c.args[0]).startswith("UPDATE dbo.mesas")]
        self.assertEqual(len(updates), 2)
        self.assertIn("sync = 1", updates[0])

    @patch("backend.services.tables.get_tables", return_value=FAKE_TABLES)
    def test_update_tables_api(self, _mock_get):
        payload = {"tables": [{"codigo": 1, "descricao": "Mesa Renovada 1"}]}

        prev_res = client.post("/api/tables/preview", json=payload)
        self.assertEqual(prev_res.status_code, 200)
        self.assertEqual(prev_res.json()["total_affected"], 1)

        with patch("backend.services.tables.db_manager") as mock_db_mgr:
            mock_conn = MagicMock()
            mock_cursor = MagicMock()
            mock_conn.cursor.return_value = mock_cursor
            mock_cursor.rowcount = 1
            mock_db_mgr.get_connection.return_value = mock_conn
            mock_db_mgr.get_schema.return_value = SCHEMA

            upd_res = client.post("/api/tables/update", json=payload)

        self.assertEqual(upd_res.status_code, 200)
        self.assertTrue(upd_res.json()["success"])

    @patch("backend.services.tables.db_manager")
    def test_falha_de_ligacao_devolve_erro_e_nao_mesas_ficticias(self, mock_db_mgr):
        """Regressão: sem ligação devolvia 9 mesas inventadas com HTTP 200."""
        mock_db_mgr.get_connection.side_effect = pyodbc.Error(
            "08001", "[08001] Não foi possível contactar o servidor")

        res = client.get("/api/tables")
        self.assertEqual(res.status_code, 503)
        self.assertIn("detail", res.json())
        self.assertNotIn("tables", res.json())


if __name__ == "__main__":
    unittest.main()
