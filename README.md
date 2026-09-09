# AccessApp

A mobile-first Vue 3 accessibility collection PWA with a PHP REST API and PostgreSQL persistence. All seven milestones in [plan.md](plan.md) are implemented. The follow-up request to complete the remaining milestones superseded the original stop-after-each-milestone instruction.

## Start the app

Use Node.js 22.12+ or Node.js 24+, plus Docker Compose for the backend. The repository includes `.nvmrc`.

```sh
nvm use
npm ci
docker compose -p accessapp up -d --build
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to **http://127.0.0.1:8080**. PostgreSQL uses the isolated local port **55432**, so an existing database on 5432 is unaffected. Compose creates dedicated database and photo volumes. The Compose credentials and PHP development server are for local development.

Alternatively, run PHP 8.4 locally with `pdo_pgsql`, `gd`, and `mbstring`:

```sh
docker compose -p accessapp up -d db
php backend/migrate.php
php -d upload_max_filesize=5M -d post_max_size=6M -S 127.0.0.1:8080 backend/router.php
```

Run `npm run dev` in another terminal. Do not run the native PHP server and Compose API on port 8080 simultaneously. The variables in [backend/.env.example](backend/.env.example) document configuration; export them in the server environment if overriding defaults. The PHP code does not automatically load dotenv files.

Stop containers without removing saved data using `docker compose -p accessapp stop`.

## Using the app

1. On the map, choose **Use my location**, or **Add accessibility information** to capture a fresh position.
2. Answer the questionnaire. Unknown answers remain explicit; `3` steps means **3 or more**.
3. Optionally add up to six photos, a 10-second relative noise measurement, a 10-second raw motion recording, or a 5-second ambient-light measurement.
4. **Save observation on this device** makes it ready for sharing. **Save draft** keeps it out of the sync queue.
5. In **My observations**, edit or delete local records. Deleting removes local photos and measurements immediately and queues public deletion.
6. **Share & sync now** publishes all ready records and pending deletions. It publishes exact coordinates, comments, photos, and measurements. Automatic sharing is off by default; enabling it retries queued changes while the app is open.
7. Use **Load public observations** on the map to fetch up to 200 public records. Local records take precedence, and locally deleted records remain hidden.

## Offline PWA

Build and preview the production app to use its service worker:

```sh
npm run build
npm run preview -- --host 127.0.0.1
```

Visit the printed localhost URL once online and wait for **App ready for offline use**. The app shell and local observations can then reopen offline, including direct routes. Browser installation is available where supported through the browser's install/Add to Home Screen command. The manifest provides 192 px and 512 px PNG icons (including a maskable icon), and iOS uses the supplied Apple touch icon.

At **https://app.hendrikgoebel.de**, install with the browser's **Install app** command (Chrome/Edge) or Safari's **Share → Add to Home Screen**. HTTPS is required; deploy every file in `dist/`, including `manifest.webmanifest`, `sw.js`, and the PNG icons. Serve `sw.js` and `manifest.webmanifest` with a short or no-cache policy so updates are discovered promptly.

Service-worker updates prompt for a reload so an update does not silently discard an open form. The development server intentionally does not register a service worker.

OpenStreetMap tiles and public data requests are not precached. The local map markers, questionnaire, photo storage, and observation management continue to work when tiles fail. Installation does not guarantee offline GPS availability.

## Milestone report

| Milestone                  | Implemented behavior                                                                                                         | Main created/modified files                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Foundation             | Location, map, questionnaire, local saving, accessible navigation                                                            | Existing types, location service/store, map and questionnaire components                                                                                                                |
| 2 — Offline and management | PWA app shell, update prompt, observation list, drafts, editing, deletion, v1 data migration                                 | `vite.config.ts`, `public/icon.svg`, `src/components/PwaStatus.vue`, `src/views/MyObservationsView.vue`, `src/views/NewObservationView.vue`, router, App, storage and observation store |
| 3 — Photos                 | Camera/file selection, previews, six-photo limit, resizing, JPEG encoding, EXIF removal, local persistence/removal           | `src/services/camera.ts`, `src/components/PhotoCapture.vue`, observation types and photo table                                                                                          |
| 4 — Noise                  | Microphone permission, bounded measurement, relative RMS average and amplitude peak; no audio recording                      | `src/services/noise.ts`, `src/services/abort.ts`, `src/components/SensorMeasurements.vue`                                                                                               |
| 5 — Motion                 | Raw acceleration, angular velocity and orientation, optional ambient light, cancellation/permission handling                 | `src/services/motion.ts`, `src/services/light.ts`, `src/types/sensors.ts`, sensor component/table                                                                                       |
| 6 — Backend                | Validated REST API, PostgreSQL, public queries, photo persistence/retrieval, authenticated updates/deletion without accounts | `backend/public/index.php`, `backend/src/common.php`, schema, migration, router, Dockerfile, environment example and `compose.yaml`                                                     |
| 7 — Sync                   | Durable queue, retries/backoff, timeouts, partial photo recovery, revision protection, cross-tab lock, reconnect support     | `src/services/api.ts`, `src/services/sync.ts`, `src/stores/sync.ts`, `src/components/SyncPanel.vue`, map/list integration                                                               |

Supporting changes include dependency/lock files, TypeScript PWA declarations, styling, ignore files, three Playwright configurations, and browser/API/PWA tests. The original `plan.md` remains unchanged.

## Architecture decisions

- Browser APIs stay in services. Vue components manage presentation and temporary form state. Pinia contains small observation records, location, and sync state; photo blobs and sensor datasets are stored separately in IndexedDB.
- A single Dexie transaction saves the observation, photos, and sensor data together. A failed write preserves the open form. Version 2 migrates Milestone 1 observations in place, adding revision, edit-token, and photo metadata.
- Edits increment a revision. A stale edit from another tab is rejected instead of silently overwriting newer work. GPS is a captured snapshot, not a continuous tracker; editing preserves the recorded location unless explicitly refreshed.
- Sync statuses are `draft`, `ready`, `syncing`, `synced`, and `failed`. Only ready/failed/interrupted records enter the queue. An acknowledgement updates a local record only if its revision still matches.
- Sync first uploads the observation and photo manifest, then each photo. A partial photo failure leaves the record failed; the next attempt reuses IDs and the same revision. The server can expose the observation before all its photos have arrived; unavailable photos return 404 until uploaded.
- Each observation has a random edit capability token. It stays in local IndexedDB and travels only in the Authorization header. The server stores its SHA-256 hash and never returns it through public endpoints. No user account is required. Losing browser storage also loses the ability to edit/delete that browser's public contributions.
- Server mutations lock the observation row. Repeated requests are idempotent; stale revisions are rejected. Deletion keeps minimal tombstones both locally and on the server so delayed requests cannot resurrect deleted records. Photo files are written atomically outside the public directory and pruned after removal.
- Requests time out after 20 seconds. Retry state persists with exponential backoff capped at five minutes; **Share & sync now** bypasses the delay. Automatic retries run on reconnect and every 30 seconds while open. Web Locks serialize tabs where supported; server idempotency and revision checks remain the fallback.
- Photos accept JPEG/PNG/WebP up to 20 MB, resize to at most 1600 pixels on the longest side, and are stored as JPEG. The API accepts JPEGs up to 5 MB/1600 pixels and re-encodes them again to strip metadata.
- Noise stores the mean of sampled RMS levels and peak absolute amplitude, not calibrated dB. Motion stores raw acceleration in m/s², rotation rates in degrees/second, orientation angles in degrees, and epoch-millisecond timestamps. Browser-provided null readings remain null. Sampling is throttled to about 10 Hz and does not infer accessibility.
- Sensors stop after their measurement window, on cancellation, when the document is hidden, or when leaving the form. Cancelling a pending permission request releases the UI; any microphone stream granted later is immediately stopped.
- PostgreSQL JSONB is sufficient for this MVP's bounding-box filters. PostGIS can be added when geographic indexing, distances, or larger query volumes require it.

## API

All routes are same-origin under `/api`. JSON mutations require `Content-Type: application/json`. Creation, edits, photo uploads, and deletion require `Authorization: Bearer <observation-edit-token>`.

| Method and route                                                           | Behavior                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /api/health`                                                          | Database connectivity check                                   |
| `POST /api/observations`                                                   | Create/update a versioned observation; repeat requests safely |
| `GET /api/observations?limit=100&cursor=<uuid>&bbox=west,south,east,north` | Public collection; all query parameters optional; limit 1–200 |
| `GET /api/observations/{id}`                                               | Full public record, including optional measurements           |
| `POST /api/observations/{id}/photos`                                       | Multipart fields `id`, `revision`, `photo`                    |
| `GET /api/observations/{id}/photos/{photoId}`                              | JPEG for a current, non-deleted observation                   |
| `DELETE /api/observations/{id}`                                            | JSON `{ "revision": <newer integer> }`; repeatable deletion   |

