from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))
    from hr_analytics.adapters.workbook import (
        WorkbookUploadAdapter,
        manual_publish_block_reason,
        parse_as_of_date,
    )
    from hr_analytics.analytics import (
        SnapshotAvailability,
        apply_filters,
        attrition_hotspots,
        availability_from_metadata,
        backfill_pressure,
        build_watchouts,
        compute_overview_kpis,
        forecast_workforce_by_dimension,
        forecast_workforce,
        movement_summary,
        null_summary,
        with_tenure_columns,
    )
    from hr_analytics.bootstrap import bootstrap_workspace
    from hr_analytics.constants import (
        APP_THEME,
        APP_NAME,
        APP_SUBTITLE,
        DIMENSION_LABELS,
        DIVERSITY_BREAKDOWN_FIELDS,
        EXIT_BREAKDOWN_FIELDS,
        EXPORT_NOTE_EVENT,
        EXPORT_NOTE_PARTIAL,
        FILTER_FIELDS,
        MANAGER_HIERARCHY_FIELDS,
        MOVEMENT_GRAIN_OPTIONS,
        STRUCTURE_DIMENSIONS,
        resource_path,
    )
    from hr_analytics.exports import dataframe_to_csv_bytes, dataframe_to_excel_bytes, persist_export
    from hr_analytics.repository import DatabaseLockedError, Repository
    from hr_analytics.workspace import AppWorkspace
else:
    from .adapters.workbook import (
        WorkbookUploadAdapter,
        manual_publish_block_reason,
        parse_as_of_date,
    )
    from .analytics import (
        SnapshotAvailability,
        apply_filters,
        attrition_hotspots,
        availability_from_metadata,
        backfill_pressure,
        build_watchouts,
        compute_overview_kpis,
        forecast_workforce_by_dimension,
        forecast_workforce,
        movement_summary,
        null_summary,
        with_tenure_columns,
    )
    from .bootstrap import bootstrap_workspace
    from .constants import (
        APP_THEME,
        APP_NAME,
        APP_SUBTITLE,
        DIMENSION_LABELS,
        DIVERSITY_BREAKDOWN_FIELDS,
        EXIT_BREAKDOWN_FIELDS,
        EXPORT_NOTE_EVENT,
        EXPORT_NOTE_PARTIAL,
        FILTER_FIELDS,
        MANAGER_HIERARCHY_FIELDS,
        MOVEMENT_GRAIN_OPTIONS,
        STRUCTURE_DIMENSIONS,
        resource_path,
    )
    from .exports import dataframe_to_csv_bytes, dataframe_to_excel_bytes, persist_export
    from .repository import DatabaseLockedError, Repository
    from .workspace import AppWorkspace

PAGES = [
    "Overview",
    "Organization Structure",
    "Manager View",
    "Movement & Attrition",
    "Predictive Analysis",
    "Diversity & Geography",
    "Data Quality & Audit",
    "Uploads & Archive",
]


@st.cache_resource(show_spinner=False)
def get_services() -> tuple[AppWorkspace, Repository, WorkbookUploadAdapter]:
    workspace = AppWorkspace.discover()
    repository = Repository(workspace.database_path)
    adapter = WorkbookUploadAdapter(workspace, repository)
    return workspace, repository, adapter


