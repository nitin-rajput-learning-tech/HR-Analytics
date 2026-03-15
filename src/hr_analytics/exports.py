from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pandas as pd


def dataframe_to_csv_bytes(
    dataframe: pd.DataFrame,
    *,
    snapshot_date: str,
    source_file: str,
    note: str,
) -> bytes:
    export_df = dataframe.copy()
    export_df["export_snapshot_date"] = snapshot_date
    export_df["export_source_file"] = source_file
    export_df["export_note"] = note
    return export_df.to_csv(index=False).encode("utf-8")


def dataframe_to_excel_bytes(
    dataframe: pd.DataFrame,
    *,
    snapshot_date: str,
    source_file: str,
    note: str,
    summary_name: str = "Data",
    extra_sheets: dict[str, pd.DataFrame] | None = None,
) -> bytes:
    buffer = BytesIO()
    export_df = dataframe.copy()
    export_df["export_snapshot_date"] = snapshot_date
    export_df["export_source_file"] = source_file
    export_df["export_note"] = note

    metadata = pd.DataFrame(
        [
            {"property": "snapshot_date", "value": snapshot_date},
            {"property": "source_file", "value": source_file},
            {"property": "note", "value": note},
            {"property": "row_count", "value": len(dataframe)},
        ]
    )

    used_names: set[str] = set()

    def next_sheet_name(raw_name: str) -> str:
        base_name = "".join(char if char not in '[]:*?/\\' else "_" for char in raw_name).strip() or "Sheet"
        candidate = base_name[:31]
        suffix = 2
        while candidate in used_names:
            stem = base_name[: max(0, 31 - len(str(suffix)) - 1)]
            candidate = f"{stem}_{suffix}"
            suffix += 1
        used_names.add(candidate)
        return candidate

    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        export_df.to_excel(writer, index=False, sheet_name=next_sheet_name(summary_name))
        metadata.to_excel(writer, index=False, sheet_name=next_sheet_name("Metadata"))
        for sheet_name, sheet_df in (extra_sheets or {}).items():
            export_sheet_df = sheet_df.copy()
            export_sheet_df["export_snapshot_date"] = snapshot_date
            export_sheet_df["export_source_file"] = source_file
            export_sheet_df["export_note"] = note
            export_sheet_df.to_excel(writer, index=False, sheet_name=next_sheet_name(sheet_name))
    return buffer.getvalue()


def persist_export(export_dir: Path, filename: str, payload: bytes) -> Path:
    export_path = export_dir / filename
    export_path.write_bytes(payload)
    return export_path
