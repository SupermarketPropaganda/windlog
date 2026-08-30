#!/usr/bin/env python3
"""
WindLog Database Builder
========================
This script downloads airport and navaid data from OurAirports (CSV format)
and compiles them into an optimized SQLite database for the WindLog application.

Output:
  public/waypoints.sqlite

Usage:
  python tools/build-db.py
"""

import csv
import io
import os
import sqlite3
import sys
import time
import urllib.request
from pathlib import Path

# Data Source URLs
AIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
NAVAIDS_URL = "https://davidmegginson.github.io/ourairports-data/navaids.csv"

# Airport type mappings (OurAirports -> WindLog)
AIRPORT_TYPE_MAPPING = {
    "large_airport": "airport",
    "medium_airport": "airport",
    "small_airport": "airport",
    "heliport": "airport",
    "seaplane_base": "airport",
}

# Navaid type mappings (OurAirports -> WindLog)
NAVAID_TYPE_MAPPING = {
    "VOR": "vor",
    "VOR-DME": "vor-dme",
    "VORTAC": "vortac",
    "NDB": "ndb",
    "NDB-DME": "ndb-dme",
    "DME": "dme",
    "TACAN": "tacan",
}

# Airport types to explicitly exclude
EXCLUDED_AIRPORT_TYPES = {"closed", "balloonport"}


def get_project_root() -> Path:
    """Returns the project root directory."""
    return Path(__file__).resolve().parent.parent


def download_csv(url: str, description: str) -> list[dict[str, str]]:
    """
    Downloads a CSV file from a URL and parses it into a list of row dictionaries.
    """
    print(f"Downloading {description} from:\n  {url} ...")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "WindLog-Database-Builder/1.0"}
    )
    start_time = time.time()
    with urllib.request.urlopen(req) as response:
        content = response.read().decode("utf-8")
    elapsed = time.time() - start_time
    print(f"  Downloaded {len(content):,} bytes in {elapsed:.2f}s.")

    # Parse CSV content
    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    print(f"  Parsed {len(rows):,} raw records.")
    return rows


def parse_float(val: str | None) -> float | None:
    """Helper to parse a float value or return None if empty/invalid."""
    if not val:
        return None
    val = val.strip()
    if not val:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def process_airports(raw_rows: list[dict[str, str]]) -> list[tuple]:
    """
    Processes raw airport rows into waypoint tuples.
    Returns: list of (identifier, name, type, latitude, longitude, elevation, frequency, country)
    """
    airports = []
    skipped_closed = 0
    skipped_invalid = 0

    for row in raw_rows:
        ident = row.get("ident", "").strip().upper()
        if not ident:
            skipped_invalid += 1
            continue

        raw_type = row.get("type", "").strip().lower()
        if raw_type in EXCLUDED_AIRPORT_TYPES:
            skipped_closed += 1
            continue

        mapped_type = AIRPORT_TYPE_MAPPING.get(raw_type)
        if not mapped_type:
            # Skip any unrecognized or unmapped types
            skipped_invalid += 1
            continue

        name = row.get("name", "").strip()
        lat = parse_float(row.get("latitude_deg"))
        lon = parse_float(row.get("longitude_deg"))
        elevation = parse_float(row.get("elevation_ft"))
        country = row.get("iso_country", "").strip().upper()

        if lat is None or lon is None:
            skipped_invalid += 1
            continue

        # frequency is None for airports
        frequency = None

        airports.append((
            ident,
            name,
            mapped_type,
            lat,
            lon,
            elevation,
            frequency,
            country
        ))

    print(f"  Valid airports extracted: {len(airports):,}")
    print(f"  Skipped closed/balloonports: {skipped_closed:,}, skipped invalid/other: {skipped_invalid:,}")
    return airports


