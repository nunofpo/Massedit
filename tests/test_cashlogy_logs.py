import unittest
from datetime import datetime, timedelta
from decimal import Decimal

from backend.services.cashlogy_logs import (
    analyze_logs,
    decode_log,
    detect_kind,
    investigate,
    parse_errors,
    parse_logerr,
    parse_com,
    parse_opos,
    parse_payments,
    parse_times,
    parse_tran,
    parse_transactions,
    parse_usr,
    parse_versions,
)
from backend.services.cashlogy_sales import fetch_sales, match_sales

SEP = "        " + "+" * 60


def tx_block(start, end, before, ops, after, rejected=None):
    """Bloco de Transactions_Cashlogy.log. before/after = (stored, stacker)."""
    def snap(stored, stacker):
        return (
            f"        CashCountsStored=              {stored}\n"
            f"        CashCountsStoredStacker=       {stacker}\n"
            "        ItemsStates=                   1:DISP_SIN_PRIOR-0\n"
            "        DevicesErrors=                 H2:OK; BILLRECYCLER:OK; \n"
            "        EmptyFullStates=               1:OK,200:OK;500:NEAR_EMPTY,2000:NEAR_FULL,STACKER:OK\n"
        )
    text = f"{SEP}\n        {start}\n{snap(*before)}{ops}{snap(*after)}"
    if rejected:
        text += f"        Rejected=                      {rejected}\n"
    return text + f"        {end}\n{SEP}\n \n"


DEPOSIT_OPS = (
    "        Init Deposit\n"
    "             DepositAmount=            400\n"
    "             DepositCounts=            200:2,500:0\n"
    "        End Deposit                    OK\n"
)
DISPENSE_OPS = (
    "        Init Dispense Change\n"
    "             DispenseAmount=           250\n"
    "             CalculatedDispenseCounts= 50:1,200:1\n"
    "        End Dispense                   OK\n"
    "             DispensedAmount=          250\n"
    "             DispensedCounts=          50:1,200:1\n"
)
T1, T2 = "Mon Sep 15 13:43:53 2025", "Mon Sep 15 13:43:57 2025"
T3, T4 = "Mon Sep 15 14:11:33 2025", "Mon Sep 15 14:11:40 2025"
T5, T6 = "Mon Sep 15 15:00:00 2025", "Mon Sep 15 15:00:05 2025"


class TestKinds(unittest.TestCase):
    def test_detect_kind(self):
        self.assertEqual(detect_kind("Transactions_Cashlogy.log"), "transactions")
        self.assertEqual(detect_kind("Process_Times.log"), "times")
        self.assertEqual(detect_kind("Opos_ResultCodeExtended.log"), "errors")
        self.assertEqual(detect_kind("Process_GestorAdminDev.log"), "payments")
        self.assertEqual(detect_kind("VersionsHistory.log"), "versions")
        self.assertEqual(detect_kind("Opos_Cashlogy.log"), "opos")
        self.assertIsNone(detect_kind("Opos_Status.log"))
        self.assertIsNone(detect_kind("7028437-46027-Sensores_H500.log"))

    def test_unsupported_files_are_reported_not_parsed(self):
        r = analyze_logs([("Opos_Status.log", b"(Information not changed)"),
                          ("qualquer.txt", b"x")])
        self.assertEqual(r["files"], [])
        self.assertEqual([i["name"] for i in r["ignored"]], ["Opos_Status.log", "qualquer.txt"])

    def test_decode_falls_back_to_cp1252(self):
        self.assertEqual(decode_log("Recicladora máxima".encode("cp1252")), "Recicladora máxima")
        self.assertEqual(decode_log("Recicladora máxima".encode("utf-8")), "Recicladora máxima")


class TestTransactions(unittest.TestCase):
    def test_deposit_and_dispense_reconcile(self):
        text = (
            tx_block(T1, T2, ("200:5,500:3", "500:0"), DEPOSIT_OPS, ("200:7,500:3", "500:0"))
            + tx_block(T3, T4, ("50:4,200:7", "500:0"), DISPENSE_OPS, ("50:3,200:6", "500:0"))
        )
        r = parse_transactions(text)
        self.assertEqual(r["summary"]["deposits"], 1)
        self.assertEqual(r["summary"]["dispenses"], 1)
        self.assertEqual(r["summary"]["deposit_total"], 400)
        self.assertEqual(r["summary"]["dispense_total"], 250)
        self.assertEqual(r["summary"]["reconciled"], 2)
        self.assertEqual(r["summary"]["mismatches"], 0)
        self.assertEqual(r["transactions"][0]["counts"], {"200": 2})
        self.assertEqual(r["transactions"][1]["subtype"], "change")

    def test_stacker_counts_toward_reconciliation(self):
        # nota depositada vai para o stacker: recicladora não muda, stacker +1
        ops = DEPOSIT_OPS.replace("200:2,500:0", "200:0,2000:1").replace("400", "2000")
        text = tx_block(T1, T2, ("2000:4", "2000:10"), ops, ("2000:4", "2000:11"))
        self.assertEqual(parse_transactions(text)["summary"]["reconciled"], 1)

    def test_stock_mismatch_is_detected(self):
        # depósito de 2x2 €, mas o stock só sobe 1
        text = tx_block(T1, T2, ("200:5", "500:0"), DEPOSIT_OPS, ("200:6", "500:0"))
        r = parse_transactions(text)
        self.assertEqual(r["summary"]["mismatches"], 1)
        op = r["transactions"][0]
        self.assertEqual(op["reconciliation"]["status"], "mismatch")
        self.assertEqual(op["reconciliation"]["diff"], {"200": -1})
        self.assertTrue(any("reconcilia" in i for i in op["issues"]))

    def test_partial_dispense_is_flagged(self):
        ops = DISPENSE_OPS.replace("DispenseAmount=           250", "DispenseAmount=           500")
        text = tx_block(T1, T2, ("50:4,200:7", "500:0"), ops, ("50:3,200:6", "500:0"))
        op = parse_transactions(text)["transactions"][0]
        self.assertTrue(any(i.startswith("Dispensa parcial") for i in op["issues"]))

    def test_non_ok_result_and_missing_end(self):
        failed = DEPOSIT_OPS.replace("End Deposit                    OK", "End Deposit                    ERROR")
        truncated = DEPOSIT_OPS.replace("        End Deposit                    OK\n", "")
        text = (tx_block(T1, T2, ("200:5", "500:0"), failed, ("200:7", "500:0"))
                + tx_block(T3, T4, ("200:7", "500:0"), truncated, ("200:7", "500:0")))
        r = parse_transactions(text)
        self.assertEqual(r["transactions"][0]["result"], "ERROR")
        self.assertIsNone(r["transactions"][1]["result"])
        self.assertTrue(any("sem 'End'" in i for i in r["transactions"][1]["issues"]))
        self.assertEqual(r["summary"]["with_issues"], 2)

    def test_external_stock_change_between_blocks(self):
        text = (
            tx_block(T1, T2, ("200:5", "500:0"), DEPOSIT_OPS, ("200:7", "500:0"))
            + tx_block(T5, T6, ("200:17", "500:0"), DEPOSIT_OPS, ("200:19", "500:0"))  # +10 sem transação
        )
        r = parse_transactions(text)
        self.assertEqual(len(r["external_changes"]), 1)
        self.assertEqual(r["external_changes"][0]["delta"], {"200": 10})

    def test_rejected_and_latest_stock(self):
        text = tx_block(T1, T2, ("200:5,500:3,2000:1", "500:0"), DEPOSIT_OPS, ("200:7,500:3,2000:1", "500:0"),
                        rejected="COINS:1;BILLS:2(DB-2,FU-0,MI-0,IN-0,OT-0)")
        r = parse_transactions(text)
        self.assertEqual(r["summary"]["rejected_bills"], 2)
        self.assertEqual(r["summary"]["rejected_coins"], 1)
        self.assertEqual(r["transactions"][0]["rejected"]["detail"], {"DB": 2})
        by_value = {d["value"]: d for d in r["stock"]["denominations"]}
        self.assertEqual(by_value[200]["stored"], 7)
        self.assertEqual(by_value[500]["state"], "NEAR_EMPTY")
        self.assertEqual(by_value[2000]["state"], "NEAR_FULL")

    def test_rejections_by_day_fills_clean_days(self):
        d15 = ("Mon Sep 15 10:00:00 2025", "Mon Sep 15 10:00:05 2025")
        d16 = ("Tue Sep 16 10:00:00 2025", "Tue Sep 16 10:00:05 2025")
        d17 = ("Wed Sep 17 10:00:00 2025", "Wed Sep 17 10:00:05 2025")
        text = (
            tx_block(*d15[:1], d15[1], ("200:5", "500:0"), DEPOSIT_OPS, ("200:7", "500:0"),
                     rejected="COINS:0;BILLS:3(DB-2,FU-0,MI-0,IN-1,OT-0)")
            + tx_block(*d16[:1], d16[1], ("200:7", "500:0"), DEPOSIT_OPS, ("200:9", "500:0"))
            + tx_block(*d17[:1], d17[1], ("200:9", "500:0"), DEPOSIT_OPS, ("200:11", "500:0"),
                       rejected="COINS:0;BILLS:2(DB-0,FU-0,MI-2,IN-0,OT-0)")
        )
        rej = parse_transactions(text)["rejections"]
        self.assertEqual(rej["codes"], ["DB", "IN", "MI"])  # ordem DB,FU,IN,MI,OT; só os que ocorrem
        self.assertEqual([d["day"] for d in rej["by_day"]], ["2025-09-15", "2025-09-16", "2025-09-17"])
        self.assertEqual(rej["by_day"][0], {"day": "2025-09-15", "total": 3, "codes": {"DB": 2, "IN": 1, "MI": 0}})
        self.assertEqual(rej["by_day"][1]["total"], 0)      # dia limpo a zero, não omitido
        self.assertEqual(rej["by_day"][2]["codes"], {"DB": 0, "IN": 0, "MI": 2})

    def test_rejections_empty_when_no_rejects(self):
        text = tx_block(T1, T2, ("200:5", "500:0"), DEPOSIT_OPS, ("200:7", "500:0"))
        self.assertEqual(parse_transactions(text)["rejections"], {"codes": [], "by_day": []})

    def test_crlf_line_endings(self):
        text = tx_block(T1, T2, ("200:5", "500:0"), DEPOSIT_OPS, ("200:7", "500:0")).replace("\n", "\r\n")
        self.assertEqual(parse_transactions(text)["summary"]["reconciled"], 1)


