#!/bin/sh
set -eu

# Extract accessibility-relevant OSM features as a GeoJSON FeatureCollection for
# the map's static OSM layer. Reads the routing graph's OSM extract and writes to
# stdout; the Makefile's extract-features target redirects it into the backend.
# Override the input file with OSM_PBF (used by the deployment workflow, which
# runs this on the CI runner instead of the memory-constrained server).
#
# The extraction filters come from the map feature config (config/map-features.json,
# mounted next to this script in the routing container); each osm rule's extract
# expression becomes one osmium filter. w/ (way) filters produce LineString
# geometries, n/ (node) filters produce Points. The frontend classifies each
# feature by the same config's tags.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pbf="${OSM_PBF:-/data/osm/schleswig-holstein.osm.pbf}"
dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
config="${MAP_FEATURES_CONFIG:-}"
if [ -z "$config" ]; then
    for candidate in "$dir/map-features.json" "$dir/../config/map-features.json"; do
        if [ -f "$candidate" ]; then
            config=$candidate
            break
        fi
    done
fi
if [ -z "$config" ] || [ ! -f "$config" ]; then
    echo "Map feature config not found; set MAP_FEATURES_CONFIG." >&2
    exit 1
fi
filters=$(jq -r '[.types[].osm[].extract] | join(" ")' "$config")
if [ -z "$filters" ]; then
    echo "No OSM extraction filters configured in $config." >&2
    exit 1
fi
osmium tags-filter "$pbf" $filters \
    --output "$work/features.osm.pbf" --overwrite
osmium export "$work/features.osm.pbf" --add-unique-id=type_id --output-format=geojson \
    --output "$work/features.geojson" --overwrite
cat "$work/features.geojson"