Collection responses are `{ observations, nextCursor }`, ordered by descending UUID for stable cursor pagination, and omit large motion/light arrays. Bounding boxes support crossing the antimeridian. Detail responses include measurement arrays. Local sync metadata and edit tokens are not public.

Payloads include `id` (UUID v4), `revision`, `createdAt`, `location`, `accessibility`, `comment`, `photoIds`, and optional `noise`, `motion`, and `light`. See the shared TypeScript types and API integration tests for examples. Invalid input, conflicting revisions, unauthorized edits, oversized uploads, and missing records return JSON errors with appropriate HTTP status codes.

## Verification

Verified on 2026-09-09: TypeScript and production/PWA builds pass, all **16 automated tests** pass (12 browser, 3 API/integration, 1 production offline-reload), PHP syntax checks pass, and the Docker API image builds and runs with PostgreSQL. The updated 375 px mobile form and observation list were visually inspected without horizontal overflow. API integration tests passed against the containerized backend.

```sh
npx playwright install chromium
npm test
npm run test:api
npm run test:pwa
```

The API suite requires PostgreSQL and PHP running on the configured ports. It creates isolated UUID fixtures and removes their public records afterward; minimal deletion tombstones remain. It also starts/reuses Vite for the full UI sync test. The PWA suite builds and previews the production app.

