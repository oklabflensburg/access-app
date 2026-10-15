# AccessApp — Technical Documentation

Status: October 2026, collection MVP (milestones 1–7 plus routing and OSM feature import).
Audience: developers joining the project. This document describes the current state of the system: the technology stack, where data comes from, how it is processed, and where it is stored. Section 5 covers the OpenStreetMap data pipeline in detail and assumes no prior OSM knowledge.

---

## 1. System overview

AccessApp is a mobile-first, offline-capable PWA for collecting accessibility observations (questionnaire answers, photos, noise/motion/light measurements) and drawing map features (polygons such as ramps, steps, toilets). Data is stored locally first (local-first) and synchronized to a public map served by a Symfony REST API backed by PostgreSQL/PostGIS. A self-hosted GraphHopper instance computes walking routes over an OpenStreetMap graph of Schleswig-Holstein.

```
┌─────────────────────────────── Browser ───────────────────────────────┐
│  Vue 3 PWA (Vite, Pinia, Leaflet, PrimeVue, vue-i18n)                  │
│  ├── Dexie/IndexedDB  (observations, photos, sensors, features, prefs)│
│  ├── Service Worker  (Workbox app-shell precache, prompt update)      │
│  └── Browser APIs    (Geolocation, getUserMedia, DeviceMotion, ALS)   │
└──────────┬───────────────────────────────────────────────────────────┘
           │ HTTPS JSON / multipart, Bearer edit-token
┌──────────▼───────────────────────────────────────────────────────────┐
│  Symfony 8.1 API (PHP 8.5, FrankenPHP/Caddy)  /api/*                  │
│  ├── Doctrine ORM + DBAL, migrations (auto-applied on start)          │
│  ├── Photo pipeline (GD re-encode, atomic writes, var/photos volume)  │
│  └── RoutingService ── HTTP ──► GraphHopper 11.1 (Java 17, :8989)     │
│                                       │                              │
│  PostgreSQL 17 + PostGIS 3.5          │ OSM extract (Geofabrik .pbf)  │
│  (observations, media, sensors,      │ graph-cache volume            │
│   map_features, routing_preferences)  │                              │
└───────────────────────────────────────┴──────────────────────────────┘
```

Key architectural decisions (from `README.md`, still in force):

- **Local-first**: every record is written to IndexedDB before any network call; a durable sync queue publishes it later.
- **No user accounts**: edit capability is a random per-observation token; the server stores only its SHA-256 hash.
- **Revision-based optimistic concurrency**: edits increment a `revision`; stale revisions are rejected server-side.
- **Idempotent mutations**: repeated sync attempts with the same ID/revision are safe; deletion leaves tombstones.

---

## 2. Technology stack

### Frontend (`src/`, root project)

| Technology | Version | Role |
| --- | --- | --- |
| Vue | 3.5 | UI framework (Composition API, SFC) |
| TypeScript | ~5.9 | Type checking via `vue-tsc --noEmit` in the build |
| Vite | 7.3 | Dev server, build; proxies `/api` and `/data` to `127.0.0.1:8080` |
| vite-plugin-pwa (Workbox) | 1.3 | Service worker, manifest, precache; `registerType: "prompt"` |
| Pinia | 3.0 | State stores: `location`, `map`, `observation`, `preferences`, `sync` |
| vue-router | 4.6 | Views: Map, NewObservation, MyObservations, MyMapFeatures, Preferences, EditObservationDialog |
| Leaflet | 1.9 | Map rendering; OSM raster tiles; GeoJSON layers |
| PrimeVue / primeicons | 4.5 / 8.0 | UI component library, `@primeuix/themes` |
| vue-i18n | 11 | Localization (`src/i18n.ts` also maps API error codes to messages) |
| Dexie | 4.4 | IndexedDB wrapper and schema migrations |
| Playwright | 1.58 | Three suites: e2e (`playwright.config.ts`), API (`playwright.api.config.ts`), PWA (`playwright.pwa.config.ts`) |

Node `^22.12 || >=24` (`.nvmrc`). Browser APIs are isolated in `src/services/` (`geolocation.ts`, `camera.ts`, `noise.ts`, `motion.ts`, `light.ts`, `abort.ts`); Vue components hold only presentation and temporary form state.

### Backend (`backend/`)

| Technology | Version | Role |
| --- | --- | --- |
| PHP | >= 8.5 | Runtime |
| Symfony | 8.1 (framework, validator, serializer, http-client, console, yaml, dotenv) | REST API skeleton |
| Doctrine ORM / DBAL / migrations | 3.7 / 3.3 / 4.0 | Persistence, schema migrations (auto-applied on container start) |
| FrankenPHP + Caddy | (Symfony Docker image) | Application server, HTTP/HTTPS endpoints, Mercure module available |
| ext-gd | — | Server-side JPEG re-encoding of photos |
| PHPUnit | — | Functional HTTP tests (`backend/tests`) |

### Data and routing infrastructure (Docker Compose, `backend/compose.yaml`)

| Component | Image / version | Purpose |
| --- | --- | --- |
| Database | `postgis/postgis:17-3.5` | Relational + spatial storage |
| PHP/API | built from `backend/Dockerfile` | Symfony app, published on `${HTTP_PORT:-8080}` |
| Routing | `accessapp-graphhopper:11.1` (locally built Java 17 image, official release JAR, SHA-256 verified) | Walking routes, internal port 8989 |
| routing-data | `curlimages/curl:8.19.0` (profile `routing-data`) | One-shot OSM extract download |

