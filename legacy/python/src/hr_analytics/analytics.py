from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Iterable

import pandas as pd


@dataclass(slots=True)
class SnapshotAvailability:
    available_columns: set[str]
    missing_columns: set[str]
    compatibility_level: str
    status: str


def availability_from_metadata(metadata_row: pd.Series) -> SnapshotAvailability:
    available = set(json.loads(metadata_row["available_columns"])) if metadata_row is not None else set()
    missing = set(json.loads(metadata_row["missing_columns"])) if metadata_row is not None else set()
    compatibility_level = metadata_row["compatibility_level"] if metadata_row is not None else "rejected"
    status = metadata_row["status"] if metadata_row is not None else "rejected"
    return SnapshotAvailability(
        available_columns=available,
        missing_columns=missing,
        compatibility_level=compatibility_level,
        status=status,
    )


def apply_filters(dataframe: pd.DataFrame, filters: dict[str, list[str]]) -> pd.DataFrame:
    filtered = dataframe.copy()
    for field_name, selected_values in filters.items():
        if not selected_values or field_name not in filtered.columns:
            continue
        filtered = filtered[filtered[field_name].fillna("Unspecified").isin(selected_values)]
    return filtered


def compute_overview_kpis(
    dataframe: pd.DataFrame, *, snapshot_date: pd.Timestamp | None
) -> dict[str, int | float]:
    total_rows = len(dataframe)
    active = int(dataframe["employment_status"].fillna("").eq("Working").sum())
    relieved = int(dataframe["employment_status"].fillna("").eq("Relieved").sum())
    pending_exits = 0
    if snapshot_date is not None:
        cutoff = pd.Timestamp(snapshot_date)
        pending_mask = (
            dataframe["employment_status"].fillna("").eq("Working")
            & dataframe["last_working_day"].notna()
            & (pd.to_datetime(dataframe["last_working_day"]) >= cutoff)
        )
        pending_exits = int(pending_mask.sum())
    return {
        "rows": total_rows,
        "active": active,
        "relieved": relieved,
        "pending_exits": pending_exits,
        "active_ratio": round((active / total_rows) * 100, 1) if total_rows else 0.0,
        "relieved_ratio": round((relieved / total_rows) * 100, 1) if total_rows else 0.0,
    }


def movement_summary(
    events: pd.DataFrame,
    *,
    granularity: str = "month",
    cutoff: pd.Timestamp | None = None,
) -> pd.DataFrame:
    if events.empty:
        return pd.DataFrame(columns=["period_start", "period_label", "joiners", "leavers", "net_movement"])
    event_df = events.copy()
    event_df["event_date"] = pd.to_datetime(event_df["event_date"])
    if cutoff is not None:
        event_df = event_df[event_df["event_date"] <= pd.Timestamp(cutoff)]
    if granularity == "quarter":
        periods = event_df["event_date"].dt.to_period("Q")
        event_df["period_start"] = periods.dt.start_time
        event_df["period_label"] = periods.astype(str).str.replace("Q", " Q", regex=False)
    elif granularity == "year":
        periods = event_df["event_date"].dt.to_period("Y")
        event_df["period_start"] = periods.dt.start_time
        event_df["period_label"] = periods.astype(str)
    else:
        periods = event_df["event_date"].dt.to_period("M")
        event_df["period_start"] = periods.dt.start_time
        event_df["period_label"] = periods.dt.strftime("%b %Y")
    summary = (
        event_df.pivot_table(
            index=["period_start", "period_label"],
            columns="event_type",
            values="employee_number",
            aggfunc="count",
            fill_value=0,
        )
        .rename(columns={"joiner": "joiners", "leaver": "leavers"})
        .reset_index()
    )
    for field_name in ["joiners", "leavers"]:
        if field_name not in summary.columns:
            summary[field_name] = 0
    summary["net_movement"] = summary["joiners"] - summary["leavers"]
    return summary.sort_values("period_start")


def monthly_movement(events: pd.DataFrame, *, cutoff: pd.Timestamp | None = None) -> pd.DataFrame:
    return movement_summary(events, granularity="month", cutoff=cutoff)


def recent_movement_window(
    events: pd.DataFrame,
    *,
    cutoff: pd.Timestamp | None,
    months: int = 6,
) -> pd.DataFrame:
    cutoff_ts = pd.Timestamp(cutoff) if cutoff is not None else pd.Timestamp.now().normalize()
    month_start = cutoff_ts.to_period("M").to_timestamp()
    periods = pd.date_range(end=month_start, periods=months, freq="MS")
    base = pd.DataFrame({"period_start": periods})
    summary = movement_summary(events, granularity="month", cutoff=cutoff_ts)
    if summary.empty:
        base["period_label"] = base["period_start"].dt.strftime("%b %Y")
        base["joiners"] = 0
        base["leavers"] = 0
        base["net_movement"] = 0
        return base
    merged = base.merge(
        summary[["period_start", "joiners", "leavers", "net_movement"]],
        on="period_start",
        how="left",
    ).fillna(0)
    merged["period_label"] = merged["period_start"].dt.strftime("%b %Y")
    for field_name in ["joiners", "leavers", "net_movement"]:
        merged[field_name] = merged[field_name].astype(float)
    return merged