TIMES = """\
        InitDeposit  +++++++++++++++++++++++++++++++++++++++++++   Sun Jun 22 14:38:52 2025
                        t11:                                 140   Sun Jun 22 14:38:52 2025
                       t12c:                                 610   Sun Jun 22 14:38:53 2025
        EndDeposit   +++++++++++++++++++++++++++++++++++++++++++   Sun Jun 22 14:38:57 2025
                     T1+T2:                                5187
                     TotalDeposit:                         5187

        InitDispense +++++++++++++++++++++++++++++++++++++++++++   Sun Jun 22 14:38:57 2025
                        t41:                                 906   Sun Jun 22 14:38:58 2025
        EndDispense  +++++++++++++++++++++++++++++++++++++++++++   Sun Jun 22 14:39:01 2025
                     TotalDispense:                         4172

        InitDeposit  +++++++++++++++++++++++++++++++++++++++++++   Sun Jun 22 15:13:15 2025
                        t11:                                 140   Sun Jun 22 15:13:15 2025
"""


class TestTimes(unittest.TestCase):
    def test_totals_phases_and_incomplete(self):
        r = parse_times(TIMES)
        self.assertEqual(r["deposit"]["count"], 1)
        self.assertEqual(r["deposit"]["max"], 5187)
        self.assertEqual(r["deposit"]["slowest"][0]["phases"], {"t11": 140, "t12c": 610})
        self.assertEqual(r["dispense"]["max"], 4172)
        self.assertEqual(r["incomplete"], 1)  # último InitDeposit sem Total

    def test_slow_threshold_uses_median(self):
        rows = "".join(
            f"        InitDeposit  ++++++   Sun Jun 22 14:00:0{i} 2025\n"
            f"                     TotalDeposit:   {ms}\n"
            for i, ms in enumerate([1000, 1000, 1000, 1000, 9000])
        )
        r = parse_times(rows)["deposit"]
        self.assertEqual(r["median"], 1000)
        self.assertEqual(r["slow_count"], 1)


ERRORS = """\
        Error:  1313 (WARNING)                  Tue Sep 16 11:07:17 2025
                Info:                           Recicladora atingiu a capacidade máxima (sensor r3)
                SubCodigo:                      0x0000
                Producto:                       H500
                Items Adm.:                     0x0400  (20E, )
                Items Dev.:                     0x0000

        Error:  1314 (     OK)                  Tue Sep 16 11:08:17 2025
                Info:                           Recicladora tem um nível de notas OK (sensor r3):
                SubCodigo:                      0x0000
                Producto:                       H500

        Error:  1313 (WARNING)                  Tue Sep 16 12:00:00 2025
                Info:                           Recicladora atingiu a capacidade máxima (sensor r3)

        Error:  1751 (WARNING)                  Sat Sep 20 00:16:17 2025
                Info:                           Warning na Reciclagem 1: Controle motor
                SubCodigo:                      0x0002

        Error:  1751 (     OK)                  Sat Sep 20 00:16:19 2025
                Info:                           Corrigido-Warning na Reciclagem 1: Controle motor
"""


class TestErrors(unittest.TestCase):
    def test_counts_and_episode_pairing(self):
        r = parse_errors(ERRORS)
        self.assertEqual(r["total_events"], 5)
        counts = {(row["code"], row["level"]): row["count"] for row in r["by_code"]}
        self.assertEqual(counts[(1313, "WARNING")], 2)
        self.assertEqual(counts[(1314, "OK")], 1)
        ep = {e["code"]: e for e in r["episodes"]}
        self.assertEqual(ep[1313]["count"], 1)          # 1313 -> 1314 fecha um episódio
        self.assertEqual(ep[1313]["total_s"], 60)
        self.assertEqual(ep[1751]["max_s"], 2.0)        # mesmo código fecha 1751
        self.assertEqual(r["still_open"], [1313])       # segundo 1313 ficou por resolver

    def test_event_fields(self):
        e = parse_errors(ERRORS)["events"][0]
        self.assertEqual(e["product"], "H500")
        self.assertIn("(20E", e["items_in"])
        self.assertEqual(e["ts"], "2025-09-16 11:07:17")


PAYMENTS = """\
     Gestor_paga_START                                   Wed Jul 30 12:13:55.484 2025
         (BuscarOrdenPagoH500=TRUE  status=4 APagar=4)
         Gestor_pagaH500_START                           Wed Jul 30 12:13:55.500 2025
             GestorH500_paga_START                       Wed Jul 30 12:13:55.515 2025
                 H500_paga_START                         Wed Jul 30 12:13:55.656 2025
                 H500_paga_END warning                   Wed Jul 30 12:13:59.062 2025
             GestorH500_paga_END                         Wed Jul 30 12:13:59.093 2025
     (ModificarOrdenPendientes=FALSE)
                 (BuscarOrdenPagoH500=TRUE  status=4 APagar=1)
                 H500_paga_START                         Wed Jul 30 12:20:00.000 2025
                 H500_paga_END ok                        Wed Jul 30 12:20:02.000 2025
Read Accounting after open/claim:
Error Read Accounting: C:\\Cashlogy\\Accounting.new            Sat Sep 20 08:39:41.320 2025
Constructor GestorAdminDev                                Wed Jan 17 10:52:07 2024
"""


ERRORS_PT = """        Error:  1075 (   ERRO)                  Thu Oct 02 10:11:58 2025
                Info:                           Máquina desligada
                SubCodigo:                      0x0000

        Error:  1110 (WARNING)                  Tue Oct 07 13:59:25 2025
                Info:                           Não existem moedas suficientes para realizar a devolução

        Error:  1110 (WARNING)                  Tue Oct 07 13:59:46 2025
                Info:                           Não existem moedas suficientes para realizar a devolução

        Error:  1014 (WARNING)                  Tue Sep 30 08:24:24 2025
                Info:                           Houve incompatibilidade na contabilidade de moedas
                SubCodigo:                      0x0004
                Descuadre:                      10716

        Error:  1014 (WARNING)                  Tue Jul 14 07:34:57 2026
                Info:                           Houve incompatibilidade na contabilidade de moedas
                Descuadre:                      -30

        Error:  1315 (WARNING)                  Tue Oct 14 08:53:59 2025
                Info:                           Corrigido-MANUTENÇÃO: Limpeza

        Error:  1751 (WARNING)                  Sat Sep 20 00:16:17 2025
                Info:                           Warning na Reciclagem 1: Controle motor

        Error:  1751 (WARNING)                  Sat Sep 20 00:16:19 2025
                Info:                           Corrigido-Warning na Reciclagem 1: Controle motor
"""


