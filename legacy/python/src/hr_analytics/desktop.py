from __future__ import annotations

import argparse
import ctypes
import os
import socket
import subprocess
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import TextIO

import webview

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))
    from hr_analytics.workspace import AppWorkspace
else:
    from .workspace import AppWorkspace

EMBEDDED_STREAMLIT_PORT = 8501
HOST_MODE_SENTINEL = "__streamlit_host__"


def main() -> None:
    host_mode, host_workspace, host_port, host_address = _parse_host_mode_args()
    if host_mode:
        if host_workspace is None or host_port is None:
            raise SystemExit("Missing required --workspace or --port arguments for --streamlit-host mode.")
        _run_streamlit_host(host_workspace, host_port, host_address)
        return

    workspace = AppWorkspace.discover()
    lock_file = _acquire_single_instance_lock(workspace.root)
    if lock_file is None:
        _show_error(
            "HR Analytics is already running for this workspace. "
            "Close the existing window and launch again."
        )
        return

    port = _find_available_port(EMBEDDED_STREAMLIT_PORT)
    env = os.environ.copy()
    env["HR_ANALYTICS_WORKSPACE"] = str(workspace.root)
    env["HR_ANALYTICS_MODULE_PATH"] = str(_module_import_root())

    entry_script = _create_streamlit_entry_script(workspace.config_dir)
    if getattr(sys, "frozen", False):
        command = [
            sys.executable,
            HOST_MODE_SENTINEL,
            str(workspace.root),
            str(port),
            "127.0.0.1",
        ]
    else:
        command = [
            sys.executable,
            "-m",
            "streamlit",
            "run",
            str(entry_script),
            "--server.headless=true",
            "--server.address=127.0.0.1",
            f"--server.port={port}",
            "--browser.gatherUsageStats=false",
            "--global.developmentMode=false",
        ]

    server_log_path = workspace.config_dir / "streamlit_server.log"
    server_log = server_log_path.open("a", encoding="utf-8")
    server_log.write(f"\n[{datetime.now().isoformat()}] Starting embedded server on port {port}\n")
    server_log.flush()

    try:
        process = subprocess.Popen(
            command,
            env=env,
            cwd=workspace.root,
            stdout=server_log,
            stderr=subprocess.STDOUT,
        )
    except Exception:
        server_log.close()
        _release_single_instance_lock(lock_file)
        raise

    try:
        try:
            _wait_for_port(port)
        except TimeoutError:
            _show_error(
                "The analytics server did not start in time. "
                "Please close any other running instances and retry.\n"
                f"Diagnostic log: {server_log_path}"
            )
            return
        webview.create_window(
            "HR Analytics",
            f"http://127.0.0.1:{port}",
            width=1500,
            height=940,
            min_size=(1200, 780),
            text_select=True,
        )
        webview.start()
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
        server_log.close()
        _release_single_instance_lock(lock_file)


def _run_streamlit_host(workspace_root: Path, port: int, address: str) -> None:
    os.environ["HR_ANALYTICS_WORKSPACE"] = str(workspace_root)
    os.environ.setdefault("HR_ANALYTICS_MODULE_PATH", str(_module_import_root()))
    workspace = AppWorkspace.prepare(workspace_root)
    entry_script = _create_streamlit_entry_script(workspace.config_dir)
    log_path = workspace.config_dir / "streamlit_server.log"
    stdio_handles = _ensure_writable_stdio(log_path)

    from streamlit.web import bootstrap
    _patch_streamlit_cli_print(bootstrap, log_path)

    with log_path.open("a", encoding="utf-8") as stream_log:
        stream_log.write(
            f"\n[{datetime.now().isoformat()}] Host mode invoked with address={address} port={port}\n"
        )
        stream_log.flush()

    flag_options = {
        "server_headless": True,
        "server_address": address,
        "server_port": int(port),
        "browser_serverPort": int(port),
        "browser_gatherUsageStats": False,
        "global_developmentMode": False,
    }
    try:
        # streamlit.web.bootstrap.run() does not apply flag options by itself in 1.55;
        # load them first so local user config cannot force dev server mode/port drift.
        bootstrap.load_config_options(flag_options)
        bootstrap.run(str(entry_script), False, [], flag_options)
    except Exception:
        with log_path.open("a", encoding="utf-8") as stream_log:
            stream_log.write(
                f"[{datetime.now().isoformat()}] Host mode crashed with exception:\n"
            )
            stream_log.write(traceback.format_exc())
            stream_log.write("\n")
            stream_log.flush()
        raise
    finally:
        for handle in stdio_handles:
            try:
                handle.close()
            except OSError:
                pass


