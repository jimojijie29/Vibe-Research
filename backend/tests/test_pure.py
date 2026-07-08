"""纯逻辑单测（无网络、快、确定）：市场前缀、估值计算、行情解析。"""
import math

import astock


def test_get_prefix():
    assert astock.get_prefix("600519") == "sh"
    assert astock.get_prefix("900001") == "sh"   # 9 开头也是沪
    assert astock.get_prefix("000001") == "sz"
    assert astock.get_prefix("300750") == "sz"
    assert astock.get_prefix("832000") == "bj"   # 8 开头北交所


def test_calc_peg():
    assert astock.calc_peg(20, 0.2) == 20 / (0.2 * 100)  # =1.0
    assert astock.calc_peg(20, 0) == float("inf")        # 增速<=0 → inf
    assert astock.calc_peg(20, -0.1) == float("inf")


def test_pe_digestion():
    assert astock.pe_digestion(30, 0.2) == 0.0           # 当前<=目标PE 无需消化
    assert astock.pe_digestion(25, 0.2, target_pe=30) == 0.0
    assert astock.pe_digestion(60, 0.2) > 0              # 高于目标需消化年数
    assert astock.pe_digestion(60, 0) == float("inf")    # 零增速永远消化不掉


def _gtimg_line(**overrides) -> str:
    # 构造一条腾讯行情返回行：v_sh600519="1~名~代码~价~..."（≥53 字段）。
    parts = ["0"] * 55
    parts[1] = overrides.get("name", "贵州茅台")
    parts[3] = overrides.get("price", "1194.45")
    parts[39] = overrides.get("pe_ttm", "18.05")
    parts[44] = overrides.get("mcap", "15000")
    parts[46] = overrides.get("pb", "6.41")
    return 'v_sh600519="' + "~".join(parts) + '";'


def test_parse_gtimg():
    out = astock._parse_gtimg(_gtimg_line())
    assert "600519" in out
    q = out["600519"]
    assert q["name"] == "贵州茅台"
    assert q["price"] == 1194.45
    assert q["pe_ttm"] == 18.05
    assert q["pb"] == 6.41
    assert q["mcap_yi"] == 15000


def test_parse_gtimg_bad_line_ignored():
    # 字段不足 / 无引号的行应被安全跳过，不抛异常。
    assert astock._parse_gtimg("garbage;no_quotes_here;") == {}
    assert astock._parse_gtimg("") == {}


def test_market_margin_balance_empty():
    """akshare 不可用时返回全 None 结构，不抛异常。"""
    original = astock._akshare
    try:
        astock._akshare = lambda: (_ for _ in ()).throw(astock.DependencyMissing("akshare 未安装"))
        assert astock.market_margin_balance() == {
            "sh_rzye": None, "sh_rqye": None, "sh_rzrqye": None,
            "sz_rzye": None, "sz_rqye": None, "sz_rzrqye": None,
        }
    finally:
        astock._akshare = original


def test_market_margin_balance():
    """SSE/SZSE 融资余额与融资融券余额按列位置正确解析为元。"""
    import pandas as pd
    original = astock._akshare
    try:
        class FakeAk:
            def stock_margin_sse(self):
                # [日期, 融资余额, 融资买入额, 融券余量, 融券卖出量, 融券偿还量, 融资融券余额]
                return pd.DataFrame([["2026-07-08", 1000, 200, 300, 100, 50, 1100]])
            def stock_margin_szse(self):
                # [融资买入额, 融资余额, 融券卖出量, 融券余量, 融券余额, 融资融券余额]（单位：亿元）
                return pd.DataFrame([[200, 3000, 100, 200, 400, 3500]])
        astock._akshare = FakeAk
        res = astock.market_margin_balance()
        assert res["sh_rzye"] == 1000.0
        assert res["sh_rqye"] is None  # SSE 不直接提供融券余额（元）
        assert res["sh_rzrqye"] == 1100.0
        assert res["sz_rzye"] == 3000.0 * 1e8
        assert res["sz_rqye"] == 400.0 * 1e8
        assert res["sz_rzrqye"] == 3500.0 * 1e8
    finally:
        astock._akshare = original


