# 运维手册

本文档面向部署和运维 Vibe-Research 的同学，涵盖部署步骤、健康检查、常见问题、回滚和监控。

<!-- AUTO-GENERATED:scripts -->

## 可用脚本命令

### 前端 (frontend/)

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（Vite，热重载） |
| `npm run build` | 生产构建（TypeScript 编译 + Vite 打包） |
| `npm run preview` | 预览生产构建结果 |

### 后端 (backend/)

| 命令 | 说明 |
|------|------|
| `python -m uvicorn app:app --host 0.0.0.0 --port 8900` | 启动后端服务 |
| `python backfill_margin_history.py --days 30` | 回填融资排名历史数据（加速历史查询） |
| `python mcp_server.py` | 启动 MCP Server（供 Claude Code 等 agent 调用） |
| `pytest` | 运行测试套件 |

<!-- /AUTO-GENERATED:scripts -->

## 部署方式

当前项目以**手动部署**为主，无 Docker 镜像。推荐在单台服务器或本地机器上前后端一起运行。

### 生产部署步骤

1. **克隆代码**

   ```bash
   git clone https://github.com/simonlin1212/Vibe-Research.git
   cd Vibe-Research
   ```

2. **安装后端**

   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\pip install -r requirements.txt
   cd ..
   ```

3. **安装前端并构建**

   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

4. **配置环境变量（重要）**

   复制 `backend/.env.example` 为 `backend/.env`，并至少设置：

   ```ini
   VR_ALLOW_ORIGINS=https://your-frontend-domain
   VR_API_KEY=<强随机字符串>
   ```

   详见 [`docs/ENV.md`](ENV.md)。

5. **启动后端**

   ```bash
   cd backend
   .venv\Scripts\python -m uvicorn app:app --host 0.0.0.0 --port 8900
   ```

   生产环境建议使用进程管理器（如 systemd、PM2、supervisor）守护该进程。

6. **启动前端**

   生产环境可用任意静态服务器托管 `frontend/dist`：

   ```bash
   cd frontend
   npx serve dist -l 5899
   ```

   或使用 nginx / Caddy 反代到 `dist` 目录。

7. **验证**

   - 打开前端页面。
   - 访问后端健康检查：`GET http://localhost:8900/api/health` 应返回 `{"ok": true, ...}`。

## 健康检查与监控

- **健康端点**：`GET /api/health`
  - 成功响应：`{"ok": true, "service": "vibe-research-api", "version": "0.1.1"}`
- **关键端口**：
  - 后端：`8900`
  - 前端：`5899`
- **日志位置**：
  - 后端：uvicorn 标准输出/错误。
  - 前端：构建/服务器日志。
  - 一键启动脚本：`scripts/logs/backend.log`、`scripts/logs/frontend.log`。

## 常见故障

### 端口被占用，服务起不来

使用脚本启动时会自动清理 8900/5899 上的残留进程。若手动启动遇到 `Address already in use`：

```bash
# Windows PowerShell
Get-NetTCPConnection -LocalPort 8900,5899 | Select-Object -ExpandProperty OwningProcess -Unique | Stop-Process -Force
```

### 前端调用后端报 CORS 错误

检查 `VR_ALLOW_ORIGINS` 是否包含前端实际域名。本地开发可保持 `*`，生产必须收紧。

### 后端返回 401 Unauthorized

设置了 `VR_API_KEY` 后，前端请求需带请求头：

```http
Authorization: Bearer <VR_API_KEY>
```

### 某些数据端点返回 501

对应可选依赖未安装（如 `akshare`、`mootdx`）。按响应提示安装即可：

```bash
.venv\Scripts\pip install akshare mootdx
```

### 订阅接入（Claude Code / Codex 等）无回复

- 确认对应 CLI 已安装并登录，且在服务器 `PATH` 中可执行。
- 确认后端跑在**本机**（云端读不到本机 CLI）。
- 若长时间无输出，检查是否有旧后端进程仍占用 8900 端口并服务旧代码。

### 订阅接入报「生成超时（>300s）」

现象：网页问 AI 长时间转圈，最后报 `对话失败：claude 生成超时（>300s）`。

原因：本机 `claude` 命令挂载了 MCP server（含本项目自己的 MCP），模型在回答「分析个股」类问题时会尝试调用 MCP 工具（如 `mcp__vibe-research__query_valuation`）。但后端以 `-p` 非交互模式调用 CLI，无法弹授权框，进程一直等授权直到 300s 兜底超时。

> 这是 Claude Code 的已知行为：`--disallowedTools` 在 `-p` 模式下不影响 MCP 工具。

修复：`backend/cli_runtime.py` 的 claude 启动参数已加 `--strict-mcp-config`（不加载任何 MCP 配置）。若仍超时，确认该参数存在，并重启后端。

### 订阅接入报「退出码 1 / 403 usage limit」

现象：CLI 能答简单问题，但复杂/长问题报错，日志或回复中出现类似：

```
Failed to authenticate. API Error: 403 You've reached your usage limit for this billing cycle.
```

原因：所接 CLI 后端（如 Kimi/Moonshot、Anthropic 订阅）的**额度已用尽**。这是账号问题，非代码 bug。

处理：等额度刷新、升级订阅、换一个已登录的 CLI，或改用「API 接入」（填自己的 key，还支持模型现场调数据工具）。

### 网页 AI 回复为空或乱码（Windows）

如果通过订阅接入（CLI）长时间无回复或输出乱码，可能是子进程输出编码与系统默认编码不一致（Windows 中文系统默认 GBK，而 CLI 输出 UTF-8）。请确保 `backend/cli_runtime.py` 中的 `subprocess.run` / `subprocess.Popen` 已显式指定 `encoding="utf-8", errors="replace"`。

## 回滚

1. 停止当前前后端进程。
2. 切回上一个稳定 commit：

   ```bash
   git log --oneline -5
   git checkout <stable-commit-hash>
   ```

3. 重新安装依赖（如果依赖有变化）：

   ```bash
   cd backend && .venv\Scripts\pip install -r requirements.txt
   cd ../frontend && npm install && npm run build
   ```

4. 重启服务。

## 告警与升级路径

- **告警**：建议监控 `GET /api/health` 是否可达、端口是否存活、日志中是否频繁出现 502/503。
- **升级**：
  1. 拉取最新代码：`git pull origin main`
  2. 查看 `requirements.txt`、`package.json` 是否有依赖变更并同步安装。
  3. 运行 `pytest -m "not live"` 和 `pytest -m live`（发布前）。
  4. 重新构建前端并重启后端。

## MCP Server（可选）

如需把后端挂进 Claude Code 等 agent：

```bash
claude mcp add vibe-research -- \
  "$(pwd)/backend/.venv/Scripts/python.exe" "$(pwd)/backend/mcp_server.py"
```

挂上后 agent 可直接调用 `query_quote / query_valuation / query_reports / query_news` 四个工具。
