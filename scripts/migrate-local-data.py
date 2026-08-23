#!/usr/bin/env python3
import base64
import json
import os
import pathlib
import sqlite3
import sys
import time
import urllib.error
import urllib.request


PROJECT = pathlib.Path(__file__).resolve().parents[1]
D1_PATH = PROJECT / ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite"
R2_INDEX_PATH = PROJECT / ".wrangler/state/v3/r2/miniflare-R2BucketObject/49e6826fd41b4990fd0dd7b3ba19a3021a358ffb618ea1ab8f4454a592996ae7.sqlite"
R2_BLOBS_PATH = PROJECT / ".wrangler/state/v3/r2/site-creator-r2/blobs"
IMPORT_URL = os.environ["MM_IMPORT_URL"]
IMPORT_TOKEN = os.environ["MM_IMPORT_TOKEN"]
SITES_BYPASS_TOKEN = os.environ["MM_SITES_BYPASS_TOKEN"]


def post(payload):
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        IMPORT_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {IMPORT_TOKEN}",
            "OAI-Sites-Authorization": f"Bearer {SITES_BYPASS_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", "replace")
            if error.code < 500 or attempt == 3:
                raise RuntimeError(f"HTTP {error.code}: {details}") from error
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == 3:
                raise RuntimeError(str(error)) from error
        time.sleep(2 ** attempt)


def chunks(rows, size=25):
    for index in range(0, len(rows), size):
        yield rows[index:index + size]


def migrate_database():
    connection = sqlite3.connect(D1_PATH)
    connection.row_factory = sqlite3.Row
    tables = [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
        )
    ]
    total = 0
    for table in tables:
        columns = [row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')]
        rows = [list(row) for row in connection.execute(f'SELECT * FROM "{table}"')]
        if table == "app_users":
            email_index = columns.index("email")
            rows = [row for row in rows if row[email_index] not in {"martin@local.mm", "sites-screenshot-service-noreply@chatgpt.com"}]
        if not rows:
            print(f"DB {table}: 0")
            continue
        imported = 0
        for batch in chunks(rows):
            result = post({"mode": "rows", "table": table, "columns": columns, "rows": batch})
            imported += int(result["imported"])
        total += imported
        print(f"DB {table}: {imported}")
    connection.close()
    post({"mode": "cleanup"})
    print(f"DB CELKEM: {total}")


def migrate_objects():
    connection = sqlite3.connect(R2_INDEX_PATH)
    rows = connection.execute("SELECT key, blob_id, size, http_metadata FROM _mf_objects ORDER BY key").fetchall()
    transferred = 0
    total_bytes = 0
    for key, blob_id, expected_size, http_metadata in rows:
        blob = (R2_BLOBS_PATH / blob_id).read_bytes()
        if len(blob) != expected_size:
            raise RuntimeError(f"Nesouhlasí velikost souboru {key}: {len(blob)} != {expected_size}")
        metadata = json.loads(http_metadata or "{}")
        result = post({
            "mode": "object",
            "key": key,
            "contentType": metadata.get("contentType", "application/octet-stream"),
            "data": base64.b64encode(blob).decode("ascii"),
        })
        if int(result["size"]) != expected_size:
            raise RuntimeError(f"Online velikost nesouhlasí pro {key}")
        transferred += 1
        total_bytes += expected_size
        print(f"R2 {transferred}/{len(rows)}: {key} ({expected_size} B)")
    connection.close()
    print(f"R2 CELKEM: {transferred} souborů, {total_bytes} B")


if __name__ == "__main__":
    try:
        migrate_database()
        migrate_objects()
    except Exception as error:
        print(f"MIGRACE SELHALA: {error}", file=sys.stderr)
        raise
