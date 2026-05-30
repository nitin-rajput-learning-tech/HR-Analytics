from __future__ import annotations

import sys
from pathlib import Path

APP_NAME = "HR Analytics"
APP_SUBTITLE = "Portable Workforce Analytics"

CANONICAL_COLUMNS = [
    "snapshot_id",
    "as_of_date",
    "employee_number",
    "full_name",
    "legal_entity",
    "last_working_day",
    "current_city",
    "work_phone",
    "work_email",
    "exit_requested_on",
    "sub_department",
    "gender",
    "date_joined",
    "employment_status",
    "job_title",
    "l2_manager",
    "reporting_manager",
    "department",
    "source_file",
    "compatibility_level",
]

EMPLOYEE_COLUMNS = [
    "employee_number",
    "full_name",
    "legal_entity",
    "last_working_day",
    "current_city",
    "work_phone",
    "work_email",
    "exit_requested_on",
    "sub_department",
    "gender",
    "date_joined",
    "employment_status",
    "job_title",
    "l2_manager",
    "reporting_manager",
    "department",
]

FULL_COMPATIBILITY_FIELDS = set(EMPLOYEE_COLUMNS)
COMPATIBLE_REQUIRED_FIELDS = {
    "employee_number",
    "full_name",
    "legal_entity",
    "work_email",
    "sub_department",
    "date_joined",
    "employment_status",
    "job_title",
    "reporting_manager",
    "department",
}
OPTIONAL_COMPATIBILITY_FIELDS = {
    "last_working_day",
    "current_city",
    "work_phone",
    "exit_requested_on",
    "gender",
    "l2_manager",
}
PARTIAL_MIN_FIELDS = {
    "employee_number",
    "full_name",
    "department",
    "job_title",
}

FILTER_FIELDS = [
    "legal_entity",
    "department",
    "sub_department",
    "job_title",
    "gender",
    "reporting_manager",
    "l2_manager",
    "current_city",
    "employment_status",
]

DIMENSION_LABELS = {
    "legal_entity": "Legal Entity",
    "department": "Department",
    "sub_department": "Sub Department",
    "job_title": "Job Title",
    "gender": "Gender",
    "reporting_manager": "Reporting Manager",
    "l2_manager": "L2 Manager",
    "current_city": "Current City",
    "employment_status": "Employment Status",
}

STRUCTURE_DIMENSIONS = [
    "department",
    "sub_department",
    "job_title",
    "legal_entity",
    "current_city",
    "gender",
    "reporting_manager",
    "l2_manager",
]

EXIT_BREAKDOWN_FIELDS = [
    "department",
    "legal_entity",
    "sub_department",
    "reporting_manager",
    "gender",
]

DIVERSITY_BREAKDOWN_FIELDS = [
    "legal_entity",
    "department",
    "reporting_manager",
    "l2_manager",
]

MANAGER_HIERARCHY_FIELDS = [
    "reporting_manager",
    "l2_manager",
]

MOVEMENT_GRAIN_OPTIONS = {
    "Month": "month",
    "Quarter": "quarter",
    "Year": "year",
}

MANUAL_UPLOAD_ALLOWED_LEVELS = {"full", "compatible_with_warnings"}

EXPORT_NOTE_EVENT = "Reconstructed from event dates"
EXPORT_NOTE_PARTIAL = "Partial source coverage applies to the selected snapshot"
BLANK_ALIAS_TOKEN = "__BLANK__"

APP_THEME = {
    "primary": "#4a6cf7",
    "accent": "#0ea5e9",
    "bg": "#f5f7fb",
    "surface": "#ffffff",
    "ink": "#1e293b",
    "muted": "#64748b",
}


def project_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def resource_path(*parts: str) -> Path:
    candidates: list[Path] = []

    meipass_root = getattr(sys, "_MEIPASS", None)
    if meipass_root:
        meipass = Path(meipass_root)
        candidates.append(meipass.joinpath(*parts))
        candidates.append(meipass.parent.joinpath(*parts))

    root = project_root()
    candidates.append(root.joinpath(*parts))

    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]
