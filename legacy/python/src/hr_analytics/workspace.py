from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from .constants import APP_NAME, project_root, resource_path


@dataclass(slots=True)
class AppWorkspace:
    root: Path
    database_path: Path
    raw_uploads_dir: Path
    exports_dir: Path
    config_dir: Path

    @classmethod
    def discover(cls) -> "AppWorkspace":
        env_workspace = os.environ.get("HR_ANALYTICS_WORKSPACE")
        if env_workspace:
            return cls.prepare(Path(env_workspace))

        preferred = _preferred_workspace_root()
        try:
            return cls.prepare(preferred)
        except OSError:
            fallback = Path.home() / "Documents" / APP_NAME
            return cls.prepare(fallback)

    @classmethod
    def prepare(cls, root: Path) -> "AppWorkspace":
        root.mkdir(parents=True, exist_ok=True)
        _assert_writable(root)

        raw_uploads_dir = root / "raw_uploads"
        exports_dir = root / "exports"
        config_dir = root / "config"

        for directory in (raw_uploads_dir, exports_dir, config_dir):
            directory.mkdir(parents=True, exist_ok=True)

        workspace = cls(
            root=root,
            database_path=root / "hr_analytics.duckdb",
            raw_uploads_dir=raw_uploads_dir,
            exports_dir=exports_dir,
            config_dir=config_dir,
        )
        workspace._write_settings()
        return workspace

    def _write_settings(self) -> None:
        settings_path = self.config_dir / "workspace_settings.json"
        payload = {
            "app_name": APP_NAME,
            "workspace_root": str(self.root),
            "database_path": str(self.database_path),
        }
        settings_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def fixture_dir(self) -> Path | None:
        candidates = [
            resource_path("Employee Masters", "Employee Masters"),
            resource_path("Employee Masters"),
            project_root() / "Employee Masters" / "Employee Masters",
            project_root() / "Employee Masters",
        ]
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return None


def _preferred_workspace_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent / APP_NAME
    return project_root() / ".workspace"


def _assert_writable(path: Path) -> None:
    probe = path / ".write_probe"
    probe.write_text("ok", encoding="utf-8")
    probe.unlink(missing_ok=True)
