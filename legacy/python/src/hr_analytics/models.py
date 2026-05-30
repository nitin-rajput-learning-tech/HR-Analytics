from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import pandas as pd


@dataclass(slots=True)
class ValidationIssue:
    severity: str
    issue_type: str
    field_name: str
    issue_count: int
    message: str
    sample_values: str = ""


@dataclass(slots=True)
class SnapshotCandidate:
    source_name: str
    source_path: Path | None
    raw_bytes: bytes | None
    uploaded_by: str
    as_of_date: date | None
    parse_confidence: float
    parse_note: str
    detected_sheet: str | None
    header_row: int | None
    available_columns: list[str]
    missing_columns: list[str]
    compatibility_level: str
    row_count: int
    status: str
    notes: list[str] = field(default_factory=list)
    dataframe: pd.DataFrame = field(default_factory=pd.DataFrame)
    validation_issues: list[ValidationIssue] = field(default_factory=list)
    snapshot_id: str | None = None
    raw_file_path: Path | None = None


@dataclass(slots=True)
class IngestionResult:
    snapshot_id: str
    status: str
    message: str
    compatibility_level: str
    row_count: int
    as_of_date: date | None
    raw_file_path: Path | None
    uploaded_by: str
    validation_issues: list[ValidationIssue] = field(default_factory=list)