class TestErrorsPortugueseMachine(unittest.TestCase):
    def test_erro_level_is_normalised_and_reported(self):
        r = parse_errors(ERRORS_PT)
        levels = {(row["code"], row["level"]) for row in r["by_code"]}
        self.assertIn((1075, "ERROR"), levels)
        self.assertNotIn((1075, "ERRO"), levels)
        found = analyze_logs([("Opos_ResultCodeExtended.log", ERRORS_PT.encode("cp1252"))])["findings"]
        err = [f for f in found if f["severity"] == "error"]
        self.assertEqual(len(err), 1)
        self.assertIn("1075 ×1: Máquina desligada", err[0]["detail"])

    def test_one_shot_warnings_are_not_reported_as_unresolved(self):
        r = parse_errors(ERRORS_PT)
        # 1110 e 1014 nunca têm regresso a normal neste log -> não são "por resolver"
        self.assertEqual(r["still_open"], [])

    def test_corrigido_text_marks_resolution_even_at_warning_level(self):
        r = parse_errors(ERRORS_PT)
        ep = {e["code"]: e for e in r["episodes"]}
        self.assertEqual(ep[1751]["count"], 1)            # 1751 WARNING + 'Corrigido-' WARNING fecham o episódio
        self.assertEqual(ep[1751]["max_s"], 2.0)
        clear = {(e["code"], e["ts"]): e["clear"] for e in r["events"]}
        self.assertTrue(clear[(1315, "2025-10-14 08:53:59")])

    def test_descuadre_is_extracted(self):
        r = parse_errors(ERRORS_PT)
        self.assertEqual([m["value"] for m in r["accounting_mismatches"]], [10716, -30])
        found = analyze_logs([("Opos_ResultCodeExtended.log", ERRORS_PT.encode("cp1252"))])["findings"]
        self.assertTrue(any("Descuadre" in f["title"] and "-30" in f["detail"] for f in found))

    def test_closable_warning_left_open_is_reported(self):
        # 1313 tem resolução (1314) neste log e o último 1313 ficou por fechar
        self.assertEqual(parse_errors(ERRORS)["still_open"], [1313])


def _ev(code, level, when, info):
    return (f"        Error:  {code} ({level:>7})                  {when}\n"
            f"                Info:                           {info}\n\n")


class TestErrorEpisodes(unittest.TestCase):
    def test_ok_closes_most_recent_related_warning_not_a_stale_one(self):
        text = (
            _ev(1187, "WARNING", "Thu Oct 23 07:39:59 2025", "Nota à espera")   # nunca resolvido
            + _ev(1187, "WARNING", "Thu Oct 23 10:24:13 2025", "Nota à espera")  # nunca resolvido
            + _ev(1187, "WARNING", "Sun Nov 02 11:46:07 2025", "Nota à espera")
            + _ev(1188, "OK", "Sun Nov 02 11:46:08 2025", "Nota liberta")
        )
        ep = {e["code"]: e for e in parse_errors(text)["episodes"]}
        self.assertEqual(ep[1187]["count"], 1)
        self.assertEqual(ep[1187]["total_s"], 1)   # 1 s, não os ~10 dias desde o primeiro aviso

    def test_door_codes_close_with_plus_two(self):
        text = (
            _ev(1131, "ERRO", "Wed Oct 01 08:10:32 2025", "Porta de moedas está aberta")
            + _ev(1133, "OK", "Wed Oct 01 08:15:32 2025", "Porta de notas está fechado")       # fecha 1131 (+2)
            + _ev(1130, "WARNING", "Wed Oct 08 17:28:00 2025", "Porta de moedas está aberta")
            + _ev(1132, "OK", "Wed Oct 08 17:31:00 2025", "Porta de moedas está fechado")      # fecha 1130 (+2)
        )
        ep = {e["code"]: e for e in parse_errors(text)["episodes"]}
        self.assertEqual((ep[1131]["count"], ep[1131]["total_s"]), (1, 300))
        self.assertEqual((ep[1130]["count"], ep[1130]["total_s"]), (1, 180))

    def test_ok_does_not_close_unrelated_code(self):
        text = (_ev(1110, "WARNING", "Tue Oct 07 13:59:25 2025", "Sem moedas")
                + _ev(1313, "WARNING", "Tue Oct 07 14:00:00 2025", "Cheia")
                + _ev(1314, "OK", "Tue Oct 07 14:01:00 2025", "OK"))
        r = parse_errors(text)
        self.assertEqual([e["code"] for e in r["episodes"]], [1313])
        self.assertEqual(r["still_open"], [])   # 1110 nunca tem resolução neste log


class TestPayments(unittest.TestCase):
    def test_payment_results_and_durations(self):
        r = parse_payments(PAYMENTS)
        self.assertEqual(r["total"], 2)
        self.assertEqual(r["by_result"], {"warning": 1, "ok": 1})
        self.assertEqual(r["warnings"][0]["duration_ms"], 3406)
        self.assertEqual(r["warnings"][0]["apagar"], 4)
        self.assertEqual(r["duration_ms"]["max"], 3406)

    def test_gestor_wrapper_lines_are_not_counted(self):
        # GestorH500_paga_START/END e Gestor_pagaH500_* não são pagamentos H500
        self.assertEqual(parse_payments(PAYMENTS)["total"], 2)

    def test_accounting_errors_and_app_starts(self):
        r = parse_payments(PAYMENTS)
        self.assertEqual(r["accounting_read_errors"], 1)
        self.assertEqual(r["accounting_path"], "C:\\Cashlogy\\Accounting.new")
        self.assertEqual(r["app_starts"], 1)


VERSIONS = """\
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Wed Jan 17 10:52:08 2024
Versions  Information
     Initial::
     GENERAL::                 S.Number:     7028437     Date: 2023-03-28         Mechanical Rev.: 3A           Firmware Rev.: 1.0.0
                               IP:       192.168.1.2     MAC: 04-2B-58-0E-25-8F   ID TeamViewer: 1624574291     Windows Ver.: Windows 10,  build:19044;
     DLL::                     Exec:                     CashlogyEU-POS2023.dll
                               Name:                     CashlogyEU-POS2023
                               Version:                  1.11.7.89;
     HOPPER_Dir 3::            S.Number:     2537575     Ref:                     Frw.Version:  2.0
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Sat Dec 14 23:47:16 2024
Versions  Information
     Changes::
     DLL::                     (Previous)
                               Name:                     CashlogyEU-POS2023
                               Version:                  1.11.7.89;
                               (Change)
                               Name:                     CashlogyEU-POS2023
                               Version:                  1.11.7.94;
     H500::                    (Previous)
                               S.Number:       46027     Frw.Version:  RBH500 v03.00#08.20#09.00
                               (Change)
                               S.Number:       46027     Frw.Version:  RBH500 v04.00#09.00#09.00
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
"""


class TestVersions(unittest.TestCase):
    def test_device_uses_latest_value_not_previous(self):
        r = parse_versions(VERSIONS)
        d = r["device"]
        self.assertEqual(d["serial"], "7028437")
        self.assertEqual(d["mac"], "04-2B-58-0E-25-8F")
        self.assertEqual(d["dll_version"], "1.11.7.94")
        self.assertEqual(d["h500_firmware"], "RBH500 v04.00#09.00#09.00")

    def test_history_records_transitions(self):
        h = parse_versions(VERSIONS)["history"]
        self.assertEqual([e["kind"] for e in h], ["Initial", "Changes"])
        self.assertEqual(h[1]["changes"], [
            {"label": "DLL", "from": "1.11.7.89", "to": "1.11.7.94"},
            {"label": "Firmware H500", "from": "RBH500 v03.00#08.20#09.00", "to": "RBH500 v04.00#09.00#09.00"},
        ])
        self.assertNotIn("HOPPER_Dir 3", h[1]["sections"])


OPOS = """     DirectIO    ReadStatus
                 Fri Sep 19 22:29:36.000 2025
     DirectIO    ReadCashEmptyFullStatus <1:0,200:0;2000:22,STACKER:0>
                 Fri Sep 19 22:29:37.110 2025
     DirectIO    ReadCashEmptyFullStatus <1:0,200:0;2000:22,STACKER:0>
                 Fri Sep 19 22:30:00.000 2025
     DirectIO    ReadCashEmptyFullStatus <1:0,200:12;2000:21,STACKER:0>
                 Fri Sep 19 22:31:00.000 2025
     DirectIO    ReadCashEmptyFullStatus <1:0,200:0;2000:99,STACKER:0>
                 Fri Sep 19 22:32:00.000 2025
"""


class TestOpos(unittest.TestCase):
    def test_level_codes_and_transitions(self):
        r = parse_opos(OPOS)
        self.assertEqual(r["reads"], 4)
        by_key = {row["key"]: row for row in r["levels"]}
        self.assertEqual([row["key"] for row in r["levels"]], ["1", "200", "2000", "STACKER"])  # STACKER no fim
        self.assertEqual(by_key["2000"]["counts"], {"NEAR_FULL": 2, "FULL": 1, "CÓDIGO_99": 1})
        self.assertEqual(by_key["200"]["current"], "OK")
        self.assertEqual(by_key["200"]["changes"], 2)  # OK -> NEAR_EMPTY -> OK
        self.assertEqual(by_key["1"]["changes"], 0)
        first = [t for t in r["transitions"] if t["key"] == "2000"][0]
        self.assertEqual((first["from"], first["to"], first["ts"]), ("NEAR_FULL", "FULL", "2025-09-19 22:31:00"))

    def test_no_reads(self):
        r = parse_opos("     DirectIO    ReadStatus\n                 Fri Sep 19 22:29:36.000 2025\n")
        self.assertEqual((r["reads"], r["levels"], r["first"]), (0, [], None))

    def test_analyze_warns_when_off_normal_without_transactions(self):
        r = analyze_logs([("Opos_Cashlogy.log", OPOS.encode("cp1252"))])
        self.assertEqual([f["kind"] for f in r["files"]], ["opos"])
        titles = [f["title"] for f in r["findings"]]
        self.assertTrue(any("20 €" in t and "CÓDIGO_99" in t for t in titles), titles)


