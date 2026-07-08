"""Hidden launcher for Vibe-Research.

Starts the backend and frontend dev servers without console windows, waits for
both ports to be reachable, then opens the dashboard in the default browser.
"""
from __future__ import annotations

import ctypes
import os
import shutil
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def alert(title: str, message: str) -> None:
    """Show a native message box for errors."""
    ctypes.windll.user32.MessageBoxW(0, message, title, 0x10)


def resolve_repo_root() -> Path:
    """Return the absolute repo root (the parent of the scripts directory)."""
    return Path(__file__).resolve().parent.parent


def is_port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    """Return True if a TCP connection to host:port can be established."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def kill_port_users(ports: list[int]) -> None:
    """Kill any processes listening on the given local ports."""
    port_list = ",".join(str(p) for p in ports)
    script = (
        "Get-NetTCPConnection -LocalPort "
        + port_list
        + " -ErrorAction SilentlyContinue "
        "| Select-Object -ExpandProperty OwningProcess -Unique "
        "| ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
    )
    subprocess.run(
        ["powershell", "-Command", script],
        capture_output=True,
        creationflags=CREATE_NO_WINDOW,
    )


def start_service(
    name: str,
    cwd: Path,
    command: list[str],
    log_path: Path,
) -> subprocess.Popen:
    """Start a child service with a hidden window and capture logs."""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = open(log_path, "w", encoding="utf-8")
    try:
        proc = subprocess.Popen(
            command,
            cwd=cwd,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            creationflags=CREATE_NO_WINDOW,
        )
    except Exception as exc:
        log_file.close()
        raise RuntimeError(f"Failed to start {name}: {exc}") from exc
    return proc


def wait_for_port(name: str, host: str, port: int, attempts: int = 30, delay: float = 1.0) -> bool:
    """Poll until the port is open or attempts are exhausted."""
    for _ in range(attempts):
        if is_port_open(host, port):
            return True
        time.sleep(delay)
    return False


def main() -> int:
    repo_root = resolve_repo_root()
    backend_dir = repo_root / "backend"
    frontend_dir = repo_root / "frontend"
    scripts_dir = repo_root / "scripts"
    python_exe = backend_dir / ".venv" / "Scripts" / "python.exe"

    if not python_exe.exists():
        alert(
            "Vibe-Research Launcher",
            "Backend virtual environment not found.\n\n"
            "Please run:\n"
            "  cd backend\n"
            "  python -m venv .venv\n"
            "  .venv\Scripts\pip install -r requirements.txt",
        )
        return 1

    if not (frontend_dir / "node_modules").exists():
        alert(
            "Vibe-Research Launcher",
            "Frontend dependencies not found.\n\n"
            "Please run:\n"
            "  cd frontend\n"
            "  npm install",
        )
        return 1

    # Clear any leftover dev server processes from previous runs.
    kill_port_users([8900, 5899])
    time.sleep(1)

    # Start backend.
    backend_proc = start_service(
        "backend",
        backend_dir,
        [str(python_exe), "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8900"],
        scripts_dir / "logs" / "backend.log",
    )

    # Locate Node.js. npm is a cmd script; running node directly is more
    # reliable when launched without a console window.
    node_exe = shutil.which("node")
    if not node_exe:
        alert("Vibe-Research Launcher", "Node.js executable not found in PATH.")
        return 1

    vite_script = frontend_dir / "node_modules" / "vite" / "bin" / "vite.js"
    if not vite_script.exists():
        alert("Vibe-Research Launcher", "Vite not found. Please run: cd frontend && npm install")
        return 1

    # Start frontend.
    frontend_proc = start_service(
        "frontend",
        frontend_dir,
        [node_exe, str(vite_script)],
        scripts_dir / "logs" / "frontend.log",
    )

    try:
        if not wait_for_port("backend", "127.0.0.1", 8900):
            alert("Vibe-Research Launcher", "Backend did not start on http://localhost:8900 within 30 seconds.")
            return 1

        if not wait_for_port("frontend", "127.0.0.1", 5899):
            alert("Vibe-Research Launcher", "Frontend did not start on http://localhost:5899 within 30 seconds.")
            return 1

        webbrowser.open("http://localhost:5899")

        # Keep the launcher running as a hidden watchdog so the dev servers
        # are not terminated when this process exits (e.g. by a parent shell).
        while True:
            backend_dead = backend_proc.poll() is not None
            frontend_dead = frontend_proc.poll() is not None
            if backend_dead or frontend_dead:
                break
            time.sleep(5)
    except Exception as exc:
        alert("Vibe-Research Launcher", f"Unexpected error: {exc}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
