from __future__ import annotations

import json

from .adapters.workbook import WorkbookUploadAdapter
from .constants import resource_path
from .repository import Repository
from .workspace import AppWorkspace


def bootstrap_workspace(workspace: AppWorkspace, repository: Repository) -> list[str]:
    seed_aliases = json.loads(
        resource_path("config", "value_aliases.seed.json").read_text(encoding="utf-8")
    )
    repository.seed_value_aliases(seed_aliases)

    if repository.has_imported_snapshots():
        return []

    adapter = WorkbookUploadAdapter(workspace, repository)
    messages = []
    for result in adapter.bootstrap_from_fixtures():
        messages.append(result.message)
    snapshots = repository.list_snapshots()
    imported_active = snapshots[
        (snapshots["status"] == "imported") & (snapshots["is_active_for_date"] == True)
    ].sort_values("as_of_date", ascending=False)
    if not imported_active.empty:
        repository.set_current_snapshot(imported_active.iloc[0]["snapshot_id"])
    return messages
