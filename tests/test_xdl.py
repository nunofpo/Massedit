import unittest

from backend.services.xdl import (
    KEY0, C1, C2,
    decrypt, is_xdl_encrypted, detect_and_decrypt_text, parse_xdl_db_config,
)


def encrypt(plain: bytes) -> bytes:
    """Inverso de xdl.decrypt (a chave é atualizada com o byte cifrado)."""
    out = bytearray()
    key = KEY0
    for p in plain:
        c = p ^ (key >> 8)
        out.append(c)
        key = ((key + c) * C1 + C2) & 0xFFFF
    return bytes(out)


class TestXdlCipher(unittest.TestCase):
    def test_roundtrip(self):
        plain = b'<?xml version="1.0"?><a>ol\xe1</a>'
        self.assertEqual(decrypt(encrypt(plain)), plain)


class TestXdlEncryptionDetection(unittest.TestCase):
    def test_encrypted_with_xml_declaration(self):
        data = encrypt(b'<?xml version="1.0"?><cfg><Password>abc123</Password></cfg>')
        self.assertTrue(is_xdl_encrypted(data))

    def test_encrypted_without_xml_declaration(self):
        # Antes só era reconhecido se o ficheiro começasse por '<?xml'
        for xml in (b'<cfg><Password>abc123</Password></cfg>', b'<Config><Password>abc123</Password></Config>'):
            data = encrypt(xml)
            self.assertTrue(is_xdl_encrypted(data), xml)
            self.assertEqual(detect_and_decrypt_text(data), xml.decode())

    def test_plain_text_is_not_encrypted(self):
        self.assertFalse(is_xdl_encrypted(b'<?xml version="1.0"?><cfg/>'))
        self.assertFalse(is_xdl_encrypted(b'<cfg><a>1</a></cfg>'))
        self.assertFalse(is_xdl_encrypted(b'Server=x;Password=y'))

    def test_utf16_udl_is_not_encrypted(self):
        data = b'\xff\xfe' + '[oledb]\r\nData Source=srv'.encode('utf-16le')
        self.assertFalse(is_xdl_encrypted(data))

    def test_empty(self):
        self.assertFalse(is_xdl_encrypted(b''))
        self.assertEqual(detect_and_decrypt_text(b''), '')


class TestParseXdlDbConfig(unittest.TestCase):
    XML = (
        '<?xml version="1.0"?><cfg><Servidor>SRV1</Servidor><BD>loja</BD>'
        '<User>sa</User><Password>abc123</Password></cfg>'
    )

    def check(self, result, server='', database='', username='', password=''):
        cfg = result['config']
        self.assertEqual(
            (cfg['server'], cfg['database'], cfg['username'], cfg['password']),
            (server, database, username, password),
        )

    def test_plain_xml(self):
        res = parse_xdl_db_config(self.XML.encode())
        self.check(res, 'SRV1', 'loja', 'sa', 'abc123')
        self.assertEqual(res['passwords_found'], ['abc123'])

    def test_encrypted_xml(self):
        self.check(parse_xdl_db_config(encrypt(self.XML.encode())), 'SRV1', 'loja', 'sa', 'abc123')

    def test_encrypted_xml_without_declaration(self):
        xml = '<Config><Servidor>SRV1</Servidor><BD>loja</BD><User>sa</User><Password>abc123</Password></Config>'
        self.check(parse_xdl_db_config(encrypt(xml.encode())), 'SRV1', 'loja', 'sa', 'abc123')

    def test_udl_connection_string(self):
        text = (
            '[oledb]\r\n; Everything after this line is an OLE DB initstring\r\n'
            'Provider=SQLOLEDB.1;Password=p@ss;Persist Security Info=True;'
            'User ID=sa;Initial Catalog=db;Data Source=.\\ZONESOFTSQL'
        )
        data = b'\xff\xfe' + text.encode('utf-16le')
        self.check(parse_xdl_db_config(data), '.\\ZONESOFTSQL', 'db', 'sa', 'p@ss')

    def test_password_with_spaces(self):
        self.check(parse_xdl_db_config(b'Server=x;Password=my pass word;User ID=sa'),
                   server='x', username='sa', password='my pass word')

    def test_guid_is_not_a_user(self):
        # "GUID=" não pode ser lido como "UID="
        res = parse_xdl_db_config(b'GUID=abc-123;Server=x;Password=y')
        self.check(res, server='x', password='y')

    def test_prefixed_keys_are_not_matched(self):
        res = parse_xdl_db_config(b'LinkedServer=other;Server=x;OldPassword=z;Password=y')
        self.check(res, server='x', password='y')

    def test_unrelated_xml_tags_are_ignored(self):
        # "ip" está dentro de "description", "pin" dentro de "shipping", "bd" dentro de "abdomen"...
        xml = (b'<c><description>hello world</description><shipping>fast</shipping>'
               b'<abdomen>x</abdomen><bypass>no</bypass><Password>pw</Password></c>')
        res = parse_xdl_db_config(xml)
        self.check(res, password='pw')
        self.assertEqual(res['passwords_found'], ['pw'])

    def test_xml_tag_variants(self):
        xml = (b'<c><ServerIP>10.0.0.5</ServerIP><DB_Name>loja</DB_Name>'
               b'<UserName>admin</UserName><UserPassword>s3cret</UserPassword></c>')
        self.check(parse_xdl_db_config(xml), '10.0.0.5', 'loja', 'admin', 's3cret')

    def test_user_password_tag_is_a_password_not_a_user(self):
        res = parse_xdl_db_config(b'<c><User>sa</User><UserPassword>s3cret</UserPassword></c>')
        self.check(res, username='sa', password='s3cret')

    def test_database_server_tag_is_a_server(self):
        res = parse_xdl_db_config(b'<c><DatabaseServer>SRV</DatabaseServer><Database>loja</Database></c>')
        self.check(res, server='SRV', database='loja')

    def test_xml_namespace_tags(self):
        xml = b'<c xmlns="urn:x"><Servidor>SRV1</Servidor><Password>pw</Password></c>'
        self.check(parse_xdl_db_config(xml), server='SRV1', password='pw')

    def test_empty_and_binary_do_not_crash(self):
        self.check(parse_xdl_db_config(b''))
        res = parse_xdl_db_config(bytes(range(256)))
        self.assertEqual(res['passwords_found'], [])


if __name__ == '__main__':
    unittest.main()
