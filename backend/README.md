# AccessApp API

The Symfony JSON API for accessibility observations. It runs with FrankenPHP,
PostgreSQL/PostGIS, Doctrine DBAL and migrations, and persistent photo storage.

## Start the application

```bash
docker compose run --rm routing-data
docker compose up --build --wait
```

The explicit download command fetches the Schleswig-Holstein OSM extract, which
includes Flensburg and its surroundings. The first routing startup builds a
walking graph and can take several minutes. Allow Docker at least 4 GB of RAM
for the stack; routing starts with a 2 GB Java heap (`GRAPHHOPPER_XMX` can increase it).
GraphHopper 11.1 runs in a locally built Java 17 image using the official release
JAR and its verified SHA-256 digest. No hosted routing API or API key is needed.
Normal restarts reuse the `graphhopper_graphs` volume and do not download OSM data.
The routing engine is internal to Compose; the frontend only calls `/api/routes`.
Observation collection works even while routing is building or unavailable.
The deployment workflow preserves `routing/data/` and downloads the extract
only when it is missing. It does not automatically refresh existing OSM data.

Check routing readiness:

```bash
docker compose exec routing curl -fsS http://localhost:8989/info
docker compose logs -f routing
```

To update routing data, run the download command again, then explicitly rebuild:

```bash
docker compose run --rm routing-data
GRAPHHOPPER_REBUILD_GRAPH=true docker compose up -d --force-recreate routing
# Wait for readiness, then restore normal graph reuse:
docker compose up -d --force-recreate routing
```

Rebuilding temporarily interrupts route calculation and moves the previous
graph into `/data/graph-backup.XXXXXX/graph-cache` inside the GraphHopper volume
before generating a replacement. Backups consume disk space and can be removed
manually after verifying the new graph. Restore normal reuse as shown above so
future restarts do not repeatedly rebuild. Observation and photo data are
unaffected. Keep OSM files and generated graphs outside Git.
`routing/data/downloaded-at.txt` records the download time. Changing engine
version or graph build settings may require a rebuild.

### Migration from openrouteservice

The existing OSM extract is reused, but ORS graphs are incompatible with native
GraphHopper graphs. The first startup therefore imports a new graph into
`graphhopper_graphs`. The previous `api_routing_graphs` volume is left untouched;
no database or photo volumes are changed. Replace any `ORS_BASE_URL` override in
local or production environment settings with
`GRAPHHOPPER_BASE_URL=http://routing:8989`, and replace `ORS_XMX` with
`GRAPHHOPPER_XMX`. Remove `ORS_REBUILD_GRAPHS`. The deployment workflow builds the
routing image and preserves the existing extract automatically. No database
migration is required.

`POST /api/routes` accepts `start` and `end` objects with `latitude`/`longitude`,
plus an optional `wheelchairAccessible` flag (default `false`). When the flag is
set, the backend uses the `foot_wheelchair` profile, which additionally blocks
steps. It returns `geometry` (GeoJSON LineString, longitude first), `distanceMeters`,
`snappedStart`, and `snappedEnd`. The backend calls GraphHopper's internal
`POST /route` with the selected profile and unencoded GeoJSON coordinates.
It validates the snapped waypoints and rejects either endpoint more than
100 metres from its requested location. Distance excludes the connection from clicked
coordinates to the snapped walking network. No route data is persisted.
Error responses contain `error` and a stable `code`: `invalid_input` or
`identical_points` (400), `no_route` (422), `invalid_response` (502), or
`unavailable` (503). The server request limit is 15 seconds.

The walking profile assigns a constant speed of 5 km/h and uniform priority to
permitted edges, with zero distance influence and no turn penalties. Its weights
are therefore proportional to distance, not estimated walking time. Standard
pedestrian access restrictions still apply; mountain-hiking paths and German
bridleways without explicit pedestrian permission are excluded. Steps are
allowed in the `foot_shortest` profile; the `foot_wheelchair` profile blocks
them. Wheelchair routing is an approximation from built-in encoded values: the
OSM `wheelchair` tag would need a custom encoded value and therefore a custom
GraphHopper build. The API exposes
distance only, not the synthetic travel time. Collected observations and custom
accessibility rules are not applied yet.

Source and setup: [Geofabrik Schleswig-Holstein](https://download.geofabrik.de/europe/germany/schleswig-holstein.html),
[GraphHopper 11.1](https://github.com/graphhopper/graphhopper/releases/tag/11.1),
and [custom-model weighting](https://github.com/graphhopper/graphhopper/blob/11.1/docs/core/custom-models.md).

The local API is available at `http://localhost:8080`. Check the application,
database, and PostGIS connection with:

```bash
curl http://localhost:8080/api/health
```

## Run Symfony commands

The Symfony CLI is installed in the PHP container:

```bash
docker compose exec php symfony console about
docker compose exec php symfony console doctrine:migrations:migrate
```

## Database

The default development database is `api`, using user `app` and password
`!ChangeMe!`. Override these defaults with `POSTGRES_DB`, `POSTGRES_USER`, and
`POSTGRES_PASSWORD` environment variables. Change the password outside local
development.

PostGIS is initialized by the first Doctrine migration. The container runs all
pending migrations during startup. Observation locations use a spatial index;
media files are stored in the dedicated `photo_data` volume.

## Tests

```bash
docker compose exec php php bin/console --env=test doctrine:migrations:migrate --no-interaction
docker compose exec php php bin/phpunit
```

After building the routing image, verify the production distance-only profile
against a tiny synthetic OSM network (short stairs versus a faster footway
detour), using a temporary container and graph without changing real OSM data:

```bash
cd ..
npm run test:routing-profile
npm run test:api -- tests/api/routing.spec.ts
```

Stop the stack with:

```bash
docker compose down --remove-orphans
```
