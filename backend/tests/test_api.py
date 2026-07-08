"""API 验证/契约测（FastAPI TestClient）。大多在校验层就返回，不联网、可靠。"""
import pytest
from fastapi.testclient import TestClient

import app as app_module

client = TestClient(app_module.app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


@pytest.mark.parametrize("path", [
    "/api/quote?codes=abc",
    "/api/valuation?code=12",
    "/api/margin?code=notcode",
    "/api/holders?code=1234567",
    "/api/announcements?code=",
])
def test_bad_code_400(path):
    assert client.get(path).status_code == 400


def test_industry_top_range():
    assert client.get("/api/industry?top=2").status_code == 422   # ge=5
    assert client.get("/api/industry?top=999").status_code == 422  # le=50


def test_chat_empty_messages_400():
    r = client.post("/api/chat", json={"messages": [], "llm": {"model": "x", "baseURL": "http://x", "apiKey": "k"}})
    assert r.status_code == 400


def test_chat_api_missing_key_400():
    # API 接入缺 baseURL/apiKey → 400（在开流前拦下）
    r = client.post("/api/chat", json={
        "messages": [{"role": "user", "content": "hi"}],
        "llm": {"provider": "deepseek", "model": "deepseek-chat", "baseURL": "", "apiKey": ""},
    })
    assert r.status_code == 400


def test_chat_cli_not_installed_400():
    # 订阅接入选一个本机没装的 CLI → 400 明确提示（不静默失败）
    r = client.post("/api/chat", json={
        "messages": [{"role": "user", "content": "hi"}],
        "llm": {"provider": "cli-qwen", "model": "qwen-code", "baseURL": "", "apiKey": ""},
    })
    # qwen 一般未装 → 400；若恰好装了 qwen 则会进流式（放宽断言）
    assert r.status_code in (400, 200)


def test_global_stock_404(monkeypatch):
    """无法解析的美股/港股代码 → 404（不 500、不崩）。"""
    import gstock
    monkeypatch.setattr(gstock, "us_hk_stock", lambda q: {})
    assert client.get("/api/global/stock?symbol=ZZZZ").status_code == 404


def test_gstock_quote_full_null_shape():
    """行情取不到时 `_quote_from({})` 仍返回完整 null 形状（契合 GlobalQuote 类型），不是空 dict。"""
    import gstock
    q = gstock._quote_from({})
    assert set(q) == {"code", "name", "price", "open", "high", "low", "prev_close", "amount", "mcap", "change_pct"}
    assert all(v is None for v in q.values())


def test_market_snapshot(monkeypatch):
    import market
    monkeypatch.setattr(market, "get_market_snapshot", lambda: {"a_indices": [], "global_indices": []})
    r = client.get("/api/market/snapshot")
    assert r.status_code == 200
    assert "data" in r.json()


def test_margin_stock_rank(monkeypatch):
    import astock
    monkeypatch.setattr(astock, "margin_stock_rank", lambda top=10, date=None: {"buy": [], "sell": [], "date": date or "2026-07-08"})
    r = client.get("/api/margin/stock-rank?top=10")
    assert r.status_code == 200
    assert r.json()["data"]["date"] == "2026-07-08"

    r2 = client.get("/api/margin/stock-rank?date=2026-07-07")
    assert r2.status_code == 200
    assert r2.json()["data"]["date"] == "2026-07-07"

    assert client.get("/api/margin/stock-rank?date=bad").status_code == 400
    assert client.get("/api/margin/stock-rank?date=2026-02-30").status_code == 400
    assert client.get("/api/margin/stock-rank?date=2099-01-01").status_code == 400


def test_margin_sector_rank(monkeypatch):
    import astock
    monkeypatch.setattr(astock, "margin_sector_rank", lambda top=10, date=None: {"buy": [], "sell": [], "date": date or "2026-07-08"})
    r = client.get("/api/margin/sector-rank?top=10")
    assert r.status_code == 200
    assert r.json()["data"]["date"] == "2026-07-08"

    r2 = client.get("/api/margin/sector-rank?date=2026-07-07")
    assert r2.status_code == 200
    assert r2.json()["data"]["date"] == "2026-07-07"

    assert client.get("/api/margin/sector-rank?date=bad").status_code == 400
    assert client.get("/api/margin/sector-rank?date=2026-02-30").status_code == 400
    assert client.get("/api/margin/sector-rank?date=2099-01-01").status_code == 400


def test_global_quotes_validation():
    assert client.get("/api/global/quotes").status_code == 422
    assert client.get("/api/global/quotes?symbols=").status_code == 400
    assert client.get("/api/global/quotes?symbols=" + "x" * 20).status_code == 400


def test_global_quotes(monkeypatch):
    import gstock
    monkeypatch.setattr(gstock, "batch_quotes", lambda syms: [{"symbol": s, "quote": None} for s in syms])
    r = client.get("/api/global/quotes?symbols=AAPL,BABA")
    assert r.status_code == 200
    assert len(r.json()["data"]) == 2
