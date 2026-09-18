import unittest

from backend.services.cashlogy_logs import (
    analyze_logs,
    decode_log,
    detect_kind,
    parse_errors,
    parse_payments,
    parse_times,
    parse_transactions,
    parse_versions,
)

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


if __name__ == "__main__":
    unittest.main()
