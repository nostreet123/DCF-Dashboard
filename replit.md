# DCF Dashboard - Damodaran Financial Database

## Overview
A data pipeline that stores Professor Aswath Damodaran's public datasets in Convex and keeps them updated via a Python sync job.

## Project Structure
```
.
├── convex/           # Convex backend schema and functions
├── python/           # Python data sync CLI
│   ├── damodaran_sync/  # Sync module
│   └── tests/           # Test suite
├── documentation/    # Project documentation
└── package.json      # Bun/Node dependencies
```

## Tech Stack
- **Backend**: Convex (serverless database)
- **Data Sync**: Python 3.11
- **Package Manager**: Bun (for Convex), pip (for Python)

## Setup Requirements

### Environment Variables
- `CONVEX_URL`: Convex deployment URL (required for Python sync)
- `DAMODARAN_SYNC_TOKEN`: Optional auth token for sync operations

### Running the Project
1. Start Convex dev server: `bunx convex dev`
2. Run Python CLI from `python/` directory:
   - Seed data: `python -m damodaran_sync.cli seed`
   - Sync current: `python -m damodaran_sync.cli sync-current`
   - Sync all: `python -m damodaran_sync.cli sync-all`

## Key Features
- Syncs financial datasets from NYU Stern's Damodaran pages
- Stores snapshots in Convex with versioning
- Supports industry, country, and time-series data types
- Operational logging and error tracking