def test_margin_stock_rank(monkeypatch):
    """本地过滤最新交易日并按 RZJME 分 buy/sell 前 N。"""
    monkeypatch.setattr(astock, "eastmoney_datacenter", lambda *a, **k: [
        {"DATE": "2026-07-08 00:00:00", "SCODE": "000001", "SECNAME": "A", "RZYE": 100, "RZJME": 50, "RZRQYE": 150, "RZRQYECZ": 10},
        {"DATE": "2026-07-08 00:00:00", "SCODE": "000002", "SECNAME": "B", "RZYE": 100, "RZJME": -30, "RZRQYE": 70, "RZRQYECZ": -5},
        {"DATE": "2026-07-07 00:00:00", "SCODE": "000003", "SECNAME": "C", "RZYE": 100, "RZJME": 999, "RZRQYE": 100, "RZRQYECZ": 0},
    ])
    res = astock.margin_stock_rank(top=1)
    assert res["date"] == "2026-07-08"
    assert [r["code"] for r in res["buy"]] == ["000001"]
    assert [r["code"] for r in res["sell"]] == ["000002"]


def test_margin_stock_rank_by_date(monkeypatch):
    """指定日期时返回该日数据；无数据时返回空并带日期。"""
    monkeypatch.setattr(astock, "eastmoney_datacenter", lambda *a, **k: [
        {"DATE": "2026-07-08 00:00:00", "SCODE": "000001", "SECNAME": "A", "RZYE": 100, "RZJME": 50, "RZRQYE": 150, "RZRQYECZ": 10},
        {"DATE": "2026-07-07 00:00:00", "SCODE": "000003", "SECNAME": "C", "RZYE": 100, "RZJME": 999, "RZRQYE": 100, "RZRQYECZ": 0},
    ])
    res = astock.margin_stock_rank(top=1, date="2026-07-07")
    assert res["date"] == "2026-07-07"
    assert [r["code"] for r in res["buy"]] == ["000003"]
    assert res["sell"] == []

    empty = astock.margin_stock_rank(top=1, date="2026-07-06")
    assert empty["date"] == "2026-07-06"
    assert empty["buy"] == []
    assert empty["sell"] == []


def test_margin_sector_rank(monkeypatch):
    """按个股行业聚合融资净买入。"""
    calls = []
    def fake_datacenter(*a, **k):
        calls.append(k.get("page_number", 1))
        # 第一页返回目标日期数据，第二页起返回更旧日期，模拟分页截止
        if len(calls) == 1:
            return [
                {"DATE": "2026-07-08 00:00:00", "SCODE": "000001", "SECNAME": "A", "RZYE": 100, "RZJME": 50, "RZRQYE": 150, "RZRQYECZ": 10},
                {"DATE": "2026-07-08 00:00:00", "SCODE": "000002", "SECNAME": "B", "RZYE": 100, "RZJME": 30, "RZRQYE": 130, "RZRQYECZ": 5},
            ]
        return [{"DATE": "2026-07-07 00:00:00", "SCODE": "000003", "SECNAME": "C", "RZYE": 100, "RZJME": 10, "RZRQYE": 100, "RZRQYECZ": 0}]

    monkeypatch.setattr(astock, "eastmoney_datacenter", fake_datacenter)
    monkeypatch.setattr(astock, "market_turnover_rank", lambda n: [
        {"code": "000001", "industry": "银行"}, {"code": "000002", "industry": "银行"},
    ])
    res = astock.margin_sector_rank(top=1)
    assert res["buy"][0]["name"] == "银行"
    assert res["buy"][0]["rzjme"] == 80


def test_gstock_batch_quotes_empty():
    """批量行情对空/不可解析 symbol 仍返回占位结构。"""
    import gstock
    out = gstock.batch_quotes(["", "!!!"])
    assert len(out) == 1
    assert out[0]["symbol"] == "!!!"
    assert out[0]["code"] is None