def process_navaids(raw_rows: list[dict[str, str]]) -> list[tuple]:
    """
    Processes raw navaid rows into waypoint tuples.
    Returns: list of (identifier, name, type, latitude, longitude, elevation, frequency, country)
    """
    navaids = []
    skipped_unsupported = 0
    skipped_invalid = 0

    for row in raw_rows:
        ident = row.get("ident", "").strip().upper()
        if not ident:
            skipped_invalid += 1
            continue

        raw_type = row.get("type", "").strip().upper()
        mapped_type = NAVAID_TYPE_MAPPING.get(raw_type)
        if not mapped_type:
            skipped_unsupported += 1
            continue

        name = row.get("name", "").strip()
        lat = parse_float(row.get("latitude_deg"))
        lon = parse_float(row.get("longitude_deg"))
        elevation = parse_float(row.get("elevation_ft"))
        frequency = parse_float(row.get("frequency_khz"))
        country = row.get("iso_country", "").strip().upper()

        if lat is None or lon is None:
            skipped_invalid += 1
            continue

        navaids.append((
            ident,
            name,
            mapped_type,
            lat,
            lon,
            elevation,
            frequency,
            country
        ))

    print(f"  Valid navaids extracted: {len(navaids):,}")
    print(f"  Skipped unsupported types: {skipped_unsupported:,}, skipped invalid: {skipped_invalid:,}")
    return navaids


def build_database(db_path: Path, airports: list[tuple], navaids: list[tuple]) -> None:
    """
    Creates SQLite database, tables, indexes, and inserts waypoint records.
    """
    print(f"\nBuilding SQLite database at:\n  {db_path} ...")
    
    # Ensure parent directory exists
    db_path.parent.mkdir(parents=True, exist_ok=True)

    # Remove existing database file if present
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Optimization pragmas during bulk insertion
    cursor.execute("PRAGMA synchronous = OFF;")
    cursor.execute("PRAGMA journal_mode = MEMORY;")

    # Create waypoints table
    cursor.execute("""
    CREATE TABLE waypoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      elevation REAL,
      frequency REAL,
      country TEXT NOT NULL
    );
    """)

    insert_sql = """
    INSERT INTO waypoints (
      identifier,
      name,
      type,
      latitude,
      longitude,
      elevation,
      frequency,
      country
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    """

    print("  Inserting airport records...")
    cursor.executemany(insert_sql, airports)

    print("  Inserting navaid records...")
    cursor.executemany(insert_sql, navaids)

    print("  Creating indexes...")
    cursor.execute("CREATE INDEX idx_identifier ON waypoints(identifier);")
    cursor.execute("CREATE INDEX idx_type ON waypoints(type);")
    cursor.execute("CREATE INDEX idx_country ON waypoints(country);")

    conn.commit()

    # Optimize and vacuum the final database
    cursor.execute("PRAGMA optimize;")
    conn.close()

    print("  Database build complete.")


def format_file_size(size_bytes: int) -> str:
    """Formats bytes into a readable string (e.g. '12.34 MB')."""
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024.0 or unit == "GB":
            return f"{size_bytes:,.2f} {unit}" if unit != "B" else f"{size_bytes:,} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} B"


def main() -> None:
    start_total_time = time.time()
    project_root = get_project_root()
    output_db_path = project_root / "public" / "waypoints.sqlite"

    print("=" * 60)
    print(" WindLog Database Builder ")
    print("=" * 60)
    print(f"Project root: {project_root}")
    print(f"Target DB:    {output_db_path}")
    print("-" * 60)

    try:
        # Step 1: Download & process airports
        airports_raw = download_csv(AIRPORTS_URL, "Airports CSV")
        airports = process_airports(airports_raw)
        print()

        # Step 2: Download & process navaids
        navaids_raw = download_csv(NAVAIDS_URL, "Navaids CSV")
        navaids = process_navaids(navaids_raw)

        # Step 3: Build SQLite database
        build_database(output_db_path, airports, navaids)

        # Step 4: Summary & stats
        total_waypoints = len(airports) + len(navaids)
        file_size_bytes = output_db_path.stat().st_size
        total_time = time.time() - start_total_time

        print("\n" + "=" * 60)
        print(" BUILD SUMMARY")
        print("=" * 60)
        print(f"  Airports:        {len(airports):>10,}")
        print(f"  Navaids:         {len(navaids):>10,}")
        print(f"  Total Waypoints: {total_waypoints:>10,}")
        print(f"  Database File:   {output_db_path}")
        print(f"  Database Size:   {format_file_size(file_size_bytes)} ({file_size_bytes:,} bytes)")
        print(f"  Elapsed Time:    {total_time:.2f}s")
        print("=" * 60)

    except Exception as err:
        print(f"\n[ERROR] Database build failed: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
