from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

import pandas as pd

from ..models import IngestionResult


class DataSourceAdapter(ABC):
    @abstractmethod
    def ingest_snapshot(self, source: Path, *, force_reimport: bool = False) -> IngestionResult:
        raise NotImplementedError

    @abstractmethod
    def list_snapshots(self) -> pd.DataFrame:
        raise NotImplementedError

    @abstractmethod
    def refresh_metrics(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def get_validation_report(self, snapshot_id: str | None = None) -> pd.DataFrame:
        raise NotImplementedError
