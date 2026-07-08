# 环境变量参考

本文件由 `backend/.env.example` 自动生成。部署前可复制该文件为 `backend/.env` 并按需修改。

<!-- AUTO-GENERATED:env-vars -->

## 后端环境变量

| 变量 | 是否必填 | 说明 | 示例 |
|------|----------|------|------|
| `VR_ALLOW_ORIGINS` | 否 | CORS 白名单，逗号分隔。本地开发可保持 `*`；公网部署务必收紧为你的前端域名。 | `*` 或 `https://your-frontend-host` |
| `VR_API_KEY` | 否 | 后端 API 鉴权 key。本地留空表示开放；公网部署必须设置为强随机值，所有 `/api/*`（除 `/api/health`）需带 `Authorization: Bearer <key>`。 | `$(openssl rand -hex 32)` |
| `IWENCAI_API_KEY` | 否 | 仅当启用 `iwencai` 语义搜索研报时需要。 | `your-iwencai-key` |
| `IWENCAI_BASE_URL` | 否 | `iwencai` OpenAPI 基础地址。 | `https://openapi.iwencai.com` |
| `VR_DATA_PROXY` | 否 | 强制走系统代理。默认 `0`（国内数据源自动直连）；仅当机器只能靠代理出网时设为 `1`。 | `0` 或 `1` |

## 前端环境变量

| 变量 | 是否必填 | 说明 | 示例 |
|------|----------|------|------|
| `VITE_API_URL` | 否 | 开发时代理 `/api` 的后端地址。默认 `http://127.0.0.1:8900`；仅当后端不在本机 8900 端口时才需修改。 | `http://127.0.0.1:8900` |

<!-- /AUTO-GENERATED:env-vars -->

## 本地开发与生产部署建议

- **本地自托管**：全部留空即可，后端默认开放 CORS、不鉴权。
- **公网部署**：必须设置 `VR_ALLOW_ORIGINS` 和 `VR_API_KEY`，否则后端接口对外完全开放。
