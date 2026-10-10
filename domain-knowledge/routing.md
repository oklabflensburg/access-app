# Routing

The app computes walking routes between two user-picked points on the map. Routing is a three-stage pipeline: the Vue frontend collects start/end points, the Symfony backend validates and forwards the request, and a self-hosted GraphHopper instance calculates the route on an OpenStreetMap graph of Schleswig-Holstein.

```
Map.vue (pick points)  →  useRouting.ts  →  POST /api/routes  →  RoutingService.php  →  GraphHopper (/route)
```

## Preference-driven routing (general concept)

Routing is not a fixed shortest-path service: the route is shaped by the user's **routing preferences**. The intended feature is general — a user sets preferences, and route calculation considers them when choosing the way. The mechanism has three hooks, all already in place:

1. **Profile selection** — preferences choose which GraphHopper profile calculates the route (e.g. `foot_shortest` vs `foot_wheelchair`). Profiles encode way-level rules from OSM data.
2. **Custom model areas** — user-drawn map features are sent with the route request and converted into GraphHopper custom-model areas whose priority factor follows the user's per-type setting: blocked (`avoid`), reduced (`reduce`), or increased (`prefer`). This handles obstacles that are not (yet) in OSM.
3. **Preference sync** — preferences are stored locally, synced to the backend (`/api/preferences/routing`, revision-based conflict handling), and applied to every route request.

The current implementation realizes this mechanism with **per-feature-type priorities**: the preference is a map from every map feature type (`src/types/map-feature.ts`) to a priority effect — `neutral` (default), `avoid` (priority 0), `reduce` (reduced priority), or `prefer` (increased priority). Drawn features of non-neutral types are sent with the route request and converted into custom-model areas with the matching priority factor. Avoiding staircases additionally selects the `foot_wheelchair` profile, which blocks OSM-mapped steps. Future preferences (e.g. surface quality, slope) plug into the same pipeline: extend the preference model, map it to profile rules and/or custom-model areas in `RoutingService`, and pass the relevant features from the frontend.

## Frontend (Vue)

### State machine — `src/composables/useRouting.ts`

The composable manages the routing session:

- `active` — routing mode is open
- `picking` — which point the next map click sets: `"start"`, `"end"`, or `null`
- `start` / `end` — picked `RoutePoint`s (lat/lng)
- `result` — the returned `WalkingRoute`, `loading`, `error`

Flow: `open()` resets everything and sets `picking = "start"`. Each map click during picking calls `selectPoint()`, which fills `start`, then `end`, then triggers `calculate()` automatically. `change(which)` re-opens picking for one side; `clear()` resets points; `close()` leaves routing mode. Only one request is in flight at a time — a new `calculate()` aborts the previous one via `AbortController`, and stale responses are discarded by comparing the controller instance.

Before requesting, `calculate()` rejects identical start/end points and offline usage locally.

### Wiring — `src/views/MapView.vue`

- Routing is opened from the app menu (`App.vue` → `map.requestRouting()` → `mapStore.routeRequest` counter → `routing.open()`), and closed automatically when navigating away from the map view.
- The composable receives a getter for **all map features** (`src/types/map-feature.ts`). At request time it resolves the user's feature priorities against the features and sends the non-neutral ones as `priorityAreas` (geometry + priority).
- When a result arrives, the map fits the route into view, accounting for the panel height.

### Map interaction — `src/components/Map.vue`

- While `routePicking` is set, map clicks emit `routePoint` instead of selecting features. `pickMapCenter()` uses the current map center as the picked point ("use center" button).
- `drawRoute()` renders on a dedicated routing layer:
  - the route geometry as a purple `LineString` (`#5145cd`)
  - dashed "connector" lines from each picked point to its snapped waypoint when they differ by more than 1 m
  - markers `A` (start) and `B` (end)
- `fitRoute(panelHeight)` fits the bounds of geometry + both points, with padding so the route is not hidden behind the routing panel.

### Panel — `src/components/RoutingPanel.vue`

Shows the current status (pick start / pick end / loading / distance), errors, and actions: use center, change start/end, retry, clear, close. Distance is formatted in meters or kilometers (`de-DE` locale) from `result.distanceMeters`.

## API client — `src/services/api.ts`

`getWalkingRoute(start, end, featurePriorities, priorityAreas, signal)` posts to `/api/routes`:

```json
{
  "start": { "latitude": 54.09, "longitude": 12.10 },
  "end":   { "latitude": 54.10, "longitude": 12.11 },
  "featurePriorities": { "staircase": "avoid", "ramp": "prefer", "...": "neutral" },
  "priorityAreas": [ { "priority": "avoid", "geometry": { "type": "Polygon", "coordinates": [...] } } ]
}
```

`featurePriorities` is the full per-type settings map (used for profile selection); `priorityAreas` carries the geometries of drawn features whose type is non-neutral.

All requests have a 20 s timeout. Error responses carry a machine-readable `code` that the client maps to localized messages (`routing.errors.*` in `src/i18n.ts`).

## Backend (Symfony)

