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

The tool expects Excel workbooks with employee master data. Filenames should include the as-of date (e.g., `Employee report-as on 7th May 2025.xlsx`). The tool auto-detects column mappings and assigns compatibility levels.

## License

MIT