TRAN = '''"18/09/2026 07:23:35.740,IN: 1 of 0,05 €. 1 of 0,10 €. 5 of 0,20 €. 3 of 0,50 €. 5 of 1,00 €. 1 of 2,00 €."
"18/09/2026 07:24:01.060,OUT: 1 of 0,05 €. 1 of 0,10 €. 1 of 0,50 €. 4 of 1,00 €. 1 of 5,00 €."
"18/09/2026 07:24:01.090,BACKOFFICE - Dar troco - IN: 9,65 €"
"18/09/2026 07:24:01.100,BACKOFFICE - Dar troco - OUT: 9,65 €"
"18/09/2026 19:32:18.380,IN: 1 of 20,00 €."
"18/09/2026 19:32:22.380,OUT: 1 of 0,10 €. 1 of 10,00 €."
'''

COM = '''"18/09/2026 07:11:17.820,; Connector.Started()    ; (v2.5.0.136)"
"18/09/2026 07:13:22.860,; Connector.Started()    ; (v2.5.0.136)"
"18/09/2026 07:11:11.940,; Winsock.IsClose() - Response delayed!"
"18/09/2026 07:22:53.500,; Winsock.Event(ConnectionRequest, IP=127.0.0.1)"
"18/09/2026 07:22:53.770,#G#1#1#1#1#1#1#1#1#1#0#1#1#1# "
"18/09/2026 07:24:29.370,#0#546247#546247#965#965#0#0#"
"18/09/2026 17:02:12.090,#C#1#1#360#1#15360#0#0#0#1#0#0# "
"18/09/2026 17:02:19.020,#WR:CANCEL#0#0#0#0#"
"18/09/2026 19:32:00.140,#C#1#1#990#1#15360#0#0#0#1#0#0# "
"18/09/2026 19:32:22.410,#WR:LEVEL#2000#1010#0#0#"
'''


class TestConnectorLogs(unittest.TestCase):
    def test_detect_kinds(self):
        self.assertEqual(detect_kind("LogTran_20260918.txt"), "tran")
        self.assertEqual(detect_kind("LogCom_20260918.txt"), "com")
        self.assertEqual(detect_kind("LogUsr_20260918.txt"), "usr")
        r = analyze_logs([("LogIot_20260918.txt", b"x")])
        self.assertIn("Telemetria IoT", r["ignored"][0]["reason"])

    def test_tran_totals_do_not_double_count_backoffice(self):
        r = parse_tran(TRAN)
        self.assertEqual((r["summary"]["ins"], r["summary"]["outs"]), (2, 2))
        self.assertEqual((r["summary"]["in_total"], r["summary"]["out_total"]), (965 + 2000, 965 + 1010))
        self.assertEqual(r["summary"]["backoffice"], 2)  # linhas BACKOFFICE só anotam, não somam
        self.assertEqual(r["movements"][0]["counts"], {"5": 1, "10": 1, "20": 5, "50": 3, "100": 5, "200": 1})
        self.assertEqual(r["backoffice"][0], {"ts": "2026-09-18 07:24:01", "action": "Dar troco", "dir": "in", "amount": 965})

    def test_com_pairs_commands_and_decodes_charge_and_backoffice(self):
        r = parse_com(COM)
        s = r["summary"]
        self.assertEqual((s["charges"], s["cancelled"], s["not_matching"], s["level_warnings"]), (2, 1, 0, 1))
        self.assertEqual((s["connections"], s["delayed_responses"]), (1, 1))
        self.assertEqual(s["commands"], {"G": 1, "C": 2})
        self.assertEqual(len(r["starts"]), 2)
        self.assertEqual(r["starts"][0]["version"], "2.5.0.136")
        self.assertEqual(r["duration_ms"]["max"], 22270)   # a cancelada não conta para os tempos
        charge = [o for o in r["operations"] if o["kind"] == "charge" and not o["cancelled"]][0]
        self.assertEqual((charge["amount"], charge["introduced"], charge["returned"], charge["net"]), (990, 2000, 1010, 990))
        bo = [o for o in r["operations"] if o["kind"] == "backoffice"][0]
        self.assertEqual((bo["before"], bo["after"], bo["introduced"], bo["returned"]), (546247, 546247, 965, 965))

    def test_crosscheck_matches_when_logs_agree(self):
        r = analyze_logs([("LogTran_20260918.txt", TRAN.encode("cp1252")), ("LogCom_20260918.txt", COM.encode("cp1252"))])
        cc = r["com"]["crosscheck"]
        self.assertEqual((cc["checked"], cc["matched"], cc["mismatches"]), (3, 3, []))  # G, cancelada, cobrança
        self.assertNotIn("_moves", r["tran"])
        self.assertNotIn("_start", r["com"]["operations"][0])
        self.assertEqual([f for f in r["findings"] if f["severity"] == "error"], [])

    def test_crosscheck_detects_movement_that_connector_did_not_report(self):
        tran = TRAN.replace("1 of 10,00 €.", "1 of 5,00 €.")  # a máquina devolveu 5,10 € em vez de 10,10 €
        r = analyze_logs([("LogTran_20260918.txt", tran.encode("cp1252")), ("LogCom_20260918.txt", COM.encode("cp1252"))])
        mm = r["com"]["crosscheck"]["mismatches"]
        self.assertEqual(len(mm), 1)
        self.assertEqual((mm[0]["returned"], mm[0]["tran_out"]), (1010, 510))
        self.assertTrue(any("LogTran não coincide" in f["title"] for f in r["findings"] if f["severity"] == "error"))

    def test_charge_whose_net_differs_from_amount_is_flagged(self):
        com = COM.replace("#WR:LEVEL#2000#1010#0#0#", "#WR:LEVEL#2000#900#0#0#")  # líquido 11,00 € para cobrar 9,90 €
        r = parse_com(com)
        self.assertEqual(r["summary"]["not_matching"], 1)
        found = analyze_logs([("LogCom_20260918.txt", com.encode("cp1252"))])["findings"]
        self.assertTrue(any("entrou − devolvido" in f["title"] and f["severity"] == "error" for f in found))

    def test_error_responses_and_repeated_starts_are_reported(self):
        com = COM + '"18/09/2026 20:00:00.000,#C#1#1#500#1#15360#0#0#0#1#0#0# "\n"18/09/2026 20:00:05.000,#ER:GENERIC#0#0#0#0#"\n'
        r = parse_com(com)
        self.assertEqual(r["errors"], [{"ts": "2026-09-18 20:00:00", "cmd": "C", "code": "ER:GENERIC"}])
        titles = [f["title"] for f in analyze_logs([("LogCom_20260918.txt", com.encode("cp1252"))])["findings"]]
        self.assertTrue(any("erro do Connector" in t for t in titles))
        self.assertTrue(any("arrancou 2 vezes" in t for t in titles))


USR = '''"18/09/2026 07:11:17.870,Users.Initialize() - 'User accounts' disabled."
"18/09/2026 07:22:53.860,frmBackOffice._Load"
"18/09/2026 07:23:43.460,frmMsgBox._Load - Text=O valor introduzido tem que coincidir com o valor a devolver"
"18/09/2026 07:23:57.870,frmGiveChange.cmdAcceptReturn_Click - Items=1:0,2:0,5:1,10:1,20:0,50:1,100:4,200:0;500:1,1000:0,2000:0"
"18/09/2026 07:24:49.820,frmWithdrawCash.cmdWithdrawAll_Click - Items=1:0,2:0,5:0,10:0,20:0,50:0,100:0,200:0;500:0,1000:0,2000:25 - ToStacker=1"
"18/09/2026 07:25:58.380,frmWithdrawCash.cmdWithdrawAll_Click - Items=1:1,2:0,5:9,10:0,20:0,50:0,100:1,200:1;500:1,1000:0,2000:0 - ToStacker=0"
"18/09/2026 17:02:17.000,frmCharge.cmdCancel_Click"
"18/09/2026 17:02:18.000,frmCharge._Load"
"18/09/2026 17:02:19.000,frmCharge2._Load"
"18/09/2026 17:02:20.000,frmCharge.CloseForm()"
'''
TRAN_WITHDRAW = '"18/09/2026 07:26:01.640,OUT: 1 of 0,01 €. 9 of 0,05 €. 1 of 1,00 €. 1 of 2,00 €. 1 of 5,00 €."\n'


