"""融资融券历史数据持久化模块。

使用 SQLite 存储历史融资排名数据，支持：
1. 行业板块融资排名历史
2. 个股融资排名历史
3. 市场指数收盘价历史
4. 融资余额和成交额历史
5. 按日期查询历史数据
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Literal

DB_PATH = Path(__file__).parent / "margin_history.db"

RankType = Literal["stock", "sector"]


def _get_connection() -> sqlite3.Connection:
    """获取数据库连接并初始化表结构。"""
    conn = sqlite3.connect(DB_PATH)

    # 融资排名历史表
    conn.execute("""
        CREATE TABLE IF NOT EXISTS margin_rank_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_date TEXT NOT NULL,
            rank_type TEXT NOT NULL,
            data_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(trade_date, rank_type)
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_trade_date
        ON margin_rank_history(trade_date)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_rank_type
        ON margin_rank_history(rank_type)
    """)

    # 市场指数历史表
    conn.execute("""
        CREATE TABLE IF NOT EXISTS market_index_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_date TEXT NOT NULL,
            sh_close REAL,
            sz_close REAL,
            created_at TEXT NOT NULL,
            UNIQUE(trade_date)
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_index_date
        ON market_index_history(trade_date)
    """)

    # 融资余额和成交额历史表
    conn.execute("""
        CREATE TABLE IF NOT EXISTS market_stats_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_date TEXT NOT NULL,
            sh_rzye REAL,
            sz_rzye REAL,
            total_rzye REAL,
            total_turnover REAL,
            created_at TEXT NOT NULL,
            UNIQUE(trade_date)
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_stats_date
        ON market_stats_history(trade_date)
    """)

    conn.commit()
    return conn


def save_margin_rank(trade_date: str, rank_type: RankType, data: dict) -> None:
    """保存融资排名数据到数据库。

    Args:
        trade_date: 交易日期，格式 YYYY-MM-DD
        rank_type: 排名类型，'stock' 或 'sector'
        data: 排名数据字典 {"buy": [...], "sell": [...], "date": "..."}
    """
    conn = _get_connection()
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO margin_rank_history
            (trade_date, rank_type, data_json, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (trade_date, rank_type, json.dumps(data, ensure_ascii=False), datetime.now().isoformat())
        )
        conn.commit()
    finally:
        conn.close()


def get_margin_rank(trade_date: str, rank_type: RankType) -> dict | None:
    """查询历史融资排名数据。

    Args:
        trade_date: 交易日期，格式 YYYY-MM-DD
        rank_type: 排名类型，'stock' 或 'sector'

    Returns:
        排名数据字典，若不存在则返回 None
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT data_json FROM margin_rank_history
            WHERE trade_date = ? AND rank_type = ?
            """,
            (trade_date, rank_type)
        )
        row = cursor.fetchone()
        if row:
            return json.loads(row[0])
        return None
    finally:
        conn.close()


def get_latest_date(rank_type: RankType) -> str | None:
    """获取数据库中最新的交易日期。

    Args:
        rank_type: 排名类型，'stock' 或 'sector'

    Returns:
        最新交易日期（YYYY-MM-DD），若无数据则返回 None
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT trade_date FROM margin_rank_history
            WHERE rank_type = ?
            ORDER BY trade_date DESC
            LIMIT 1
            """,
            (rank_type,)
        )
        row = cursor.fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def get_available_dates(rank_type: RankType, limit: int = 30) -> list[str]:
    """获取数据库中已有数据的交易日期列表。

    Args:
        rank_type: 排名类型，'stock' 或 'sector'
        limit: 返回最近N个日期，默认30

    Returns:
        交易日期列表，降序排列（最新日期在前）
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT DISTINCT trade_date FROM margin_rank_history
            WHERE rank_type = ?
            ORDER BY trade_date DESC
            LIMIT ?
            """,
            (rank_type, limit)
        )
        return [row[0] for row in cursor.fetchall()]
    finally:
        conn.close()


def save_market_index(trade_date: str, sh_close: float | None, sz_close: float | None) -> None:
    """保存市场指数收盘价。

    Args:
        trade_date: 交易日期，格式 YYYY-MM-DD
        sh_close: 上证指数收盘价
        sz_close: 深证成指收盘价
    """
    conn = _get_connection()
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO market_index_history
            (trade_date, sh_close, sz_close, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (trade_date, sh_close, sz_close, datetime.now().isoformat())
        )
        conn.commit()
    finally:
        conn.close()


def get_market_index(trade_date: str) -> dict | None:
    """查询历史市场指数。

    Args:
        trade_date: 交易日期，格式 YYYY-MM-DD

    Returns:
        指数数据字典 {"sh_close": float, "sz_close": float}，若不存在则返回 None
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT sh_close, sz_close FROM market_index_history
            WHERE trade_date = ?
            """,
            (trade_date,)
        )
        row = cursor.fetchone()
        if row:
            return {"sh_close": row[0], "sz_close": row[1]}
        return None
    finally:
        conn.close()


def save_market_stats(
    trade_date: str,
    sh_rzye: float | None,
    sz_rzye: float | None,
    total_rzye: float | None,
    total_turnover: float | None
) -> None:
    """保存融资余额和成交额数据。

    Args:
        trade_date: 交易日期，格式 YYYY-MM-DD
        sh_rzye: 沪市融资余额（元）
        sz_rzye: 深市融资余额（元）
        total_rzye: 两市融资余额合计（元）
        total_turnover: 两市总成交额（亿元）
    """
    conn = _get_connection()
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO market_stats_history
            (trade_date, sh_rzye, sz_rzye, total_rzye, total_turnover, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (trade_date, sh_rzye, sz_rzye, total_rzye, total_turnover, datetime.now().isoformat())
        )
        conn.commit()
    finally:
        conn.close()


def get_market_stats(trade_date: str) -> dict | None:
    """查询历史融资余额和成交额数据。

    Args:
        trade_date: 交易日期，格式 YYYY-MM-DD

    Returns:
        市场数据字典，若不存在则返回 None
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT sh_rzye, sz_rzye, total_rzye, total_turnover
            FROM market_stats_history
            WHERE trade_date = ?
            """,
            (trade_date,)
        )
        row = cursor.fetchone()
        if row:
            return {
                "sh_rzye": row[0],
                "sz_rzye": row[1],
                "total_rzye": row[2],
                "total_turnover": row[3]
            }
        return None
    finally:
        conn.close()

