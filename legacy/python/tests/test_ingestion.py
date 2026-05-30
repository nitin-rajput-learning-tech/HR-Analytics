from __future__ import annotations

import pandas as pd

from hr_analytics.adapters.workbook import manual_publish_block_reason, normalize_value
from hr_analytics.analytics import availability_from_metadata


def test_bootstrap_imports_all_files_and_quarantines_duplicate(bootstrapped):
    _, _, snapshots = bootstrapped

    assert len(snapshots) == 14
    assert (snapshots["status"] == "imported").sum() == 13
    assert (snapshots["status"] == "quarantined_duplicate").sum() == 1
    assert not (snapshots["status"] == "rejected").any()

    duplicate_row = snapshots[snapshots["status"] == "quarantined_duplicate"].iloc[0]
    assert "Copy" in duplicate_row["source_file"]


def test_duplicate_snapshot_keeps_higher_row_count_active(bootstrapped):
    _, _, snapshots = bootstrapped

    july = snapshots[snapshots["as_of_date"] == pd.Timestamp("2025-07-07")]
    assert len(july) == 2

    active = july[july["is_active_for_date"] == True].iloc[0]
    quarantined = july[july["status"] == "quarantined_duplicate"].iloc[0]

    assert active["row_count"] == 2088
    assert quarantined["row_count"] == 422


def test_august_and_october_schema_mappings(bootstrapped):
    _, repository, snapshots = bootstrapped

    august = snapshots[snapshots["source_file"].str.contains("4th Aug", regex=False)].iloc[0]
    october = snapshots[snapshots["source_file"].str.contains("13th Oct", regex=False)].iloc[0]

    august_df = repository.get_snapshot_dataframe(august["snapshot_id"])
    october_df = repository.get_snapshot_dataframe(october["snapshot_id"])

    assert august["compatibility_level"] == "partial"
    assert august_df["current_city"].notna().sum() > 0
    assert august_df["reporting_manager"].notna().sum() > 0
    assert august_df["last_working_day"].notna().sum() > 0

    assert october["compatibility_level"] == "compatible_with_warnings"
    assert october_df["sub_department"].notna().sum() > 0
    assert "current_city" in october_df.columns


def test_partial_snapshots_surface_missing_fields(bootstrapped):
    _, _, snapshots = bootstrapped

    august = snapshots[snapshots["source_file"].str.contains("4th Aug", regex=False)].iloc[0]
    november = snapshots[snapshots["source_file"].str.contains("7th Nov", regex=False)].iloc[0]

    august_availability = availability_from_metadata(august)
    november_availability = availability_from_metadata(november)

    assert august_availability.compatibility_level == "partial"
    assert "legal_entity" in august_availability.missing_columns
    assert november_availability.compatibility_level == "full"
    assert not november_availability.missing_columns


def test_bootstrap_records_uploader_and_blocks_partial_manual_publish(adapter, repository):
    import pytest

    snapshots = repository.list_snapshots()
    assert snapshots.empty

    sources = adapter.list_bootstrap_sources()
    if not sources:
        pytest.skip("Employee Masters fixture data not available")

    adapter.bootstrap_from_fixtures(force_reimport=True)
    snapshots = repository.list_snapshots()
    assert "uploaded_by" in snapshots.columns
    assert (snapshots["uploaded_by"] == "fixture_bootstrap").any()

    august_path = next(path for path in sources if "4th Aug" in path.name)
    candidate = adapter.review_uploaded_file(file_name=august_path.name, raw_bytes=august_path.read_bytes())

    assert candidate.compatibility_level == "partial"
    assert manual_publish_block_reason(candidate) is not None


def test_current_city_values_are_normalized_for_display() -> None:
    assert normalize_value("current_city", "  mumbai ") == "Mumbai"
    assert normalize_value("current_city", "NAVI MUMBAI") == "Navi Mumbai"
    assert normalize_value("current_city", "dar es salaam") == "Dar es Salaam"
    assert normalize_value("current_city", ".") is None


def test_alias_lookup_is_case_insensitive_and_applies_display_normalization(repository) -> None:
    repository.replace_value_aliases(
        pd.DataFrame(
            [
                {
                    "field_name": "current_city",
                    "raw_value": "Mumbai",
                    "canonical_value": "Mumbai",
                },
                {
                    "field_name": "current_city",
                    "raw_value": "Miraroad",
                    "canonical_value": "Mira Road",
                },
            ]
        )
    )

    result = repository.apply_value_aliases(
        pd.DataFrame(
            {
                "current_city": [
                    "mumbai",
                    " MUMBAI ",
                    "Miraroad",
                    "miraroad",
                    "dar es salaam",
                    None,
                ]
            }
        )
    )

    assert result["current_city"].tolist() == [
        "Mumbai",
        "Mumbai",
        "Mira Road",
        "Mira Road",
        "Dar es Salaam",
        None,
    ]


def test_seed_value_aliases_upserts_missing_defaults(repository) -> None:
    repository.seed_value_aliases(
        [
            {
                "field_name": "current_city",
                "raw_value": "Mumbai",
                "canonical_value": "Mumbai",
            }
        ]
    )
    repository.seed_value_aliases(
        [
            {
                "field_name": "current_city",
                "raw_value": "Mumbai",
                "canonical_value": "Mumbai",
            },
            {
                "field_name": "current_city",
                "raw_value": "Miraroad",
                "canonical_value": "Mira Road",
            },
        ]
    )

    aliases = repository.get_value_aliases()
    current_city = aliases[aliases["field_name"] == "current_city"]

    assert len(current_city) == 2
    assert set(current_city["canonical_value"]) == {"Mumbai", "Mira Road"}
