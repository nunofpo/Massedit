import unittest
from backend.models import (
    ProductItem,
    FieldDiff,
    ProductDiff,
    BulkEditPreviewResponse,
    PosLayoutApplyRequest,
)
from backend.services.customers import validate_pt_nif


class TestContracts(unittest.TestCase):
    def test_product_item_instantiation(self):
        item = ProductItem(
            codigo=101,
            descricao="Produto Teste",
            descricaocurta="Teste",
            familias=1,
            familia_desc="Geral",
            subfamilia=0,
            subfamilia_desc="",
            iva=23.0,
            iva_desc="23%",
            pvp1=10.0,
            pvp2=0.0,
            pvp3=0.0,
            pvp4=0.0,
            pvp5=0.0,
            pvp6=0.0,
            pvp7=0.0,
            pvp8=0.0,
            pvp9=0.0,
            pvp10=0.0,
            fundo=0,
            fundo_hex="#000000",
            letra=16777215,
            letra_hex="#ffffff",
            posicaofront=0,
            plu=101,
            codbarras="",
            referencia="",
            centro_prod=None,
            centro_prod_desc="",
            centro_prod_info=0,
            bloqueado=0,
            frontoffice=1,
            cor=0,
            cor_hex="#000000",
            sync=0,
            isencao="",
            has_sales=False,
            sales_check_ok=True,
            can_edit_description=True,
        )
        self.assertEqual(item.codigo, 101)
        self.assertEqual(item.isencao, "")
        self.assertTrue(item.can_edit_description)

    def test_bulk_edit_preview_response(self):
        field_diff = FieldDiff(
            field_name="pvp1",
            field_label="Preço PVP 1",
            old_value="10.00 €",
            new_value="12.00 €",
            blocked=False,
            reason=None,
        )
        product_diff = ProductDiff(
            codigo=101,
            descricao="Produto Teste",
            has_sales=False,
            diffs=[field_diff],
        )
        resp = BulkEditPreviewResponse(
            total_selected=1,
            total_affected=1,
            blocked_descriptions_count=0,
            previews=[product_diff],
        )
        self.assertEqual(resp.total_selected, 1)
        self.assertEqual(resp.previews[0].diffs[0].field_name, "pvp1")

    def test_pos_layout_apply_request(self):
        req = PosLayoutApplyRequest(
            familia=1,
            order=[101, 102, 103],
            set_ordem_frontoffice=True,
        )
        self.assertTrue(req.set_ordem_frontoffice)
        self.assertEqual(req.familia, 1)

    def test_validate_pt_nif(self):
        is_valid, msg = validate_pt_nif("501234560")
        self.assertTrue(is_valid)
        self.assertIn("Pessoa Coletiva", msg)

        is_valid_person, _ = validate_pt_nif("123456789")
        self.assertTrue(is_valid_person)

        is_valid_bad, msg_bad = validate_pt_nif("123456788")
        self.assertFalse(is_valid_bad)
        self.assertIn("inválido", msg_bad)

        is_valid_empty, msg_empty = validate_pt_nif("")
        self.assertFalse(is_valid_empty)
        self.assertEqual(msg_empty, "NIF Vazio")


if __name__ == "__main__":
    unittest.main()
