#!/bin/sh
set -eu

# Extract OSM staircases (highway=steps) as a GeoJSON FeatureCollection for the
# map's static steps layer. Reads the routing graph's OSM extract and writes to
# stdout; the Makefile's extract-steps target redirects it into the backend.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
osmium tags-filter /data/osm/schleswig-holstein.osm.pbf w/highway=steps \
    --output "$work/steps.osm.pbf" --overwrite
osmium export "$work/steps.osm.pbf" --add-unique-id=type_id --output-format=geojson \
    --output "$work/steps.geojson" --overwrite
cat "$work/steps.geojson"