def main() -> None:
    st.set_page_config(
        page_title=APP_NAME,
        page_icon="📊",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    render_theme()

    try:
        workspace, repository, adapter = get_services()
    except DatabaseLockedError as error:
        st.error(str(error))
        st.info("Close other app windows using the same workspace and retry.")
        st.stop()
    if "bootstrapped" not in st.session_state:
        st.session_state["bootstrap_messages"] = bootstrap_workspace(workspace, repository)
        st.session_state["bootstrapped"] = True

    snapshots = repository.list_snapshots()
    latest_import_metadata = repository.get_latest_import_metadata()
    imported_active = snapshots[
        (snapshots["status"] == "imported") & (snapshots["is_active_for_date"] == True)
    ].copy()

    render_header(workspace, snapshots)
    if st.session_state.get("bootstrap_messages"):
        with st.expander("Bootstrap import summary", expanded=False):
            for message in st.session_state["bootstrap_messages"]:
                st.write(f"- {message}")

    if imported_active.empty:
        st.warning("No published snapshots are available yet. Upload a workbook from the archive page to begin.")
        render_upload_page(workspace, repository, adapter, snapshots)
        return

    current_snapshot_id = repository.get_current_snapshot_id() or imported_active.iloc[0]["snapshot_id"]
    imported_active = imported_active.sort_values("as_of_date", ascending=False)
    snapshot_options = imported_active["snapshot_id"].tolist()
    default_index = snapshot_options.index(current_snapshot_id) if current_snapshot_id in snapshot_options else 0

    with st.sidebar:
        st.markdown("## Navigation")
        selected_page = st.radio("Page", PAGES, index=0)

        snapshot_labels = {
            row.snapshot_id: f"{row.as_of_date}  |  {row.source_file}  |  {row.compatibility_level}"
            for row in imported_active.itertuples(index=False)
        }
        selected_snapshot_id = st.selectbox(
            "Snapshot view",
            options=snapshot_options,
            index=default_index,
            format_func=lambda option: snapshot_labels[option],
        )
        if selected_snapshot_id != current_snapshot_id:
            repository.set_current_snapshot(selected_snapshot_id)

    selected_metadata = snapshots[snapshots["snapshot_id"] == selected_snapshot_id].iloc[0]
    availability = availability_from_metadata(selected_metadata)
    snapshot_date = pd.Timestamp(selected_metadata["as_of_date"]) if selected_metadata["as_of_date"] else None
    snapshot_df = repository.get_snapshot_dataframe(selected_snapshot_id)
    event_df = repository.get_employee_events()
    if snapshot_date is not None and not event_df.empty:
        event_df = event_df[pd.to_datetime(event_df["event_date"]) <= snapshot_date]

    filters = render_global_filters(snapshot_df, availability)
    filtered_snapshot_df = apply_filters(snapshot_df, filters)
    filtered_event_df = apply_filters(event_df, filters)

    render_coverage_banner(availability, selected_metadata)

    if selected_page == "Overview":
        render_overview_page(
            workspace,
            filtered_snapshot_df,
            filtered_event_df,
            selected_metadata,
            latest_import_metadata,
            availability,
        )
    elif selected_page == "Organization Structure":
        render_structure_page(workspace, filtered_snapshot_df, selected_metadata, availability)
    elif selected_page == "Manager View":
        render_manager_page(workspace, filtered_snapshot_df, selected_metadata, availability)
    elif selected_page == "Movement & Attrition":
        render_movement_page(workspace, filtered_snapshot_df, filtered_event_df, selected_metadata, availability)
    elif selected_page == "Predictive Analysis":
        render_predictive_page(
            workspace,
            filtered_snapshot_df,
            filtered_event_df,
            selected_metadata,
            availability,
        )
    elif selected_page == "Diversity & Geography":
        render_diversity_page(workspace, filtered_snapshot_df, selected_metadata, availability)
    elif selected_page == "Data Quality & Audit":
        render_quality_page(repository, filtered_snapshot_df, selected_metadata, snapshots)
    else:
        render_upload_page(workspace, repository, adapter, snapshots)


def render_theme() -> None:
    st.markdown(
        f"""
        <style>
          :root {{
            --app-primary: {APP_THEME["primary"]};
            --app-accent: {APP_THEME["accent"]};
            --app-bg: {APP_THEME["bg"]};
            --app-surface: {APP_THEME["surface"]};
            --app-ink: {APP_THEME["ink"]};
            --app-muted: {APP_THEME["muted"]};
          }}
          .stApp {{
            background:
              radial-gradient(circle at top right, rgba(242,107,33,0.12), transparent 30%),
              linear-gradient(180deg, #ffffff 0%, var(--app-bg) 100%);
          }}
          .app-shell {{
            background: rgba(255,255,255,0.82);
            border: 1px solid rgba(21,32,51,0.08);
            border-radius: 18px;
            padding: 1.4rem 1.4rem 0.4rem;
            box-shadow: 0 20px 60px rgba(21,32,51,0.08);
            margin-bottom: 1rem;
          }}
          .app-kicker {{
            color: var(--app-accent);
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-size: 0.75rem;
          }}
          .app-title {{
            color: var(--app-ink);
            font-size: 2rem;
            font-weight: 800;
            margin: 0.2rem 0 0.3rem;
          }}
          .app-subtitle {{
            color: var(--app-muted);
            margin-bottom: 0.8rem;
          }}
          .small-note {{
            color: var(--app-muted);
            font-size: 0.88rem;
          }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_header(workspace: AppWorkspace, snapshots: pd.DataFrame) -> None:
    imported_count = int((snapshots["status"] == "imported").sum()) if not snapshots.empty else 0
    quarantined_count = int((snapshots["status"] == "quarantined_duplicate").sum()) if not snapshots.empty else 0
    latest_upload_text = "No uploads yet"
    if not snapshots.empty and (snapshots["status"] == "imported").any():
        latest_snapshot = (
            snapshots[snapshots["status"] == "imported"]
            .sort_values("imported_at", ascending=False)
            .iloc[0]
        )
        latest_upload_text = format_timestamp(latest_snapshot["imported_at"])
    st.markdown(
        f"""
        <div class="app-shell">
          <div class="app-kicker">Local Analytics</div>
          <div class="app-title">{APP_NAME}</div>
          <div class="app-subtitle">{APP_SUBTITLE}. Archive-backed, offline-friendly, and built for rapid HR drill-down.</div>
          <div class="small-note">
            Workspace: {workspace.root}<br/>
            Published snapshots: {imported_count} | Quarantined duplicates: {quarantined_count}<br/>
            Latest upload: {latest_upload_text}
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_coverage_banner(availability: SnapshotAvailability, metadata: pd.Series) -> None:
    if availability.compatibility_level == "partial":
        st.warning(
            "This snapshot was imported with partial coverage. Some visuals are intentionally limited so the app does not overstate incomplete history."
        )
    elif availability.compatibility_level == "compatible_with_warnings":
        st.info("This snapshot is usable, but some optional dimensions are missing.")
    if metadata["notes"]:
        st.caption(str(metadata["notes"]))


def format_timestamp(value: object) -> str:
    timestamp = pd.to_datetime(value, errors="coerce")
    if pd.isna(timestamp):
        return "Unavailable"
    return timestamp.strftime("%d %b %Y %I:%M %p")


def validation_issues_to_dataframe(candidate_issues: list[object]) -> pd.DataFrame:
    if not candidate_issues:
        return pd.DataFrame(
            columns=["severity", "issue_type", "field_name", "issue_count", "message", "sample_values"]
        )
    return pd.DataFrame(
        [
            {
                "severity": issue.severity,
                "issue_type": issue.issue_type,
                "field_name": issue.field_name,
                "issue_count": issue.issue_count,
                "message": issue.message,
                "sample_values": issue.sample_values,
            }
            for issue in candidate_issues
        ]
    )


def render_validation_review(candidate: object) -> None:
    st.markdown("#### Validation summary")
    summary_col1, summary_col2, summary_col3, summary_col4 = st.columns(4)
    summary_col1.metric("Compatibility", str(candidate.compatibility_level).replace("_", " ").title())
    summary_col2.metric("Row count", f"{candidate.row_count:,}")
    summary_col3.metric("Detected sheet", candidate.detected_sheet or "Unavailable")
    summary_col4.metric("Uploader", candidate.uploaded_by)
    st.caption(candidate.parse_note)

    detail_col1, detail_col2 = st.columns(2)
    detail_col1.markdown("**Available columns**")
    detail_col1.write(", ".join(candidate.available_columns) if candidate.available_columns else "None detected")
    detail_col2.markdown("**Missing columns**")
    detail_col2.write(", ".join(candidate.missing_columns) if candidate.missing_columns else "None")

    issues_df = validation_issues_to_dataframe(candidate.validation_issues)
    if issues_df.empty:
        st.success("No validation issues were found in the workbook preview.")
    else:
        st.dataframe(issues_df, width="stretch", hide_index=True)
        exception_csv = dataframe_to_csv_bytes(
            issues_df,
            snapshot_date=str(candidate.as_of_date),
            source_file=str(candidate.source_name),
            note="Pre-publish validation review",
        )
        exception_xlsx = dataframe_to_excel_bytes(
            issues_df,
            snapshot_date=str(candidate.as_of_date),
            source_file=str(candidate.source_name),
            note="Pre-publish validation review",
            summary_name="ValidationPreview",
        )
        download_col1, download_col2 = st.columns(2)
        download_col1.download_button(
            "Download exception log (CSV)",
            data=exception_csv,
            file_name=f"validation_preview_{sanitize_key_fragment(candidate.source_name)}.csv",
            mime="text/csv",
            key=f"preview-csv-{candidate.snapshot_id}",
        )
        download_col2.download_button(
            "Download exception log (XLSX)",
            data=exception_xlsx,
            file_name=f"validation_preview_{sanitize_key_fragment(candidate.source_name)}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            key=f"preview-xlsx-{candidate.snapshot_id}",
        )


def issue_counts_by_type(issues: pd.DataFrame) -> dict[str, int]:
    if issues.empty:
        return {}
    counts: dict[str, int] = {}
    for row in issues.itertuples(index=False):
        counts[row.issue_type] = counts.get(row.issue_type, 0) + int(row.issue_count)
        key_with_field = f"{row.issue_type}:{row.field_name}"
        counts[key_with_field] = counts.get(key_with_field, 0) + int(row.issue_count)
    return counts


def sanitize_key_fragment(value: str) -> str:
    return "".join(char if char.isalnum() else "_" for char in value)[:48]


def render_global_filters(
    dataframe: pd.DataFrame, availability: SnapshotAvailability
) -> dict[str, list[str]]:
    filters: dict[str, list[str]] = {}
    with st.sidebar:
        st.markdown("## Global filters")
        for field_name in FILTER_FIELDS:
            label = field_name.replace("_", " ").title()
            if field_name not in availability.available_columns or field_name not in dataframe.columns:
                st.multiselect(label, options=["Unavailable in this snapshot"], default=[], disabled=True)
                continue
            series = dataframe[field_name].fillna("Unspecified").astype(str)
            options = sorted(value for value in series.unique() if value)
            filters[field_name] = st.multiselect(label, options=options)
    return filters


def render_export_actions(
    *,
    workspace: AppWorkspace,
    base_name: str,
    dataframe: pd.DataFrame,
    snapshot_meta: pd.Series,
    note: str,
    summary_name: str = "Data",
    extra_sheets: dict[str, pd.DataFrame] | None = None,
) -> None:
    snapshot_date = str(snapshot_meta["as_of_date"])
    source_file = str(snapshot_meta["source_file"])
    csv_payload = dataframe_to_csv_bytes(
        dataframe, snapshot_date=snapshot_date, source_file=source_file, note=note
    )
    excel_payload = dataframe_to_excel_bytes(
        dataframe,
        snapshot_date=snapshot_date,
        source_file=source_file,
        note=note,
        summary_name=summary_name,
        extra_sheets=extra_sheets,
    )

    col1, col2, col3 = st.columns([1, 1, 1.2])
    col1.download_button(
        "Download CSV",
        data=csv_payload,
        file_name=f"{base_name}.csv",
        mime="text/csv",
        key=f"csv-{base_name}",
    )
    col2.download_button(
        "Download XLSX",
        data=excel_payload,
        file_name=f"{base_name}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        key=f"xlsx-{base_name}",
    )
    if col3.button("Save XLSX to exports folder", key=f"save-{base_name}"):
        path = persist_export(workspace.exports_dir, f"{base_name}.xlsx", excel_payload)
        st.success(f"Saved export to {path}")


def render_overview_page(
    workspace: AppWorkspace,
    snapshot_df: pd.DataFrame,
    event_df: pd.DataFrame,
    metadata: pd.Series,
    latest_import_metadata: pd.Series | None,
    availability: SnapshotAvailability,
) -> None:
    st.subheader("Overview")
    kpis = compute_overview_kpis(snapshot_df, snapshot_date=pd.Timestamp(metadata["as_of_date"]))
    latest_upload = format_timestamp(
        latest_import_metadata["imported_at"] if latest_import_metadata is not None else metadata["imported_at"]
    )
    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric("Rows", f"{kpis['rows']:,}")
    col2.metric("Active headcount", f"{kpis['active']:,}")
    col3.metric("Relieved employees", f"{kpis['relieved']:,}")
    col4.metric("Pending exits", f"{kpis['pending_exits']:,}")
    col5.metric("Latest upload", latest_upload)

    ratio_col1, ratio_col2 = st.columns(2)
    ratio_col1.metric("Active ratio", f"{kpis['active_ratio']}%")
    ratio_col2.metric("Relieved ratio", f"{kpis['relieved_ratio']}%")

    split_df = pd.DataFrame(
        [
            {"employment_status": "Working", "count": kpis["active"]},
            {"employment_status": "Relieved", "count": kpis["relieved"]},
        ]
    )
    selected_grain_label = st.segmented_control(
        "Trend grain",
        options=list(MOVEMENT_GRAIN_OPTIONS.keys()),
        default="Month",
        key=f"overview-grain-{metadata['snapshot_id']}",
    )
    movement_df = movement_summary(
        event_df,
        granularity=MOVEMENT_GRAIN_OPTIONS[selected_grain_label],
        cutoff=pd.Timestamp(metadata["as_of_date"]),
    )
    entity_df = (
        snapshot_df.fillna({"legal_entity": "Unspecified"})
        .groupby("legal_entity")
        .size()
        .reset_index(name="count")
        .sort_values("count", ascending=False)
        .head(15)
    )

    chart_col1, chart_col2 = st.columns([1, 1.3])
    with chart_col1:
        st.plotly_chart(
            px.pie(
                split_df,
                names="employment_status",
                values="count",
                color="employment_status",
                color_discrete_map={"Working": APP_THEME["accent"], "Relieved": APP_THEME["primary"]},
                title="Active vs relieved split",
            ),
            width="stretch",
        )
    with chart_col2:
        if movement_df.empty:
            st.info("No event history is available for the selected filters.")
        else:
            chart_df = movement_df.melt("period_label", ["joiners", "leavers"], "metric", "count")
            st.plotly_chart(
                px.line(
                    chart_df,
                    x="period_label",
                    y="count",
                    color="metric",
                    markers=True,
                    color_discrete_map={"joiners": APP_THEME["accent"], "leavers": APP_THEME["primary"]},
                    title=f"Reconstructed joiners vs exits by {selected_grain_label.lower()}",
                ),
                width="stretch",
            )
            st.caption(EXPORT_NOTE_EVENT)

    st.plotly_chart(
        px.bar(
            entity_df,
            x="count",
            y="legal_entity",
            orientation="h",
            color="count",
            color_continuous_scale=["#dbeafe", APP_THEME["primary"]],
            title="Headcount by legal entity",
        ),
        width="stretch",
    )
    export_note = EXPORT_NOTE_PARTIAL if availability.compatibility_level == "partial" else "Snapshot export"
    render_export_actions(
        workspace=workspace,
        base_name=f"overview_{metadata['as_of_date']}",
        dataframe=snapshot_df,
        snapshot_meta=metadata,
        note=export_note,
        summary_name="OverviewRows",
    )


def render_structure_page(
    workspace: AppWorkspace,
    snapshot_df: pd.DataFrame,
    metadata: pd.Series,
    availability: SnapshotAvailability,
) -> None:
    st.subheader("Organization Structure")
    dept_df = snapshot_df.fillna({"department": "Unspecified"}).groupby("department").size().reset_index(name="count")
    sub_df = snapshot_df.fillna({"sub_department": "Unspecified"}).groupby("sub_department").size().reset_index(name="count")
    job_df = snapshot_df.fillna({"job_title": "Unspecified"}).groupby("job_title").size().reset_index(name="count")
    entity_df = snapshot_df.fillna({"legal_entity": "Unspecified"}).groupby("legal_entity").size().reset_index(name="count")

    col1, col2 = st.columns(2)
    col1.plotly_chart(
        px.treemap(
            dept_df.sort_values("count", ascending=False).head(20),
            path=["department"],
            values="count",
            color="count",
            color_continuous_scale=["#e0f2fe", APP_THEME["accent"]],
            title="Departments",
        ),
        width="stretch",
    )
    col2.plotly_chart(
        px.bar(
            sub_df.sort_values("count", ascending=False).head(15),
            x="count",
            y="sub_department",
            orientation="h",
            color="count",
            color_continuous_scale=["#dbeafe", APP_THEME["primary"]],
            title="Sub-departments",
        ),
        width="stretch",
    )

    col3, col4 = st.columns(2)
    col3.plotly_chart(
        px.bar(
            job_df.sort_values("count", ascending=False).head(15),
            x="count",
            y="job_title",
            orientation="h",
            color="count",
            color_continuous_scale=["#e0f2fe", APP_THEME["accent"]],
            title="Job titles",
        ),
        width="stretch",
    )
    col4.plotly_chart(
        px.bar(
            entity_df.sort_values("count", ascending=False),
            x="count",
            y="legal_entity",
            orientation="h",
            color="count",
            color_continuous_scale=["#dbeafe", APP_THEME["primary"]],
            title="Legal entities",
        ),
        width="stretch",
    )

    available_dimensions = [
        field_name
        for field_name in STRUCTURE_DIMENSIONS
        if field_name in availability.available_columns and field_name in snapshot_df.columns
    ]
    st.markdown("#### Structure drill-down")
    if not available_dimensions:
        st.info("No additional structure dimensions are available for this snapshot.")
    else:
        drill_col1, drill_col2 = st.columns(2)
        primary_dimension = drill_col1.selectbox(
            "Primary dimension",
            options=available_dimensions,
            format_func=lambda field_name: DIMENSION_LABELS.get(field_name, field_name.replace("_", " ").title()),
            key=f"structure-primary-{metadata['snapshot_id']}",
        )
        secondary_options = ["None"] + [field for field in available_dimensions if field != primary_dimension]
        secondary_dimension = drill_col2.selectbox(
            "Break down by",
            options=secondary_options,
            format_func=lambda field_name: "None" if field_name == "None" else DIMENSION_LABELS.get(field_name, field_name.replace("_", " ").title()),
            key=f"structure-secondary-{metadata['snapshot_id']}",
        )
        drill_df = snapshot_df.fillna("Unspecified")
        if secondary_dimension == "None":
            summary_df = (
                drill_df.groupby(primary_dimension)
                .size()
                .reset_index(name="count")
                .sort_values("count", ascending=False)
                .head(20)
            )
            st.plotly_chart(
                px.bar(
                    summary_df,
                    x="count",
                    y=primary_dimension,
                    orientation="h",
                    color="count",
                    color_continuous_scale=["#e0f2fe", APP_THEME["accent"]],
                    title=f"Headcount by {DIMENSION_LABELS.get(primary_dimension, primary_dimension)}",
                ),
                width="stretch",
            )
        else:
            summary_df = (
                drill_df.groupby([primary_dimension, secondary_dimension])
                .size()
                .reset_index(name="count")
            )
            top_primary = (
                summary_df.groupby(primary_dimension)["count"]
                .sum()
                .sort_values(ascending=False)
                .head(12)
                .index
            )
            summary_df = summary_df[summary_df[primary_dimension].isin(top_primary)]
            st.plotly_chart(
                px.bar(
                    summary_df,
                    x="count",
                    y=primary_dimension,
                    color=secondary_dimension,
                    orientation="h",
                    title=(
                        f"Headcount by {DIMENSION_LABELS.get(primary_dimension, primary_dimension)} "
                        f"and {DIMENSION_LABELS.get(secondary_dimension, secondary_dimension)}"
                    ),
                ),
                width="stretch",
            )
        st.dataframe(summary_df, width="stretch", hide_index=True)
    render_export_actions(
        workspace=workspace,
        base_name=f"organization_structure_{metadata['as_of_date']}",
        dataframe=snapshot_df,
        snapshot_meta=metadata,
        note=EXPORT_NOTE_PARTIAL if availability.compatibility_level == "partial" else "Structure export",
        summary_name="StructureRows",
    )


def render_manager_page(
    workspace: AppWorkspace,
    snapshot_df: pd.DataFrame,
    metadata: pd.Series,
    availability: SnapshotAvailability,
) -> None:
    st.subheader("Manager View")
    hierarchy_fields = [
        field_name
        for field_name in MANAGER_HIERARCHY_FIELDS
        if field_name in availability.available_columns and field_name in snapshot_df.columns
    ]
    if not hierarchy_fields:
        st.warning("Manager hierarchy fields are unavailable for this snapshot.")
        return

    hierarchy_field = st.selectbox(
        "Hierarchy level",
        options=hierarchy_fields,
        format_func=lambda field_name: DIMENSION_LABELS.get(field_name, field_name.replace("_", " ").title()),
        key=f"manager-hierarchy-{metadata['snapshot_id']}",
    )
    manager_summary = (
        snapshot_df.fillna({hierarchy_field: "Unspecified"})
        .assign(
            active_flag=lambda df: df["employment_status"].fillna("").eq("Working").astype(int),
            relieved_flag=lambda df: df["employment_status"].fillna("").eq("Relieved").astype(int),
        )
        .groupby(hierarchy_field, as_index=False)
        .agg(team_size=("employee_number", "count"), active_team=("active_flag", "sum"), relieved_team=("relieved_flag", "sum"))
        .sort_values("team_size", ascending=False)
    )
    top_managers = manager_summary.head(15)
    st.plotly_chart(
        px.bar(
            top_managers,
            x="team_size",
            y=hierarchy_field,
            orientation="h",
            color="active_team",
            color_continuous_scale=["#e0f2fe", APP_THEME["accent"]],
            title=f"Top {DIMENSION_LABELS.get(hierarchy_field, hierarchy_field)} spans",
            hover_data=["relieved_team"],
        ),
        width="stretch",
    )
    detail_options = manager_summary[hierarchy_field].tolist()
    selected_manager = st.selectbox(
        "Inspect manager team",
        options=detail_options,
        index=0,
        key=f"manager-detail-{metadata['snapshot_id']}",
    )
    team_df = (
        snapshot_df.fillna({hierarchy_field: "Unspecified"})
        .loc[lambda df: df[hierarchy_field] == selected_manager]
        .sort_values(["employment_status", "full_name"])
    )
    st.dataframe(manager_summary, width="stretch", hide_index=True)
    st.markdown("#### Team detail")
    st.dataframe(
        team_df[
            [
                "employee_number",
                "full_name",
                "employment_status",
                "department",
                "sub_department",
                "job_title",
                hierarchy_field,
            ]
        ],
        width="stretch",
        hide_index=True,
    )
    render_export_actions(
        workspace=workspace,
        base_name=f"manager_view_{metadata['as_of_date']}",
        dataframe=manager_summary,
        snapshot_meta=metadata,
        note=EXPORT_NOTE_PARTIAL if availability.compatibility_level == "partial" else "Manager summary export",
        summary_name="ManagerSummary",
    )


def render_movement_page(
    workspace: AppWorkspace,
    snapshot_df: pd.DataFrame,
    event_df: pd.DataFrame,
    metadata: pd.Series,
    availability: SnapshotAvailability,
) -> None:
    st.subheader("Movement & Attrition")
    st.caption(EXPORT_NOTE_EVENT)
    selected_grain_label = st.segmented_control(
        "Trend grain",
        options=list(MOVEMENT_GRAIN_OPTIONS.keys()),
        default="Month",
        key=f"movement-grain-{metadata['snapshot_id']}",
    )
    movement_df = movement_summary(
        event_df,
        granularity=MOVEMENT_GRAIN_OPTIONS[selected_grain_label],
        cutoff=pd.Timestamp(metadata["as_of_date"]),
    )
    tenure_df = with_tenure_columns(snapshot_df, snapshot_date=pd.Timestamp(metadata["as_of_date"]))
    active_df = tenure_df[tenure_df["employment_status"].fillna("").eq("Working")]

    if movement_df.empty:
        st.info("No movement events are available for the selected filters.")
    else:
        col1, col2 = st.columns([1.4, 1])
        col1.plotly_chart(
            px.line(
                movement_df,
                x="period_label",
                y=["joiners", "leavers"],
                markers=True,
                title=f"{selected_grain_label} joiners and exits",
            ),
            width="stretch",
        )
        col2.plotly_chart(
            px.bar(
                movement_df,
                x="period_label",
                y="net_movement",
                color="net_movement",
                color_continuous_scale=["#dbeafe", APP_THEME["accent"]],
                title="Net movement",
            ),
            width="stretch",
        )

    active_band_df = (
        active_df.fillna({"tenure_band_active": "Unknown"})
        .groupby("tenure_band_active")
        .size()
        .reset_index(name="count")
        .sort_values("count", ascending=False)
    )
    exits = tenure_df[tenure_df["employment_status"].fillna("").eq("Relieved")]
    exit_band_df = (
        exits.fillna({"tenure_band_exit": "Unknown"})
        .groupby("tenure_band_exit")
        .size()
        .reset_index(name="count")
        .sort_values("count", ascending=False)
    )
    breakdown_fields = [
        field_name
        for field_name in EXIT_BREAKDOWN_FIELDS
        if field_name in availability.available_columns and field_name in exits.columns
    ]
    selected_breakdown = breakdown_fields[0] if breakdown_fields else None
    if breakdown_fields:
        selected_breakdown = st.selectbox(
            "Exit breakdown",
            options=breakdown_fields,
            format_func=lambda field_name: DIMENSION_LABELS.get(field_name, field_name.replace("_", " ").title()),
            key=f"exit-breakdown-{metadata['snapshot_id']}",
        )
    exit_breakdown_df = pd.DataFrame(columns=["dimension_value", "count"])
    if selected_breakdown is not None:
        exit_breakdown_df = (
            exits.fillna({selected_breakdown: "Unspecified"})
            .groupby(selected_breakdown)
            .size()
            .reset_index(name="count")
            .rename(columns={selected_breakdown: "dimension_value"})
            .sort_values("count", ascending=False)
            .head(15)
        )

    col3, col4 = st.columns(2)
    col3.plotly_chart(
        px.bar(
            active_band_df,
            x="tenure_band_active",
            y="count",
            color="count",
            color_continuous_scale=["#e0f2fe", APP_THEME["accent"]],
            title="Active tenure bands",
        ),
        width="stretch",
    )
    col4.plotly_chart(
        px.bar(
            exit_band_df,
            x="tenure_band_exit",
            y="count",
            color="count",
            color_continuous_scale=["#dbeafe", APP_THEME["primary"]],
            title="Tenure at exit",
        ),
        width="stretch",
    )

    if exit_breakdown_df.empty:
        st.info("No exit breakdown is available for the selected filters.")
    else:
        st.plotly_chart(
            px.bar(
                exit_breakdown_df,
                x="count",
                y="dimension_value",
                orientation="h",
                color="count",
                color_continuous_scale=["#dbeafe", APP_THEME["primary"]],
                title=f"Exits by {DIMENSION_LABELS.get(selected_breakdown, selected_breakdown)}",
            ),
            width="stretch",
        )

    export_df = movement_df.copy() if not movement_df.empty else pd.DataFrame(columns=["period_label", "joiners", "leavers", "net_movement"])
    if not exit_breakdown_df.empty:
        export_df = export_df.assign(exit_breakdown_dimension=DIMENSION_LABELS.get(selected_breakdown, selected_breakdown))
    render_export_actions(
        workspace=workspace,
        base_name=f"movement_attrition_{metadata['as_of_date']}",
        dataframe=export_df,
        snapshot_meta=metadata,
        note=EXPORT_NOTE_EVENT,
        summary_name="Movement",
    )


def render_predictive_page(
    workspace: AppWorkspace,
    snapshot_df: pd.DataFrame,
    event_df: pd.DataFrame,
    metadata: pd.Series,
    availability: SnapshotAvailability,
) -> None:
    st.subheader("Predictive Analysis")
    st.caption(
        "Forecasts and watchouts are heuristic estimates based on archived uploads and reconstructed event history. "
        "Keka live sync is intentionally deferred."
    )

    scope_options = {
        "Overall": None,
        "Department": "department",
        "Legal Entity": "legal_entity",
        "Current City": "current_city",
        "Reporting Manager": "reporting_manager",
    }
    control_col1, control_col2, control_col3 = st.columns(3)
    selected_scope_label = control_col1.selectbox(
        "Forecast scope",
        options=list(scope_options.keys()),
        index=0,
        key=f"predictive-scope-{metadata['snapshot_id']}",
    )
    selected_dimension = scope_options[selected_scope_label]
    horizon_months = control_col2.select_slider(
        "Forecast horizon (months)",
        options=[3, 6, 12],
        value=6,
        key=f"predictive-horizon-{metadata['snapshot_id']}",
    )
    lookback_months = control_col3.select_slider(
        "Lookback window (months)",
        options=[3, 6, 9, 12],
        value=6,
        key=f"predictive-lookback-{metadata['snapshot_id']}",
    )
    snapshot_date = pd.Timestamp(metadata["as_of_date"])

    forecast_df, forecast_summary = forecast_workforce(
        snapshot_df,
        event_df,
        snapshot_date=snapshot_date,
        horizon_months=int(horizon_months),
        lookback_months=int(lookback_months),
        compatibility_level=availability.compatibility_level,
    )
    segment_forecast_df = pd.DataFrame()
    segment_summary_df = pd.DataFrame()
    detail_forecast_df = pd.DataFrame()
    detail_summary: pd.Series | None = None
    if selected_dimension is not None:
        segment_forecast_df = forecast_workforce_by_dimension(
            snapshot_df,
            event_df,
            snapshot_date=snapshot_date,
            dimension=selected_dimension,
            horizon_months=int(horizon_months),
            lookback_months=int(lookback_months),
            compatibility_level=availability.compatibility_level,
        )
        if not segment_forecast_df.empty:
            segment_summary_df = (
                segment_forecast_df.groupby("dimension_value", as_index=False)
                .agg(
                    current_active=("current_active", "first"),
                    projected_active_end=("projected_active_end", "first"),
                    projected_net_change=("projected_net_change_total", "first"),
                    projected_joiners=("projected_joiners_total", "first"),
                    projected_leavers=("projected_leavers_total", "first"),
                    confidence_label=("confidence_label", "first"),
                    confidence_score=("confidence_score", "first"),
                    history_months=("history_months", "first"),
                    volatility_proxy=("volatility_proxy", "first"),
                )
                .sort_values(
                    ["projected_net_change", "projected_leavers", "current_active", "dimension_value"],
                    ascending=[True, False, False, True],
                )
                .reset_index(drop=True)
            )
            selected_segment = st.selectbox(
                f"{selected_scope_label} detail",
                options=segment_summary_df["dimension_value"].tolist(),
                index=0,
                key=f"predictive-segment-{metadata['snapshot_id']}",
            )
            detail_forecast_df = (
                segment_forecast_df[segment_forecast_df["dimension_value"] == selected_segment]
                .sort_values("period_start")
                .reset_index(drop=True)
            )
            detail_summary = segment_summary_df[segment_summary_df["dimension_value"] == selected_segment].iloc[0]

    current_active = int(forecast_summary["current_active"])
    projected_active = int(forecast_summary["projected_active"])
    projected_net_change = int(forecast_summary["projected_net_change"])
    projected_joiners = int(forecast_summary["projected_joiners"])
    projected_leavers = int(forecast_summary["projected_leavers"])
    confidence_label = str(forecast_summary["confidence_label"])
    confidence_score = int(forecast_summary["confidence_score"])
    history_months = int(forecast_summary["history_months"])
    if detail_summary is not None:
        current_active = int(detail_summary["current_active"])
        projected_active = int(detail_summary["projected_active_end"])
        projected_net_change = int(detail_summary["projected_net_change"])
        projected_joiners = int(detail_summary["projected_joiners"])
        projected_leavers = int(detail_summary["projected_leavers"])
        confidence_label = str(detail_summary["confidence_label"])
        confidence_score = int(detail_summary["confidence_score"])
        history_months = int(detail_summary["history_months"])

    card1, card2, card3, card4 = st.columns(4)
    card1.metric("Current active headcount", f"{current_active:,}")
    card2.metric("Projected active headcount", f"{projected_active:,}")
    card3.metric("Projected net change", f"{projected_net_change:+,}")
    card4.metric(
        "Forecast confidence",
        f"{confidence_label} ({confidence_score}%)",
    )

    card5, card6, card7 = st.columns(3)
    card5.metric("Projected joiners", f"{projected_joiners:,}")
    card6.metric("Projected leavers", f"{projected_leavers:,}")
    card7.metric("Observed history months", f"{history_months:,}")
    st.caption(
        "Why this is safe to use: these are heuristic workforce signals derived from upload history "
        "and current pending exits, not ML predictions."
    )

    chart_source_df = detail_forecast_df if detail_summary is not None else forecast_df
    chart_title_prefix = (
        f"{selected_scope_label}: {detail_summary['dimension_value']}"
        if detail_summary is not None
        else "Overall"
    )
    if selected_dimension is None:
        if forecast_df.empty:
            st.info("Forecasts need at least some reconstructed event history to project forward.")
        else:
            scenario_df = forecast_df.melt(
                ["period_start", "period_label"],
                ["projected_active_headcount", "upside_active_headcount", "downside_active_headcount"],
                var_name="scenario",
                value_name="active_headcount",
            )
            scenario_df["scenario"] = scenario_df["scenario"].map(
                {
                    "projected_active_headcount": "Baseline",
                    "upside_active_headcount": "Upside",
                    "downside_active_headcount": "Downside",
                }
            )
            proj_col1, proj_col2 = st.columns([1.3, 1])
            proj_col1.plotly_chart(
                px.line(
                    scenario_df,
                    x="period_label",
                    y="active_headcount",
                    color="scenario",
                    markers=True,
                    title="Projected active headcount scenarios",
                    color_discrete_map={
                        "Baseline": APP_THEME["accent"],
                        "Upside": "#2f9e44",
                        "Downside": APP_THEME["primary"],
                    },
                ),
                width="stretch",
            )
            flow_df = forecast_df.melt(
                ["period_start", "period_label"],
                ["predicted_joiners", "predicted_leavers"],
                var_name="metric",
                value_name="count",
            )
            flow_df["metric"] = flow_df["metric"].map(
                {"predicted_joiners": "Predicted joiners", "predicted_leavers": "Predicted leavers"}
            )
            proj_col2.plotly_chart(
                px.bar(
                    flow_df,
                    x="period_label",
                    y="count",
                    color="metric",
                    barmode="group",
                    title="Projected movement drivers",
                    color_discrete_map={
                        "Predicted joiners": APP_THEME["accent"],
                        "Predicted leavers": APP_THEME["primary"],
                    },
                ),
                width="stretch",
            )
    else:
        st.markdown(f"#### {selected_scope_label} outlook")
        if segment_summary_df.empty:
            st.info(
                "No segments met the minimum forecast threshold. Granular forecasts require at least "
                "20 active employees and 3 months of observed movement."
            )
        else:
            seg_col1, seg_col2 = st.columns([1.05, 1])
            seg_col1.dataframe(
                segment_summary_df[
                    [
                        "dimension_value",
                        "current_active",
                        "projected_active_end",
                        "projected_net_change",
                        "projected_leavers",
                        "confidence_label",
                    ]
                ],
                width="stretch",
                hide_index=True,
            )
            scenario_df = chart_source_df.melt(
                ["period_start", "period_label"],
                ["projected_active_headcount", "upside_active_headcount", "downside_active_headcount"],
                var_name="scenario",
                value_name="active_headcount",
            )
            scenario_df["scenario"] = scenario_df["scenario"].map(
                {
                    "projected_active_headcount": "Baseline",
                    "upside_active_headcount": "Upside",
                    "downside_active_headcount": "Downside",
                }
            )
            seg_col2.plotly_chart(
                px.line(
                    scenario_df,
                    x="period_label",
                    y="active_headcount",
                    color="scenario",
                    markers=True,
                    title=f"{chart_title_prefix} scenarios",
                    color_discrete_map={
                        "Baseline": APP_THEME["accent"],
                        "Upside": "#2f9e44",
                        "Downside": APP_THEME["primary"],
                    },
                ),
                width="stretch",
            )
            flow_df = chart_source_df.melt(
                ["period_start", "period_label"],
                ["predicted_joiners", "predicted_leavers"],
                var_name="metric",
                value_name="count",
            )
            flow_df["metric"] = flow_df["metric"].map(
                {"predicted_joiners": "Predicted joiners", "predicted_leavers": "Predicted leavers"}
            )
            st.plotly_chart(
                px.bar(
                    flow_df,
                    x="period_label",
                    y="count",
                    color="metric",
                    barmode="group",
                    title=f"{chart_title_prefix} movement drivers",
                    color_discrete_map={
                        "Predicted joiners": APP_THEME["accent"],
                        "Predicted leavers": APP_THEME["primary"],
                    },
                ),
                width="stretch",
            )

    watchouts = build_watchouts(
        snapshot_df,
        event_df,
        snapshot_date=snapshot_date,
        forecast_summary=forecast_summary,
        compatibility_level=availability.compatibility_level,
        lookback_months=int(lookback_months),
    )

    st.markdown("#### Prioritized Actions")
    if watchouts.empty:
        st.success("No material watchouts were triggered by the current heuristic rules.")
    else:
        st.dataframe(
            watchouts[
                [
                    "severity",
                    "category",
                    "scope",
                    "suggested_owner",
                    "title",
                    "metric_summary",
                    "action_hint",
                    "confidence_label",
                ]
            ],
            width="stretch",
            hide_index=True,
        )

    hotspot_dimension_label = st.selectbox(
        "Hotspot view",
        options=[label for label in scope_options.keys() if label != "Overall"],
        index=0,
        key=f"predictive-hotspot-{metadata['snapshot_id']}",
    )
    hotspot_dimension = scope_options[hotspot_dimension_label]
    hotspot_df = attrition_hotspots(
        snapshot_df,
        event_df,
        snapshot_date=snapshot_date,
        dimension=str(hotspot_dimension),
        compatibility_level=availability.compatibility_level,
    )
    st.markdown(f"#### {hotspot_dimension_label} hotspots")
    if hotspot_df.empty:
        st.info(f"No {hotspot_dimension_label.lower()} hotspots met the current watch thresholds.")
    else:
        st.dataframe(
            hotspot_df.head(10)[
                [
                    str(hotspot_dimension),
                    "active_headcount",
                    "leavers_90d",
                    "pending_exits",
                    "risk_rate",
                    "watch_level",
                    "confidence_label",
                ]
            ],
            width="stretch",
            hide_index=True,
        )

    with st.expander("Forecast caveats", expanded=False):
        st.markdown(
            "\n".join(
                [
                    "- Forecasts are based on archived manual uploads and reconstructed joiner/leaver events, not a live HRIS feed.",
                    "- Filters affect current-snapshot rows directly; event history respects the selected filters only where those dimensions exist in the archived event model.",
                    "- Upside and downside scenarios are simple planning bands, not probability-weighted simulations.",
                    "- Keka integration is intentionally deferred and will be added after these file-based predictive features stabilize.",
                ]
            )
        )

    export_note = (
        "Predictive heuristics from archived manual snapshots. "
        "Not a live Keka forecast."
    )
    export_df = (
        segment_summary_df
        if selected_dimension is not None and not segment_summary_df.empty
        else forecast_df if not forecast_df.empty else pd.DataFrame(
            columns=[
                "period_start",
                "period_label",
                "predicted_joiners",
                "predicted_leavers",
                "projected_net_movement",
                "projected_active_headcount",
                "upside_active_headcount",
                "downside_active_headcount",
            ]
        )
    )
    extra_sheets: dict[str, pd.DataFrame] = {
        "PrioritizedActions": watchouts if not watchouts.empty else pd.DataFrame(columns=watchouts.columns),
        f"{hotspot_dimension_label}Hotspots": hotspot_df if not hotspot_df.empty else pd.DataFrame(columns=hotspot_df.columns),
    }
    if selected_dimension is not None and not segment_forecast_df.empty:
        extra_sheets["SegmentForecast"] = segment_forecast_df
    render_export_actions(
        workspace=workspace,
        base_name=f"predictive_analysis_{metadata['as_of_date']}",
        dataframe=export_df,
        snapshot_meta=metadata,
        note=export_note,
        summary_name="PredictiveForecast" if selected_dimension is None else "SegmentForecastSummary",
        extra_sheets=extra_sheets,
    )


def render_diversity_page(
    workspace: AppWorkspace,
    snapshot_df: pd.DataFrame,
    metadata: pd.Series,
    availability: SnapshotAvailability,
) -> None:
    st.subheader("Diversity & Geography")

    gender_available = "gender" in availability.available_columns
    city_available = "current_city" in availability.available_columns

    col1, col2 = st.columns(2)
    with col1:
        if not gender_available:
            st.warning("Gender is unavailable for this snapshot.")
        else:
            gender_df = (
                snapshot_df.fillna({"gender": "Unspecified"}).groupby("gender").size().reset_index(name="count")
            )
            st.plotly_chart(
                px.pie(
                    gender_df,
                    names="gender",
                    values="count",
                    color_discrete_sequence=[APP_THEME["primary"], APP_THEME["accent"], "#cbd5e1"],
                    title="Gender mix",
                ),
                width="stretch",
            )
    with col2:
        if not city_available:
            st.warning("City is unavailable for this snapshot.")
        else:
            city_df = (
                snapshot_df.fillna({"current_city": "Unspecified"})
                .groupby("current_city")
                .size()
                .reset_index(name="count")
                .sort_values("count", ascending=False)
                .head(15)
            )
            st.plotly_chart(
                px.bar(
                    city_df,
                    x="count",
                    y="current_city",
                    orientation="h",
                    color="count",
                    color_continuous_scale=["#e0f2fe", APP_THEME["accent"]],
                    title="Top cities",
                ),
                width="stretch",
            )

    if gender_available:
        breakdown_fields = [
            field_name
            for field_name in DIVERSITY_BREAKDOWN_FIELDS
            if field_name in availability.available_columns and field_name in snapshot_df.columns
        ]
        if not breakdown_fields:
            st.info("No diversity breakdown dimensions are available for this snapshot.")
        else:
            selected_breakdown = st.selectbox(
                "Gender breakdown",
                options=breakdown_fields,
                format_func=lambda field_name: DIMENSION_LABELS.get(field_name, field_name.replace("_", " ").title()),
                key=f"diversity-breakdown-{metadata['snapshot_id']}",
            )
            entity_gender_df = (
                snapshot_df.fillna({"gender": "Unspecified", selected_breakdown: "Unspecified"})
                .groupby([selected_breakdown, "gender"])
                .size()
                .reset_index(name="count")
            )
            st.plotly_chart(
                px.bar(
                    entity_gender_df,
                    x=selected_breakdown,
                    y="count",
                    color="gender",
                    barmode="stack",
                    title=f"Gender mix by {DIMENSION_LABELS.get(selected_breakdown, selected_breakdown)}",
                ),
                width="stretch",
            )

    note = EXPORT_NOTE_PARTIAL if availability.compatibility_level == "partial" else "Diversity export"
    render_export_actions(
        workspace=workspace,
        base_name=f"diversity_geography_{metadata['as_of_date']}",
        dataframe=snapshot_df,
        snapshot_meta=metadata,
        note=note,
        summary_name="DiversityRows",
    )


def render_quality_page(
    repository: Repository,
    snapshot_df: pd.DataFrame,
    metadata: pd.Series,
    snapshots: pd.DataFrame,
) -> None:
    st.subheader("Data Quality & Audit")
    nulls = null_summary(snapshot_df)
    issues = repository.get_validation_report(metadata["snapshot_id"])
    quarantined = snapshots[snapshots["status"].str.startswith("quarantined", na=False)].copy()
    issue_counts = issue_counts_by_type(issues)

    card1, card2, card3, card4 = st.columns(4)
    card1.metric("Duplicate IDs", issue_counts.get("duplicate_employee_ids", 0))
    card2.metric("Malformed emails", issue_counts.get("malformed_email", 0))
    card3.metric(
        "Missing hierarchy fields",
        issue_counts.get("missing_values:reporting_manager", 0) + issue_counts.get("missing_values:l2_manager", 0),
    )
    card4.metric("Invalid dates", issue_counts.get("invalid_date", 0))

    col1, col2 = st.columns([1, 1.2])
    with col1:
        st.markdown("#### Null coverage")
        st.dataframe(nulls.head(20), width="stretch", hide_index=True)
    with col2:
        st.markdown("#### Validation issues")
        if issues.empty:
            st.success("No validation issues recorded for this snapshot.")
        else:
            st.dataframe(issues, width="stretch", hide_index=True)
            exception_csv = dataframe_to_csv_bytes(
                issues,
                snapshot_date=str(metadata["as_of_date"]),
                source_file=str(metadata["source_file"]),
                note="Validation exception log",
            )
            exception_xlsx = dataframe_to_excel_bytes(
                issues,
                snapshot_date=str(metadata["as_of_date"]),
                source_file=str(metadata["source_file"]),
                note="Validation exception log",
                summary_name="ValidationIssues",
            )
            download_col1, download_col2 = st.columns(2)
            download_col1.download_button(
                "Download exception log (CSV)",
                data=exception_csv,
                file_name=f"validation_log_{metadata['as_of_date']}.csv",
                mime="text/csv",
            )
            download_col2.download_button(
                "Download exception log (XLSX)",
                data=exception_xlsx,
                file_name=f"validation_log_{metadata['as_of_date']}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )

    st.markdown("#### Snapshot metadata")
    metadata_frame = metadata.to_frame(name="value").reset_index().rename(columns={"index": "property"})
    st.dataframe(metadata_frame, width="stretch", hide_index=True)

    st.markdown("#### Quarantined files")
    if quarantined.empty:
        st.info("No quarantined duplicate snapshots are present.")
    else:
        st.dataframe(
            quarantined[["as_of_date", "source_file", "row_count", "compatibility_level", "notes"]],
            width="stretch",
            hide_index=True,
        )


def render_upload_page(
    workspace: AppWorkspace,
    repository: Repository,
    adapter: WorkbookUploadAdapter,
    snapshots: pd.DataFrame,
) -> None:
    st.subheader("Uploads & Archive")
    st.caption("Manual uploads publish new snapshots into the local archive after schema validation.")

    template_path = resource_path("HR_Analytics_Employee_Template.xlsx")
    if template_path.exists():
        with st.expander("Download data template", expanded=False):
            st.markdown(
                "Use this Excel template to prepare your employee data. "
                "It includes column headers, data validation, sample rows, and an instructions sheet."
            )
            st.download_button(
                label="Download Employee Template (.xlsx)",
                data=template_path.read_bytes(),
                file_name="HR_Analytics_Employee_Template.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )

    with st.expander("Upload a new workbook", expanded=True):
        uploaded = st.file_uploader("Employee report workbook", type=["xlsx"])
        override_date: date | None = None
        if uploaded is not None:
            inferred_date, confidence, note = parse_as_of_date(uploaded.name)
            if confidence < 1.0:
                st.info(note)
                override_date = st.date_input(
                    "Confirm snapshot as-of date",
                    value=inferred_date or date.today(),
                    key="upload-date-confirmation",
                )
            else:
                st.success(f"Snapshot date detected as {inferred_date}.")
            candidate = adapter.review_uploaded_file(
                file_name=uploaded.name,
                raw_bytes=uploaded.getvalue(),
                override_as_of_date=override_date,
            )
            blocked_reason = manual_publish_block_reason(candidate)
            render_validation_review(candidate)
            if blocked_reason:
                st.error(blocked_reason)
            elif candidate.compatibility_level == "compatible_with_warnings":
                st.warning("Optional fields are missing, but the workbook still meets the approved Phase 1 publish rules.")
            if st.button("Publish snapshot", type="primary", disabled=blocked_reason is not None):
                result = adapter.ingest_uploaded_file(
                    file_name=uploaded.name,
                    raw_bytes=uploaded.getvalue(),
                    override_as_of_date=override_date,
                )
                st.success(result.message) if result.status == "imported" else st.warning(result.message)
                st.rerun()

    bootstrap_col1, bootstrap_col2 = st.columns([1, 1.6])
    if bootstrap_col1.button("Re-run fixture bootstrap"):
        messages = [result.message for result in adapter.bootstrap_from_fixtures(force_reimport=True)]
        st.session_state["bootstrap_messages"] = messages
        st.success("Bootstrap import completed.")
        st.rerun()
    bootstrap_col2.caption("Use this after updating bundled source files or ingestion normalization rules.")

    st.markdown("#### Snapshot archive")
    display_df = snapshots.copy()
    if not display_df.empty:
        display_df["available_columns"] = display_df["available_columns"].map(
            lambda value: ", ".join(json.loads(value)) if isinstance(value, str) else value
        )
        display_df["missing_columns"] = display_df["missing_columns"].map(
            lambda value: ", ".join(json.loads(value)) if isinstance(value, str) else value
        )
    st.dataframe(
        display_df[
            [
                "as_of_date",
                "source_file",
                "uploaded_by",
                "imported_at",
                "row_count",
                "compatibility_level",
                "status",
                "is_current_view",
                "notes",
                "missing_columns",
            ]
        ],
        width="stretch",
        hide_index=True,
    )

    imported = snapshots[snapshots["status"] == "imported"].copy()
    if not imported.empty:
        selectable = imported.sort_values("as_of_date", ascending=False)
        selected_id = st.selectbox(
            "Select imported snapshot for archive actions",
            options=selectable["snapshot_id"].tolist(),
            format_func=lambda value: f"{selectable.loc[selectable['snapshot_id'] == value, 'as_of_date'].iloc[0]}  |  {selectable.loc[selectable['snapshot_id'] == value, 'source_file'].iloc[0]}",
        )
        action_col1, action_col2 = st.columns(2)
        if action_col1.button("Set as current view"):
            repository.set_current_snapshot(selected_id)
            st.success("Current view updated.")
            st.rerun()
        if action_col2.button("Reprocess selected raw file"):
            selected_row = selectable[selectable["snapshot_id"] == selected_id].iloc[0]
            source_path = Path(selected_row["source_path"])
            result = adapter.ingest_snapshot(source_path, force_reimport=True)
            st.success(result.message) if result.status == "imported" else st.warning(result.message)
            st.rerun()

    st.markdown("#### Value alias editor")
    alias_df = repository.get_value_aliases()
    editable_aliases = st.data_editor(
        alias_df[["field_name", "raw_value", "canonical_value"]] if not alias_df.empty else pd.DataFrame(columns=["field_name", "raw_value", "canonical_value"]),
        num_rows="dynamic",
        width="stretch",
        key="alias-editor",
    )
    if st.button("Save aliases"):
        repository.replace_value_aliases(editable_aliases)
        st.success("Alias table updated. The refreshed app view will use the new canonical values.")
        st.rerun()

    st.markdown("#### Export workspace")
    exports = sorted(workspace.exports_dir.glob("*"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not exports:
        st.info("No saved exports yet.")
    else:
        st.dataframe(
            pd.DataFrame(
                [{"file_name": path.name, "size_kb": round(path.stat().st_size / 1024, 1)} for path in exports[:25]]
            ),
            width="stretch",
            hide_index=True,
        )


if __name__ == "__main__":
    main()
