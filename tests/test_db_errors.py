import asyncio
import json
import unittest
from unittest import mock

import pyodbc

from backend import app as app_module
from backend.db import describe_db_error


def call_api(method: str, path: str):
    """Chama a app por ASGI (sem TestClient/httpx) e devolve (status, corpo JSON ou texto)."""
    sent = []

    async def run():
        scope = {
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
            "method": method, "path": path, "raw_path": path.encode(), "query_string": b"",
            "headers": [], "server": ("test", 80), "client": ("test", 1), "scheme": "http",
        }

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):
            sent.append(message)

        await app_module.app(scope, receive, send)

    asyncio.run(run())
    status = next(m["status"] for m in sent if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    try:
        return status, json.loads(body)
    except ValueError:
        return status, body.decode(errors="replace")


class TestDescribeDbError(unittest.TestCase):
    def test_login_failed_is_503(self):
        status, msg = describe_db_error(pyodbc.InterfaceError(
            "28000", "[28000] [Microsoft][ODBC Driver 17 for SQL Server][SQL Server]Login failed for user 'sa'. (18456)"))
        self.assertEqual(status, 503)
        self.assertIn("autenticação", msg)
        self.assertIn("Login failed", msg)

    def test_unreachable_server_is_503(self):
        for state in ("08001", "HYT00"):
            status, msg = describe_db_error(pyodbc.OperationalError(state, "timeout"))
            self.assertEqual(status, 503, state)
            self.assertIn("contactar o SQL Server", msg)

    def test_missing_driver_is_503(self):
        status, msg = describe_db_error(pyodbc.Error("IM002", "Data source name not found"))
        self.assertEqual(status, 503)
        self.assertIn("Driver ODBC", msg)

    def test_cannot_open_database_is_503(self):
        status, msg = describe_db_error(pyodbc.ProgrammingError(
            "42000", "[42000] [SQL Server]Cannot open database \"x\" requested by the login. (4060)"))
        self.assertEqual(status, 503)
        self.assertIn("não existe", msg)

    def test_other_sql_error_is_500(self):
        status, msg = describe_db_error(pyodbc.IntegrityError("23000", "Violation of PRIMARY KEY constraint"))
        self.assertEqual(status, 500)
        self.assertTrue(msg.startswith("Erro na base de dados:"))
        self.assertIn("PRIMARY KEY", msg)

    def test_unexpected_args_shape_does_not_crash(self):
        self.assertEqual(describe_db_error(pyodbc.Error())[0], 500)
        self.assertEqual(describe_db_error(pyodbc.Error("only a message"))[0], 500)

    def test_long_message_is_truncated(self):
        _, msg = describe_db_error(pyodbc.Error("42000", "x" * 5000))
        self.assertLess(len(msg), 400)


class TestDbErrorHandler(unittest.TestCase):
    def test_uncaught_connection_error_returns_json_503(self):
        err = pyodbc.InterfaceError("28000", "Login failed for user ''. (18456)")
        with mock.patch.object(app_module, "get_families", side_effect=err):
            status, body = call_api("GET", "/api/families")
        self.assertEqual(status, 503)
        self.assertIn("autenticação", body["detail"])

    def test_uncaught_sql_error_returns_json_500(self):
        err = pyodbc.ProgrammingError("42S02", "Invalid object name 'dbo.familias'.")
        with mock.patch.object(app_module, "get_families", side_effect=err):
            status, body = call_api("GET", "/api/families")
        self.assertEqual(status, 500)
        self.assertIn("dbo.familias", body["detail"])

    def test_endpoint_that_handles_its_own_errors_is_unchanged(self):
        # /api/families/create já converte exceções em 400: o handler global não interfere
        err = pyodbc.Error("23000", "duplicate")
        with mock.patch.object(app_module, "create_family", side_effect=err):
            sent = []

            async def run():
                body = json.dumps({"descricao": "X"}).encode()
                scope = {
                    "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
                    "path": "/api/families/create", "raw_path": b"/api/families/create", "query_string": b"",
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
                    "server": ("test", 80), "client": ("test", 1), "scheme": "http",
                }

                async def receive():
                    return {"type": "http.request", "body": body, "more_body": False}

                async def send(message):
                    sent.append(message)

                await app_module.app(scope, receive, send)

            asyncio.run(run())
        self.assertEqual(next(m["status"] for m in sent if m["type"] == "http.response.start"), 400)


if __name__ == "__main__":
    unittest.main()
