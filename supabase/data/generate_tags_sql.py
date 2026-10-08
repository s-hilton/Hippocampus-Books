#!/usr/bin/env python3
"""Turn tropes.csv and content_warnings.csv into SQL that loads them into public.tags.

Usage:  python3 supabase/data/generate_tags_sql.py > tags.sql
Paste the output into a NEW migration (never edit a merged one). Rows are upserted on
(kind, slug), so re-running with an edited CSV renames or recategorizes existing tags and
adds new ones; removing a row from a CSV does not delete the tag.
"""
import csv
import pathlib

HERE = pathlib.Path(__file__).parent
FILES = [("trope", "tropes.csv"), ("content_warning", "content_warnings.csv")]


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


rows = []
for kind, filename in FILES:
    with open(HERE / filename, encoding="utf-8-sig", newline="") as f:
        for position, row in enumerate(csv.DictReader(f), start=1):
            name, slug, category = (row[k].strip() for k in ("name", "slug", "category"))
            if not (name and slug and category):
                raise SystemExit(f"{filename} row {position}: name, slug and category are all required")
            rows.append(f"  ({sql_text(kind)}, {sql_text(slug)}, {sql_text(name)}, {sql_text(category)}, {position})")

print("insert into public.tags (kind, slug, name, category, position) values")
print(",\n".join(rows))
print("on conflict (kind, slug) do update")
print("  set name = excluded.name, category = excluded.category, position = excluded.position;")
