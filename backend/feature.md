Implemented features:

## Map and observations

- A user can create an observation for every point on the map
- A user can see their current location on the map with accuracy and altitude, capture a fresh GPS position for a new observation, or enter coordinates manually
- A user can answer an accessibility questionnaire: wheelchair accessible, ramp, accessible toilet, elevator, steps (0, 1, 2, 3 or more), surface quality (smooth, uneven, cobblestone, gravel, other), and a free-text comment; "unknown" is an explicit answer and is never stored as "no"
- A user can attach up to six photos per observation: take a new photo or choose files, see previews, and remove photos; JPEG/PNG/WebP up to 20 MB are resized to at most 1600 px on the longest side, stored as JPEG, and stripped of metadata
- A user can record a 10-second relative noise measurement (mean RMS level and peak amplitude; no audio is recorded or uploaded)
- A user can record a 10-second raw motion measurement (acceleration, rotation rates, orientation) and a 5-second ambient-light measurement; recording stops on cancellation, when the tab is hidden, or when leaving the form, and unavailable sensors do not break the questionnaire
- A user can save an observation locally ("ready") or as a draft that stays out of the sync queue; observations, photos, and sensor data are saved together in one IndexedDB transaction and survive reloads and offline use
- A user can view, edit, and delete their own observations in "My observations"; deleting removes local photos and measurements immediately and queues public deletion; edits increment a revision and stale edits from another tab are rejected
- A user can view public observations on the map (up to 200 per load) next to their own; locally stored records take precedence over the public list
- Milestone 1 observations are migrated in place to the current storage schema (revision, edit token, photo metadata)

## Map features (polygons)

- A user can draw a polygonal map feature on the map: at least 3 vertices (at most 500), an optional name, and a type (area, building, entrance, staircase, ramp, toilet, elevator, path); self-intersecting or invalid polygons are rejected client-side
- A user can create child map features inside a chosen parent feature; both the client and the server validate that the child lies within the parent
- A newly drawn feature that lies completely inside an existing feature is automatically saved as its child feature (the deepest containing feature wins); a drawing that only partially overlaps an existing feature is rejected with a hint, and while drawing the client shows which existing feature the new object would become a child of
- The sync queue publishes a parent feature before its children
- A user can select a polygon on the map to inspect its name and type; features created on the current device can be edited and re-synchronized, other public features are read-only
- A user can manage their own map features in "My map features": rename them, change their type, and delete them with confirmation
- Map features are stored locally first and synchronized through the same durable queue as observations

## Sharing and synchronization

- A user can publish all ready observations, map features, and pending deletions with "Share & sync now"; automatic sharing is off by default and, when enabled, retries queued changes every 30 seconds while the app is open and on reconnect
- Failed or interrupted uploads retry with exponential backoff capped at five minutes; requests time out after 20 seconds; retries reuse the same id and revision, so nothing is duplicated
- An observation syncs its record and photo manifest first, then each photo; a partial photo failure leaves the record failed and the next attempt reuses the same ids and revision
- Syncing is serialized across browser tabs with Web Locks; server idempotency and revision checks are the fallback
- Deletion tombstones are kept locally and on the server so delayed offline clients cannot resurrect deleted observations or map features

## Authorization

- Every observation and map feature has a random edit capability token created on the device; it travels only in the Authorization header, the server stores only its SHA-256 hash, and public responses never include it
- No user account is required; losing browser storage loses the ability to edit or delete that device's public contributions

## PWA and UI

- The app is an installable offline PWA: the app shell and local observations reopen offline, including direct routes; the map markers, questionnaire, photo storage, and observation management keep working when tiles fail
- Service-worker updates prompt the user to reload instead of silently discarding an open form
- The UI is in German (vue-i18n)

## Backend REST API (Symfony, PostgreSQL, PostGIS)

- `GET /api/health` returns the database connectivity check
- `POST /api/observations` creates or updates a versioned observation; repeat requests with the same id and revision are idempotent, and mutations lock the row
- `GET /api/observations` returns the public collection with cursor pagination (descending UUID, limit 1-200) and an optional bounding box that supports crossing the antimeridian; list responses omit large motion/light arrays
- `GET /api/observations/{id}` returns the full public record including measurements
- `POST /api/observations/{id}/photos` uploads a photo (multipart fields `id`, `revision`, `photo`); JPEGs up to 5 MB/1600 px are accepted, re-encoded to strip metadata, and written atomically outside the public directory; photos 404 until uploaded and are pruned on removal
- `GET /api/observations/{id}/photos/{photoId}` returns the JPEG of a current, non-deleted observation
- `DELETE /api/observations/{id}` performs a repeatable deletion that keeps a minimal tombstone
- `POST /api/map-features` creates or updates an authenticated polygon feature idempotently; it validates closed rings, 3-500 vertices, longitude/latitude coordinates, non-self-intersecting geometry, and child-in-parent containment
- `GET /api/map-features?limit=100` lists active public polygons with type, name, geometry, createdAt, and parentFeatureId (limit 1-200)
- `DELETE /api/map-features/{id}` performs an authenticated, repeatable, tombstoned deletion
- Invalid input, conflicting revisions, unauthorized edits, oversized uploads, and missing records return JSON errors with appropriate HTTP status codes; all inputs are validated DTOs
- Doctrine migrations run automatically when the backend container starts; the Docker Compose stack (FrankenPHP, PostgreSQL/PostGIS, photo volume) provides the local development setup and a production variant

## Verification and deployment

- Three Playwright suites: browser UI tests, a real Vue-to-Symfony API suite (including partial photo recovery, authorization, revisions, bounding boxes, tombstones), and a production-build offline PWA suite
- The Symfony backend has functional PHPUnit HTTP tests
- Pushing to main builds and deploys the frontend and backend via GitHub Actions