class TestOperatorLog(unittest.TestCase):
    def test_actions_and_summary_ignore_screen_noise(self):
        r = parse_usr(USR)
        s = r["summary"]
        self.assertEqual((s["charges"], s["cancels"], s["backoffice_sessions"], s["messages"], s["starts"]), (1, 1, 1, 1, 1))
        self.assertEqual((s["returned"], s["withdrawn"], s["to_stacker"]), (965, 846, 50000))
        kinds = [a["kind"] for a in r["actions"]]
        self.assertNotIn("close", kinds)               # frmCharge2 / CloseForm não geram ações
        self.assertEqual(kinds.count("charge"), 1)     # só frmCharge._Load, não frmCharge2._Load
        msg = [a for a in r["actions"] if a["kind"] == "message"][0]
        self.assertTrue(msg["detail"].startswith("O valor introduzido"))
        stack = [a for a in r["actions"] if a["kind"] == "withdraw_all" and a["to_stacker"]][0]
        self.assertEqual((stack["items"], stack["amount"], stack["label"]), ({"2000": 25}, 50000, "Retirar tudo para o stacker"))

    def test_withdraw_without_items_is_ignored(self):
        r = parse_usr('"18/09/2026 07:25:58.380,frmWithdrawCash.cmdWithdrawAll_Click"\n')
        self.assertEqual(r["actions"], [])

    def test_crosscheck_with_tran_when_denominations_agree(self):
        tran = TRAN + TRAN_WITHDRAW
        r = analyze_logs([("LogUsr_20260918.txt", USR.encode("cp1252")), ("LogTran_20260918.txt", tran.encode("cp1252"))])
        cc = r["usr"]["crosscheck"]
        self.assertEqual((cc["checked"], cc["matched"], cc["mismatches"]), (2, 2, []))  # devolução + retirada
        stack = [a for a in r["usr"]["actions"] if a.get("to_stacker")][0]
        self.assertIsNone(stack["tran_match"])          # para o stacker: não se verifica
        self.assertNotIn("_items", r["usr"]["actions"][0])
        self.assertEqual([f for f in r["findings"] if f["severity"] == "error"], [])

    def test_crosscheck_flags_withdrawal_without_matching_output(self):
        r = analyze_logs([("LogUsr_20260918.txt", USR.encode("cp1252")), ("LogTran_20260918.txt", TRAN.encode("cp1252"))])
        mm = r["usr"]["crosscheck"]["mismatches"]
        self.assertEqual([(m["label"], m["amount"]) for m in mm], [("Retirar tudo", 846)])
        self.assertTrue(any("sem saída correspondente" in f["title"] for f in r["findings"] if f["severity"] == "error"))

    def test_findings_are_factual(self):
        found = analyze_logs([("LogUsr_20260918.txt", USR.encode("cp1252"))])["findings"]
        titles = " | ".join(f["title"] for f in found)
        self.assertIn("1 mensagem(ns) mostrada(s) ao operador", titles)
        self.assertIn("500.00 € retirados para o stacker", titles)
        self.assertIn("1 cobrança(s) cancelada(s) no ecrã", titles)


def _files_for_investigation(tran=TRAN, com=COM, usr=USR, errors=ERRORS):
    return [("LogTran_20260918.txt", tran.encode("cp1252")), ("LogCom_20260918.txt", com.encode("cp1252")),
            ("LogUsr_20260918.txt", usr.encode("cp1252")), ("Opos_ResultCodeExtended.log", errors.encode("cp1252"))]


class TestInvestigate(unittest.TestCase):
    def test_timeline_merges_sources_in_time_order_and_filters_the_window(self):
        r = investigate(_files_for_investigation(), datetime(2026, 9, 18, 19, 32, 10), 2, 2)
        stamps = [e["ts"] for e in r["events"]]
        self.assertEqual(stamps, sorted(stamps))
        # às 19:32 só há LogCom e LogTran; o LogUsr de exemplo não tem ações a essa hora e os erros são de 2025
        self.assertEqual({e["source"] for e in r["events"]}, {"com", "tran"})
        titles = [e["title"] for e in r["events"]]
        self.assertTrue(any(t.startswith("Cobrança 9,90") for t in titles))
        self.assertIn("Entrada 20,00 €", titles)
        self.assertIn("Saída 10,10 €", titles)
        # eventos de outras horas ficam de fora (arranques do Connector às 07:11, cobrança cancelada às 17:02)
        self.assertFalse(any("arrancou" in t for t in titles))
        self.assertFalse(any(e["ts"].startswith("2026-09-18 17:02") for e in r["events"]))
        self.assertEqual(r["window"]["start"], "2026-09-18 19:30:10")

    def test_charge_event_shows_amounts_and_logtran_agreement(self):
        r = investigate(_files_for_investigation(), datetime(2026, 9, 18, 19, 32, 10), 2, 2)
        charge = [e for e in r["events"] if e["title"].startswith("Cobrança")][0]
        self.assertIn("introduzido 20,00 €", charge["detail"])
        self.assertIn("devolvido 10,10 €", charge["detail"])
        self.assertEqual(charge["severity"], "info")

    def test_mismatch_between_connector_and_logtran_is_a_highlight(self):
        tran = TRAN.replace("1 of 10,00 €.", "1 of 5,00 €.")  # a máquina devolveu 5,10 € em vez de 10,10 €
        r = investigate(_files_for_investigation(tran=tran), datetime(2026, 9, 18, 19, 32, 10), 2, 2)
        self.assertEqual(r["summary"]["errors"], 1)
        h = r["highlights"][0]
        self.assertEqual((h["severity"], h["source"]), ("error", "com"))
        self.assertIn("LogTran: entrou 20,00 € / saiu 5,10 €", h["detail"])

    def test_repeated_warnings_are_grouped_in_highlights(self):
        errors = "".join(_ev(1168, "WARNING", f"Fri Sep 18 19:32:{s:02d} 2026", "Moeda rejeitada porque não está programado")
                         for s in range(10, 16))
        r = investigate(_files_for_investigation(errors=errors), datetime(2026, 9, 18, 19, 32, 12), 1, 1)
        group = [h for h in r["highlights"] if h["source"] == "errors"]
        self.assertEqual(len(group), 1)
        self.assertEqual(group[0]["count"], 6)
        self.assertEqual(sum(1 for e in r["events"] if e["source"] == "errors"), 6)  # a linha do tempo mantém todos

    def test_file_relation_does_not_claim_coverage_it_cannot_know(self):
        r = investigate(_files_for_investigation(), datetime(2026, 9, 18, 19, 32, 10), 2, 2)
        rel = {c["kind"]: c["relation"] for c in r["coverage"]}
        self.assertEqual(rel["errors"], "before")      # último evento (20/09/2025) é anterior ao intervalo
        self.assertEqual(rel["com"], "overlap")
        self.assertNotIn("none", rel.values())         # nunca se afirma "sem cobertura"

    def test_window_without_events_reports_quiet_sources(self):
        r = investigate(_files_for_investigation(), datetime(2026, 9, 18, 15, 0, 0), 1, 1)
        self.assertEqual(r["events"], [])
        self.assertIn("LogCom", r["quiet_sources"])    # o ficheiro tem registos à volta, mas nada neste minuto

    def test_context_uses_last_known_levels_and_devices(self):
        tx = tx_block("Fri Sep 18 19:00:00 2026", "Fri Sep 18 19:00:05 2026", ("200:5", "500:0"), DEPOSIT_OPS, ("200:7", "500:0"))
        files = [("Transactions_Cashlogy.log", tx.encode("cp1252"))]
        r = investigate(files, datetime(2026, 9, 18, 19, 5, 0), 10, 10)
        self.assertTrue(any("500" in c or "5 €" in c for c in r["context"]), r["context"])

    def test_result_is_json_serialisable_and_leaks_no_internal_fields(self):
        import json
        r = investigate(_files_for_investigation(), datetime(2026, 9, 18, 19, 32, 10), 2, 2)
        text = json.dumps(r)
        self.assertNotIn('"_', text)
        a = json.dumps(analyze_logs(_files_for_investigation()))
        self.assertNotIn('"_events"', a)
    def test_explanation_and_client_report_for_successful_charge(self):
        r = investigate(_files_for_investigation(), datetime(2026, 9, 18, 19, 32, 10), 2, 2)
        exp = r.get("explanation")
        self.assertIsNotNone(exp)
        self.assertEqual(exp["status"], "success")
        self.assertIn("Cobrança de 9,90 € concluída com sucesso", exp["headline"])
        self.assertEqual(exp["financial"]["paid"], "20,00 €")
        self.assertEqual(exp["financial"]["returned"], "10,10 €")
        self.assertEqual(exp["financial"]["difference"], "0,00 €")
        self.assertTrue(len(exp["story"]) > 0)
        self.assertIn("client_report", exp)
        self.assertIn("9,90 €", exp["client_report"]["summary"])

    def test_explanation_and_client_report_for_short_change(self):
        tran = TRAN.replace("1 of 10,00 €.", "1 of 5,00 €.")  # saíram 5,10 € em vez de 10,10 €
        r = investigate(_files_for_investigation(tran=tran), datetime(2026, 9, 18, 19, 32, 10), 2, 2)
        exp = r.get("explanation")
        self.assertIsNotNone(exp)
        self.assertEqual(exp["status"], "danger")
        self.assertIn("Troco incompleto", exp["headline"])
        self.assertIn("5,00 €", exp["headline"])
        self.assertEqual(exp["financial"]["difference"], "-5,00 €")
        self.assertEqual(exp["client_report"]["suggested_settlement"], "dinheiro_manual")
        self.assertTrue(any("em falta 5,00 €" in s for s in exp["story"]))

    def test_explanation_for_cancelled_charge(self):
        # Às 17:02:12 foi cancelada uma cobrança de 3,60 € (COM)
        r = investigate(_files_for_investigation(), datetime(2026, 9, 18, 17, 2, 15), 1, 1)
        exp = r.get("explanation")
        self.assertIsNotNone(exp)
        self.assertEqual(exp["status"], "warning")
        self.assertIn("cancelada", exp["headline"].lower())

    def test_explanation_for_unable_to_pay_without_logcom(self):
        r = investigate([("LogErr_20260918.txt", LOGERR.encode("cp1252")), ("LogTran_20260918.txt", TRAN.encode("cp1252"))],
                        datetime(2026, 9, 18, 20, 40, 17), 3, 2)
        exp = r.get("explanation")
        self.assertIsNotNone(exp)
        self.assertEqual(exp["status"], "danger")
        self.assertIn("0,04 €", exp["headline"])
        self.assertEqual(exp["financial"]["difference"], "-0,04 €")



