from __future__ import annotations

from types import SimpleNamespace

import pandas as pd

from hr_analytics.analytics import (
    SnapshotAvailability,
    backfill_pressure,
    build_watchouts,
    forecast_workforce,
    forecast_workforce_by_dimension,
)
from hr_analytics.streamlit_app import render_predictive_page

SNAPSHOT_DATE = pd.Timestamp("2026-03-06")


def make_predictive_snapshot() -> pd.DataFrame:
    records: list[dict[str, object]] = []

    def add_employee(
        *,
        employee_number: str,
        department: str,
        legal_entity: str,
        current_city: str,
        reporting_manager: str,
        gender: str,
        date_joined: str,
        last_working_day: str | None = None,
    ) -> None:
        records.append(
            {
                "employee_number": employee_number,
                "full_name": f"Employee {employee_number}",
                "department": department,
                "sub_department": department,
                "legal_entity": legal_entity,
                "current_city": current_city,
                "reporting_manager": reporting_manager,
                "l2_manager": "Director 1",
                "job_title": "Associate",
                "gender": gender,
                "employment_status": "Working",
                "date_joined": pd.Timestamp(date_joined),
                "last_working_day": pd.Timestamp(last_working_day) if last_working_day else pd.NaT,
                "exit_requested_on": pd.NaT,
            }
        )

    for index in range(18):
        add_employee(
            employee_number=f"OPS-A-{index:03d}",
            department="Ops",
            legal_entity="Airpay India",
            current_city="Mumbai",
            reporting_manager="Manager A",
            gender="Female" if index in {0, 1} else "Male",
            date_joined="2025-12-15" if index < 12 else "2025-06-01",
            last_working_day={0: "2026-04-10", 1: "2026-04-18", 2: "2026-05-02"}.get(index),
        )
    for index in range(7):
        add_employee(
            employee_number=f"OPS-D-{index:03d}",
            department="Ops",
            legal_entity="Airpay India",
            current_city="Mumbai",
            reporting_manager="Manager D",
            gender="Male",
            date_joined="2025-11-20" if index < 3 else "2024-08-10",
        )
    for index in range(10):
        add_employee(
            employee_number=f"SML-{index:03d}",
            department="Small",
            legal_entity="Airpay India",
            current_city="Mumbai",
            reporting_manager="Manager B",
            gender="Female" if index < 4 else "Male",
            date_joined="2024-07-01",
        )
    for index in range(25):
        add_employee(
            employee_number=f"SPR-{index:03d}",
            department="Sparse",
            legal_entity="Airpay Africa",
            current_city="Pune",
            reporting_manager="Manager C",
            gender="Female" if index < 10 else "Male",
            date_joined="2023-05-01",
        )

    return pd.DataFrame(records)


def make_predictive_events() -> pd.DataFrame:
    records: list[dict[str, object]] = []

    def add_event(
        *,
        employee_number: str,
        event_type: str,
        event_date: str,
        department: str,
        legal_entity: str,
        current_city: str,
        reporting_manager: str,
    ) -> None:
        records.append(
            {
                "employee_number": employee_number,
                "event_type": event_type,
                "event_date": pd.Timestamp(event_date),
                "department": department,
                "legal_entity": legal_entity,
                "current_city": current_city,
                "reporting_manager": reporting_manager,
            }
        )

    for month_start in pd.date_range("2025-10-01", "2026-03-01", freq="MS"):
        month_token = month_start.strftime("%Y%m")
        add_event(
            employee_number=f"OPS-J-{month_token}",
            event_type="joiner",
            event_date=(month_start + pd.Timedelta(days=10)).strftime("%Y-%m-%d"),
            department="Ops",
            legal_entity="Airpay India",
            current_city="Mumbai",
            reporting_manager="Manager A",
        )
        for idx in range(4):
            add_event(
                employee_number=f"OPS-L-{month_token}-{idx}",
                event_type="leaver",
                event_date=(month_start + pd.Timedelta(days=1 + idx)).strftime("%Y-%m-%d"),
                department="Ops",
                legal_entity="Airpay India",
                current_city="Mumbai",
                reporting_manager="Manager A",
            )

    for month_start in pd.to_datetime(["2026-01-01", "2026-02-01"]):
        month_token = month_start.strftime("%Y%m")
        add_event(
            employee_number=f"SPR-J-{month_token}",
            event_type="joiner",
            event_date=(month_start + pd.Timedelta(days=6)).strftime("%Y-%m-%d"),
            department="Sparse",
            legal_entity="Airpay Africa",
            current_city="Pune",
            reporting_manager="Manager C",
        )
        add_event(
            employee_number=f"SPR-L-{month_token}",
            event_type="leaver",
            event_date=(month_start + pd.Timedelta(days=22)).strftime("%Y-%m-%d"),
            department="Sparse",
            legal_entity="Airpay Africa",
            current_city="Pune",
            reporting_manager="Manager C",
        )

    for month_start in pd.to_datetime(["2026-01-01", "2026-02-01", "2026-03-01"]):
        month_token = month_start.strftime("%Y%m")
        add_event(
            employee_number=f"SML-J-{month_token}",
            event_type="joiner",
            event_date=(month_start + pd.Timedelta(days=8)).strftime("%Y-%m-%d"),
            department="Small",
            legal_entity="Airpay India",
            current_city="Mumbai",
            reporting_manager="Manager B",
        )
        add_event(
            employee_number=f"SML-L-{month_token}",
            event_type="leaver",
            event_date=(month_start + pd.Timedelta(days=19)).strftime("%Y-%m-%d"),
            department="Small",
            legal_entity="Airpay India",
            current_city="Mumbai",
            reporting_manager="Manager B",
        )

    return pd.DataFrame(records)


