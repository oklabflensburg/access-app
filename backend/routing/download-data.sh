#!/bin/sh
set -eu

# Explicitly invoked; never downloads or changes the graph during app startup.
task_destination=/data/schleswig-holstein.osm.pbf
task_download=/data/schleswig-holstein.osm.pbf.download
trap 'rm -f /data/schleswig-holstein.osm.pbf.download' EXIT
curl --fail --location --retry 3 \
  https://download.geofabrik.de/europe/germany/schleswig-holstein-latest.osm.pbf \
  --output "$task_download"
test -s "$task_download"
mv "$task_download" "$task_destination"
date -u +%FT%TZ > /data/downloaded-at.txt
printf 'Downloaded Schleswig-Holstein OSM data. Rebuild the routing graph to apply it.\n'
