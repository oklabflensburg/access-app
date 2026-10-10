#!/bin/sh
set -eu

# Rebuild only on explicit request; retain the previous graph for recovery.
case "${GRAPHHOPPER_REBUILD_GRAPH:-false}" in
    true|True|1)
        if [ -d /data/graph-cache ]; then
            backup_dir=$(mktemp -d /data/graph-backup.XXXXXX)
            mv /data/graph-cache "$backup_dir/graph-cache"
            printf 'Previous graph retained at %s/graph-cache\n' "$backup_dir"
        fi
        ;;
    false|False|0) ;;
    *) printf 'GRAPHHOPPER_REBUILD_GRAPH must be true or false\n' >&2; exit 1 ;;
esac

exec java "-Xms${GRAPHHOPPER_XMS:-256m}" "-Xmx${GRAPHHOPPER_XMX:-2g}" -jar /app/graphhopper.jar "$@"