def _parse_host_mode_args() -> tuple[bool, Path | None, int | None, str]:
    if len(sys.argv) >= 2 and sys.argv[1] == HOST_MODE_SENTINEL:
        workspace = Path(sys.argv[2]).expanduser().resolve() if len(sys.argv) >= 3 else None
        port = int(sys.argv[3]) if len(sys.argv) >= 4 else None
        address = sys.argv[4] if len(sys.argv) >= 5 else "127.0.0.1"
        return True, workspace, port, address

    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--streamlit-host", action="store_true")
    parser.add_argument("--workspace")
    parser.add_argument("--port", type=int)
    parser.add_argument("--address", default="127.0.0.1")
    known_args, _ = parser.parse_known_args()
    workspace = Path(known_args.workspace).expanduser().resolve() if known_args.workspace else None
    return known_args.streamlit_host, workspace, known_args.port, known_args.address


def _wait_for_port(port: int, timeout: float = 120.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.2)
    raise TimeoutError(f"Timed out waiting for Streamlit on port {port}")


def _find_available_port(start_port: int, host: str = "127.0.0.1", max_attempts: int = 100) -> int:
    for offset in range(max_attempts):
        candidate_port = start_port + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((host, candidate_port))
                return candidate_port
            except OSError:
                continue
    raise RuntimeError(f"Could not find an available TCP port after {max_attempts} attempts.")


def _create_streamlit_entry_script(config_dir: Path) -> Path:
    entry_script = config_dir / "_streamlit_entrypoint.py"
    entry_script.write_text(
        "\n".join(
            [
                "import os",
                "import sys",
                "",
                "module_path = os.environ.get('HR_ANALYTICS_MODULE_PATH')",
                "if module_path and module_path not in sys.path:",
                "    sys.path.insert(0, module_path)",
                "",
                "from hr_analytics.streamlit_app import main",
                "",
                "if __name__ == '__main__':",
                "    main()",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return entry_script


def _module_import_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def _acquire_single_instance_lock(workspace_root: Path) -> TextIO | None:
    lock_path = workspace_root / ".hr_analytics.lock"
    lock_file = lock_path.open("a+", encoding="utf-8")
    try:
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        lock_file.seek(0)
        lock_file.truncate(0)
        lock_file.write(str(os.getpid()))
        lock_file.flush()
    except OSError:
        lock_file.close()
        return None
    return lock_file


def _release_single_instance_lock(lock_file: TextIO | None) -> None:
    if lock_file is None:
        return
    try:
        if os.name == "nt":
            import msvcrt

            lock_file.seek(0)
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
    except OSError:
        pass
    finally:
        lock_file.close()


def _show_error(message: str) -> None:
    if os.name == "nt":
        ctypes.windll.user32.MessageBoxW(None, message, "HR Analytics", 0x10)
        return
    print(message, file=sys.stderr)


def _ensure_writable_stdio(log_path: Path) -> list[TextIO]:
    if os.name != "nt":
        return []
    replacement_handles: list[TextIO] = []
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        needs_replacement = stream is None
        if not needs_replacement:
            try:
                stream.write("")
                stream.flush()
            except Exception:
                needs_replacement = True
        if needs_replacement:
            handle = log_path.open("a", encoding="utf-8")
            setattr(sys, stream_name, handle)
            replacement_handles.append(handle)
    return replacement_handles


def _patch_streamlit_cli_print(bootstrap_module: object, log_path: Path) -> None:
    try:
        import streamlit.cli_util as cli_util
    except Exception:
        return

    original_print = getattr(cli_util, "print_to_cli", None)
    if original_print is None:
        original_print = getattr(bootstrap_module, "print_to_cli", None)
    if original_print is None:
        return

    def _safe_print_to_cli(*args: object, **kwargs: object) -> None:
        try:
            original_print(*args, **kwargs)
        except OSError as exc:
            with log_path.open("a", encoding="utf-8") as stream_log:
                stream_log.write(
                    f"[{datetime.now().isoformat()}] Suppressed CLI print error: {exc}\n"
                )
                stream_log.flush()

    setattr(cli_util, "print_to_cli", _safe_print_to_cli)
    if hasattr(bootstrap_module, "print_to_cli"):
        setattr(bootstrap_module, "print_to_cli", _safe_print_to_cli)


if __name__ == "__main__":
    main()