def _charge(start, end, amount, cancelled=False):
    return {"start": start, "end": end, "amount": amount, "net": amount, "cancelled": cancelled, "ok": True, "result": "0"}


def _sale(dt, total, code=1, numero=1, anulado=0, pay_dt=None):
    return {"id": numero, "doc": "FR        ", "serie": "A", "numero": numero, "datahora": dt, "datapag": pay_dt,
            "total": Decimal(total), "anulado": anulado, "pagamento": code, "idcx": 1, "emp": 1, "mesa": 0}


D = datetime
W_START, W_END = D(2026, 9, 18, 19, 15, 0), D(2026, 9, 18, 20, 15, 0)


class TestSalesCrossCheck(unittest.TestCase):
    def test_matching_sale_and_charge_is_reported_and_infers_cash_code(self):
        rows = [_sale(D(2026, 9, 18, 19, 32, 25), "9.90", code=3, numero=101)]
        charges = [_charge(D(2026, 9, 18, 19, 32, 0), D(2026, 9, 18, 19, 32, 22), 990)]
        m = match_sales(rows, charges, W_START, W_END)
        self.assertEqual(m["summary"]["cash_codes"], [3])
        self.assertEqual(m["summary"]["matched"], 1)
        e = m["events"][0]
        self.assertEqual((e["severity"], e["title"]), ("info", "Venda FR A/101 9,90 €"))
        self.assertIn("coincide com a cobrança Cashlogy das 19:32:00", e["detail"])

    def test_value_mismatch_on_cash_code_is_an_error(self):
        rows = [_sale(D(2026, 9, 18, 19, 20, 10), "4.50", numero=1),          # ok: define o código 1 como dinheiro
                _sale(D(2026, 9, 18, 19, 45, 10), "12.00", numero=2)]         # POS: 12,00 €, Cashlogy cobrou 10,20 €
        charges = [_charge(D(2026, 9, 18, 19, 19, 40), D(2026, 9, 18, 19, 20, 5), 450),
                   _charge(D(2026, 9, 18, 19, 44, 40), D(2026, 9, 18, 19, 44, 58), 1020)]
        m = match_sales(rows, charges, W_START, W_END)
        err = [e for e in m["events"] if e["severity"] == "error"]
        self.assertEqual(len(err), 1)
        self.assertIn("venda FR A/2 12,00 € vs cobrança Cashlogy 10,20 €", err[0]["title"])
        self.assertIn("diferença +1,80 €", err[0]["detail"])
        self.assertIn("possível", err[0]["detail"])

    def test_card_sale_is_not_flagged(self):
        rows = [_sale(D(2026, 9, 18, 19, 20, 10), "4.50", code=1, numero=1),
                _sale(D(2026, 9, 18, 19, 50, 0), "30.00", code=2, numero=2)]   # cartão: nunca passa pelo Cashlogy
        charges = [_charge(D(2026, 9, 18, 19, 19, 40), D(2026, 9, 18, 19, 20, 5), 450)]
        m = match_sales(rows, charges, W_START, W_END)
        self.assertEqual([e for e in m["events"] if e["severity"] in ("error", "warning")], [])
        self.assertTrue(any(e["title"].startswith("Venda FR A/2 30,00") for e in m["events"]))

    def test_unmatched_cash_sale_and_unmatched_charge_are_warnings(self):
        rows = [_sale(D(2026, 9, 18, 19, 20, 10), "4.50", numero=1), _sale(D(2026, 9, 18, 20, 0, 0), "8.00", numero=2)]
        charges = [_charge(D(2026, 9, 18, 19, 19, 40), D(2026, 9, 18, 19, 20, 5), 450),
                   _charge(D(2026, 9, 18, 20, 10, 0), D(2026, 9, 18, 20, 10, 20), 300)]
        titles = [e["title"] for e in match_sales(rows, charges, W_START, W_END)["events"] if e["severity"] == "warning"]
        self.assertIn("Venda FR A/2 8,00 € sem cobrança Cashlogy correspondente", titles)
        self.assertIn("Cobrança Cashlogy 3,00 € sem venda correspondente", titles)

    def test_without_any_match_nothing_is_flagged_and_note_explains(self):
        rows = [_sale(D(2026, 9, 18, 19, 45, 10), "12.00")]
        charges = [_charge(D(2026, 9, 18, 19, 44, 40), D(2026, 9, 18, 19, 44, 58), 1020)]
        m = match_sales(rows, charges, W_START, W_END)
        self.assertEqual(m["summary"]["cash_codes"], [])
        self.assertIn("não foi possível identificar o código de pagamento", m["summary"]["note"])
        self.assertEqual([e for e in m["events"] if e["severity"] == "error"], [])

    def test_cancelled_charges_and_documents(self):
        rows = [_sale(D(2026, 9, 18, 19, 30, 0), "5.00", anulado=1)]
        charges = [_charge(D(2026, 9, 18, 19, 29, 0), D(2026, 9, 18, 19, 29, 30), 500, cancelled=True)]
        m = match_sales(rows, charges, W_START, W_END)
        self.assertEqual([e["title"] for e in m["events"]], ["Documento anulado FR A/1 5,00 €"])

    def test_only_events_inside_the_window_are_emitted(self):
        rows = [_sale(D(2026, 9, 18, 17, 0, 0), "4.50", numero=1)]
        charges = [_charge(D(2026, 9, 18, 16, 59, 40), D(2026, 9, 18, 17, 0, 5), 450)]
        self.assertEqual(match_sales(rows, charges, W_START, W_END)["events"], [])

    def test_datapag_is_only_the_accounting_date_and_is_ignored(self):
        # como nas vendas reais: datapag = data contabilística (00:00 do dia), não a hora do pagamento
        rows = [_sale(D(2026, 9, 18, 19, 32, 25), "9.90", pay_dt=D(2026, 9, 18, 0, 0, 0))]
        charges = [_charge(D(2026, 9, 18, 19, 32, 0), D(2026, 9, 18, 19, 32, 22), 990)]
        m = match_sales(rows, charges, W_START, W_END)
        self.assertEqual(m["summary"]["matched"], 1)
        self.assertEqual(m["events"][0]["dt"], D(2026, 9, 18, 19, 32, 25))   # na hora do documento, não à meia-noite