FORECAST_COLUMNS = [
    "period_start",
    "period_label",
    "predicted_joiners",
    "predicted_leavers",
    "projected_net_movement",
    "projected_active_headcount",
    "upside_active_headcount",
    "downside_active_headcount",
]

SEGMENT_FORECAST_COLUMNS = [
    "dimension",
    "dimension_value",
    "current_active",
    "scope_row_count",
    "history_months",
    "confidence_label",
    "confidence_score",
    "volatility_proxy",
    "projected_active_end",
    "projected_net_change_total",
    "projected_joiners_total",
    "projected_leavers_total",
    *FORECAST_COLUMNS,
]

HOTSPOT_COLUMNS = [
    "active_headcount",
    "leavers_90d",
    "pending_exits",
    "risk_rate",
    "watch_level",
    "history_months",
    "confidence_label",
    "confidence_score",
    "volatility_proxy",
]

BACKFILL_COLUMNS = [
    "dimension",
    "dimension_value",
    "active_headcount",
    "pending_exits_now",
    "predicted_leavers_next_window",
    "weighted_recent_joiners",
    "replacement_gap",
    "replacement_ratio",
    "history_months",
    "confidence_label",
    "confidence_score",
    "volatility_proxy",
]

ACTION_COLUMNS = [
    "severity",
    "category",
    "scope",
    "title",
    "metric_summary",
    "rationale",
    "action_hint",
    "suggested_owner",
    "confidence_label",
    "priority_rank",
]

SEVERITY_RANKS = {"high": 0, "medium": 1, "low": 2, "stable": 3}
CONFIDENCE_BASE_SCORES = {"High": 82, "Medium": 62, "Low": 38}


def _empty_forecast_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=FORECAST_COLUMNS)


def _empty_segment_forecast_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=SEGMENT_FORECAST_COLUMNS)


def _empty_hotspot_frame(dimension: str) -> pd.DataFrame:
    return pd.DataFrame(columns=[dimension, *HOTSPOT_COLUMNS])


def _empty_backfill_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=BACKFILL_COLUMNS)


def _empty_action_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=ACTION_COLUMNS)


def _dimension_label(dimension: str) -> str:
    return dimension.replace("_", " ").title()


def _scope_label(dimension: str, dimension_value: object) -> str:
    return f"{_dimension_label(dimension)}: {dimension_value}"


def _scope_frame(dataframe: pd.DataFrame, *, dimension: str) -> pd.DataFrame:
    frame = dataframe.copy()
    if dimension in frame.columns:
        frame[dimension] = frame[dimension].fillna("Unspecified").astype(str)
    return frame


def _history_months(recent: pd.DataFrame) -> int:
    if recent.empty:
        return 0
    return int(((recent["joiners"] + recent["leavers"]) > 0).sum())


def _volatility_proxy(recent: pd.DataFrame) -> float:
    if recent.empty:
        return 0.0
    raw_volatility = recent["net_movement"].std()
    return 0.0 if pd.isna(raw_volatility) else round(float(raw_volatility), 2)


def _weighted_recent_value(values: Iterable[float]) -> float:
    series = pd.Series(list(values), dtype=float)
    if series.empty:
        return 0.0
    weights = pd.Series(range(1, len(series) + 1), dtype=float)
    return float((series * weights).sum() / weights.sum())


def _confidence_label(
    *,
    history_months: int,
    active_headcount: int,
    compatibility_level: str,
) -> str:
    if history_months >= 6 and active_headcount >= 40 and compatibility_level != "partial":
        return "High"
    if history_months >= 3 and active_headcount >= 20:
        return "Medium"
    return "Low"


def _confidence_score(confidence_label: str, volatility_proxy: float) -> int:
    base_score = CONFIDENCE_BASE_SCORES.get(confidence_label, CONFIDENCE_BASE_SCORES["Low"])
    dampener = min(15, int(round(volatility_proxy * 2)))
    return max(20, min(90, base_score - dampener))


def _confidence_diagnostics(
    *,
    history_months: int,
    active_headcount: int,
    compatibility_level: str,
    volatility_proxy: float,
) -> tuple[str, int]:
    label = _confidence_label(
        history_months=history_months,
        active_headcount=active_headcount,
        compatibility_level=compatibility_level,
    )
    return label, _confidence_score(label, volatility_proxy)


