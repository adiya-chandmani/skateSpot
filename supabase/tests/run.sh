#!/bin/sh
# Schema/permission checks against a throwaway PostGIS container. Usage: sh supabase/tests/run.sh
set -e
cd "$(dirname "$0")"
docker rm -f ss-pg-test >/dev/null 2>&1 || true
docker run -d --name ss-pg-test -e POSTGRES_PASSWORD=pw postgis/postgis:16-3.4 >/dev/null
until docker exec ss-pg-test pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
docker exec ss-pg-test psql -U postgres -qc "create database t template template0"
for f in supabase_stub.sql ../migrations/*.sql schema_test.sql favorites_test.sql; do docker cp "$f" ss-pg-test:/$(basename "$f"); done
docker exec ss-pg-test psql -U postgres -d t -q -v ON_ERROR_STOP=1 -f /supabase_stub.sql $(for m in ../migrations/*.sql; do printf -- "-f /%s " "$(basename "$m")"; done)
docker exec ss-pg-test psql -U postgres -d t -v ON_ERROR_STOP=1 -f /schema_test.sql -f /favorites_test.sql
docker rm -f ss-pg-test >/dev/null
echo "schema tests ok"
