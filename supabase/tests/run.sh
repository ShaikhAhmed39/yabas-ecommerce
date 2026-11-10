#!/usr/bin/env bash
# Rebuilds a scratch Postgres DB from the baseline + all newer migrations, then runs every test file.
# Usage: PGPORT=5433 ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# Starts the scratch cluster if it is not running (local Debian/Ubuntu packages: `pg_ctlcluster 16 test start`).
if ! pg_isready -q -p "${PGPORT:-5433}" 2>/dev/null; then
  pg_ctlcluster 16 test start 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do pg_isready -q -p "${PGPORT:-5433}" && break; sleep 1; done
fi
DB=${DB:-yabas_test}
dropdb --if-exists "$DB"; createdb "$DB"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f tests/00_supabase_stubs.sql 2>&1 | grep -v -E 'WARNING|HINT' || true
( echo "SET check_function_bodies = false;"
  # baseline body only (skip Supabase-specific header, storage policies and PG17-only grants)
  sed -n '41,1290p' migrations/20261027185229_remote_schema.sql | grep -v '"maintain"\|MAINTAIN' ) \
  | psql -q -d "$DB" -v ON_ERROR_STOP=0 2>&1 | grep -E 'ERROR' || true
for f in $(ls migrations/*.sql | sort | awk -F/ 'substr($2,1,14) > "20261027185229"'); do
  echo "applying $f"; psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f"
done
for t in tests/[1-9]*.sql; do
  echo "=== $t ==="; psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$t"
done
echo "ALL SQL TESTS PASSED"