def _forecast_from_recent(
    *,
    current_active: int,
    recent: pd.DataFrame,
    snapshot_date: pd.Timestamp | None,
    horizon_months: int,
) -> tuple[pd.DataFrame, dict[str, int | float]]:
    weighted_joiners = _weighted_recent_value(recent["joiners"]) if not recent.empty else 0.0
    weighted_leavers = _weighted_recent_value(recent["leavers"]) if not recent.empty else 0.0
    joiner_slope = trend_slope(recent["joiners"]) if not recent.empty else 0.0
    leaver_slope = trend_slope(recent["leavers"]) if not recent.empty else 0.0

    forecast_rows: list[dict[str, object]] = []
    baseline_active = current_active
    upside_active = current_active
    downside_active = current_active
    base_month_start = (
        pd.Timestamp(snapshot_date).to_period("M").to_timestamp()
        if snapshot_date is not None
        else pd.Timestamp.now().normalize().to_period("M").to_timestamp()
    )
    for month_offset in range(1, horizon_months + 1):
        period_start = (base_month_start + pd.DateOffset(months=month_offset)).to_period("M").to_timestamp()
        predicted_joiners = max(0, round(weighted_joiners + joiner_slope * month_offset))
        predicted_leavers = max(0, round(weighted_leavers + leaver_slope * month_offset))
        baseline_active += predicted_joiners - predicted_leavers

        upside_joiners = round(predicted_joiners * 1.1)
        upside_leavers = round(predicted_leavers * 0.9)
        downside_joiners = round(predicted_joiners * 0.9)
        downside_leavers = round(predicted_leavers * 1.1)
        upside_active += upside_joiners - upside_leavers
        downside_active += downside_joiners - downside_leavers

        forecast_rows.append(
            {
                "period_start": period_start,
                "period_label": period_start.strftime("%b %Y"),
                "predicted_joiners": int(predicted_joiners),
                "predicted_leavers": int(predicted_leavers),
                "projected_net_movement": int(predicted_joiners - predicted_leavers),
                "projected_active_headcount": int(baseline_active),
                "upside_active_headcount": int(upside_active),
                "downside_active_headcount": int(downside_active),
            }
        )

    forecast_df = pd.DataFrame(forecast_rows, columns=FORECAST_COLUMNS)
    return forecast_df, {
        "weighted_recent_joiners": round(weighted_joiners, 2),
        "weighted_recent_leavers": round(weighted_leavers, 2),
        "joiner_slope": round(joiner_slope, 3),
        "leaver_slope": round(leaver_slope, 3),
        "projected_active": int(forecast_df["projected_active_headcount"].iloc[-1]) if not forecast_df.empty else current_active,
        "projected_net_change": int(forecast_df["projected_net_movement"].sum()) if not forecast_df.empty else 0,
        "projected_joiners": int(forecast_df["predicted_joiners"].sum()) if not forecast_df.empty else 0,
        "projected_leavers": int(forecast_df["predicted_leavers"].sum()) if not forecast_df.empty else 0,
    }


def forecast_workforce(
    snapshot_df: pd.DataFrame,
    events: pd.DataFrame,
    *,
    snapshot_date: pd.Timestamp | None,
    horizon_months: int = 6,
    lookback_months: int = 6,
    compatibility_level: str = "full",
) -> tuple[pd.DataFrame, dict[str, int | float | str]]:
    current_active = int(snapshot_df["employment_status"].fillna("").eq("Working").sum())
    recent = recent_movement_window(events, cutoff=snapshot_date, months=lookback_months)
    forecast_df, projection = _forecast_from_recent(
        current_active=current_active,
        recent=recent,
        snapshot_date=snapshot_date,
        horizon_months=horizon_months,
    )
    history_months = _history_months(recent)
    volatility_proxy = _volatility_proxy(recent)
    confidence_label, confidence_score = _confidence_diagnostics(
        history_months=history_months,
        active_headcount=current_active,
        compatibility_level=compatibility_level,
        volatility_proxy=volatility_proxy,
    )
    summary = {
        "current_active": current_active,
        "scope_active_headcount": current_active,
        "scope_row_count": int(len(snapshot_df)),
        "projected_active": int(projection["projected_active"]),
        "projected_net_change": int(projection["projected_net_change"]),
        "projected_joiners": int(projection["projected_joiners"]),
        "projected_leavers": int(projection["projected_leavers"]),
        "weighted_recent_joiners": float(projection["weighted_recent_joiners"]),
        "weighted_recent_leavers": float(projection["weighted_recent_leavers"]),
        "joiner_slope": float(projection["joiner_slope"]),
        "leaver_slope": float(projection["leaver_slope"]),
        "volatility_proxy": volatility_proxy,
        "confidence_score": confidence_score,
        "confidence_label": confidence_label,
        "history_months": history_months,
        "lookback_months": lookback_months,
    }
    return forecast_df, summary


def forecast_workforce_by_dimension(
    snapshot_df: pd.DataFrame,
    events: pd.DataFrame,
    *,
    snapshot_date: pd.Timestamp | None,
    dimension: str,
    horizon_months: int,
    lookback_months: int,
    min_active: int = 20,
    compatibility_level: str = "full",
) -> pd.DataFrame:
    if snapshot_df.empty or dimension not in snapshot_df.columns or dimension not in events.columns:
        return _empty_segment_forecast_frame()

    scoped_snapshot = _scope_frame(snapshot_df, dimension=dimension)
    active_df = scoped_snapshot[scoped_snapshot["employment_status"].fillna("").eq("Working")]
    if active_df.empty:
        return _empty_segment_forecast_frame()
    scoped_events = _scope_frame(events, dimension=dimension)

    records: list[pd.DataFrame] = []
    active_counts = (
        active_df.groupby(dimension)
        .size()
        .rename("current_active")
        .reset_index()
        .sort_values("current_active", ascending=False)
    )
    for row in active_counts.itertuples(index=False):
        dimension_value = getattr(row, dimension)
        current_active = int(row.current_active)
        if current_active < min_active:
            continue
        scope_events = scoped_events[scoped_events[dimension] == dimension_value]
        recent = recent_movement_window(scope_events, cutoff=snapshot_date, months=lookback_months)
        history_months = _history_months(recent)
        if history_months < 3:
            continue
        volatility_proxy = _volatility_proxy(recent)
        confidence_label, confidence_score = _confidence_diagnostics(
            history_months=history_months,
            active_headcount=current_active,
            compatibility_level=compatibility_level,
            volatility_proxy=volatility_proxy,
        )
        forecast_df, projection = _forecast_from_recent(
            current_active=current_active,
            recent=recent,
            snapshot_date=snapshot_date,
            horizon_months=horizon_months,
        )
        if forecast_df.empty:
            continue
        scope_row_count = int((scoped_snapshot[dimension] == dimension_value).sum())
        records.append(
            forecast_df.assign(
                dimension=dimension,
                dimension_value=dimension_value,
                current_active=current_active,
                scope_row_count=scope_row_count,
                history_months=history_months,
                confidence_label=confidence_label,
                confidence_score=confidence_score,
                volatility_proxy=volatility_proxy,
                projected_active_end=int(projection["projected_active"]),
                projected_net_change_total=int(projection["projected_net_change"]),
                projected_joiners_total=int(projection["projected_joiners"]),
                projected_leavers_total=int(projection["projected_leavers"]),
            )[SEGMENT_FORECAST_COLUMNS]
        )

    if not records:
        return _empty_segment_forecast_frame()
    return pd.concat(records, ignore_index=True).sort_values(
        ["projected_net_change_total", "current_active", "dimension_value", "period_start"],
        ascending=[True, False, True, True],
    )