Named volumes: `database_data`, `photo_data` (mounted at `/app/var/photos`), `graphhopper_graphs`, `caddy_data`, `caddy_config`. OSM extract lives in `backend/routing/data/` (bind mount, read-only in the routing container).

---

## 3. Where data comes from

1. **User input (primary source)**
    - Accessibility questionnaire: wheelchair accessibility, ramp, accessible toilet, elevator, steps at entrance (0–3, "3" means 3-or-more), surface class, inclination, free-text comment.
    - Drawn map features: GeoJSON polygons (3–500 vertices, closed rings, WGS84 lon/lat) typed as `area`, `building`, `entrance`, `steps`, `ramp`, `toilets`, `elevator`, or `path`.
    - Routing preferences: per-feature-type priority (`neutral`, `avoid`, `reduce`, `prefer`).
2. **Device sensors** (bounded measurements, ~10 Hz, stopped on window end/cancel/tab hide):
    - GPS via `navigator.geolocation` — a captured snapshot (accuracy, altitude, heading, speed), not continuous tracking.
    - Noise via `getUserMedia` + Web Audio `AnalyserNode` — 10-second window; stores mean RMS and peak amplitude (relative, not calibrated dB).
    - Motion via `DeviceMotionEvent` — raw acceleration (m/s²), rotation rates (deg/s), orientation angles (deg), epoch-ms timestamps.
    - Ambient light via `AmbientLightSensor`/equivalent where available — 5-second measurement; null readings stay null.
3. **Photos** — camera capture or file picker; JPEG/PNG/WebP up to 20 MB; HEIC unsupported.
4. **OpenStreetMap (external, read-only)** — three distinct uses, detailed in section 5:
    - Raster map tiles from OSM tile servers (display only, network-only, never precached).
    - Geofabrik Schleswig-Holstein `.osm.pbf` extract → GraphHopper routing graph.
    - The same extract → osmium-filtered accessibility features → static GeoJSON layer on the map.

---

## 4. How data is processed

### 4.1 Frontend capture pipeline

- Photos are resized client-side to max 1600 px longest side and re-encoded as JPEG (EXIF stripped) before storage; up to six per observation.
- Sensor services (`noise.ts`, `motion.ts`, `light.ts`) sample into arrays, compute summaries, and stop after their fixed window; `abort.ts` centralizes cancellation and permission-release handling.
- A single Dexie transaction saves the observation, photos, and sensor datasets together — a failed write leaves the open form intact.
- Edits increment the local `revision`; a stale cross-tab edit is rejected rather than merged.

### 4.2 Sync queue (`src/services/sync.ts`, `src/stores/sync.ts`)

- Statuses: `draft` → `ready` → `syncing` → `synced` / `failed`. Only ready/failed/interrupted records enter the queue.
- Order per record: upload observation JSON + photo manifest → upload each photo (multipart). Partial photo failure marks the record failed; the retry reuses the same IDs and revision.
- Acknowledgements update local records only if the revision still matches.
- Retries: 20 s request timeout, exponential backoff capped at 5 minutes, persisted across reloads; "Share & sync now" bypasses the delay; automatic retry on reconnect and every 30 s while open; Web Locks serialize cross-tab access.
- Deletions queue as tombstones so delayed requests cannot resurrect records.

### 4.3 Backend processing

- **Validation**: DTOs validated with Symfony Validator; geometry validated (closed rings, vertex counts, non-self-intersecting, parent containment) in `MapFeatureService`.
- **Authorization**: `Authorization: Bearer <edit-token>`; `EditToken` compares the SHA-256 hash. Tokens are never returned by public endpoints.
- **Concurrency**: mutations lock the observation row; idempotent replays are detected via `payload_hash`/revision; conflicting revisions return 409.
- **Photos** (`PhotoService`): accepts JPEG ≤ 5 MB / ≤ 1600 px, decodes with GD, re-encodes at quality 85 (strips metadata), writes atomically outside the public directory into the `photo_data` volume, records `sha256`/dimensions in `media`, prunes files after removal. Photos may 404 until their upload arrives.
- **Routing** (`RoutingService` → GraphHopper): see section 5.4.

### 4.4 API surface (same-origin `/api`)

| Method and route | Behavior |
| --- | --- |
| `GET /api/health` | Database connectivity check |
| `POST /api/observations` | Create/update versioned observation (idempotent) |
| `GET /api/observations?limit&cursor&bbox` | Public collection, cursor pagination (descending UUID), limit 1–200, antimeridian-safe bbox |
| `GET /api/observations/{id}` | Full record incl. measurement arrays |
| `POST /api/observations/{id}/photos` | Multipart `id`, `revision`, `photo` |
| `GET /api/observations/{id}/photos/{photoId}` | JPEG for a current, non-deleted observation |
| `DELETE /api/observations/{id}` | Repeatable deletion (`{ "revision": n }`) |
| `POST /api/map-features` | Idempotent polygon feature creation |
| `GET /api/map-features?limit` | Active public polygons, limit 1–200 |
| `DELETE /api/map-features/{id}` | Repeatable feature deletion |
| `POST /api/routes` | Walking route calculation (see 5.4) |
| `POST /api/preferences/routing` | Sync routing preferences (revision-based) |

---

## 5. OpenStreetMap data in detail

OSM data enters the system through three independent pipelines. All of them are **read-only** consumers of OSM: nothing is ever written back to OpenStreetMap.

