# 贡献指南

欢迎参与 Vibe-Research 的开发和改进。本指南涵盖环境搭建、常用命令、测试和提交规范。

## 开发环境 setup

### 前置依赖

- Python 3.10+
- Node.js 18+ 和 npm
- Git

### 1. 克隆仓库

```bash
git clone https://github.com/simonlin1212/Vibe-Research.git
cd Vibe-Research
```

### 2. 安装后端

```bash
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
cd ..
```

> 行情 / 研报等核心数据只需 `fastapi / uvicorn / requests` 即可工作。`akshare`、`mootdx` 等属于可选依赖，缺失时对应端点会返回 501 并提示安装，不会拖垮整个服务。

### 3. 安装前端

```bash
cd frontend
npm install
cd ..
```

### 4. 启动开发服务器

```bash
# 方式一：一键启动脚本（Windows）
scripts\start-project.cmd

# 方式二：手动分别启动
cd backend && .venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 8900
cd frontend && npm run dev
```

浏览器打开 <http://localhost:5899>。

## 可用脚本

<!-- AUTO-GENERATED:scripts -->

### 前端脚本（`frontend/package.json`）

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器（带热更新），默认监听 `http://localhost:5899` |
| `npm run build` | 运行 TypeScript 类型检查并构建生产包到 `frontend/dist` |
| `npm run preview` | 本地预览生产构建结果 |

### 后端命令

| 命令 | 说明 |
|------|------|
| `.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 8900` | 启动 FastAPI 后端服务 |
| `.venv\Scripts\python -m pytest -m "not live"` | 运行离线测试与 API 校验（无需联网，推荐日常开发使用） |
| `.venv\Scripts\python -m pytest -m live` | 运行联网数据源 shape 核对（升级 / 发布前跑一遍） |

<!-- /AUTO-GENERATED:scripts -->

## 环境变量

后端配置见 [`docs/ENV.md`](ENV.md)。本地开发通常无需修改；公网部署必须设置 `VR_ALLOW_ORIGINS` 和 `VR_API_KEY`。

## 测试

- 新增功能请补充对应测试。
- 优先使用 `-m "not live"` 测试套件，稳定且无需联网。
- 若修改了数据抓取逻辑，请在发布前跑一次 `-m live` 核对数据 shape。

## 代码风格

- **前端**：TypeScript + React 19 + Tailwind CSS。保持组件职责单一，类型定义优先使用接口。
- **后端**：Python 3.10+，使用类型注解。函数保持简短，错误显式处理，避免静默吞异常。
- 不要硬编码密钥、API key 或个人凭证。

## 提交 PR 前检查清单

- [ ] 代码能正常通过 `npm run build`（前端）或 `pytest -m "not live"`（后端）。
- [ ] 手动验证过修改的功能在本地 dev 环境工作正常。
- [ ] 未引入硬编码密钥或敏感信息。
- [ ] 更新了相关文档（如修改了端点、环境变量或启动方式）。
- [ ] 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/) 风格，例如 `feat:`、`fix:`、`docs:`、`refactor:`。

## 获取帮助

- 产品/数据问题：在 [GitHub Issues](https://github.com/simonlin1212/Vibe-Research/issues) 提交。
- 企业 AI 落地方案：联系作者 <https://www.simonlin.net>。
