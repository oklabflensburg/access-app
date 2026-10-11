#!/bin/sh
set -eu

# Extract accessibility-relevant OSM features as a GeoJSON FeatureCollection for
# the map's static OSM layer. Reads the routing graph's OSM extract and writes to
# stdout; the Makefile's extract-features target redirects it into the backend.
#
# Each filter below becomes one kind of map feature; extend the list to import
# more. w/ (way) filters produce LineString geometries, n/ (node) filters produce
# Points. The frontend classifies each feature by its tags, so a new filter only
# needs a matching classification rule there.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
filters="w/highway=steps w/ramp=wheelchair n/highway=elevator n/amenity=toilets"
osmium tags-filter /data/osm/schleswig-holstein.osm.pbf $filters \
    --output "$work/features.osm.pbf" --overwrite
osmium export "$work/features.osm.pbf" --add-unique-id=type_id --output-format=geojson \
    --output "$work/features.geojson" --overwrite
cat "$work/features.geojson"