```
Geofabrik schleswig-holstein-latest.osm.pbf
   │
   ├──(1) GraphHopper import──► routing graph (graphhopper_graphs volume)
   │        └─ POST /api/routes ─► GeoJSON LineString + distance (transient)
   │
   ├──(2) osmium tags-filter + export ──► osm-features.geojson (static file)
   │        └─ fetch + parse + classify ──► Dexie cache ──► Leaflet layer
   │              └─ "adopt" ──► buffered polygon ──► map_features table (osm_id)
   │
   └──(3) OSM raster tile servers ──► Leaflet tile layer (display only)
```

### 5.1 OSM in five minutes (primer for developers)

**What OpenStreetMap is.** OSM is a collaborative, free world map — think "Wikipedia for maps". Volunteers (and increasingly companies and government agencies) survey the world and edit a shared database. The database contains *only geometry and attributes*; it is not a map image. Every map, routing service, or app you build on it renders or processes that raw data yourself.

**The data model.** The OSM database consists of exactly three element types:

| Element | Meaning | Analogy |
| --- | --- | --- |
| **node** | A single point on Earth (WGS84 longitude/latitude) | a row in a `points` table |
| **way** | An ordered list of node references; open ways are lines (a street, a staircase), closed ways (first node = last node) can represent areas (a building footprint) | a polyline referencing point IDs |
| **relation** | A grouping of elements ("this cycle route consists of these ways", "this building is a multipolygon of these parts") | a many-to-many join table |

Each element has a **numeric id that is unique per type** — node 42 and way 42 are different objects. That is why this codebase always pairs the id with the type (`w123` / `n123`, or the `type/osmId` key) when it needs a unique identity.

**Tags.** Elements carry arbitrary `key=value` string pairs called *tags*. Tags are the entire semantic content of OSM — there is no fixed schema; conventions are documented on the OSM wiki. Examples this project depends on:

| Tag | Plain meaning | Used for |
| --- | --- | --- |
| `highway=steps` | This way is a staircase (the `highway` key covers *all* routeable paths and roads, from motorways to footpaths — it does not mean "motorway") | routing (steps), map layer (steps) |
| `highway=elevator` | This node is an elevator | map layer (elevator) |
| `ramp=wheelchair` | This way has a wheelchair ramp | map layer (ramp) |
| `amenity=toilets` | This node/way is a public toilet | map layer (toilets) |
| `foot=yes/no/designated/…` | Whether pedestrians may use this way | routing (encoded value `foot_access`) |
| `sac_scale=hiking/mountain_hiking/…` | Hiking difficulty of a path | routing (`hike_rating` — mountain paths are excluded) |

A single element usually has many tags at once (`highway=steps` + `ramp=wheelchair` + `name=…`), which is why the frontend's classification uses an ordered rule table — first match wins, so a ramped staircase still counts as steps.

