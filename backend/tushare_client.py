"""Tushare API 客户端 - 用于获取融资余额和市场成交额历史数据。

本模块提供统一的 Tushare 接口封装，支持：
1. 融资融券数据（margin API）- 包含融资余额、融券余额
2. 指数日线数据（index_daily API）- 包含收盘价、成交额

数据用于计算较昨日变化，支持历史对比功能。
"""

import os
import requests
from typing import Optional
from datetime import datetime, timedelta

# Tushare API Token（从环境变量读取）
_TOKEN = os.environ.get("TUSHARE_TOKEN", "")

_API_URL = "https://api.tushare.pro"
_TIMEOUT = 30


class TushareError(Exception):
    """Tushare API 调用异常"""
    pass


def _call_api(api_name: str, params: dict, fields: str = "") -> list[dict]:
    """调用 Tushare API。

    Args:
        api_name: API 名称（如 'margin', 'index_daily'）
        params: API 参数字典
        fields: 返回字段（空字符串表示全部字段）

    Returns:
        字典列表，每个字典代表一行数据

    Raises:
        TushareError: API 调用失败时抛出
    """
    if not _TOKEN:
        raise TushareError("TUSHARE_TOKEN 环境变量未设置。请访问 https://tushare.pro 注册获取 Token")

    headers = {"Content-Type": "application/json"}
    payload = {
        "api_name": api_name,
        "token": _TOKEN,
        "params": params,
        "fields": fields,
    }

    try:
        resp = requests.post(_API_URL, json=payload, headers=headers, timeout=_TIMEOUT)
        resp.raise_for_status()
        result = resp.json()
    except Exception as e:
        raise TushareError(f"Tushare API 请求失败: {e}") from e

    if result.get("code") != 0:
        msg = result.get("msg", "未知错误")
        raise TushareError(f"Tushare API 返回错误: {msg}")

    data = result.get("data")
    if not data:
        return []

    fields_list = data.get("fields", [])
    items = data.get("items", [])

    # 将二维数组转为字典列表
    return [dict(zip(fields_list, row)) for row in items]


def get_margin_balance(days: int = 2) -> dict:
    """获取沪深两市融资余额（最近N个交易日）。

    Args:
        days: 获取最近N个交易日的数据（默认2天，用于计算昨日变化）

    Returns:
        {
            "sh_rzye": float,              # 沪市融资余额（元）
            "sz_rzye": float,              # 深市融资余额（元）
            "total_rzye": float,           # 两市融资余额（元）
            "sh_rzye_change": float,       # 沪市较昨日变化（元）
            "sz_rzye_change": float,       # 深市较昨日变化（元）
            "total_rzye_change": float,    # 两市较昨日变化（元）
        }
        数据为 None 表示无法获取

    Raises:
        TushareError: API 调用失败时抛出
    """
    # 计算日期范围（多取几天，避免周末/节假日数据不足）
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days + 10)

    start_str = start_date.strftime("%Y%m%d")
    end_str = end_date.strftime("%Y%m%d")

    # 获取融资融券数据（注意：API会返回所有交易所数据，需要按exchange_id过滤）
    all_data = _call_api("margin", {"exchange": "SSE", "start_date": start_str, "end_date": end_str})

    # 按 exchange_id 过滤
    sse_data = [row for row in all_data if row.get("exchange_id") == "SSE"]
    szse_data = [row for row in all_data if row.get("exchange_id") == "SZSE"]

    # 按交易日期合并沪深数据
    data_by_date: dict[str, dict] = {}

    for row in sse_data:
        date = row.get("trade_date")
        if date:
            data_by_date.setdefault(date, {})["sse"] = row

    for row in szse_data:
        date = row.get("trade_date")
        if date:
            data_by_date.setdefault(date, {})["szse"] = row

    # 按日期降序排序
    sorted_dates = sorted(data_by_date.keys(), reverse=True)

    if len(sorted_dates) < 2:
        # 数据不足，无法计算变化
        return {
            "sh_rzye": None, "sz_rzye": None, "total_rzye": None,
            "sh_rzye_change": None, "sz_rzye_change": None, "total_rzye_change": None,
        }

    # 最新交易日（今日）
    today_date = sorted_dates[0]
    today_data = data_by_date[today_date]

    # 上一交易日（昨日）
    yesterday_date = sorted_dates[1]
    yesterday_data = data_by_date[yesterday_date]

    def _safe_float(value) -> Optional[float]:
        """安全转换为浮点数"""
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    # 提取今日数据
    sh_today = _safe_float(today_data.get("sse", {}).get("rzye"))
    sz_today = _safe_float(today_data.get("szse", {}).get("rzye"))

    # 提取昨日数据
    sh_yesterday = _safe_float(yesterday_data.get("sse", {}).get("rzye"))
    sz_yesterday = _safe_float(yesterday_data.get("szse", {}).get("rzye"))

    # 计算总额
    total_today = None
    if sh_today is not None and sz_today is not None:
        total_today = sh_today + sz_today

    total_yesterday = None
    if sh_yesterday is not None and sz_yesterday is not None:
        total_yesterday = sh_yesterday + sz_yesterday

    # 计算变化
    sh_change = None
    if sh_today is not None and sh_yesterday is not None:
        sh_change = sh_today - sh_yesterday

    sz_change = None
    if sz_today is not None and sz_yesterday is not None:
        sz_change = sz_today - sz_yesterday

    total_change = None
    if total_today is not None and total_yesterday is not None:
        total_change = total_today - total_yesterday

    return {
        "sh_rzye": sh_today,
        "sz_rzye": sz_today,
        "total_rzye": total_today,
        "sh_rzye_change": sh_change,
        "sz_rzye_change": sz_change,
        "total_rzye_change": total_change,
        "trade_date": today_date,  # 新增：交易日期（YYYYMMDD格式）
    }