def attrition_hotspots(
    snapshot_df: pd.DataFrame,
    events: pd.DataFrame,
    *,
    snapshot_date: pd.Timestamp | None,
    dimension: str,
    min_active: int = 8,
    compatibility_level: str = "full",
) -> pd.DataFrame:
    if snapshot_df.empty or dimension not in snapshot_df.columns:
        return _empty_hotspot_frame(dimension)
    frame = _scope_frame(snapshot_df, dimension=dimension)
    active_df = frame[frame["employment_status"].fillna("").eq("Working")]
    active_counts = active_df.groupby(dimension).size().rename("active_headcount")

    pending_counts = pd.Series(dtype=float)
    if snapshot_date is not None:
        future_mask = (
            active_df["last_working_day"].notna()
            & (pd.to_datetime(active_df["last_working_day"]) >= pd.Timestamp(snapshot_date))
        )
        pending_counts = active_df.loc[future_mask].groupby(dimension).size().rename("pending_exits")

    leaver_events = events.copy()
    if not leaver_events.empty:
        leaver_events = leaver_events[leaver_events["event_type"] == "leaver"]
        leaver_events["event_date"] = pd.to_datetime(leaver_events["event_date"])
        recent_cutoff = (
            pd.Timestamp(snapshot_date) - pd.Timedelta(days=90)
            if snapshot_date is not None
            else pd.Timestamp.now().normalize() - pd.Timedelta(days=90)
        )
        leaver_events = leaver_events[leaver_events["event_date"] >= recent_cutoff]
        if dimension in leaver_events.columns:
            leaver_events[dimension] = leaver_events[dimension].fillna("Unspecified").astype(str)
            leaver_counts = leaver_events.groupby(dimension).size().rename("leavers_90d")
        else:
            leaver_counts = pd.Series(dtype=float)
    else:
        leaver_counts = pd.Series(dtype=float)

    hotspot_df = (
        pd.concat([active_counts, leaver_counts, pending_counts], axis=1)
        .fillna(0)
        .reset_index()
    )
    if hotspot_df.empty:
        return _empty_hotspot_frame(dimension)
    hotspot_df["active_headcount"] = hotspot_df["active_headcount"].astype(int)
    hotspot_df["leavers_90d"] = hotspot_df["leavers_90d"].astype(int)
    hotspot_df["pending_exits"] = hotspot_df["pending_exits"].astype(int)
    hotspot_df = hotspot_df[hotspot_df["active_headcount"] >= min_active].copy()
    if hotspot_df.empty:
        return _empty_hotspot_frame(dimension)
    hotspot_df["risk_rate"] = (
        (hotspot_df["leavers_90d"] + hotspot_df["pending_exits"]) / hotspot_df["active_headcount"]
    ).round(3)
    hotspot_df["watch_level"] = hotspot_df.apply(
        lambda row: classify_watch_level(
            risk_rate=float(row["risk_rate"]),
            pending_exits=int(row["pending_exits"]),
            leavers_90d=int(row["leavers_90d"]),
        ),
        axis=1,
    )
    if dimension not in events.columns:
        hotspot_df["history_months"] = 0
        hotspot_df["confidence_label"] = "Low"
        hotspot_df["confidence_score"] = _confidence_score("Low", 0.0)
        hotspot_df["volatility_proxy"] = 0.0
        return hotspot_df.sort_values(
            ["risk_rate", "pending_exits", "leavers_90d", "active_headcount"],
            ascending=[False, False, False, False],
        )

    scoped_events = _scope_frame(events, dimension=dimension)
    diagnostics: list[dict[str, object]] = []
    for row in hotspot_df.itertuples(index=False):
        dimension_value = getattr(row, dimension)
        scope_events = scoped_events[scoped_events[dimension] == dimension_value]
        recent = recent_movement_window(scope_events, cutoff=snapshot_date, months=6)
        history_months = _history_months(recent)
        volatility_proxy = _volatility_proxy(recent)
        confidence_label, confidence_score = _confidence_diagnostics(
            history_months=history_months,
            active_headcount=int(row.active_headcount),
            compatibility_level=compatibility_level,
            volatility_proxy=volatility_proxy,
        )
        diagnostics.append(
            {
                dimension: dimension_value,
                "history_months": history_months,
                "confidence_label": confidence_label,
                "confidence_score": confidence_score,
                "volatility_proxy": volatility_proxy,
            }
        )
    hotspot_df = hotspot_df.merge(pd.DataFrame(diagnostics), on=dimension, how="left")
    return hotspot_df.sort_values(
        ["risk_rate", "pending_exits", "leavers_90d", "active_headcount"],
        ascending=[False, False, False, False],
    )


