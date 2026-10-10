# AGENTS.md

## Project

AccessApp: mobile-first Vue 3 + TypeScript PWA (Vite, Pinia, Leaflet, PrimeVue) with a Symfony REST backend (PostgreSQL/PostGIS) and a self-hosted GraphHopper routing instance. Users collect accessibility observations (questionnaire, photos, noise/motion/light measurements) and draw map features; data syncs to a public map.

Read `domain-knowledge/` for feature context before working on a domain (e.g. `domain-knowledge/routing.md` for routing). `README.md` covers setup, usage, and deployment.

## Rules

- Make only minimal code changes. Touch nothing that was not asked for.
- Keep answers small. Avoid unnecessary tokens: no filler, no restating context, no long summaries.
- Read a file before editing it. Match existing style.
- Do not add comments explaining your reasoning, license headers, or author tags.

## Commands

```sh
npm run dev          # frontend dev server (Vite, proxies /api to 127.0.0.1:8080)
npm run build        # vue-tsc type check + vite build
npm test             # Playwright e2e
npm run test:api     # API tests
npm run test:pwa     # PWA tests (builds first)
make start           # backend via docker compose (project dir backend/)
make stop
```

Node ^22.12 || >=24. Backend runs in Docker Compose; Doctrine migrations apply automatically on container start.

## Layout

- `src/` — frontend: `views/`, `components/`, `composables/`, `stores/` (Pinia), `services/`, `types/`, `i18n.ts`
- `backend/` — Symfony: `src/Controller`, `src/Service`, `src/Entity`, migrations
- `backend/routing/` — GraphHopper 11.1 container, OSM graph of Schleswig-Holstein
- `tests/` — Playwright specs (e2e, api, pwa)
- `domain-knowledge/` — per-feature documentation; consult before domain work

## Conventions

- Frontend state in Pinia stores; routing session logic in `src/composables/useRouting.ts`.
- API errors carry machine-readable `code`s; map them to localized messages in `src/i18n.ts`.
- Local-first: data is stored on-device (Dexie) and synced via a queue; keep that order.
- Route geometry is GeoJSON `[lng, lat]` pairs; GraphHopper profiles are shortest-distance, not fastest.