Tests cover Milestone 1 data migration, location capture/permission failure, questionnaire persistence, offline local saving, duplicate submissions, storage failure, keyboard/mobile layout, editing/deletion, photo compression/persistence/removal, draft exclusion, sensor recording and cancellation, failed sync/retry, backend validation/authorization/revision conflicts, partial photo upload recovery, public edits/deletion, and production offline reload.

Manual checks by milestone:

1. Allow/deny GPS, inspect accuracy and altitude, save an observation, and reload its map marker.
2. Install the production build where supported. Reopen it offline, edit a record, save a draft, delete a record, and check update prompts.
3. Take a real phone photo, choose existing images, remove a preview, save, and reopen the edit form. Try unsupported HEIC or an oversized file.
4. Allow/deny the microphone. Measure a quiet and a louder environment; verify relative levels change. Cancel or navigate away and check that the microphone indicator turns off.
5. Record while moving a supported phone. Confirm raw sample counts, try orientation permissions on iOS, hide the tab during recording, and verify unavailable light sensors leave the questionnaire usable.
6. Start the backend, share a fixture, load it through the public map/detail endpoint, and verify its photo. Retry the same IDs and reject requests with another edit token.
7. Stop the API during sharing, reconnect, and retry. Verify edits and photo removal propagate. Delete a shared observation offline, reconnect, sync, and confirm it disappears publicly.

## Browser/device limitations and remaining work

- Location, microphone, and motion generally require HTTPS or localhost. A phone accessing a plain HTTP LAN address will not have equivalent API access.
- Sensor hardware, permissions, orientation support, and ambient-light APIs vary substantially. Real iOS/Android hardware and assistive technology still need manual validation; automated tests use Chromium and simulated sensors.
- IndexedDB is browser/origin-specific and may be cleared, quota-limited, or evicted. Drafts and unsynced data have no server backup. Unsaved form changes remain temporary.
- Automatic sync is foreground-only; the app must remain open or be reopened. Closing the browser can interrupt a request, which is retried using the same ID/revision.
- HEIC is not supported. Convert it to JPEG first. Microphone gain differs across devices, so relative measurements should not be treated as calibrated comparisons between phones.
- Public-map UI loading is capped at 200 records per request. The API supports pagination/bbox queries; automatic viewport pagination and marker clustering remain future scale improvements.
- OpenStreetMap tiles require a network and are not downloaded for offline use. A managed tile provider may be appropriate for larger deployments.
- Production deployment, HTTPS, production database credentials, backups, rate limiting/moderation for anonymous submissions, monitoring, and real-device QA are operational follow-ups. The supplied Compose stack is a local development setup, not a production deployment.
- Serve `dist/` with navigation fallback to `index.html`, route `/api` to PHP separately, keep photo storage outside the public root, and avoid permanently caching `sw.js` or HTML. Use PHP-FPM or another production PHP server rather than the development server.

No requested milestone is intentionally deferred. PostGIS, calibrated noise, automatic accessibility classification, native sensor adapters, accounts, and background sync after closing the app are outside this MVP.

## References

- [Vite PWA registration and update behavior](https://vite-pwa-org.netlify.app/guide/register-service-worker)
- [Web Audio analyser](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
- [Motion permission requirements](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static)
- [PostgreSQL conflict handling](https://www.postgresql.org/docs/17/sql-insert.html)