def backfill_pressure(
    snapshot_df: pd.DataFrame,
    events: pd.DataFrame,
    *,
    snapshot_date: pd.Timestamp | None,
    dimension: str,
    horizon_months: int = 3,
    lookback_months: int = 6,
    min_active: int = 12,
    compatibility_level: str = "full",
) -> pd.DataFrame:
    if snapshot_df.empty or dimension not in snapshot_df.columns or dimension not in events.columns:
        return _empty_backfill_frame()

    scoped_snapshot = _scope_frame(snapshot_df, dimension=dimension)
    scoped_events = _scope_frame(events, dimension=dimension)
    active_df = scoped_snapshot[scoped_snapshot["employment_status"].fillna("").eq("Working")]
    if active_df.empty:
        return _empty_backfill_frame()

    pending_cutoff = pd.Timestamp(snapshot_date) if snapshot_date is not None else pd.Timestamp.now().normalize()
    pending_counts = (
        active_df[
            active_df["last_working_day"].notna()
            & (pd.to_datetime(active_df["last_working_day"]) >= pending_cutoff)
        ]
        .groupby(dimension)
        .size()
        .rename("pending_exits_now")
    )

    records: list[dict[str, object]] = []
    active_counts = active_df.groupby(dimension).size().rename("active_headcount")
    for row in active_counts.reset_index().itertuples(index=False):
        dimension_value = getattr(row, dimension)
        active_headcount = int(row.active_headcount)
        if active_headcount < min_active:
            continue
        scope_events = scoped_events[scoped_events[dimension] == dimension_value]
        recent = recent_movement_window(scope_events, cutoff=snapshot_date, months=lookback_months)
        history_months = _history_months(recent)
        volatility_proxy = _volatility_proxy(recent)
        confidence_label, confidence_score = _confidence_diagnostics(
            history_months=history_months,
            active_headcount=active_headcount,
            compatibility_level=compatibility_level,
            volatility_proxy=volatility_proxy,
        )
        _, projection = _forecast_from_recent(
            current_active=active_headcount,
            recent=recent,
            snapshot_date=snapshot_date,
            horizon_months=horizon_months,
        )
        pending_exits_now = int(pending_counts.get(dimension_value, 0))
        predicted_leavers_next_window = int(projection["projected_leavers"])
        weighted_recent_joiners = round(float(projection["weighted_recent_joiners"]) * horizon_months, 1)
        replacement_gap = round((pending_exits_now + predicted_leavers_next_window) - weighted_recent_joiners, 1)
        replacement_ratio = (
            round((pending_exits_now + predicted_leavers_next_window) / weighted_recent_joiners, 2)
            if weighted_recent_joiners > 0
            else (99.0 if (pending_exits_now + predicted_leavers_next_window) > 0 else 1.0)
        )
        if replacement_gap <= 0:
            continue
        records.append(
            {
                "dimension": dimension,
                "dimension_value": dimension_value,
                "active_headcount": active_headcount,
                "pending_exits_now": pending_exits_now,
                "predicted_leavers_next_window": predicted_leavers_next_window,
                "weighted_recent_joiners": weighted_recent_joiners,
                "replacement_gap": replacement_gap,
                "replacement_ratio": replacement_ratio,
                "history_months": history_months,
                "confidence_label": confidence_label,
                "confidence_score": confidence_score,
                "volatility_proxy": volatility_proxy,
            }
        )

    if not records:
        return _empty_backfill_frame()
    return pd.DataFrame(records, columns=BACKFILL_COLUMNS).sort_values(
        ["replacement_gap", "replacement_ratio", "active_headcount", "dimension_value"],
        ascending=[False, False, False, True],
    )