class TestRealShapedSales(unittest.TestCase):
    """Vendas reais (FS/FT) pagas SEM o Cashlogy ligado: não pode haver alarmes."""

    ROWS = [  # (hora, total, pagamento, numero)
        (D(2026, 9, 19, 0, 45, 25), "14.70", 1, 1), (D(2026, 9, 19, 0, 45, 33), "44.50", 1, 2),
        (D(2026, 9, 19, 0, 45, 39), "8.60", 3, 1), (D(2026, 9, 19, 0, 45, 53), "12.30", 3, 2),
        (D(2026, 9, 19, 0, 45, 58), "15.60", 1, 3),
    ]

    def _rows(self):
        return [{**_sale(dt, total, code=code, numero=n), "serie": "7A2601", "datapag": D(2026, 9, 18, 0, 0, 0)}
                for dt, total, code, n in self.ROWS]

    def test_sales_without_cashlogy_are_listed_and_never_flagged(self):
        m = match_sales(self._rows(), [], D(2026, 9, 19, 0, 40, 0), D(2026, 9, 19, 0, 50, 0))
        self.assertEqual(len(m["events"]), 5)
        self.assertEqual({e["severity"] for e in m["events"]}, {"info"})
        self.assertEqual(m["summary"]["cash_codes"], [])
        self.assertIn("não foi possível identificar o código de pagamento", m["summary"]["note"])
        self.assertEqual(m["events"][0]["title"], "Venda FR 7A2601/1 14,70 €")

    def test_sales_outside_the_window_are_left_out(self):
        m = match_sales(self._rows(), [], D(2026, 9, 19, 0, 45, 30), D(2026, 9, 19, 0, 45, 40))
        self.assertEqual([e["title"] for e in m["events"]], ["Venda FR 7A2601/2 44,50 €", "Venda FR 7A2601/1 8,60 €"])


class _FakeCursor:
    def __init__(self, rows=None, boom=None):
        self.rows, self.boom, self.sql, self.params = rows or [], boom, None, ()
        self.description = [(c,) for c in ("id", "doc", "serie", "numero", "datahora", "datapag", "total", "anulado", "pagamento", "idcx", "emp", "mesa")]

    def execute(self, sql, *params):
        if self.boom:
            raise self.boom
        self.sql, self.params = sql, params

    def fetchall(self):
        return self.rows


class _FakeConn:
    def __init__(self, cursor):
        self.cur, self.rolled_back, self.closed = cursor, False, False

    def cursor(self):
        return self.cur

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


class TestFetchSales(unittest.TestCase):
    def test_query_is_read_only_parameterised_and_connection_is_released(self):
        cur = _FakeCursor(rows=[(1, "FR", "A", 7, D(2026, 9, 18, 19, 32), None, Decimal("9.90"), 0, 3, 1, 1, 0)])
        conn = _FakeConn(cur)
        r = fetch_sales(lambda: conn, W_START, W_END)
        self.assertTrue(r["available"])
        self.assertEqual(r["rows"][0]["numero"], 7)
        self.assertTrue(cur.sql.lstrip().upper().startswith("SELECT"))
        for word in ("INSERT", "UPDATE", "DELETE", "DROP", "EXEC", "MERGE"):
            self.assertNotIn(word, cur.sql.upper())
        self.assertNotIn("2026", cur.sql)                 # datas só como parâmetros
        self.assertEqual(cur.params[0], W_START - timedelta(hours=2))
        self.assertTrue(conn.rolled_back and conn.closed)

    def test_connection_failure_is_reported_not_raised(self):
        def boom():
            raise RuntimeError("servidor inacessível")
        r = fetch_sales(boom, W_START, W_END)
        self.assertFalse(r["available"])
        self.assertIn("servidor inacessível", r["reason"])

    def test_query_failure_still_closes_connection(self):
        conn = _FakeConn(_FakeCursor(boom=RuntimeError("coluna inválida 'datapag'")))
        r = fetch_sales(lambda: conn, W_START, W_END)
        self.assertFalse(r["available"])
        self.assertIn("datapag", r["reason"])
        self.assertTrue(conn.closed)


class TestInvestigateWithSales(unittest.TestCase):
    WHEN = datetime(2026, 9, 18, 19, 32, 10)

    def _fetcher(self, rows):
        return lambda start, end: {"available": True, "reason": None, "rows": rows, "truncated": False}

    def test_sale_appears_in_timeline_and_matches_the_charge(self):
        rows = [_sale(D(2026, 9, 18, 17, 2, 40), "3.60", code=1, numero=1),   # define o código 1 como dinheiro
                _sale(D(2026, 9, 18, 19, 32, 25), "9.90", code=1, numero=2)]
        retry = ('"18/09/2026 17:02:29.980,#C#1#1#360#1#15360#0#0#0#1#0#0# "\n'
                 '"18/09/2026 17:02:37.490,#WR:LEVEL#500#140#0#0#"\n')
        r = investigate(_files_for_investigation(com=COM + retry), self.WHEN, 2, 2, sales_fetcher=self._fetcher(rows))
        self.assertTrue(r["sales"]["available"])
        self.assertEqual(r["sales"]["cash_codes"], [1])
        sale = [e for e in r["events"] if e["source"] == "sales"]
        self.assertEqual([e["title"] for e in sale], ["Venda FR A/2 9,90 €"])
        stamps = [e["ts"] for e in r["events"]]
        self.assertEqual(stamps, sorted(stamps))

    def test_wrong_amount_in_pos_becomes_a_highlight(self):
        rows = [_sale(D(2026, 9, 18, 17, 2, 40), "3.60", code=1, numero=1),
                _sale(D(2026, 9, 18, 19, 32, 25), "10.90", code=1, numero=2)]   # POS registou 10,90 €, Cashlogy cobrou 9,90 €
        retry = ('"18/09/2026 17:02:29.980,#C#1#1#360#1#15360#0#0#0#1#0#0# "\n'
                 '"18/09/2026 17:02:37.490,#WR:LEVEL#500#140#0#0#"\n')   # cobrança concluída (a do fixture é a cancelada)
        r = investigate(_files_for_investigation(com=COM + retry), self.WHEN, 2, 2, sales_fetcher=self._fetcher(rows))
        h = [x for x in r["highlights"] if x["source"] == "sales"]
        self.assertEqual(len(h), 1)
        self.assertEqual(h[0]["severity"], "error")
        self.assertIn("venda FR A/2 10,90 € vs cobrança Cashlogy 9,90 €", h[0]["title"])

    def test_unavailable_database_is_reported_and_timeline_still_works(self):
        fetch = lambda s, e: {"available": False, "reason": "Sem ligação à base de dados: x", "rows": [], "truncated": False}
        r = investigate(_files_for_investigation(), self.WHEN, 2, 2, sales_fetcher=fetch)
        self.assertFalse(r["sales"]["available"])
        self.assertIn("Sem ligação", r["sales"]["reason"])
        self.assertTrue(any(e["source"] == "com" for e in r["events"]))

    def test_without_logcom_sales_are_shown_with_explanatory_note(self):
        rows = [_sale(D(2026, 9, 18, 19, 32, 25), "9.90")]
        files = [("LogTran_20260918.txt", TRAN.encode("cp1252"))]
        r = investigate(files, self.WHEN, 2, 2, sales_fetcher=self._fetcher(rows))
        self.assertIn("LogCom", r["sales"]["note"])
        self.assertEqual(len([e for e in r["events"] if e["source"] == "sales"]), 1)

    def test_sales_key_is_none_when_not_requested_and_json_safe(self):
        import json
        r = investigate(_files_for_investigation(), self.WHEN, 2, 2)
        self.assertIsNone(r["sales"])
        json.dumps(investigate(_files_for_investigation(), self.WHEN, 2, 2,
                               sales_fetcher=self._fetcher([_sale(D(2026, 9, 18, 19, 32, 25), "9.90")])))


LOGERR = '''"18/09/2026 09:12:51,6320,Warning (6320) - 18/09/2026 09:12:51 - ReciclagemNotas - Nota à espera de ser retirada da boca de entrada "
"18/09/2026 09:12:59,6321,OK (6321) - 18/09/2026 09:12:59 - ReciclagemNotas - Nota liberta da boca de entrada "
"18/09/2026 15:40:15,7310,Erro (7310) - 18/09/2026 15:40:15 - ReciclagemNotas - Erro na Leitura: Sensores da entrada unidade - DepositAffectedItems: ;500,1000 - DispenseAffectedItems: ;500 "
"18/09/2026 15:45:18,7310,OK (7310) - 18/09/2026 15:45:18 - ReciclagemNotas - Corrigido-Erro na Leitura: Sensores da entrada unidade "
"18/09/2026 20:38:56,8523,Warning (8523) - 18/09/2026 20:38:56 - Devolvedor_2c - Registado vão no devolvedor (Devolvedor_2c) - DispenseAffectedItems: 2 "
"18/09/2026 20:39:09,6120,Warning (6120) - 18/09/2026 20:39:09 - Estado - Não existem moedas suficientes para realizar a devolução - DispenseAffectedItems: 2 "
"18/09/2026 20:40:17.430,0000,Error - 18/09/2026 20:40:17 - INCAPAZ DE PAGAR 0,04 €"
"18/09/2026 20:41:28,6131,Warning (6131) - 18/09/2026 20:41:28 - ReciclagemNotas - Possível incompatibilidade na contabilidade por nota preso - Admissão (n=1) - DepositAffectedItems: ;1000 "
'''