class _DummyContext:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _DummyColumn:
    def __init__(self, stub: "_DummyStreamlit") -> None:
        self._stub = stub

    def selectbox(self, label, options, index=0, **kwargs):
        return self._stub.selectbox(label, options, index=index, **kwargs)

    def select_slider(self, label, options, value=None, **kwargs):
        return self._stub.select_slider(label, options, value=value, **kwargs)

    def metric(self, *args, **kwargs):
        self._stub.metric(*args, **kwargs)

    def plotly_chart(self, *args, **kwargs):
        self._stub.plotly_chart(*args, **kwargs)

    def dataframe(self, *args, **kwargs):
        self._stub.dataframe(*args, **kwargs)

    def download_button(self, *args, **kwargs):
        self._stub.download_button(*args, **kwargs)

    def button(self, *args, **kwargs):
        return self._stub.button(*args, **kwargs)


class _DummyStreamlit:
    def __init__(self, responses: dict[str, object] | None = None) -> None:
        self.responses = responses or {}
        self.dataframe_calls = 0
        self.plot_calls = 0

    def subheader(self, *args, **kwargs):
        return None

    def caption(self, *args, **kwargs):
        return None

    def markdown(self, *args, **kwargs):
        return None

    def info(self, *args, **kwargs):
        return None

    def success(self, *args, **kwargs):
        return None

    def columns(self, spec):
        count = spec if isinstance(spec, int) else len(spec)
        return [_DummyColumn(self) for _ in range(count)]

    def selectbox(self, label, options, index=0, **kwargs):
        return self.responses.get(label, options[index])

    def select_slider(self, label, options, value=None, **kwargs):
        return self.responses.get(label, value if value is not None else options[0])

    def metric(self, *args, **kwargs):
        return None

    def dataframe(self, *args, **kwargs):
        self.dataframe_calls += 1

    def plotly_chart(self, *args, **kwargs):
        self.plot_calls += 1

    def expander(self, *args, **kwargs):
        return _DummyContext()

    def download_button(self, *args, **kwargs):
        return None

    def button(self, *args, **kwargs):
        return False


def _availability(snapshot_df: pd.DataFrame) -> SnapshotAvailability:
    return SnapshotAvailability(
        available_columns=set(snapshot_df.columns),
        missing_columns=set(),
        compatibility_level="full",
        status="imported",
    )


def test_overall_forecast_continuity():
    snapshot_df = make_predictive_snapshot()
    event_df = make_predictive_events()

    forecast_df, summary = forecast_workforce(
        snapshot_df,
        event_df,
        snapshot_date=SNAPSHOT_DATE,
        horizon_months=3,
        lookback_months=6,
        compatibility_level="full",
    )

    assert len(forecast_df) == 3
    assert (forecast_df["predicted_joiners"] >= 0).all()
    assert (forecast_df["predicted_leavers"] >= 0).all()
    assert summary["projected_leavers"] >= 0
    assert summary["history_months"] == 6