def build_watchouts(
    snapshot_df: pd.DataFrame,
    events: pd.DataFrame,
    *,
    snapshot_date: pd.Timestamp | None,
    forecast_summary: dict[str, int | float | str],
    compatibility_level: str = "full",
    lookback_months: int = 6,
) -> pd.DataFrame:
    records: list[dict[str, object]] = []
    frame = with_tenure_columns(snapshot_df, snapshot_date=snapshot_date)
    active_df = frame[frame["employment_status"].fillna("").eq("Working")]

    projected_net_change = int(forecast_summary.get("projected_net_change", 0))
    if projected_net_change < 0:
        records.append(
            watchout_record(
                severity="high" if projected_net_change <= -10 else "medium",
                category="forecast",
                scope="Overall",
                title="Projected net outflow over the forecast window",
                metric_summary=(
                    f"Projected net change: {projected_net_change:+d} | "
                    f"Projected leavers: {int(forecast_summary.get('projected_leavers', 0))}"
                ),
                rationale="Recent archived movement suggests exits are likely to outpace joiners.",
                action_hint="Review hiring pipeline coverage and confirm replacement plans for open critical roles.",
                suggested_owner="Talent Acquisition",
                confidence_label=str(forecast_summary.get("confidence_label", "Low")),
                priority_value=abs(projected_net_change),
            )
        )

    hotspot_dimensions = ["department", "legal_entity", "current_city", "reporting_manager"]
    for dimension in hotspot_dimensions:
        hotspots = attrition_hotspots(
            snapshot_df,
            events,
            snapshot_date=snapshot_date,
            dimension=dimension,
            compatibility_level=compatibility_level,
        )
        if hotspots.empty:
            continue
        for row in hotspots.head(3).itertuples(index=False):
            if row.watch_level == "stable":
                continue
            records.append(
                watchout_record(
                    severity=str(row.watch_level),
                    category="attrition hotspot",
                    scope=_scope_label(dimension, getattr(row, dimension)),
                    title=f"Elevated attrition pressure in {getattr(row, dimension)}",
                    metric_summary=(
                        f"Active: {row.active_headcount} | Leavers 90d: {row.leavers_90d} | "
                        f"Pending exits: {row.pending_exits} | Risk rate: {row.risk_rate:.1%}"
                    ),
                    rationale="The archived event history and current pending exits suggest concentrated attrition risk.",
                    action_hint="Check succession coverage, recruiting backfill, and manager-specific retention context.",
                    suggested_owner="HRBP",
                    confidence_label=str(getattr(row, "confidence_label", "Low")),
                    priority_value=float(row.risk_rate) * 100 + int(row.pending_exits),
                )
            )

    for dimension in hotspot_dimensions:
        pressure_df = backfill_pressure(
            snapshot_df,
            events,
            snapshot_date=snapshot_date,
            dimension=dimension,
            horizon_months=3,
            lookback_months=lookback_months,
            compatibility_level=compatibility_level,
        )
        if pressure_df.empty:
            continue
        for row in pressure_df.head(3).itertuples(index=False):
            records.append(
                watchout_record(
                    severity="high" if row.replacement_gap >= 5 or row.replacement_ratio >= 1.5 else "medium",
                    category="backfill pressure",
                    scope=_scope_label(dimension, row.dimension_value),
                    title="Near-term exits are outpacing recent joiner capacity",
                    metric_summary=(
                        f"Replacement gap: {row.replacement_gap:.1f} | Pending exits: {row.pending_exits_now} | "
                        f"Predicted leavers: {row.predicted_leavers_next_window} | Joiner capacity: {row.weighted_recent_joiners:.1f}"
                    ),
                    rationale="Current pending exits plus projected leavers exceed recent joiner absorption in this scope.",
                    action_hint="Validate requisition coverage, time-to-fill, and whether planned replacements match likely exits.",
                    suggested_owner="Talent Acquisition",
                    confidence_label=str(row.confidence_label),
                    priority_value=float(row.replacement_gap),
                )
            )

    if not active_df.empty and "reporting_manager" in active_df.columns:
        manager_frame = active_df.fillna({"reporting_manager": "Unspecified"}).copy()
        pending_cutoff = pd.Timestamp(snapshot_date) if snapshot_date is not None else pd.Timestamp.now().normalize()
        manager_frame["pending_exit_flag"] = (
            manager_frame["last_working_day"].notna()
            & (pd.to_datetime(manager_frame["last_working_day"]) >= pending_cutoff)
        ).astype(int)
        manager_frame["early_tenure_flag"] = (
            manager_frame["tenure_band_active"].isin(["<6 months", "6-12 months"])
        ).astype(int)
        manager_stats = (
            manager_frame.groupby("reporting_manager", as_index=False)
            .agg(
                active_team_size=("employee_number", "count"),
                pending_exits=("pending_exit_flag", "sum"),
                early_tenure_count=("early_tenure_flag", "sum"),
            )
        )
        manager_stats = manager_stats[manager_stats["active_team_size"] >= 15].copy()
        if not manager_stats.empty:
            manager_stats["early_tenure_share"] = (
                manager_stats["early_tenure_count"] / manager_stats["active_team_size"]
            ).round(3)
            manager_stats = manager_stats[
                (manager_stats["pending_exits"] >= 2) | (manager_stats["early_tenure_share"] >= 0.35)
            ].copy()
            if not manager_stats.empty and "reporting_manager" in events.columns:
                scoped_events = _scope_frame(events, dimension="reporting_manager")
                for row in manager_stats.sort_values(
                    ["active_team_size", "pending_exits", "early_tenure_share"],
                    ascending=[False, False, False],
                ).head(3).itertuples(index=False):
                    scope_events = scoped_events[scoped_events["reporting_manager"] == row.reporting_manager]
                    recent = recent_movement_window(scope_events, cutoff=snapshot_date, months=lookback_months)
                    history_months = _history_months(recent)
                    volatility_proxy = _volatility_proxy(recent)
                    confidence_label, _ = _confidence_diagnostics(
                        history_months=history_months,
                        active_headcount=int(row.active_team_size),
                        compatibility_level=compatibility_level,
                        volatility_proxy=volatility_proxy,
                    )
                    records.append(
                        watchout_record(
                            severity="high" if row.active_team_size >= 20 and (row.pending_exits >= 3 or row.early_tenure_share >= 0.4) else "medium",
                            category="manager capacity",
                            scope=f"Reporting Manager: {row.reporting_manager}",
                            title="Large span with elevated support load",
                            metric_summary=(
                                f"Active team: {row.active_team_size} | Pending exits: {row.pending_exits} | "
                                f"Early-tenure share: {row.early_tenure_share:.1%}"
                            ),
                            rationale="Large spans combined with likely exits or many newer employees can reduce coaching depth and continuity.",
                            action_hint="Review manager support load, succession coverage, and whether the team needs extra leadership capacity.",
                            suggested_owner="Business Leader",
                            confidence_label=confidence_label,
                            priority_value=float(row.active_team_size),
                        )
                    )

    if not active_df.empty and {"department", "tenure_band_active"}.issubset(active_df.columns):
        tenure_mix = (
            active_df.fillna({"department": "Unspecified", "tenure_band_active": "Unknown"})
            .assign(is_new_hire=lambda df: df["tenure_band_active"].isin(["<6 months", "6-12 months"]).astype(int))
            .groupby("department", as_index=False)
            .agg(active_headcount=("employee_number", "count"), early_tenure_count=("is_new_hire", "sum"))
        )
        tenure_mix = tenure_mix[tenure_mix["active_headcount"] >= 12].copy()
        if not tenure_mix.empty and "department" in events.columns:
            tenure_mix["early_tenure_share"] = tenure_mix["early_tenure_count"] / tenure_mix["active_headcount"]
            scoped_events = _scope_frame(events, dimension="department")
            for row in tenure_mix.sort_values("early_tenure_share", ascending=False).head(3).itertuples(index=False):
                if row.early_tenure_share < 0.45:
                    continue
                scope_events = scoped_events[scoped_events["department"] == row.department]
                recent = recent_movement_window(scope_events, cutoff=snapshot_date, months=lookback_months)
                history_months = _history_months(recent)
                volatility_proxy = _volatility_proxy(recent)
                confidence_label, _ = _confidence_diagnostics(
                    history_months=history_months,
                    active_headcount=int(row.active_headcount),
                    compatibility_level=compatibility_level,
                    volatility_proxy=volatility_proxy,
                )
                records.append(
                    watchout_record(
                        severity="high" if row.early_tenure_share >= 0.6 else "medium",
                        category="stabilization",
                        scope=f"Department: {row.department}",
                        title="High concentration of newer employees",
                        metric_summary=(
                            f"Early-tenure share: {row.early_tenure_share:.1%} "
                            f"({row.early_tenure_count}/{row.active_headcount})"
                        ),
                        rationale="Teams with many new joiners may need extra onboarding, coaching, and manager capacity.",
                        action_hint="Coordinate onboarding support, shadowing, and manager check-ins for this team.",
                        suggested_owner="Manager",
                        confidence_label=confidence_label,
                        priority_value=float(row.early_tenure_share),
                    )
                )

    if not active_df.empty and {"department", "gender"}.issubset(active_df.columns):
        representation_frame = active_df.fillna({"department": "Unspecified", "gender": "Unspecified"}).copy()
        pending_cutoff = pd.Timestamp(snapshot_date) if snapshot_date is not None else pd.Timestamp.now().normalize()
        representation_frame["is_female"] = representation_frame["gender"].astype(str).str.casefold().eq("female").astype(int)
        representation_frame["female_pending_exit"] = (
            representation_frame["is_female"].eq(1)
            & representation_frame["last_working_day"].notna()
            & (pd.to_datetime(representation_frame["last_working_day"]) >= pending_cutoff)
        ).astype(int)
        representation_frame["pending_exit_flag"] = (
            representation_frame["last_working_day"].notna()
            & (pd.to_datetime(representation_frame["last_working_day"]) >= pending_cutoff)
        ).astype(int)
        gender_watch = (
            representation_frame.groupby("department", as_index=False)
            .agg(
                active_headcount=("employee_number", "count"),
                female_count=("is_female", "sum"),
                pending_exits=("pending_exit_flag", "sum"),
                female_pending_exits=("female_pending_exit", "sum"),
            )
        )
        gender_watch = gender_watch[gender_watch["active_headcount"] >= 20].copy()
        if not gender_watch.empty and "department" in events.columns:
            gender_watch["female_share"] = gender_watch["female_count"] / gender_watch["active_headcount"]
            remaining_active = (gender_watch["active_headcount"] - gender_watch["pending_exits"]).clip(lower=1)
            gender_watch["projected_female_share"] = (
                (gender_watch["female_count"] - gender_watch["female_pending_exits"]).clip(lower=0) / remaining_active
            )
            gender_watch["share_change"] = gender_watch["projected_female_share"] - gender_watch["female_share"]
            scoped_events = _scope_frame(events, dimension="department")
            for row in gender_watch.sort_values("projected_female_share").head(3).itertuples(index=False):
                if row.female_share >= 0.18 and row.share_change > -0.03:
                    continue
                scope_events = scoped_events[scoped_events["department"] == row.department]
                recent = recent_movement_window(scope_events, cutoff=snapshot_date, months=lookback_months)
                history_months = _history_months(recent)
                volatility_proxy = _volatility_proxy(recent)
                confidence_label, _ = _confidence_diagnostics(
                    history_months=history_months,
                    active_headcount=int(row.active_headcount),
                    compatibility_level=compatibility_level,
                    volatility_proxy=volatility_proxy,
                )
                records.append(
                    watchout_record(
                        severity="high" if row.projected_female_share < 0.12 or row.share_change <= -0.05 else "medium",
                        category="representation",
                        scope=f"Department: {row.department}",
                        title="Near-term representation drift in a larger team",
                        metric_summary=(
                            f"Female share: {row.female_share:.1%} -> {row.projected_female_share:.1%} | "
                            f"Pending female exits: {int(row.female_pending_exits)}"
                        ),
                        rationale="Current gender mix combined with pending exits suggests representation could weaken further soon.",
                        action_hint="Review near-term retention actions, hiring slate balance, and succession options for this team.",
                        suggested_owner="HR Leadership",
                        confidence_label=confidence_label,
                        priority_value=float(1 - row.projected_female_share),
                    )
                )

    if not records:
        return _empty_action_frame()
    watchout_df = pd.DataFrame(records)
    watchout_df = watchout_df.sort_values(
        ["severity_rank", "priority_value", "scope"],
        ascending=[True, False, True],
    ).reset_index(drop=True)
    watchout_df["priority_rank"] = range(1, len(watchout_df) + 1)
    return watchout_df[ACTION_COLUMNS]


