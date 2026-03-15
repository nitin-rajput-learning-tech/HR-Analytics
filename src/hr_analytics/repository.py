from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Iterable

import duckdb
import pandas as pd

from .constants import BLANK_ALIAS_TOKEN, EMPLOYEE_COLUMNS
from .models import SnapshotCandidate, ValidationIssue
from .normalization import collapse_whitespace, normalize_alias_key, normalize_display_value

_CONNECTION_LOCK = threading.RLock()
_CONNECTION_RETRY_ATTEMPTS = 6
_CONNECTION_RETRY_SLEEP_SECONDS = 0.3


class DatabaseLockedError(RuntimeError):
    pass


class Repository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._initialize()

    def connect(self) -> duckdb.DuckDBPyConnection:
        database_key = str(self.database_path)
        last_error: Exception | None = None
        for attempt in range(_CONNECTION_RETRY_ATTEMPTS):
            try:
                return duckdb.connect(database_key)
            except duckdb.IOException as error:
                last_error = error
                lowered = str(error).lower()
                is_lock_error = "used by another process" in lowered or "being used by another process" in lowered
                is_last_attempt = attempt == _CONNECTION_RETRY_ATTEMPTS - 1
                if is_lock_error and not is_last_attempt:
                    time.sleep(_CONNECTION_RETRY_SLEEP_SECONDS * (attempt + 1))
                    continue
                if is_lock_error:
                    raise DatabaseLockedError(
                        "The local database is currently locked by another HR Analytics process. "
                        "Close other running app windows and retry."
                    ) from error
                raise
        if last_error:
            raise last_error
        raise RuntimeError("Unable to open DuckDB connection.")

    def _initialize(self) -> None:
        with _CONNECTION_LOCK:
            with self.connect() as con:
                con.execute(
                    """
                    create table if not exists snapshot_metadata (
                      snapshot_id varchar primary key,
                      as_of_date date,
                      source_file varchar,
                      source_sheet varchar,
                      source_path varchar,
                      uploaded_by varchar,
                      imported_at timestamp default current_timestamp,
                      row_count integer,
                      compatibility_level varchar,
                      is_active_for_date boolean default false,
                      is_current_view boolean default false,
                      status varchar,
                      parse_confidence double,
                      notes varchar,
                      missing_columns varchar,
                      available_columns varchar
                    );
                    """
                )
                self._ensure_column(con, "snapshot_metadata", "uploaded_by", "varchar")
                con.execute(
                    """
                    create table if not exists employee_snapshots (
                      snapshot_id varchar,
                      as_of_date date,
                      employee_number varchar,
                      full_name varchar,
                      legal_entity varchar,
                      last_working_day date,
                      current_city varchar,
                      work_phone varchar,
                      work_email varchar,
                      exit_requested_on date,
                      sub_department varchar,
                      gender varchar,
                      date_joined date,
                      employment_status varchar,
                      job_title varchar,
                      l2_manager varchar,
                      reporting_manager varchar,
                      department varchar,
                      source_file varchar,
                      compatibility_level varchar
                    );
                    """
                )
                con.execute(
                    """
                    create table if not exists employee_latest as
                    select * from employee_snapshots where 1 = 0;
                    """
                )
                con.execute(
                    """
                    create table if not exists employee_events (
                      event_id varchar,
                      employee_number varchar,
                      full_name varchar,
                      event_type varchar,
                      event_date date,
                      snapshot_id varchar,
                      as_of_date date,
                      department varchar,
                      sub_department varchar,
                      legal_entity varchar,
                      current_city varchar,
                      reporting_manager varchar,
                      employment_status varchar,
                      source_file varchar
                    );
                    """
                )
                self._ensure_column(con, "employee_events", "current_city", "varchar")
                con.execute(
                    """
                    create table if not exists validation_issues (
                      issue_id varchar primary key,
                      snapshot_id varchar,
                      severity varchar,
                      issue_type varchar,
                      field_name varchar,
                      issue_count integer,
                      sample_values varchar,
                      message varchar
                    );
                    """
                )
                con.execute(
                    """
                    create table if not exists value_aliases (
                      alias_id varchar primary key,
                      field_name varchar,
                      raw_value varchar,
                      canonical_value varchar,
                      is_active boolean default true,
                      created_at timestamp default current_timestamp,
                      updated_at timestamp default current_timestamp
                    );
                    """
                )

    def has_snapshots(self) -> bool:
        with _CONNECTION_LOCK:
            with self.connect() as con:
                return bool(con.execute("select count(*) from snapshot_metadata").fetchone()[0])

    def has_imported_snapshots(self) -> bool:
        with _CONNECTION_LOCK:
            with self.connect() as con:
                return bool(
                    con.execute(
                        "select count(*) from snapshot_metadata where status = 'imported'"
                    ).fetchone()[0]
                )

    def save_snapshot(self, candidate: SnapshotCandidate, force_reimport: bool = False) -> tuple[str, str]:
        snapshot_id = candidate.snapshot_id
        if not snapshot_id:
            raise ValueError("snapshot_id is required before save_snapshot")

        with _CONNECTION_LOCK:
            with self.connect() as con:
                if force_reimport:
                    self._delete_snapshot(con, snapshot_id)

                existing = con.execute(
                    "select snapshot_id from snapshot_metadata where snapshot_id = ?",
                    [snapshot_id],
                ).fetchone()
                if existing:
                    return snapshot_id, "already_imported"

                status = candidate.status
                is_active_for_date = False
                if status == "imported" and candidate.as_of_date:
                    winner = con.execute(
                        """
                        select snapshot_id, row_count
                        from snapshot_metadata
                        where as_of_date = ? and status = 'imported' and is_active_for_date = true
                        order by row_count desc, imported_at desc
                        limit 1
                        """,
                        [candidate.as_of_date],
                    ).fetchone()
                    if winner:
                        current_winner_id, current_winner_rows = winner
                        if candidate.row_count > current_winner_rows:
                            con.execute(
                                """
                                update snapshot_metadata
                                set status = 'quarantined_duplicate',
                                    is_active_for_date = false,
                                    notes = coalesce(notes, '') || case when notes is null or notes = '' then '' else ' | ' end || 'Superseded by higher row-count snapshot'
                                where snapshot_id = ?
                                """,
                                [current_winner_id],
                            )
                            is_active_for_date = True
                        else:
                            status = "quarantined_duplicate"
                    else:
                        is_active_for_date = True

                notes = " | ".join(candidate.notes)
                con.execute(
                    """
                    insert into snapshot_metadata (
                      snapshot_id, as_of_date, source_file, source_sheet, source_path, uploaded_by, row_count,
                      compatibility_level, is_active_for_date, is_current_view, status,
                      parse_confidence, notes, missing_columns, available_columns
                    )
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, false, ?, ?, ?, ?, ?)
                    """,
                    [
                        snapshot_id,
                        candidate.as_of_date,
                        candidate.source_name,
                        candidate.detected_sheet,
                        str(candidate.raw_file_path or candidate.source_path or ""),
                        candidate.uploaded_by,
                        candidate.row_count,
                        candidate.compatibility_level,
                        is_active_for_date,
                        status,
                        candidate.parse_confidence,
                        notes,
                        json.dumps(candidate.missing_columns),
                        json.dumps(candidate.available_columns),
                    ],
                )

                if status == "imported" and not candidate.dataframe.empty:
                    dataframe = candidate.dataframe.copy()
                    dataframe["snapshot_id"] = snapshot_id
                    dataframe["as_of_date"] = pd.to_datetime(candidate.as_of_date)
                    dataframe["source_file"] = candidate.source_name
                    dataframe["compatibility_level"] = candidate.compatibility_level
                    ordered = dataframe[
                        [
                            "snapshot_id",
                            "as_of_date",
                            *EMPLOYEE_COLUMNS,
                            "source_file",
                            "compatibility_level",
                        ]
                    ]
                    con.register("snapshot_df", ordered)
                    con.execute("insert into employee_snapshots select * from snapshot_df")
                    con.unregister("snapshot_df")

                self._insert_validation_issues(con, snapshot_id, candidate.validation_issues)
                self.refresh_materializations(con)
                self._ensure_current_snapshot(con)
                return snapshot_id, status

    def _insert_validation_issues(
        self,
        con: duckdb.DuckDBPyConnection,
        snapshot_id: str,
        issues: Iterable[ValidationIssue],
    ) -> None:
        records = []
        for issue in issues:
            records.append(
                {
                    "issue_id": str(uuid.uuid4()),
                    "snapshot_id": snapshot_id,
                    **asdict(issue),
                }
            )
        if not records:
            return
        issue_df = pd.DataFrame(records)
        con.register("issue_df", issue_df)
        con.execute("insert into validation_issues select * from issue_df")
        con.unregister("issue_df")

    def _delete_snapshot(self, con: duckdb.DuckDBPyConnection, snapshot_id: str) -> None:
        con.execute("delete from validation_issues where snapshot_id = ?", [snapshot_id])
        con.execute("delete from employee_snapshots where snapshot_id = ?", [snapshot_id])
        con.execute("delete from snapshot_metadata where snapshot_id = ?", [snapshot_id])

    def refresh_materializations(self, con: duckdb.DuckDBPyConnection | None = None) -> None:
        owns_connection = con is None
        with _CONNECTION_LOCK:
            active_connection = con if con is not None else self.connect()
            try:
                active_connection.execute("delete from employee_latest")
                active_connection.execute(
                    """
                    insert into employee_latest
                    with eligible as (
                      select e.*
                      from employee_snapshots e
                      join snapshot_metadata s on s.snapshot_id = e.snapshot_id
                      where s.status = 'imported' and s.is_active_for_date = true
                    ),
                    ranked as (
                      select *,
                             row_number() over (
                               partition by employee_number
                               order by as_of_date desc, snapshot_id desc
                             ) as rn
                      from eligible
                    )
                    select
                      snapshot_id, as_of_date, employee_number, full_name, legal_entity,
                      last_working_day, current_city, work_phone, work_email, exit_requested_on,
                      sub_department, gender, date_joined, employment_status, job_title,
                      l2_manager, reporting_manager, department, source_file, compatibility_level
                    from ranked
                    where rn = 1
                    """
                )

                active_connection.execute("delete from employee_events")
                active_connection.execute(
                    """
                    insert into employee_events
                    with eligible as (
                      select e.*
                      from employee_snapshots e
                      join snapshot_metadata s on s.snapshot_id = e.snapshot_id
                      where s.status = 'imported' and s.is_active_for_date = true
                    ),
                    join_events as (
                      select *,
                             'joiner' as event_type,
                             date_joined as event_date,
                             row_number() over (
                               partition by employee_number, date_joined
                               order by as_of_date desc, snapshot_id desc
                             ) as rn
                      from eligible
                      where date_joined is not null
                    ),
                    exit_events as (
                      select *,
                             'leaver' as event_type,
                             last_working_day as event_date,
                             row_number() over (
                               partition by employee_number, last_working_day
                               order by as_of_date desc, snapshot_id desc
                             ) as rn
                      from eligible
                      where last_working_day is not null
                    ),
                    all_events as (
                      select * from join_events where rn = 1
                      union all
                      select * from exit_events where rn = 1
                    )
                    select
                      employee_number || '-' || event_type || '-' || cast(event_date as varchar) as event_id,
                      employee_number,
                      full_name,
                      event_type,
                      event_date,
                      snapshot_id,
                      as_of_date,
                      department,
                      sub_department,
                      legal_entity,
                      current_city,
                      reporting_manager,
                      employment_status,
                      source_file
                    from all_events
                    """
                )
            finally:
                if owns_connection:
                    active_connection.close()

    def _ensure_current_snapshot(self, con: duckdb.DuckDBPyConnection) -> None:
        current = con.execute(
            "select snapshot_id from snapshot_metadata where is_current_view = true limit 1"
        ).fetchone()
        if current:
            return
        latest = con.execute(
            """
            select snapshot_id
            from snapshot_metadata
            where status = 'imported' and is_active_for_date = true
            order by as_of_date desc, row_count desc
            limit 1
            """
        ).fetchone()
        if latest:
            con.execute("update snapshot_metadata set is_current_view = false")
            con.execute(
                "update snapshot_metadata set is_current_view = true where snapshot_id = ?",
                [latest[0]],
            )

    def list_snapshots(self) -> pd.DataFrame:
        with _CONNECTION_LOCK:
            with self.connect() as con:
                return con.execute(
                    """
                    select snapshot_id, as_of_date, source_file, source_sheet, source_path, uploaded_by, row_count,
                           compatibility_level, is_active_for_date, is_current_view, status,
                           parse_confidence, notes, missing_columns, available_columns, imported_at
                    from snapshot_metadata
                    order by as_of_date desc nulls last, imported_at desc, source_file asc
                    """
                ).df()

    def get_snapshot(self, snapshot_id: str) -> pd.Series | None:
        snapshots = self.list_snapshots()
        if snapshots.empty:
            return None
        matches = snapshots[snapshots["snapshot_id"] == snapshot_id]
        if matches.empty:
            return None
        return matches.iloc[0]

    def set_current_snapshot(self, snapshot_id: str) -> None:
        with _CONNECTION_LOCK:
            with self.connect() as con:
                con.execute("update snapshot_metadata set is_current_view = false")
                con.execute(
                    """
                    update snapshot_metadata
                    set is_current_view = true
                    where snapshot_id = ? and status = 'imported'
                    """,
                    [snapshot_id],
                )

    def get_current_snapshot_id(self) -> str | None:
        with _CONNECTION_LOCK:
            with self.connect() as con:
                row = con.execute(
                    """
                    select snapshot_id
                    from snapshot_metadata
                    where is_current_view = true and status = 'imported'
                    limit 1
                    """
                ).fetchone()
        return row[0] if row else None

    def get_snapshot_dataframe(self, snapshot_id: str) -> pd.DataFrame:
        with _CONNECTION_LOCK:
            with self.connect() as con:
                df = con.execute(
                    """
                    select *
                    from employee_snapshots
                    where snapshot_id = ?
                    order by full_name
                    """,
                    [snapshot_id],
                ).df()
        return self.apply_value_aliases(df)

    def get_employee_latest(self) -> pd.DataFrame:
        with _CONNECTION_LOCK:
            with self.connect() as con:
                df = con.execute("select * from employee_latest order by full_name").df()
        return self.apply_value_aliases(df)

    def get_employee_events(self) -> pd.DataFrame:
        with _CONNECTION_LOCK:
            with self.connect() as con:
                df = con.execute("select * from employee_events").df()
        return self.apply_value_aliases(df)

    def get_validation_report(self, snapshot_id: str | None = None) -> pd.DataFrame:
        with _CONNECTION_LOCK:
            with self.connect() as con:
                if snapshot_id:
                    return con.execute(
                        """
                        select *
                        from validation_issues
                        where snapshot_id = ?
                        order by severity, issue_type, field_name
                        """,
                        [snapshot_id],
                    ).df()
                return con.execute(
                    "select * from validation_issues order by snapshot_id, severity, issue_type"
                ).df()

    def get_latest_import_metadata(self) -> pd.Series | None:
        snapshots = self.list_snapshots()
        imported = snapshots[snapshots["status"] == "imported"]
        if imported.empty:
            return None
        return imported.sort_values("imported_at", ascending=False).iloc[0]

    def get_value_aliases(self) -> pd.DataFrame:
        with _CONNECTION_LOCK:
            with self.connect() as con:
                return con.execute(
                    """
                    select alias_id, field_name, raw_value, canonical_value, is_active
                    from value_aliases
                    where is_active = true
                    order by field_name, raw_value
                    """
                ).df()

    def seed_value_aliases(self, aliases: list[dict[str, str]]) -> None:
        with _CONNECTION_LOCK:
            with self.connect() as con:
                existing_rows = con.execute(
                    """
                    select field_name, raw_value
                    from value_aliases
                    where is_active = true
                    """
                ).fetchall()
                existing_keys = {
                    (field_name, normalize_alias_key(field_name, raw_value))
                    for field_name, raw_value in existing_rows
                }
                records = []
                for alias in aliases:
                    field_name = _clean_alias_cell(alias.get("field_name"))
                    raw_value = _clean_alias_cell(alias.get("raw_value"), allow_blank_token=True)
                    canonical_value = _clean_alias_cell(alias.get("canonical_value"))
                    if not field_name or raw_value is None or canonical_value is None:
                        continue
                    canonical_value = normalize_display_value(field_name, canonical_value)
                    alias_key = normalize_alias_key(field_name, raw_value)
                    if (field_name, alias_key) in existing_keys:
                        continue
                    records.append(
                        {
                            "alias_id": str(uuid.uuid4()),
                            "field_name": field_name,
                            "raw_value": raw_value,
                            "canonical_value": canonical_value,
                            "is_active": True,
                        }
                    )
                    existing_keys.add((field_name, alias_key))
                alias_df = pd.DataFrame(records)
                if alias_df.empty:
                    return
                con.register("alias_df", alias_df)
                con.execute(
                    """
                    insert into value_aliases (alias_id, field_name, raw_value, canonical_value, is_active)
                    select alias_id, field_name, raw_value, canonical_value, is_active from alias_df
                    """
                )
                con.unregister("alias_df")

    def replace_value_aliases(self, aliases: pd.DataFrame) -> None:
        with _CONNECTION_LOCK:
            with self.connect() as con:
                con.execute("delete from value_aliases")
                if aliases.empty:
                    return
                deduplicated: dict[tuple[str, str], dict[str, object]] = {}
                for row in aliases.to_dict("records"):
                    field_name = _clean_alias_cell(row.get("field_name"))
                    raw_value = _clean_alias_cell(row.get("raw_value"), allow_blank_token=True)
                    canonical_value = _clean_alias_cell(row.get("canonical_value"))
                    if not field_name or raw_value is None or canonical_value is None:
                        continue
                    canonical_value = normalize_display_value(field_name, canonical_value)
                    alias_key = normalize_alias_key(field_name, raw_value)
                    deduplicated[(field_name, alias_key)] = {
                        "alias_id": str(row.get("alias_id") or uuid.uuid4()),
                        "field_name": field_name,
                        "raw_value": raw_value,
                        "canonical_value": canonical_value,
                        "is_active": bool(row.get("is_active", True)),
                    }
                alias_df = pd.DataFrame(deduplicated.values())
                if alias_df.empty:
                    return
                con.register(
                    "alias_df",
                    alias_df[["alias_id", "field_name", "raw_value", "canonical_value", "is_active"]],
                )
                con.execute(
                    """
                    insert into value_aliases (alias_id, field_name, raw_value, canonical_value, is_active)
                    select alias_id, field_name, raw_value, canonical_value, is_active from alias_df
                    """
                )
                con.unregister("alias_df")

    def apply_value_aliases(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
        alias_lookup: dict[str, dict[str, str]] = {}
        aliases = self.get_value_aliases()
        if not aliases.empty:
            for alias in aliases.itertuples(index=False):
                alias_lookup.setdefault(alias.field_name, {})[
                    normalize_alias_key(alias.field_name, alias.raw_value)
                ] = alias.canonical_value
        result = df.copy()
        for field_name in {"current_city", *alias_lookup.keys()}:
            if field_name not in result.columns:
                continue
            field_aliases = alias_lookup.get(field_name, {})

            def map_value(value: object) -> object:
                alias_key = normalize_alias_key(field_name, value)
                if alias_key in field_aliases:
                    return field_aliases[alias_key]
                return normalize_display_value(field_name, value)

            result[field_name] = result[field_name].map(map_value)
        return result

    def _ensure_column(
        self,
        con: duckdb.DuckDBPyConnection,
        table_name: str,
        column_name: str,
        definition: str,
    ) -> None:
        existing_columns = {
            row[1]
            for row in con.execute(f"pragma table_info('{table_name}')").fetchall()
        }
        if column_name not in existing_columns:
            con.execute(f"alter table {table_name} add column {column_name} {definition}")


def _clean_alias_cell(value: object, *, allow_blank_token: bool = False) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    text = collapse_whitespace(str(value))
    if allow_blank_token and text == BLANK_ALIAS_TOKEN:
        return BLANK_ALIAS_TOKEN
    if not text or text.casefold() in {"nan", "none"}:
        return None
    return text