def test_segment_forecast_gating():
    snapshot_df = make_predictive_snapshot()
    event_df = make_predictive_events()

    segment_df = forecast_workforce_by_dimension(
        snapshot_df,
        event_df,
        snapshot_date=SNAPSHOT_DATE,
        dimension="department",
        horizon_months=3,
        lookback_months=6,
        compatibility_level="full",
    )

    assert not segment_df.empty
    assert set(segment_df["dimension_value"]) == {"Ops"}
    assert (segment_df["history_months"] >= 3).all()
    assert (segment_df["current_active"] >= 20).all()


def test_backfill_pressure_flags_positive_gap():
    snapshot_df = make_predictive_snapshot()
    event_df = make_predictive_events()

    pressure_df = backfill_pressure(
        snapshot_df,
        event_df,
        snapshot_date=SNAPSHOT_DATE,
        dimension="department",
        horizon_months=3,
        lookback_months=6,
        compatibility_level="full",
    )

    ops_row = pressure_df.loc[pressure_df["dimension_value"] == "Ops"].iloc[0]

    assert ops_row["replacement_gap"] > 0
    assert ops_row["pending_exits_now"] == 3
    assert ops_row["confidence_label"] in {"Medium", "High"}


def test_action_queue_generation_and_owner_mapping():
    snapshot_df = make_predictive_snapshot()
    event_df = make_predictive_events()
    _, forecast_summary = forecast_workforce(
        snapshot_df,
        event_df,
        snapshot_date=SNAPSHOT_DATE,
        horizon_months=6,
        lookback_months=6,
        compatibility_level="full",
    )

    watchouts = build_watchouts(
        snapshot_df,
        event_df,
        snapshot_date=SNAPSHOT_DATE,
        forecast_summary=forecast_summary,
        compatibility_level="full",
        lookback_months=6,
    )

    owner_map = dict(zip(watchouts["category"], watchouts["suggested_owner"]))
    severity_order = watchouts["severity"].map({"High": 0, "Medium": 1, "Low": 2, "Stable": 3}).tolist()

    assert {"severity", "category", "scope", "suggested_owner", "confidence_label", "priority_rank"}.issubset(
        watchouts.columns
    )
    assert owner_map["Forecast"] == "Talent Acquisition"
    assert owner_map["Attrition Hotspot"] == "HRBP"
    assert owner_map["Backfill Pressure"] == "Talent Acquisition"
    assert owner_map["Manager Capacity"] == "Business Leader"
    assert owner_map["Stabilization"] == "Manager"
    assert owner_map["Representation"] == "HR Leadership"
    assert severity_order == sorted(severity_order)
    assert watchouts["priority_rank"].tolist() == list(range(1, len(watchouts) + 1))


def test_partial_snapshot_downgrades_confidence():
    snapshot_df = make_predictive_snapshot()
    event_df = make_predictive_events()

    _, summary = forecast_workforce(
        snapshot_df,
        event_df,
        snapshot_date=SNAPSHOT_DATE,
        horizon_months=6,
        lookback_months=6,
        compatibility_level="partial",
    )

    assert summary["history_months"] == 6
    assert summary["confidence_label"] == "Medium"


def test_predictive_page_renders_for_overall_and_segment_views(monkeypatch):
    snapshot_df = make_predictive_snapshot()
    event_df = make_predictive_events()
    metadata = pd.Series(
        {
            "snapshot_id": "snapshot-1",
            "as_of_date": SNAPSHOT_DATE.date(),
            "source_file": "predictive.xlsx",
        }
    )
    availability = _availability(snapshot_df)

    overall_st = _DummyStreamlit(
        responses={
            "Forecast scope": "Overall",
            "Hotspot view": "Department",
        }
    )
    monkeypatch.setattr("hr_analytics.streamlit_app.st", overall_st)
    monkeypatch.setattr("hr_analytics.streamlit_app.render_export_actions", lambda **kwargs: None)
    render_predictive_page(
        workspace=SimpleNamespace(),
        snapshot_df=snapshot_df,
        event_df=event_df,
        metadata=metadata,
        availability=availability,
    )

    segment_st = _DummyStreamlit(
        responses={
            "Forecast scope": "Department",
            "Department detail": "Ops",
            "Hotspot view": "Department",
        }
    )
    monkeypatch.setattr("hr_analytics.streamlit_app.st", segment_st)
    render_predictive_page(
        workspace=SimpleNamespace(),
        snapshot_df=snapshot_df,
        event_df=event_df,
        metadata=metadata,
        availability=availability,
    )

    assert overall_st.plot_calls > 0
    assert segment_st.dataframe_calls > 0