def watchout_record(
    *,
    severity: str,
    category: str,
    scope: str,
    title: str,
    metric_summary: str,
    rationale: str,
    action_hint: str,
    suggested_owner: str,
    confidence_label: str,
    priority_value: float,
) -> dict[str, object]:
    severity_key = severity.lower()
    severity_rank = SEVERITY_RANKS.get(severity_key, 3)
    return {
        "severity": severity_key.title(),
        "category": category.title(),
        "scope": scope,
        "title": title,
        "metric_summary": metric_summary,
        "rationale": rationale,
        "action_hint": action_hint,
        "suggested_owner": suggested_owner,
        "confidence_label": confidence_label,
        "severity_rank": severity_rank,
        "priority_value": float(priority_value),
    }


def classify_watch_level(*, risk_rate: float, pending_exits: int, leavers_90d: int) -> str:
    if risk_rate >= 0.2 or pending_exits >= 4 or leavers_90d >= 6:
        return "high"
    if risk_rate >= 0.1 or pending_exits >= 2 or leavers_90d >= 3:
        return "medium"
    if risk_rate >= 0.05 or pending_exits >= 1 or leavers_90d >= 1:
        return "low"
    return "stable"


def trend_slope(values: Iterable[float]) -> float:
    series = pd.Series(list(values), dtype=float)
    if len(series) < 2:
        return 0.0
    x = pd.Series(range(len(series)), dtype=float)
    x_centered = x - x.mean()
    denominator = float((x_centered**2).sum())
    if denominator == 0:
        return 0.0
    numerator = float((x_centered * (series - series.mean())).sum())
    return numerator / denominator


