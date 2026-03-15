from __future__ import annotations

import pandas as pd

from hr_analytics.analytics import compute_overview_kpis, movement_summary


def test_march_snapshot_matches_prd_counts(bootstrapped):
    _, repository, snapshots = bootstrapped
    march = snapshots[snapshots["source_file"].str.contains("6th Mar", regex=False)].iloc[0]
    march_df = repository.get_snapshot_dataframe(march["snapshot_id"])

    kpis = compute_overview_kpis(march_df, snapshot_date=pd.Timestamp(march["as_of_date"]))

    assert kpis["active"] == 698
    assert kpis["relieved"] == 1742
    assert kpis["pending_exits"] == 19
    assert kpis["active_ratio"] == 28.6
    assert kpis["relieved_ratio"] == 71.4


def test_employee_events_are_deduplicated(bootstrapped):
    _, repository, _ = bootstrapped
    events = repository.get_employee_events()

    assert not events.duplicated(subset=["employee_number", "event_type", "event_date"]).any()


def test_movement_summary_supports_quarter_and_year(bootstrapped):
    _, repository, snapshots = bootstrapped
    march = snapshots[snapshots["source_file"].str.contains("6th Mar", regex=False)].iloc[0]
    events = repository.get_employee_events()
    filtered_events = events[pd.to_datetime(events["event_date"]) <= pd.Timestamp(march["as_of_date"])]

    quarter_df = movement_summary(filtered_events, granularity="quarter")
    year_df = movement_summary(filtered_events, granularity="year")

    assert not quarter_df.empty
    assert not year_df.empty
    assert "period_label" in quarter_df.columns
    assert "period_label" in year_df.columns
