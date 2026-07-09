"""干支日历工具 —— 实时展示农历年月日时（盘前准备专用）。

功能：
- 天干地支纪年法（甲子周期）
- 农历月日显示
- 生肖
- 当前时辰

合规：仅做客观日历展示，不涉及任何预测、占卜、迷信内容。
"""

from __future__ import annotations

from datetime import datetime
from borax.calendars.lunardate import LunarDate

# 24节气近似日期表（每年可能有±1天偏差，仅供参考展示）
# 格式：(月, 日, 节气名)
SOLAR_TERMS = [
    (1, 6, "小寒"), (1, 20, "大寒"),
    (2, 4, "立春"), (2, 19, "雨水"),
    (3, 6, "惊蛰"), (3, 21, "春分"),
    (4, 5, "清明"), (4, 20, "谷雨"),
    (5, 6, "立夏"), (5, 21, "小满"),
    (6, 6, "芒种"), (6, 21, "夏至"),
    (7, 7, "小暑"), (7, 23, "大暑"),
    (8, 8, "立秋"), (8, 23, "处暑"),
    (9, 8, "白露"), (9, 23, "秋分"),
    (10, 8, "寒露"), (10, 23, "霜降"),
    (11, 7, "立冬"), (11, 22, "小雪"),
    (12, 7, "大雪"), (12, 22, "冬至"),
]


def _get_solar_term(dt: datetime) -> str:
    """获取当天的节气（如果是节气日）。"""
    for month, day, name in SOLAR_TERMS:
        # 允许±1天误差
        if dt.month == month and abs(dt.day - day) <= 1:
            return name
    return ""


def get_ganzhi_calendar(dt: datetime | None = None) -> dict:
    """获取当前时刻的干支日历。

    Args:
        dt: 指定时间，默认为当前时间

    Returns:
        {
            "year_gz": "丙午",
            "month_gz": "乙未",
            "day_gz": "甲申",
            "hour_gz": "辛未",
            "lunar_date": "六月初四",
            "zodiac": "龙",
            "solar_date": "2026-07-09",
            "update_time": "2026-07-09 14:30:15"
        }
    """
    if dt is None:
        dt = datetime.now()

    # 转换为农历（borax 库）
    lunar = LunarDate.from_solar_date(dt.year, dt.month, dt.day)

    # 获取干支纪年月日（borax 自动处理立春等节气边界）
    gz_year = lunar.gz_year
    gz_month = lunar.gz_month
    gz_day = lunar.gz_day

    # 计算时辰干支（完整的天干+地支）
    # 1. 地支时辰对照（23-1=子，1-3=丑...）
    hour_dz_idx = ((dt.hour + 1) // 2) % 12
    dizhi = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]
    hour_dz = dizhi[hour_dz_idx]

    # 2. 时辰天干口诀：甲己还加甲，乙庚丙作初...
    # 日干决定子时天干，然后按天干序推算
    day_tg_idx = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"].index(gz_day[0])
    # 子时天干起始 = (日干 * 2) % 10
    zi_tg_idx = (day_tg_idx * 2) % 10
    # 当前时辰天干 = (子时天干 + 当前时辰地支序号) % 10
    hour_tg_idx = (zi_tg_idx + hour_dz_idx) % 10
    tiangan = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"]
    hour_tg = tiangan[hour_tg_idx]

    hour_gz = f"{hour_tg}{hour_dz}"

    # 生肖
    zodiac = lunar.animal

    # 农历日期（人类可读）
    lunar_str = lunar.cn_str()

    # 获取节气（手动匹配）
    solar_term = _get_solar_term(dt)

    return {
        "year_gz": gz_year,
        "month_gz": gz_month,
        "day_gz": gz_day,
        "hour_gz": hour_gz,
        "lunar_date": lunar_str,
        "zodiac": zodiac,
        "solar_term": solar_term,  # 当天的节气，非节气日返回空字符串
        "solar_date": dt.strftime("%Y-%m-%d"),
        "update_time": dt.strftime("%Y-%m-%d %H:%M:%S")
    }


if __name__ == "__main__":
    # 测试
    result = get_ganzhi_calendar()
    print("干支日历测试：")
    for k, v in result.items():
        print(f"  {k}: {v}")