def tenure_band(days: float | int | None) -> str:
    if days is None or pd.isna(days):
        return "Unknown"
    if days < 180:
        return "<6 months"
    if days < 365:
        return "6-12 months"
    if days < 730:
        return "1-2 years"
    if days < 1825:
        return "2-5 years"
    return "5+ years"


def with_tenure_columns(dataframe: pd.DataFrame, *, snapshot_date: pd.Timestamp | None) -> pd.DataFrame:
    frame = dataframe.copy()
    if frame.empty:
        return frame
    frame["date_joined"] = pd.to_datetime(frame["date_joined"])
    frame["last_working_day"] = pd.to_datetime(frame["last_working_day"])
    cutoff = pd.Timestamp(snapshot_date) if snapshot_date is not None else pd.Timestamp.now().normalize()

    active_mask = frame["employment_status"].fillna("").eq("Working")
    relieved_mask = frame["employment_status"].fillna("").eq("Relieved")

    frame["tenure_days_active"] = None
    frame.loc[active_mask, "tenure_days_active"] = (
        cutoff - frame.loc[active_mask, "date_joined"]
    ).dt.days

    frame["tenure_days_exit"] = None
    frame.loc[relieved_mask, "tenure_days_exit"] = (
        frame.loc[relieved_mask, "last_working_day"] - frame.loc[relieved_mask, "date_joined"]
    ).dt.days

    frame["tenure_band_active"] = frame["tenure_days_active"].map(tenure_band)
    frame["tenure_band_exit"] = frame["tenure_days_exit"].map(tenure_band)
    return frame


def null_summary(dataframe: pd.DataFrame) -> pd.DataFrame:
    if dataframe.empty:
        return pd.DataFrame(columns=["field_name", "null_count", "null_ratio"])
    records = []
    for column in dataframe.columns:
        null_count = int(dataframe[column].isna().sum())
        records.append(
            {
                "field_name": column,
                "null_count": null_count,
                "null_ratio": round(null_count / len(dataframe), 4),
            }
        )
    return pd.DataFrame(records).sort_values(["null_count", "field_name"], ascending=[False, True])