def get_market_turnover(days: int = 3) -> dict:
    """获取沪深两市总成交额（最近N个交易日）。

    Args:
        days: 获取最近N个交易日的数据（默认2天，用于计算昨日变化）

    Returns:
        {
            "total_turnover": float,        # 两市总成交额（亿元）
            "total_turnover_change": float, # 较昨日变化（亿元）
        }
        数据为 None 表示无法获取

    Raises:
        TushareError: API 调用失败时抛出
    """
    # 计算日期范围
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days + 10)

    start_str = start_date.strftime("%Y%m%d")
    end_str = end_date.strftime("%Y%m%d")

    # 获取指数日线数据
    sh_data = _call_api("index_daily", {"ts_code": "000001.SH", "start_date": start_str, "end_date": end_str})
    sz_data = _call_api("index_daily", {"ts_code": "399001.SZ", "start_date": start_str, "end_date": end_str})

    # 按交易日期合并
    data_by_date: dict[str, dict] = {}

    for row in sh_data:
        date = row.get("trade_date")
        if date:
            data_by_date.setdefault(date, {})["sh"] = row

    for row in sz_data:
        date = row.get("trade_date")
        if date:
            data_by_date.setdefault(date, {})["sz"] = row

    # 按日期降序排序
    sorted_dates = sorted(data_by_date.keys(), reverse=True)

    if len(sorted_dates) < 2:
        return {"total_turnover": None, "total_turnover_change": None}

    def _safe_float(value) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    # 使用昨日成交额（盘前准备，看昨日收盘数据）
    # sorted_dates[0] 可能是今天（未收盘），sorted_dates[1] 是昨天（已收盘）
    today_date = sorted_dates[1]  # 取昨日作为"今日"
    today_data = data_by_date[today_date]
    sh_amount_today = _safe_float(today_data.get("sh", {}).get("amount"))
    sz_amount_today = _safe_float(today_data.get("sz", {}).get("amount"))

    # 前日成交额（万元）
    if len(sorted_dates) < 3:
        return {"total_turnover": None, "total_turnover_change": None, "trade_date": None}

    yesterday_date = sorted_dates[2]  # 前日
    yesterday_data = data_by_date[yesterday_date]
    sh_amount_yesterday = _safe_float(yesterday_data.get("sh", {}).get("amount"))
    sz_amount_yesterday = _safe_float(yesterday_data.get("sz", {}).get("amount"))

    # 计算总成交额（转为亿元）
    total_today = None
    if sh_amount_today is not None and sz_amount_today is not None:
        total_today = (sh_amount_today + sz_amount_today) / 10000  # 万元 → 亿元

    total_yesterday = None
    if sh_amount_yesterday is not None and sz_amount_yesterday is not None:
        total_yesterday = (sh_amount_yesterday + sz_amount_yesterday) / 10000

    # 计算变化
    total_change = None
    if total_today is not None and total_yesterday is not None:
        total_change = total_today - total_yesterday

    return {
        "total_turnover": total_today,
        "total_turnover_change": total_change,
        "trade_date": today_date,  # 新增：交易日期（YYYYMMDD格式）
    }
