#!/bin/sh
set -eu

test_database="${POSTGRES_DB:-api}_test"

if ! psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align \
    --command "SELECT 1 FROM pg_database WHERE datname = '$test_database'" | grep --quiet '^1$'; then
    createdb --username "$POSTGRES_USER" --template template_postgis "$test_database"
fi
