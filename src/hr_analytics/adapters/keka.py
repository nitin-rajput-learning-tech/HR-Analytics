from __future__ import annotations

from pathlib import Path

import pandas as pd

from .base import DataSourceAdapter
from ..models import IngestionResult


class KekaAdapter(DataSourceAdapter):
    """Future integration boundary for Keka ingestion."""

    def ingest_snapshot(self, source: Path, *, force_reimport: bool = False) -> IngestionResult:
        raise NotImplementedError("Keka Phase 2 integration is not implemented in Phase 1.")

    def list_snapshots(self) -> pd.DataFrame:
        raise NotImplementedError("Keka Phase 2 integration is not implemented in Phase 1.")

    def refresh_metrics(self) -> None:
        raise NotImplementedError("Keka Phase 2 integration is not implemented in Phase 1.")

    def get_validation_report(self, snapshot_id: str | None = None) -> pd.DataFrame:
        raise NotImplementedError("Keka Phase 2 integration is not implemented in Phase 1.")
