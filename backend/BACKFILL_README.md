# 融资排名历史数据回填

## 问题

查询历史日期的融资排名数据时响应很慢，因为数据库中只有"访问过的日期"的数据。

## 解决方案

使用 `backfill_margin_history.py` 脚本预先填充历史数据到数据库。

---

## 使用方法

### 1. 手动回填（一次性）

```bash
cd backend

# 回填最近30个交易日（默认）
.venv/Scripts/python backfill_margin_history.py

# 回填最近60个交易日
.venv/Scripts/python backfill_margin_history.py --days 60

# 自定义请求间隔（避免API限流）
.venv/Scripts/python backfill_margin_history.py --days 30 --delay 1.5
```

**参数说明**：
- `--days N`：回填最近N个交易日（默认30）
- `--delay N`：每次请求间隔秒数（默认1.0）

**预计耗时**：
- 30天数据：约30-60秒（取决于网络和API响应）
- 60天数据：约60-120秒

---

### 2. 定时任务（自动更新）

#### Windows 任务计划程序

1. 打开"任务计划程序"
2. 创建基本任务
3. 触发器：每天早上9:30（盘前）
4. 操作：启动程序
   - 程序：`D:\AI_Tools\finance\Vibe-Research\backend\.venv\Scripts\python.exe`
   - 参数：`backfill_margin_history.py --days 10`
   - 起始于：`D:\AI_Tools\finance\Vibe-Research\backend`

#### Linux/Mac Cron

```bash
# 编辑 crontab
crontab -e

# 添加每天早上9:30执行
30 9 * * * cd /path/to/backend && .venv/bin/python backfill_margin_history.py --days 10 >> /tmp/backfill.log 2>&1
```

---

## 效果

回填后，查询历史日期的融资排名将：

✅ **从数据库读取** → 毫秒级响应  
❌ ~~调用API实时获取~~ → ~~几秒延迟~~

---

## 数据库文件

- 位置：`backend/margin_history.db`
- 大小：约 1-5 MB（30天数据）

---

## 注意事项

1. **首次运行**：建议回填30天数据
2. **定时任务**：每天只需更新最近10天即可（增量更新）
3. **API限流**：如遇到429错误，增加 `--delay` 参数值
4. **数据覆盖**：脚本会跳过已存在的日期，不会重复下载

---

## 故障排查

### 问题：脚本报错 "date must be YYYY-MM-DD"

**原因**：日期格式错误  
**解决**：已在最新版本修复，重新运行即可

### 问题：找不到交易日

**原因**：东财API临时不可用  
**解决**：稍后重试，或手动指定日期范围

### 问题：数据为空

**原因**：周末/节假日无融资数据  
**解决**：正常现象，脚本会自动跳过

---

## 查看已有数据

```bash
cd backend

# 查看已回填的日期列表
.venv/Scripts/python -c "import margin_db; print(margin_db.get_available_dates('stock', limit=30))"
```

---

## 更新日志

- **2026-07-09**：首次创建回填脚本
- 支持自动去重（跳过已存在的日期）
- 支持自定义回填天数和请求间隔
