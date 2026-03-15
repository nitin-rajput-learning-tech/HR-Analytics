from __future__ import annotations

import shutil
from pathlib import Path

import pandas as pd
import pytest

from hr_analytics.adapters.workbook import WorkbookUploadAdapter
from hr_analytics.repository import Repository
from hr_analytics.workspace import AppWorkspace


@pytest.fixture()
def workspace(tmp_path: Path) -> AppWorkspace:
    return AppWorkspace.prepare(tmp_path / "workspace")


@pytest.fixture()
def repository(workspace: AppWorkspace) -> Repository:
    return Repository(workspace.database_path)


@pytest.fixture()
def adapter(workspace: AppWorkspace, repository: Repository) -> WorkbookUploadAdapter:
    return WorkbookUploadAdapter(workspace, repository)


@pytest.fixture()
def bootstrapped(adapter: WorkbookUploadAdapter, repository: Repository) -> tuple[WorkbookUploadAdapter, Repository, pd.DataFrame]:
    sources = adapter.list_bootstrap_sources()
    if not sources:
        pytest.skip("Employee Masters fixture data not available")
    adapter.bootstrap_from_fixtures(force_reimport=True)
    return adapter, repository, repository.list_snapshots()