### Controller — `backend/src/Controller/RouteController.php`

`POST /api/routes` deserializes into `RouteInput` (validated DTO: lat/lng points, feature priority map, max 200 priority areas) and delegates to `RoutingService`. Responses are `no-store`.

### RoutingService — `backend/src/Service/RoutingService.php`

1. Rejects identical start/end (`identical_points`, 400).
2. Validates the feature priority map (known types, `neutral`/`avoid`/`reduce`/`prefer`) and the priority areas (only non-neutral priorities, single-ring polygons, 4–501 points per ring, closed rings, finite coordinates within lat/lng bounds); otherwise `invalid_input` (400).
3. Builds the GraphHopper request:
   - `profile`: `foot_wheelchair` if staircases are avoided, else `foot_shortest`
   - `points_encoded: false`, no instructions, no elevation
   - when priority areas are present, a **custom model** shapes them: each polygon becomes a named area feature with a priority rule `if: in_<id> → multiply_by <factor>` — `avoid` → 0, `reduce` → 0.5, `prefer` → 2 (factors in `FeaturePriorities::FACTORS`) — and `ch.disable: true` (custom models require flexible routing instead of the precomputed CH graph).
4. Calls GraphHopper `POST {GRAPHHOPPER_BASE_URL}/route` with a 15 s timeout. Maps failures to error codes:
   - GraphHopper 5xx / 429 / transport errors → `unavailable` (503)
   - `PointNotFoundException` / `PointOutOfBoundsException` / `ConnectionNotFoundException` hints → `no_route` (422)
   - undecodable responses → `invalid_response` (502)
5. Validates the response shape (LineStrings, exactly 2 snapped waypoints, non-negative distance) and enforces a **100 m snap limit**: if GraphHopper snapped either point more than 100 m (haversine distance) from the requested coordinate, the request fails with `no_route` (422).
6. Returns the normalized `WalkingRoute`: geometry (LineString, `[lng, lat]` pairs), `distanceMeters`, and the snapped start/end waypoints.

## GraphHopper — `backend/routing/`

A pinned GraphHopper 11.1 container (see `backend/routing/Dockerfile`, SHA-256 verified download) serving on port 8989. It imports `routing/data/schleswig-holstein.osm.pbf` into a cached graph (`graph.location: /data/graph-cache`); the graph is only rebuilt when `GRAPHHOPPER_REBUILD_GRAPH=true` (the previous graph is kept as backup — see `entrypoint.sh`).

Two profiles are defined in `graphhopper.yml`, both with `distance_influence: 0` and a constant 5 km/h speed so that **weight is proportional to distance** — routes are shortest paths, not fastest; travel time is deliberately not exposed:

- `foot_shortest` — blocks ways without foot access, ways with `hike_rating >= 2`, and German bridleways without explicit foot access.
- `foot_wheelchair` — same as `foot_shortest`, plus blocks `road_class == STEPS` (staircases). This approximates wheelchair accessibility with built-in encoded values; the OSM `wheelchair` tag itself would require a custom GraphHopper build.

Both profiles have CH (Contraction Hierarchies) enabled for fast queries; requests with priority areas disable CH and fall back to flexible routing.

## Feature type priorities

The routing preference is a map from every map feature type to a priority effect, defined in `src/types/preferences.ts` (frontend) and `backend/src/Service/FeaturePriorities.php` (backend — the single source for the type list, the priority values, and the factors):

| Setting | Effect on the route | Custom-model factor |
| --- | --- | --- |
| `neutral` (default) | none — features of this type are not sent | – |
| `avoid` | the route must not cross the area (detour where possible) | `0` |
| `reduce` | crossing is allowed, but detours win | `0.5` |
| `prefer` | the route is drawn toward the area | `2` |

It lives in the preferences store (`src/stores/preferences.ts`), editable in `PreferencesView.vue` (one dropdown per configurable feature type — currently only `staircase`, listed in `routeSettingFeatureTypes` in `src/types/preferences.ts`; more types will be added there). The settings record itself covers every map feature type (defaulting to `neutral`), so enabling a type later requires no migration. It is synced to the backend via `PUT /api/preferences/routing` (revision-based conflict handling, stored as JSONB in `routing_preferences.feature_priorities`; `GET` always returns the complete map with defaults filled in).

On each route request the frontend resolves the settings against the drawn features: the full map travels as `featurePriorities` (used for profile selection), and every feature of a non-neutral type becomes a `priorityAreas` entry — the backend applies the priority factor without needing to know the feature's type. The computed route then avoids, disfavors, or prefers crossing those areas.

Avoiding staircases additionally selects the `foot_wheelchair` profile: the profile blocks mapped OSM stairways, the custom model blocks user-reported staircases that may not yet be in OSM.

### Migration from the wheelchair POC

The preference was originally a single `wheelchairAccessible` boolean (staircases → priority 0). Both stores migrate it automatically: Dexie version 3 (`src/services/storage.ts`) and Doctrine migration `Version20261011000000` convert `wheelchairAccessible = true` into `staircase: avoid` and drop the boolean column/field.
