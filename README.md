# HR Analytics — Portable Workforce Analytics

A self-contained desktop application for workforce analytics. Upload Excel employee master reports and get interactive dashboards covering headcount, attrition, movement trends, diversity metrics, and predictive forecasting.

## Features

- **Excel Ingestion** — Auto-detect employee master sheets with schema compatibility scoring
- **Historical Snapshots** — Track workforce changes across monthly/quarterly reports
- **Interactive Dashboards** — 8 pages: Overview, Org Structure, Manager View, Movement & Attrition, Predictive Analysis, Diversity & Geography, Data Quality, Uploads
- **Export** — Download filtered data as CSV or Excel
- **Portable** — Runs locally with no cloud dependencies; all data stays on your machine

## Requirements

- Python 3.11+
- Windows 10/11

## Quick Start

### Option A: Batch Launcher (recommended)

Double-click `Run_HR_Analytics.bat` — it will create a virtual environment, install dependencies, and launch the app automatically.

### Option B: Manual Setup

```bash
python -m venv .venv_hr_analytics
.venv_hr_analytics\Scripts\activate
pip install -r requirements.txt
set PYTHONPATH=src
set HR_ANALYTICS_WORKSPACE=.workspace
python -m hr_analytics.desktop
```

## Project Structure

```
├── src/hr_analytics/       # Application source code
│   ├── adapters/           # Data source adapters (Excel, Keka stub)
│   ├── analytics.py        # KPI computation & forecasting
│   ├── bootstrap.py        # Initial data loading
│   ├── constants.py        # Configuration & theme
│   ├── desktop.py          # PyWebView desktop shell
│   ├── exports.py          # CSV/Excel export
│   ├── models.py           # Data models
│   ├── normalization.py    # Text normalization
│   ├── repository.py       # DuckDB data layer
│   ├── streamlit_app.py    # Streamlit UI (8 pages)
│   └── workspace.py        # Workspace management
├── config/                 # Column mappings & value aliases
├── tests/                  # Test suite
├── requirements.txt        # Python dependencies
└── Run_HR_Analytics.bat    # One-click launcher
```

## Data Format

Use the included **`HR_Analytics_Employee_Template.xlsx`** as your starting point. It contains:

- **Instructions** sheet — field reference with required/optional flags, data types, and examples
- **Employee Data** sheet — pre-formatted with headers, data validation dropdowns (Employment Status, Gender), and 5 sample rows
- **Blank Template** sheet — clean sheet with headers and validation only, ready for your data

### Column Overview

| Column | Required? | Description |
|--------|-----------|-------------|
| Employee Number | Yes | Unique employee ID |
| Full Name | Yes | Employee's full name |
| Department | Yes | Primary department |
| Sub Department | Yes | Sub-division |
| Job Title | Yes | Current role/designation |
| Legal Entity | Yes | Employing legal entity |
| Employment Status | Yes | "Working" or "Relieved" |
| Date Joined | Yes | Start date |
| Work Email | Yes | Work email address |
| Reporting Manager | Yes | Direct manager name |
| Last Working Day | No | Exit date (if applicable) |
| Exit Requested On | No | Resignation date |
| Current City | No | Employee location |
| Work Phone | No | Phone number |
| Gender | No | Male / Female / Other |
| L2 Manager | No | Skip-level manager |

Name your files with the as-of date for automatic detection: `Employee report-as on 7th Mar 2026.xlsx`

## License

MIT
