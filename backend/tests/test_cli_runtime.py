"""订阅接入 CLI 运行时的回归测（无网络、不依赖真实 CLI）。

覆盖 Windows 中文环境 + Claude MCP 配置的已知坑：
- subprocess 必须显式指定 encoding="utf-8", errors="replace"，否则 Windows 默认 GBK 解码 CLI 的 UTF-8 输出会 UnicodeDecodeError。
- Claude 非交互模式必须加 --strict-mcp-config，否则会加载用户本地 MCP server，在 -p 模式下等待工具授权而挂起 300s。
"""
from unittest.mock import patch

import cli_runtime


def test_run_cli_claude_uses_strict_mcp_and_utf8_encoding():
    """run_cli 对 claude 应传 --strict-mcp-config，且 subprocess.run 用 utf-8 解码。"""
    with patch("cli_runtime.detect_cli", return_value="/fake/claude"):
        with patch("cli_runtime.subprocess.run") as mock_run:
            mock_run.return_value.stdout = "hello"
            mock_run.return_value.returncode = 0
            cli_runtime.run_cli("claude", "system", "user")

    args = mock_run.call_args
    assert "--strict-mcp-config" in args.args[0]
    assert args.kwargs.get("encoding") == "utf-8"
    assert args.kwargs.get("errors") == "replace"


def test_run_cli_stream_claude_uses_strict_mcp_and_utf8_encoding():
    """run_cli_stream 对 claude 同样应传 --strict-mcp-config 与 utf-8 解码。"""
    with patch("cli_runtime.detect_cli", return_value="/fake/claude"):
        with patch("cli_runtime.subprocess.Popen") as mock_popen:
            mock_proc = mock_popen.return_value
            mock_proc.stdout = iter([])
            mock_proc.wait.return_value = 0
            list(cli_runtime.run_cli_stream("claude", "system", "user"))

    args = mock_popen.call_args
    assert "--strict-mcp-config" in args.args[0]
    assert args.kwargs.get("encoding") == "utf-8"
    assert args.kwargs.get("errors") == "replace"
