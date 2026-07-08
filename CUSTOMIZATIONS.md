# 个性化定制清单

本文件记录本 fork（`jimojijie29/Vibe-Research`）与上游原项目（`simonlin1212/Vibe-Research`）之间的差异。每次从上游同步代码后，建议对照本清单检查是否有功能被覆盖或需要重新适配。

## 当前已应用的定制

### 1. 后端订阅接入修复

- **文件**: `backend/cli_runtime.py`
- **说明**: 恢复 Claude Code 订阅接入的两个关键参数。
  - 启动参数增加 `--strict-mcp-config`，防止 `claude -p` 非交互模式加载本机 MCP server 后挂起 300s。
  - `subprocess.run` / `subprocess.Popen` 显式指定 `encoding="utf-8", errors="replace"`，避免 Windows 中文系统（GBK 代码页）解码 CLI 的 UTF-8 输出时抛 `UnicodeDecodeError`。
- **上游风险**: 若上游再次修改 `cli_runtime.py` 的 Claude 启动参数，需确认 `--strict-mcp-config` 和 `encoding="utf-8"` 仍然存在。

### 2. 订阅接入回归测试

- **文件**: `backend/tests/test_cli_runtime.py`
- **说明**: 针对 `cli_runtime.py` 的上述修复，新增两条离线回归测试，验证 Claude 调用时包含 `--strict-mcp-config` 和 UTF-8 解码参数。
- **上游风险**: 低。仅在本 fork 存在。

### 3. 环境变量模板同步

- **文件**: `backend/.env.example`、`docs/ENV.md`
- **说明**: 从 `.env.example` 的 CLI 列表中移除已停止支持的 **Gemini CLI**；同步更新 `docs/ENV.md`。
- **上游风险**: 若上游重新支持 Gemini 或新增其他 CLI，需同步更新。

### 4. 项目辅助脚本与文档

- **文件**:
  - `docs/CONTRIBUTING.md`
  - `docs/RUNBOOK.md`
  - `docs/screenshots/install-verify.png`
  - `scripts/start-project.cmd`
  - `scripts/launch.py`
  - `scripts/launch.vbs`
  - `scripts/create-desktop-shortcut.ps1`
  - `scripts/generate-icon.py`
  - `scripts/requirements.txt`
  - `frontend/public/app-icon.ico`
  - `frontend/public/app-icon.png`
  - `frontend/public/app-icon.svg`
- **说明**: 本地开发/部署辅助文档、Windows 启动脚本、图标资源等。
- **上游风险**: 低。这些文件基本不会与上游冲突；若上游新增同名文件，合并时需选择保留哪个版本。

### 5. 依赖与忽略项

- **文件**: `frontend/package-lock.json`、`.gitignore`
- **说明**: `npm install` 生成的 lock 文件更新；`.gitignore` 增加 `desktop.ini` 等系统文件忽略。
- **上游风险**: `package-lock.json` 容易因平台/Node 版本差异与上游冲突，同步时建议接受上游版本后重新 `npm install`。

## 同步上游的标准流程

```bash
# 1. 保存当前未提交改动
git stash push -m "before-upstream-sync"

# 2. 拉取上游并合并到 main
git fetch upstream
git checkout main
git merge upstream/main

# 3. 解决冲突后验证
cd backend && .venv\Scripts\python -m pytest -m "not live" -q
cd ..\frontend && npm run build

# 4. 推送到自己的 fork
git push origin main

# 5. 恢复之前的工作
git stash pop
```

## 新增定制的流程

1. 从 `main` 切出新分支：`git checkout -b feat/xxx`
2. 开发并在本地验证（pytest + `npm run build`）。
3. 合并回 `main`：`git checkout main && git merge feat/xxx`
4. 更新本文件，记录新增定制。
5. `git push origin main`

## 需要持续关注的地方

- `backend/cli_runtime.py` 的 Claude 启动参数。
- `backend/.env.example` 的 CLI 列表。
- `frontend/package-lock.json` 的平台差异。
- 上游新增页面/组件时，确认是否影响你的自定义样式或脚本。