class TestLogErr(unittest.TestCase):
    def test_lines_are_parsed_including_the_one_without_code_or_module(self):
        r = parse_logerr(LOGERR)
        self.assertEqual(r["total_events"], 8)
        by = {(c["code"], c["level"]): c for c in r["by_code"]}
        self.assertIn((7310, "ERROR"), by)                       # 'Erro' (pt) normalizado
        self.assertEqual(by[(0, "ERROR")]["info"], "INCAPAZ DE PAGAR 0,04 €")
        ev = {e["code"]: e for e in r["events"]}
        self.assertEqual((ev[6131]["product"], ev[6131]["items_in"]), ("ReciclagemNotas", "10 €"))   # ';1000' = nota de 10 €
        self.assertEqual((ev[8523]["product"], ev[8523]["items_out"]), ("Devolvedor_2c", "2 c"))
        self.assertEqual(ev[0]["product"], "")

    def test_episodes_pair_warning_with_next_code_or_corrigido(self):
        ep = {e["code"]: e for e in parse_logerr(LOGERR)["episodes"]}
        self.assertEqual(ep[6320]["total_s"], 8)                  # 6320 -> 6321
        self.assertEqual(ep[7310]["total_s"], 303)                # 7310 erro -> 7310 'Corrigido-...'

    def test_unable_to_pay_and_hardware_errors_become_findings(self):
        found = analyze_logs([("LogErr_20260918.txt", LOGERR.encode("cp1252"))])["findings"]
        titles = {f["title"]: f for f in found}
        unable = titles["A máquina não conseguiu pagar o troco 1 vez(es) (LogErr)"]
        self.assertEqual(unable["severity"], "error")
        self.assertIn("INCAPAZ DE PAGAR 0,04 €", unable["detail"])
        hw = titles["1 erro(s) de hardware em 1 código(s) (LogErr)"]     # o código 0 não conta como código de hardware
        self.assertIn("7310", hw["detail"])

    def test_investigation_shows_the_chain_around_the_unable_to_pay_event(self):
        r = investigate([("LogErr_20260918.txt", LOGERR.encode("cp1252")), ("LogTran_20260918.txt", TRAN.encode("cp1252"))],
                        datetime(2026, 9, 18, 20, 40, 17), 3, 2)
        titles = [e["title"] for e in r["events"] if e["source"] == "logerr"]
        self.assertEqual(titles[0], "8523 Registado vão no devolvedor (Devolvedor_2c)")
        self.assertIn("INCAPAZ DE PAGAR 0,04 €", titles)
        self.assertEqual(r["highlights"][0]["title"], "INCAPAZ DE PAGAR 0,04 €")
        self.assertEqual(r["highlights"][0]["severity"], "error")
        first = [e for e in r["events"] if e["source"] == "logerr"][0]
        self.assertIn("dispensa 2 c", first["detail"])
        self.assertEqual([e["ts"] for e in r["events"]], sorted(e["ts"] for e in r["events"]))


class TestSeveralFilesOfTheSameKind(unittest.TestCase):
    """Um ficheiro por dia (LogTran_20260917 + LogTran_20260918): antes só ficava o último."""

    DAY17 = TRAN.replace("18/09/2026", "17/09/2026")

    def _files(self):
        return [("LogTran_20260918.txt", TRAN.encode("cp1252")), ("LogTran_20260917.txt", self.DAY17.encode("cp1252"))]

    def test_all_days_are_analysed_together(self):
        r = analyze_logs(self._files())
        self.assertEqual(r["tran"]["summary"]["ins"], 4)             # 2 entradas por dia
        self.assertEqual(r["period"], {"start": "2026-09-17 07:23:35", "end": "2026-09-18 19:32:22"})

    def test_each_file_keeps_its_own_period(self):
        rows = {f["name"]: (f["start"][:10], f["end"][:10]) for f in analyze_logs(self._files())["files"]}
        self.assertEqual(rows["LogTran_20260917.txt"], ("2026-09-17", "2026-09-17"))
        self.assertEqual(rows["LogTran_20260918.txt"], ("2026-09-18", "2026-09-18"))

    def test_investigating_the_older_day_finds_its_events(self):
        r = investigate(self._files(), datetime(2026, 9, 17, 19, 32, 10), 2, 2)
        self.assertEqual([e["title"] for e in r["events"]], ["Entrada 20,00 €", "Saída 10,10 €"])
        rel = {c["name"]: c["relation"] for c in r["coverage"]}
        self.assertEqual(rel["LogTran_20260917.txt"], "overlap")
        self.assertEqual(rel["LogTran_20260918.txt"], "after")

    def test_order_of_upload_does_not_matter(self):
        a = analyze_logs(self._files())["tran"]["summary"]
        b = analyze_logs(list(reversed(self._files())))["tran"]["summary"]
        self.assertEqual(a, b)


class TestAnalyze(unittest.TestCase):
    def test_aggregates_files_period_findings(self):
        tx = tx_block(T1, T2, ("200:5", "500:0"), DEPOSIT_OPS, ("200:6", "500:0")).encode("cp1252")
        r = analyze_logs([
            ("Transactions_Cashlogy.log", tx),
            ("Opos_ResultCodeExtended.log", ERRORS.encode("cp1252")),
            ("7028437-46027-Sensores_H500.log", b"x"),
        ])
        self.assertEqual({f["kind"] for f in r["files"]}, {"transactions", "errors"})
        self.assertEqual(len(r["ignored"]), 1)
        self.assertEqual(r["period"]["start"], "2025-09-15 13:43:53")
        self.assertEqual(r["period"]["end"], "2025-09-20 00:16:19")
        titles = [f["title"] for f in r["findings"]]
        self.assertTrue(any("não reconcilia" in t for t in titles))
        self.assertEqual(r["findings"][0]["severity"], "error")  # erros primeiro
        self.assertNotIn("_timestamps", r["transactions"])

    def test_empty_input(self):
        r = analyze_logs([])
        self.assertEqual(r["files"], [])
        self.assertIsNone(r["period"]["start"])
        self.assertEqual(r["findings"], [])


class TestIncidentInvestigation(unittest.TestCase):
    def test_investigate_add_change_command(self):
        # LogCom com comando #A# (adicionar troco) no qual foram inseridos 10,00 € (1000 cêntimos)
        com_log = (
            '"18/09/2026 15:30:00.100,; Connector.Started()    ; (v2.5.0.136)"\n'
            '"18/09/2026 15:30:05.200,#A#1#1#1#1#1#1#1#1#1#0#1#1#1# "\n'
            '"18/09/2026 15:30:25.400,#0#1000#"\n'
        )
        r = investigate([("LogCom_20260918.txt", com_log.encode("cp1252"))], datetime(2026, 9, 18, 15, 30, 20), 5, 5)
        exp = r["explanation"]
        self.assertIsNotNone(exp)
        self.assertEqual(exp["status"], "danger")
        self.assertIn("10,00 €", exp["headline"])
        self.assertIn("Adicionar Trocos", exp["headline"])
        fin = exp["financial"]
        self.assertTrue(fin["has_values"])
        self.assertEqual(fin["paid"], "10,00 €")
        self.assertEqual(fin["returned"], "0,00 €")
        self.assertEqual(fin["difference"], "-10,00 €")
        self.assertEqual(fin["difference_raw"], -1000)
        self.assertIn("Adicionar Trocos", exp["cause"])
        self.assertIn("stock", exp["cause"].lower())
        self.assertEqual(exp["client_report"]["suggested_settlement"], "dinheiro_manual")
        self.assertIn("10,00 €", exp["client_report"]["summary"])

    def test_investigate_add_change_screen_with_tran(self):
        # LogTran com entrada física de 10 € e LogUsr com ecrã de Adicionar Troco aberto
        tran_log = '"18/09/2026 16:15:10.120,IN: 1 of 10,00 €."\n'
        usr_log = '"18/09/2026 16:15:02.050,frmAddChange_Load"\n'
        r = investigate([
            ("LogTran_20260918.txt", tran_log.encode("cp1252")),
            ("LogUsr_20260918.txt", usr_log.encode("cp1252")),
        ], datetime(2026, 9, 18, 16, 15, 10), 3, 3)
        exp = r["explanation"]
        self.assertEqual(exp["status"], "danger")
        self.assertIn("10,00 €", exp["headline"])
        self.assertIn("Adicionar Trocos", exp["headline"])
        self.assertEqual(exp["financial"]["paid"], "10,00 €")
        self.assertEqual(exp["financial"]["returned"], "0,00 €")
        self.assertEqual(exp["financial"]["difference"], "-10,00 €")
        self.assertTrue(any("Adicionar Troco" in s for s in exp["story"]))

    def test_investigate_regular_charge_not_confused(self):
        # Cobrança regular de 3,60 € cancelada
        r = investigate([("LogCom_20260918.txt", COM.encode("cp1252"))], datetime(2026, 9, 18, 17, 2, 15), 1, 1)
        exp = r["explanation"]
        self.assertEqual(exp["financial"]["requested"], "3,60 €")
        self.assertIn("cancelada", exp["headline"].lower())


if __name__ == "__main__":
    unittest.main()
