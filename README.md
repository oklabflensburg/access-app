# AccessApp

A mobile-first Vue 3 accessibility collection PWA with a Symfony REST API, PostgreSQL, and PostGIS persistence. The collection-phase requirements and schema are documented in [plan2.md](plan2.md), which is the source of truth; [plan.md](plan.md) mirrors it.

## Start the app

Use Node.js 22.12+ or Node.js 24+, plus Docker Compose for the backend. The repository includes `.nvmrc`.

```sh
nvm use
npm ci
(cd backend && docker compose up -d --build --wait)
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to the Symfony API at **http://127.0.0.1:8080**. The backend container applies Doctrine migrations automatically and Compose creates dedicated database and photo volumes. Its default credentials are for local development only.

Stop the backend without removing saved data using `(cd backend && docker compose stop)`.

## Using the app

1. On the map, choose **Use my location**, or **Add accessibility information** to capture a fresh position.
2. To contribute an area, choose **Draw area**, place at least three vertices, and select **Close and save**. The polygon is stored locally first and synchronized to the public map with the normal sync queue.
3. Answer the questionnaire. Unknown answers remain explicit; `3` steps means **3 or more**.
4. Optionally add up to six photos, a 10-second relative noise measurement, a 10-second raw motion recording, or a 5-second ambient-light measurement.
5. **Save observation on this device** makes it ready for sharing. **Save draft** keeps it out of the sync queue.
6. In **My observations**, edit or delete local records. Deleting removes local photos and measurements immediately and queues public deletion.
7. **Share & sync now** publishes all ready observations, polygons, and pending deletions. Automatic sharing is off by default; enabling it retries queued changes while the app is open.
8. The map fetches up to 200 public observations and 200 public polygon features. Locally stored records take precedence.

## Offline PWA

Build and preview the production app to use its service worker:

```sh
npm run build
npm run preview -- --host 127.0.0.1
```

Visit the printed localhost URL once online and wait for **App ready for offline use**. The app shell and local observations can then reopen offline, including direct routes. Browser installation is available where supported through the browser's install/Add to Home Screen command. The manifest provides 192 px and 512 px PNG icons (including a maskable icon), and iOS uses the supplied Apple touch icon.

At **https://app.hendrikgoebel.de**, install with the browser's **Install app** command (Chrome/Edge) or Safari's **Share → Add to Home Screen**. HTTPS is required; deploy every file in `dist/`, including `manifest.webmanifest`, `sw.js`, and the PNG icons. Serve `sw.js` and `manifest.webmanifest` with a short or no-cache policy so updates are discovered promptly.

## Deployment

Pushing to `main` runs the **Build and deploy** GitHub Actions workflow. It builds the frontend and synchronizes `dist/` to `/opt/access/` over SSH. Configure the `production` environment with these secrets:

- `DEPLOY_HOST`: deployment server hostname
- `DEPLOY_USER`: SSH user with write access to `/opt/access`
- `DEPLOY_SSH_KEY`: private SSH key for that user
- `DEPLOY_PORT`: optional SSH port; defaults to `22`

The workflow currently disables SSH host-key verification, so no `DEPLOY_KNOWN_HOSTS` secret is required.

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
| 6 — Backend                | Symfony REST API, PostGIS queries, normalized persistence, photo storage, validated DTOs, and capability-authenticated mutations | Symfony controllers/services/DTOs in `backend/src`, Doctrine migrations, Dockerfile and Compose configuration                                                                         |
| 7 — Sync                   | Durable queue, retries/backoff, timeouts, partial photo recovery, revision protection, cross-tab lock, reconnect support     | `src/services/api.ts`, `src/services/sync.ts`, `src/stores/sync.ts`, `src/components/SyncPanel.vue`, map/list integration                                                               |

Supporting changes include dependency/lock files, TypeScript PWA declarations, styling, ignore files, three Playwright configurations, and browser/API/PWA tests.

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
- PostgreSQL stores questionnaire fields relationally, PostGIS stores and indexes observation locations, and JSONB is limited to variable sensor summaries and sample arrays.

## API

If you deploy the frontend and backend on different origins, set `VITE_API_BASE_URL` to the backend origin, for example `https://api.example.com/api`, before building the frontend. Keep the default `/api` when the app and API are served from the same origin behind a reverse proxy.

All routes are same-origin under `/api`. JSON mutations require `Content-Type: application/json`. Creation, edits, photo uploads, and deletion require `Authorization: Bearer <edit-token>`.

| Method and route                                                           | Behavior                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /api/health`                                                          | Database connectivity check                                   |
| `POST /api/observations`                                                   | Create/update a versioned observation; repeat requests safely |
| `GET /api/observations?limit=100&cursor=<uuid>&bbox=west,south,east,north` | Public collection; all query parameters optional; limit 1–200 |
| `GET /api/observations/{id}`                                               | Full public record, including optional measurements           |
| `POST /api/observations/{id}/photos`                                       | Multipart fields `id`, `revision`, `photo`                    |
| `GET /api/observations/{id}/photos/{photoId}`                              | JPEG for a current, non-deleted observation                   |
| `DELETE /api/observations/{id}`                                            | JSON `{ "revision": <newer integer> }`; repeatable deletion   |
| `POST /api/map-features`                                                   | Create an authenticated, idempotent polygon feature            |
| `GET /api/map-features?limit=100`                                          | List active public polygons; limit 1–200                       |

Collection responses are `{ observations, nextCursor }`, ordered by descending UUID for stable cursor pagination, and omit large motion/light arrays. Bounding boxes support crossing the antimeridian. Detail responses include measurement arrays. Local sync metadata and edit tokens are not public.

Payloads include `id` (UUID v4), `revision`, `createdAt`, `location`, `accessibility`, `comment`, `photoIds`, and optional `noise`, `motion`, and `light`. See the shared TypeScript types and API integration tests for examples. Invalid input, conflicting revisions, unauthorized edits, oversized uploads, and missing records return JSON errors with appropriate HTTP status codes.

Map-feature creation accepts a UUID, creation time, the `area` type, an optional name, and GeoJSON `Polygon` geometry. Rings must be explicitly closed, contain 3–500 vertices, use longitude/latitude coordinates, and form a valid non-self-intersecting area. The edit token is sent only in the Authorization header and makes offline retries idempotent.

## Verification

The Symfony backend has functional HTTP tests, while the root API suite exercises the real Vue-to-Symfony synchronization flow, including partial photo recovery, authorization, revisions, bounding boxes, and tombstones.

```sh
npx playwright install chromium
npm test
npm run test:api
npm run test:pwa
(cd backend && docker compose exec php php bin/phpunit)
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
- Serve `dist/` with navigation fallback to `index.html`, route `/api` to the Symfony/FrankenPHP service, keep photo storage outside the public root, and avoid permanently caching `sw.js` or HTML.

Calibrated noise, automatic accessibility classification, native sensor adapters, accounts, routing, and background sync after closing the app are outside this collection MVP.

## References

- [Vite PWA registration and update behavior](https://vite-pwa-org.netlify.app/guide/register-service-worker)
- [Web Audio analyser](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
- [Motion permission requirements](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static)
- [PostgreSQL conflict handling](https://www.postgresql.org/docs/17/sql-insert.html)


