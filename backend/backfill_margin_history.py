"""批量回填融资排名历史数据到数据库。

使用方法：
    python backfill_margin_history.py --days 30

功能：
1. 获取最近N个交易日的融资排名数据（行业 + 个股）
2. 保存到 margin_history.db
3. 加速后续历史日期查询
"""

import argparse
import time
from datetime import datetime, timedelta

import astock
import margin_db


def get_trading_dates(days: int = 30) -> list[str]:
    """获取最近N个交易日的日期列表（YYYY-MM-DD格式）。

    使用逆推法：从今天往前推算，去除周末和已知节假日。
    """
    print(f"正在生成最近 {days} 个交易日...")

    from datetime import datetime, timedelta

    dates = []
    current = datetime.now()

    # 简单的交易日判断：排除周末
    checked = 0
    while len(dates) < days and checked < days * 2:
        # 周一=0, 周日=6
        if current.weekday() < 5:  # 周一到周五
            dates.append(current.strftime("%Y-%m-%d"))
        current -= timedelta(days=1)
        checked += 1

    print(f"生成 {len(dates)} 个交易日（已排除周末）")
    return dates


def backfill_margin_rank(trade_date: str) -> tuple[bool, bool]:
    """回填指定日期的融资排名数据。

    Returns:
        (stock_success, sector_success)
    """
    stock_success = False
    sector_success = False

    # 检查是否已存在
    existing_stock = margin_db.get_margin_rank(trade_date, "stock")
    existing_sector = margin_db.get_margin_rank(trade_date, "sector")

    if existing_stock and existing_sector:
        print(f"  {trade_date}: 已存在，跳过")
        return True, True

    # 个股融资排名
    if not existing_stock:
        try:
            stock_data = astock.margin_stock_rank(top=10, date=trade_date)
            if stock_data.get("buy") or stock_data.get("sell"):
                margin_db.save_margin_rank(trade_date, "stock", stock_data)
                stock_success = True
                print(f"  {trade_date}: [OK] 个股数据已保存")
            else:
                print(f"  {trade_date}: [WARN] 个股数据为空")
        except Exception as e:
            print(f"  {trade_date}: [FAIL] 个股数据失败 - {e}")
    else:
        stock_success = True

    # 行业融资排名
    if not existing_sector:
        try:
            sector_data = astock.margin_sector_rank(top=10, date=trade_date)
            if sector_data.get("buy") or sector_data.get("sell"):
                margin_db.save_margin_rank(trade_date, "sector", sector_data)
                sector_success = True
                print(f"  {trade_date}: [OK] 行业数据已保存")
            else:
                print(f"  {trade_date}: [WARN] 行业数据为空")
        except Exception as e:
            print(f"  {trade_date}: [FAIL] 行业数据失败 - {e}")
    else:
        sector_success = True

    return stock_success, sector_success


def main():
    parser = argparse.ArgumentParser(description="回填融资排名历史数据")
    parser.add_argument("--days", type=int, default=30, help="回填最近N个交易日（默认30）")
    parser.add_argument("--delay", type=float, default=1.0, help="每次请求间隔秒数（默认1.0）")
    args = parser.parse_args()

    print("=" * 60)
    print("融资排名历史数据回填工具")
    print("=" * 60)

    # 获取交易日列表
    dates = get_trading_dates(args.days)

    if not dates:
        print("未找到交易日，退出")
        return

    print(f"\n开始回填 {len(dates)} 个交易日的数据...")
    print(f"日期范围: {dates[-1]} ~ {dates[0]}")
    print("-" * 60)

    success_count = 0
    fail_count = 0

    for i, date in enumerate(dates, 1):
        print(f"[{i}/{len(dates)}] {date}:")
        stock_ok, sector_ok = backfill_margin_rank(date)

        if stock_ok and sector_ok:
            success_count += 1
        else:
            fail_count += 1

        # 延迟避免API限流
        if i < len(dates):
            time.sleep(args.delay)

    print("-" * 60)
    print(f"完成! 成功: {success_count}, 失败: {fail_count}")
    print(f"数据库文件: {margin_db.DB_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()