**Example.** Two raw OSM elements (shown in OSM's XML representation for readability; inside a PBF they are binary). The first is the kind of staircase this app cares about — a *way* referencing three nodes, carrying three tags. The second is a toilet — a single *node* with a position of its own:

```xml
<!-- A staircase in Flensburg: a way (a line of node references) with tags -->
<way id="48123457">
  <nd ref="312060011"/>
  <nd ref="312060012"/>
  <nd ref="312060013"/>
  <tag k="highway" v="steps"/>
  <tag k="ramp" v="wheelchair"/>
  <tag k="name" v="Treppenanlage Südertor"/>
</way>

<!-- A public toilet: a node with its own coordinates -->
<node id="312060100" lat="54.78430" lon="9.43912">
  <tag k="amenity" v="toilets"/>
  <tag k="name" v="Toiletten Rathausmarkt"/>
</node>
```

Note that the way itself has no coordinates — its geometry is the sequence of positions of the nodes it references. These two elements are used as the running example throughout this section.

**The PBF file format.** The full planet is hundreds of GB, so OSM data is exchanged in *extracts*: regional snapshots in the compact binary **PBF** format (protocol-buffers-based; roughly an order of magnitude smaller than XML and fast to scan sequentially). This project uses one PBF: the Schleswig-Holstein extract. PBF is a *dump of the database* — nodes, ways, relations, and tags — with no topology or routing structure; anything like a routing graph has to be built from it.

**Geofabrik.** [Geofabrik](https://download.geofabrik.de) is a company that republishes OSM data as free daily-refreshed regional extracts. `schleswig-holstein-latest.osm.pbf` ("latest" = the current daily snapshot) is downloaded once and kept on disk; nothing in this project refreshes it automatically.

**Raster tiles.** The visible base map is *not* rendered from the PBF. Tile servers pre-render the OSM database into a pyramid of small PNG images ("tiles"), addressed as `z/x/y` (zoom level / column / row). Leaflet simply computes which tiles cover the current viewport and requests those URLs. Tiles are pure display output — the app never reads data out of them.

**License.** OSM data is Open Data under the ODbL. This project only *consumes* it (routing, feature display), which is the uncomplicated case; redistributing OSM-derived datasets (e.g. the extracted GeoJSON) carries attribution obligations worth knowing about before any public reuse beyond this app.

### 5.2 Source and acquisition

- **File**: `https://download.geofabrik.de/europe/germany/schleswig-holstein-latest.osm.pbf` — the Geofabrik regional extract in PBF format, covering the whole federal state including Flensburg.
- **Download** (`backend/routing/download-data.sh`, run via the explicit `routing-data` Compose profile — never during normal startup): `curl --fail --location --retry 3` streams to a `.download` temp file, verifies it is non-empty, atomically renames it to `backend/routing/data/schleswig-holstein.osm.pbf`, and records the UTC timestamp in `routing/data/downloaded-at.txt`. The download is idempotent and manual.
- **Storage of the raw file**: bind-mounted at `backend/routing/data/`, mounted read-only (`:/data/osm:ro`) into the routing container. Not in Git. The deployment workflow preserves `routing/data/` across rsyncs and downloads the extract only when missing.

### 5.3 Libraries that process OSM data

| Library / tool | Version | Where | What it does with OSM data |
| --- | --- | --- | --- |
| **osmium-tool** | apt package in the routing image and on the CI runner | `backend/routing/extract-features.sh` | Command-line toolkit for OSM data: `tags-filter` selects elements by tag from the PBF, `export` converts them to GeoJSON |
| **GraphHopper** | 11.1, official `graphhopper-web-11.1.jar`, SHA-256-pinned (`8462f758…4ea33`), on Eclipse Temurin 17 JRE | `backend/routing/` image | A Java routing engine: imports the PBF into an internal graph, then answers shortest-path queries over it |
| **Leaflet** | 1.9 | frontend | Renders OSM raster tiles and the extracted GeoJSON feature layer |
| **TypeScript domain code** | — | `src/domain/map/osmFeatures.ts`, `src/domain/map/pathGeometry.ts` | Parses, validates, classifies, and buffers the extracted GeoJSON |

There is no Overpass API (OSM's ad-hoc query service), no osm2pgsql (OSM-to-PostGIS importer), and no OSM library in the PHP backend — the backend only proxies GraphHopper and serves the pre-extracted static file. All OSM processing happens at build/import time, not per request.

### 5.4 Pipeline 1: routing graph (GraphHopper)

**What a routing graph is.** You cannot compute a shortest path over raw OSM elements. A routing engine first compiles them into a *graph*: nodes become graph vertices, walkable ways become edges, and the tags are distilled into numeric per-edge attributes ("encoded values") that the path algorithm can compare cheaply. This compilation is the expensive step; the resulting graph is a binary cache that is reused on every restart.

**Import (offline, one-time per data version).** On first start — or when `GRAPHHOPPER_REBUILD_GRAPH=true` is set — GraphHopper reads `/data/osm/schleswig-holstein.osm.pbf` and writes its graph to `/data/graph-cache` (the `graphhopper_graphs` Docker volume). The entrypoint (`routing/entrypoint.sh`) first moves any existing graph to `/data/graph-backup.XXXXXX/graph-cache` inside the same volume, so a failed rebuild is recoverable and the old graph can be deleted manually afterwards. The build takes several minutes and is the reason the stack wants ≥ 4 GB RAM (JVM defaults: `-Xms256m -Xmx2g`, tunable via `GRAPHHOPPER_XMX`).

**What is encoded** (`routing/graphhopper.yml`): the import keeps only pedestrian-relevant OSM semantics as encoded values — `foot_access` (from `foot`/pedestrian access tags), `foot_road_access`, `hike_rating` (from `sac_scale`), `country`, and `road_class` (the general kind of way: footway, steps, bridleway, …). Ways tagged `highway=construction` are ignored at import. Elevation is disabled (`noop` provider).

**Profiles.** Two *custom models* define the routing behavior. A custom model is GraphHopper's rule language for weighting edges at query time:

- `foot_shortest` — constant 5 km/h speed, `distance_influence: 0`, priority 1 on all permitted edges. Weights are therefore exactly proportional to distance; there is no ETA and travel time is deliberately not exposed by the API. Edges without foot access, mountain-hiking paths (`hike_rating >= 2`), and German bridleways without explicit pedestrian permission get priority 0 (effectively removed). Steps are allowed.
- `foot_wheelchair` — identical, except edges with `road_class == STEPS` also get priority 0. This is an approximation of wheelchair accessibility using built-in encoded values; honoring the OSM `wheelchair` tag would require a custom encoded value and therefore a custom GraphHopper build.

Both profiles get Contraction Hierarchies (CH) precomputation (`profiles_ch`) — an index that makes default queries fast.

**Runtime (per request).** `POST /api/routes` → `RoutingService.php` builds a GraphHopper `POST /route` request:

1. Profile selection: `avoid` priority on `steps` selects `foot_wheelchair`, otherwise `foot_shortest`.
2. The user's drawn map features with non-neutral priority are sent as `priorityAreas` and converted into a **request-time custom model**: each polygon becomes a GeoJSON feature in `custom_model.areas`, and each gets a `priority` rule `if: in_area_N, multiply_by: <factor>` (0 for avoid, reduced/increased factors from `FeaturePriorities::FACTORS`). This shapes routes around obstacles that are not in OSM. Because request custom models cannot use the precomputed CH index, `ch.disable: true` is set for those requests (slower, still bounded by a 15 s timeout).
3. `points_encoded: false` requests plain GeoJSON coordinates; `instructions` and `elevation` are off.
4. The response is validated: `paths[0].points` (LineString), `snapped_waypoints` (exactly 2), non-negative distance. GraphHopper's `PointNotFound`/`PointOutOfBounds`/`ConnectionNotFound` exceptions map to `no_route` (422); transport/decoding failures map to `unavailable` (503) or `invalid_response` (502).
5. Snap check: a clicked point rarely lies exactly on a way, so GraphHopper *snaps* it to the nearest walkable edge. GraphHopper has no per-point radius parameter, so the service computes the haversine distance between each requested point and its snapped waypoint and rejects endpoints more than 100 m apart (`no_route`, 422).

**Example.** A user has set `steps` to `avoid` and `ramp` to `prefer`, and has drawn (or adopted) a ramp polygon near the destination. The frontend sends:

```json
POST /api/routes
{
  "start": { "latitude": 54.78330, "longitude": 9.43710 },
  "end":   { "latitude": 54.78560, "longitude": 9.44180 },
  "featurePriorities": { "steps": "avoid", "ramp": "prefer" },
  "priorityAreas": [
    {
      "priority": "prefer",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[9.4388, 54.7840], [9.4392, 54.7840], [9.4392, 54.7844], [9.4388, 54.7844], [9.4388, 54.7840]]]
      }
    }
  ]
}
```

`RoutingService` derives this GraphHopper request from it — `steps: avoid` selects the `foot_wheelchair` profile, and the polygon becomes a custom-model area whose edges get their priority doubled (`prefer` → factor 2; `avoid` would be 0, `reduce` 0.5):

```json
POST http://routing:8989/route
{
  "points": [[9.43710, 54.78330], [9.44180, 54.78560]],
  "profile": "foot_wheelchair",
  "points_encoded": false,
  "instructions": false,
  "elevation": false,
  "ch.disable": true,
  "custom_model": {
    "areas": {
      "type": "FeatureCollection",
      "features": [
        { "type": "Feature", "id": "area_0", "properties": {},
          "geometry": { "type": "Polygon", "coordinates": [[[9.4388, 54.7840], [9.4392, 54.7840], [9.4392, 54.7844], [9.4388, 54.7844], [9.4388, 54.7840]]] } }
      ]
    },
    "priority": [ { "if": "in_area_0", "multiply_by": "2" } ]
  }
}
```

The API responds with (coordinates truncated):

```json
{
  "geometry": { "type": "LineString", "coordinates": [[9.43712, 54.78331], [9.43740, 54.78352], "…"] },
  "distanceMeters": 412.5,
  "snappedStart": { "latitude": 54.78331, "longitude": 9.43712 },
  "snappedEnd":   { "latitude": 54.78558, "longitude": 9.44177 }
}
```

Both snapped waypoints are within 100 m of the requested points, so the response passes validation; the route prefers edges inside the ramp polygon and, because of the `foot_wheelchair` profile, never uses OSM-mapped steps.

**Storage of processed routing data**: the compiled graph lives only in the `graphhopper_graphs` volume (`/data/graph-cache`) — a binary, version-specific cache that must be rebuilt when the OSM file, GraphHopper version, or `graphhopper.yml` change. **No route result is persisted anywhere**; geometry and distance are returned to the browser and discarded when the routing session closes.

### 5.5 Pipeline 2: static accessibility feature layer (osmium)

**Goal.** Show OSM-mapped staircases, wheelchair ramps, elevators, and toilets on the map, so users can inspect and "adopt" them — without querying OSM at runtime.

**Extraction** (`backend/routing/extract-features.sh`): a two-step osmium pipeline over the same PBF:

1. `osmium tags-filter <pbf> <filters>` — scans the PBF and keeps only the matching elements: *ways* (`w/`) tagged as steps or wheelchair ramps, *nodes* (`n/`) tagged as elevators or toilets. The filters come from the map feature config (`backend/config/map-features.json`, see 5.6): each `osm` rule's `extract` expression becomes one filter, and each filter corresponds to one feature kind.
2. `osmium export --add-unique-id=type_id --output-format=geojson` — converts the filtered subset to a GeoJSON FeatureCollection. Ways become `LineString` features (their centerline, i.e. the sequence of node positions), nodes become `Point` features; each feature carries its OSM tags as properties and a unique id prefixed with the element type (`w…`/`n…`).

**Example.** Running the extraction over the Schleswig-Holstein PBF produces a FeatureCollection like this (the two elements from section 5.1 have survived as features — the way as its centerline, the node as a point, each with its tags as properties and a type-prefixed id):

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "id": "w48123457",
      "type": "Feature",
      "properties": { "highway": "steps", "ramp": "wheelchair", "name": "Treppenanlage Südertor" },
      "geometry": {
        "type": "LineString",
        "coordinates": [[9.43892, 54.78401], [9.43905, 54.78418], [9.43918, 54.78435]]
      }
    },
    {
      "id": "n312060100",
      "type": "Feature",
      "properties": { "amenity": "toilets", "name": "Toiletten Rathausmarkt" },
      "geometry": { "type": "Point", "coordinates": [9.43912, 54.78430] }
    }
  ]
}
```

**Where it runs**: locally via `make extract-features`, which executes the script inside the routing image (osmium-tool is installed there) and redirects stdout to `backend/public/data/osm-features.geojson`. In production, the GitHub Actions workflow (`.github/workflows/deploy.yml`) installs osmium-tool on the CI runner, downloads the Geofabrik extract itself, runs the same script with `OSM_PBF` pointing at the fresh download, and rsyncs the result to both `backend/public/data/osm-features.geojson` (served by the API at `/data/osm-features.geojson`) and the frontend's static `data/` directory. The production server never runs osmium (too little memory). The file is generated data, not committed.

**Frontend processing** (`src/services/osmFeatures.ts`, `src/domain/map/osmFeatures.ts`, `src/composables/useOsmFeatures.ts`):

1. **Fetch**: `GET /data/osm-features.geojson` (overridable via `VITE_OSM_FEATURES_URL`).
2. **Parse + classify**: `parseOsmFeaturesGeoJson` walks the FeatureCollection, extracts the OSM id (accepts `w123`/`n123`-style ids), and classifies each feature by tag through the configured rules — `highway=steps` → `steps`, `ramp=wheelchair` → `ramp`, `highway=elevator` → `elevator`, `amenity=toilets` → `toilets`. First match wins, so a ramped staircase stays `steps`. LineStrings keep their centerline (`way`), Points keep `node`; everything else (areas, unclassified referenced nodes) is dropped. Duplicates are removed by type+id.
3. **Cache**: the parsed array is stored in the Dexie `osmFeatures` store (key `"osm-features"`, with `fetchedAt`). On load, the cache is used immediately; a refresh happens only when online and the cache is older than 24 hours. Offline, the cached layer keeps working.
4. **Render** (`src/components/Map.vue`): features are drawn on a dedicated Leaflet layer only from zoom level 14 (street level) — ways as dotted polylines, nodes as dotted circles, labeled with the OSM name tag or the localized type name.

**Adoption flow** (OSM object → editable map feature): selecting an OSM feature offers "edit" or "add observation". Both create a *personal copy* as a regular map feature, because OSM objects themselves are read-only for this app:

- A **way** (a line) is buffered into the same 10 m corridor polygon used for drawn paths (`createPathGeometry` in `src/domain/map/pathGeometry.ts` — a miter-offset buffer computed in local metre coordinates, with self-intersection rejection and a 126-point limit). If the way is too long or bent for those limits, it is first simplified with Douglas-Peucker at growing tolerances (1, 2, 5, 10, 20 m); if that still fails, adoption is refused with an "osmFeatureTooComplex" message.
- A **node** (a point) becomes a small circle polygon: 5 m radius, 12 segments, computed with a spherical latitude/longitude scale correction.
- The copy carries `osmId` (the OSM element id) and syncs through the normal queue into the `map_features` table (`osm_id BIGINT` column). From then on it behaves like any drawn feature: it can be edited, shapes routes via custom-model areas, and — because `Map.vue` hides any OSM original whose `type/osmId` matches an adopted feature — it visually replaces the OSM object on the map.

**Storage of processed feature data**:

| Stage | Location | Format |
| --- | --- | --- |
| Raw extract | `backend/routing/data/schleswig-holstein.osm.pbf` | OSM PBF (bind mount, read-only) |
| Extracted layer (server) | `backend/public/data/osm-features.geojson` | GeoJSON FeatureCollection, served statically at `/data/osm-features.geojson` |
| Extracted layer (frontend static copy) | `dist/data/osm-features.geojson` on the server | same file, deployed next to the PWA |
| Parsed layer (device) | Dexie `osmFeatures` store, IndexedDB | `OsmFeature[]` (`osmId`, `type`, `name`, `way`/`node`), 24 h max age |
| Adopted copies (device) | Dexie `mapFeatures` store | regular `MapFeature` with `osmId` |
| Adopted copies (server) | `map_features` table, `geometry geometry(Geometry, 4326)` + `osm_id BIGINT` | PostGIS polygon linked to the OSM element |

### 5.6 Matching OSM data to the app's data model

OSM elements and the app's `MapFeature` model are structurally different: OSM has schemaless tagged elements with line/point geometry, while the app persists typed, polygon-shaped, syncable records. The mapping happens in exactly one place per concern, all on the frontend — the backend never sees OSM elements, only the already-mapped result.

**The two models side by side:**

| OSM concept | App concept | Where the mapping happens |
| --- | --- | --- |
| Tags (`highway=steps`, `ramp=wheelchair`, `highway=elevator`, `amenity=toilets`) | `MapFeatureType` (`steps`, `ramp`, `elevator`, `toilets`) | Ordered classification rules in `src/domain/map/osmFeatures.ts` |
| Element id (unique per node/way, not globally) | `osmId` on `MapFeature` / `map_features.osm_id BIGINT` | `parseOsmFeaturesGeoJson` (parse) and `adoptOsmFeature` (adoption) |
| Way = `LineString` centerline | `PolygonGeometry` (10 m corridor) | `wayFeatureGeometry` → `createPathGeometry` at adoption time |
| Node = `Point` | `PolygonGeometry` (5 m circle) | `nodeFeatureGeometry` at adoption time |
| `name` tag | `name` field | parse |
| — (no OSM equivalent) | `area`, `building`, `entrance`, `path` types; `parentFeatureId`; `editToken`; `syncStatus` | user-drawn features only |

**Type vocabulary.** The app deliberately speaks OSM's language: the type codes originally used their own terms (`staircase`, `toilet`), and migration `Version20261013000000` renamed them to the OSM tag terms (`steps`, `toilets`) so that one vocabulary spans OSM tags, the TypeScript `MapFeatureType` union, the `map_features.type` column, and the routing-preference keys. The Dexie v5 upgrade performs the same rename on-device for existing records.

**The map feature config** (`backend/config/map-features.json`) is the single source of truth for which feature types exist and how they map to OSM tags. Each entry has an `id` (the type code used everywhere), a `path` flag (line-drawn types: `path`, `steps`), a `routeSetting` flag (types offered in the route-settings UI), and an `osm` list of rules — each rule pairs an osmium `extract` filter (used by `backend/routing/extract-features.sh`) with the `tags` that classify a matching feature (used by `src/domain/map/osmFeatures.ts`). Types are checked in config order and the first matching rule wins. The file is consumed by all three parts of the system: the frontend imports it at build time, the extraction script reads it with `jq`, and the backend loads it through the `MapFeatureTypes` service to validate input (`MapFeatureService`, the feature-priorities validator). Adding a type therefore means adding one config entry plus a German label under `map.featureTypes` in `src/i18n.ts`.

**Type coverage.** Only four of the eight app types can come from OSM (`steps`, `ramp`, `toilets`, `elevator` — exactly the four extraction filters); `area`, `building`, `entrance`, and `path` exist only for user-drawn features. The routing-preference model nevertheless covers all eight types (a preference can be set for any type), while the route-settings UI currently exposes only `steps` (`routeSettingFeatureTypes` in `src/types/preferences.ts`).

**Identity and deduplication.** Because OSM ids are only unique per element type, the app never treats a bare `osmId` as unique: the map layer deduplicates adopted originals by the composite key `type/osmId` (`Map.vue`), and the parsed cache dedups by `w<id>`/`n<id>`. `osm_id` is `BIGINT` because OSM ids exceed 32-bit range. Server-side, `MapFeatureService` treats `osmId` as part of a feature's immutable identity: an idempotent replay of the same feature id must carry the same `osmId`, otherwise the request is rejected with a conflict ("A different OSM object already uses this id") — an OSM-derived feature cannot later be repurposed as a different OSM object.

**Geometry normalization.** The app's persistence model is polygon-only (`geometry(Geometry, 4326)` in PostGIS, `PolygonGeometry` in TypeScript). OSM's lines and points are therefore never stored as-is: the transient `OsmFeature` type (`way`/`node`) exists only for display and is never synced; the buffering to a corridor or circle polygon happens once, at adoption, and from that point on the record is geometrically indistinguishable from a drawn feature.

**Downstream uniformity.** Once adopted, an OSM copy flows through every later stage exactly like a user-drawn feature: same Dexie `mapFeatures` store, same sync queue with edit token and revision, same `POST /api/map-features` idempotency rules, same PostGIS row shape, and same effect on routing (its polygon becomes a custom-model priority area according to the user's per-type preference). The only OSM-specific residue is the `osmId` link, used solely to hide the read-only OSM original on the map.

**Worked example: one staircase through the whole model.** Starting from the way of section 5.1 (`id 48123457`, `highway=steps` + `ramp=wheelchair`, three centerline points):

1. **After parsing** (`parseOsmFeaturesGeoJson`), the app holds an `OsmFeature` — note the classification: `highway=steps` matched first, so the `ramp=wheelchair` tag does not turn it into a ramp:

    ```ts
    {
      osmId: 48123457,
      type: "steps",
      name: "Treppenanlage Südertor",
      way: [[9.43892, 54.78401], [9.43905, 54.78418], [9.43918, 54.78435]]
    }
    ```

2. **After adoption**, a `MapFeature` is saved to Dexie and later synced via `POST /api/map-features` (Authorization header omitted). The line has become a ~10 m wide corridor polygon around the centerline (ring shown truncated; the first point repeats as the last to close it):

    ```json
    {
      "id": "6f0c9e34-a1b2-4c3d-8e5f-6a7b8c9d0e1f",
      "type": "steps",
      "name": "Treppenanlage Südertor",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[9.43887, 54.78396], [9.43897, 54.78406], "…", [9.43887, 54.78396]]
      },
      "createdAt": "2026-10-15T09:12:04.123Z",
      "osmId": 48123457
    }
    ```

3. **In PostGIS**, it is a regular row — the type code is stored directly in `map_features.type`, and the only OSM trace is `osm_id`:

    ```sql
    SELECT f.id, f.type, f.name, f.osm_id, ST_GeometryType(f.geometry) AS geometry
    FROM map_features f
    WHERE f.osm_id = 48123457;

    -- 6f0c9e34-a1b2-4c3d-8e5f-6a7b8c9d0e1f | steps | Treppenanlage Südertor | 48123457 | ST_Polygon
    ```

4. **On the map**, the dotted OSM original disappears for every device that has this feature, because `Map.vue` hides any OSM feature whose `steps/48123457` key matches an adopted copy — the editable polygon replaces it.

The toilet node (`n312060100`) follows the same path, except step 2 buffers a single point into a 5 m circle (12-segment ring) instead of a corridor.

### 5.7 Pipeline 3: raster tiles

Leaflet's default `L.tileLayer` loads standard OSM raster tiles (the `z/x/y` PNG scheme described in 5.1) for base-map display. They are network-only: the service worker does not precache them, and offline the base map simply stops updating while all local vector data (markers, polygons, routes, cached OSM features) keeps rendering. A managed tile provider is a noted future option for larger deployments.

### 5.8 Consistency and refresh semantics

- The routing graph and the static feature layer are derived from the *same* PBF but are refreshed independently: the graph only on explicit rebuild, the GeoJSON on every deploy (CI re-extracts from the latest Geofabrik file). They can therefore be briefly out of sync with each other and with the live OSM database — Geofabrik snapshots lag live OSM by up to a day even in the best case.
- `routing/data/downloaded-at.txt` is the only freshness record; there is no automatic update check.
- Adopted OSM copies are snapshots: later OSM edits do not propagate into a user's adopted polygon, and the `osm_id` link is used only for map deduplication, not for live OSM lookups.

---

## 6. How data is stored

### 6.1 On-device (browser IndexedDB via Dexie, database name `accessapp`)

Schema version 5 (`src/services/storage.ts`):

| Store | Key | Contents |
| --- | --- | --- |
| `observations` | `id` (indexed: `createdAt`, `syncStatus`) | Questionnaire, location snapshot, sync metadata, revision, edit token |
| `photos` | `id` (indexed: `observationId`) | JPEG blobs + metadata |
| `sensors` | `observationId` | Noise/motion/light summaries and sample arrays |
| `mapFeatures` | `id` (indexed: `createdAt`, `syncStatus`) | Drawn polygons and adopted OSM copies (`osmId` link) |
| `preferences` | `id` (indexed: `updatedAt`, `syncStatus`) | Routing preferences (single record) |
| `osmFeatures` | `id` (`"osm-features"`) | Cached static OSM feature layer for offline use |

Dexie upgrade transactions migrate older schema versions in place (e.g. v5 renames feature type codes to OSM terminology). The Workbox service worker precaches the app shell (`js, css, html, svg, png, ico`, `/api` excluded from navigation fallback); OSM tiles and public data are not precached.

### 6.2 Server database (PostgreSQL 17 + PostGIS 3.5, migrations in `backend/migrations/`)

- `observations` — UUID PK, `revision`, `edit_token_hash CHAR(64)`, `payload_hash`, `deleted` tombstone flag, `captured_at TIMESTAMPTZ`, **`location geography(Point, 4326)`** with a GIST index, GPS quality columns, questionnaire columns with CHECK constraints, `comment` (≤ 2000 chars), `map_feature_id` FK. Row-level invariants enforced by CHECK constraints (e.g. non-deleted rows require location and payload hash).
- `media` — UUID PK, FK to observations (CASCADE), `storage_key`, `mime_type` (JPEG only), `sha256`, dimensions, `sort_order` 0–5, upload-state consistency CHECK.
- `sensor_measurements` — UUID PK, FK to observations, `sensor_type` (`noise`/`motion`/`light`), `duration_ms`, **`summary JSONB`** and **`samples JSONB`** (the only JSONB in the observation model), UNIQUE per observation+type.
- `map_features` — UUID PK, `type` code (validated against `config/map-features.json`), self-referencing `parent_feature_id`/`merged_into_id`, **`geometry geometry(Geometry, 4326)`** with GIST index, `status` (`active`/`merged`/`removed`), `osm_id BIGINT` for OSM-linked copies, `edit_token_hash`.
- `routing_preferences` — global (no accounts yet) preference record with `feature_priorities JSONB` and revision handling.

Doctrine migrations apply automatically when the PHP container starts; PostGIS is created by the first migration.

### 6.3 Files and volumes

- **Photos**: `photo_data` Docker volume at `/app/var/photos` — outside the public web root; served only through the API endpoint; written atomically, pruned on deletion.
- **Routing graph**: `graphhopper_graphs` volume (`/data/graph-cache`), built once from the OSM extract; rebuilds are explicit and back up the previous graph in the volume.
- **OSM extract**: `backend/routing/data/schleswig-holstein.osm.pbf` (bind mount, read-only for routing); `downloaded-at.txt` records freshness. Not in Git.
- **Static OSM features**: `backend/public/data/osm-features.geojson` — generated, not committed; deployed by CI.

### 6.4 What is intentionally not stored

- No user accounts, no PII beyond the free-text comment.
- No audio recordings (only RMS/peak statistics), no continuous GPS tracking.
- No route history — routes are transient and never persisted or synced.
- No calibrated noise values; measurements are relative per device.

---

## 7. Deployment and operations

- Push to `main` triggers the **Build and deploy** GitHub Actions workflow: build frontend → extract OSM features on the runner (osmium + fresh Geofabrik download) → rsync `dist/` to `/opt/access/` → rsync Symfony app to `/opt/access/backend/` (preserving `backend/`, runtime data, and `routing/data/`) → deploy the GeoJSON to both static locations → build and restart the production Compose stack → migrations run on container start.
- Production config comes from the `production` environment secrets (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PORT`, multiline `BACKEND_ENV` written to `/opt/access/backend/.env.local`). At minimum set `APP_SECRET`, `CADDY_MERCURE_JWT_SECRET`, `POSTGRES_PASSWORD`, `SERVER_NAME`, and published ports.
- Live URL: https://app.hendrikgoebel.de (HTTPS required for sensor APIs and installability).
- OSM data refresh is manual: re-run the `routing-data` profile, then force a graph rebuild (see `backend/README.md`).

## 8. Verification

```sh
npx playwright install chromium
npm test            # e2e
npm run test:api    # real Vue→Symfony sync flow (needs backend up)
npm run test:pwa    # builds, then offline/PWA behavior
(cd backend && docker compose exec php php bin/phpunit)   # backend functional tests
npm run test:routing-profile   # synthetic-network profile check
```

## 9. Known limitations / future work

- No accounts: losing browser storage loses edit rights over that device's public contributions.
- Public map fetches are capped at 200 records per request; viewport pagination and clustering are future work.
- Wheelchair routing approximates via built-in encoded values (blocks steps); the OSM `wheelchair` tag would need a custom GraphHopper build.
- Collected observations do not yet influence routing; only drawn features and per-type preferences do.
- Routing graph and static OSM layer refresh independently and can drift from live OSM; adopted OSM copies are permanent snapshots.
- No background sync after the app closes; sync is foreground-only.
- Operational follow-ups: rate limiting/moderation for anonymous submissions, backups, monitoring, real-device QA.
