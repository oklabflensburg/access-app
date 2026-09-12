# AccessApp collection phase

## Goal

Build a mobile-first PWA for collecting accessibility information for a public map.

Users can:

- See their current location on a map.
- Mark a location and create an accessibility observation.
- Answer a short accessibility questionnaire.
- Optionally attach photos and collect sensor measurements.
- Save observations offline and synchronize them later.
- View previously collected observations on the map.
- Edit or delete observations created on their device.

Personal accessibility profiles and accessible route planning are explicitly deferred to a later phase.

## Milestones

### Milestone 1 — Local collection

- Show the user's current location and GPS accuracy.
- Create an observation at the captured location.
- Complete the accessibility questionnaire.
- Optionally attach photos and collect noise, motion, or light measurements.
- Save drafts and completed observations locally while offline.
- View, edit, and delete local observations.

### Milestone 2 — Backend synchronization

- Upload completed observations and their media to the backend.
- Retry interrupted uploads without creating duplicates.
- Reject stale edits by using an observation revision number.
- Authenticate edits and deletions with an observation-specific edit token.
- Keep deletion tombstones so an old offline client cannot recreate deleted data.
- Load public observations for the visible map area.

## Data model principles

- An **observation** is a contributor's report and contains the original questionnaire answers and measurements.
- A **map feature** is a stable real-world object such as a building, entrance, staircase, ramp, toilet, elevator, or path.
- An observation may initially be unlinked. It can later be linked to one map feature through `map_feature_id`.
- Multiple observations may refer to the same map feature.
- Map features do not contain contributor ownership, raw answers, media, or raw sensor samples.
- Derived accessibility values for map features are outside the collection phase. They must later be calculated from observations with provenance and confidence information, rather than directly overwriting feature columns.
- The MVP has no user accounts. Ownership of an observation is represented by a secret edit token held on the originating device; only its hash is stored by the backend.
- Unknown questionnaire answers are stored as `NULL`. `FALSE` always means an explicit "no" answer.
- All timestamps use `timestamptz`, and all application entity identifiers use UUIDs.

## PostgreSQL schema

PostGIS is used for validated coordinates, bounding-box queries, and future support for non-point feature geometry.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE map_feature_types (
    id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    description text
);

CREATE TABLE map_features (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type_id smallint NOT NULL REFERENCES map_feature_types(id),
    parent_feature_id uuid REFERENCES map_features(id) ON DELETE SET NULL,
    name text,
    geometry geometry(Geometry, 4326) NOT NULL,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'merged', 'removed')),
    merged_into_id uuid REFERENCES map_features(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (merged_into_id IS NULL OR merged_into_id <> id),
    CHECK (
        (status = 'merged' AND merged_into_id IS NOT NULL)
        OR (status <> 'merged' AND merged_into_id IS NULL)
    )
);

CREATE INDEX map_features_geometry_idx
    ON map_features USING gist (geometry);
CREATE INDEX map_features_type_idx
    ON map_features (type_id);

CREATE TABLE observations (
    id uuid PRIMARY KEY,
    map_feature_id uuid REFERENCES map_features(id) ON DELETE SET NULL,

    revision integer NOT NULL CHECK (revision > 0),
    edit_token_hash text NOT NULL,
    payload_hash char(64),
    deleted boolean NOT NULL DEFAULT false,

    captured_at timestamptz,
    location geography(Point, 4326),
    location_accuracy_m double precision
        CHECK (location_accuracy_m IS NULL OR location_accuracy_m >= 0),
    altitude_m double precision,
    altitude_accuracy_m double precision
        CHECK (altitude_accuracy_m IS NULL OR altitude_accuracy_m >= 0),
    heading_degrees double precision
        CHECK (heading_degrees IS NULL OR
               (heading_degrees >= 0 AND heading_degrees < 360)),
    speed_mps double precision
        CHECK (speed_mps IS NULL OR speed_mps >= 0),
    location_timestamp_ms double precision
        CHECK (location_timestamp_ms IS NULL OR location_timestamp_ms >= 0),

    wheelchair_accessible boolean,
    ramp_available boolean,
    accessible_toilet boolean,
    elevator_available boolean,
    steps_at_entrance smallint
        CHECK (steps_at_entrance IS NULL OR steps_at_entrance >= 0),
    steps_count_is_minimum boolean NOT NULL DEFAULT false,
    surface text
        CHECK (surface IS NULL OR surface IN
               ('smooth', 'uneven', 'cobblestone', 'gravel', 'other')),
    inclination_percent double precision
        CHECK (inclination_percent IS NULL OR
               inclination_percent BETWEEN -100 AND 100),
    comment text CHECK (comment IS NULL OR char_length(comment) <= 2000),

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CHECK (NOT steps_count_is_minimum OR steps_at_entrance IS NOT NULL),
    CHECK (deleted OR
           (captured_at IS NOT NULL AND location IS NOT NULL AND payload_hash IS NOT NULL))
);

CREATE INDEX observations_location_idx
    ON observations USING gist (location);
CREATE INDEX observations_map_feature_idx
    ON observations (map_feature_id)
    WHERE NOT deleted;
CREATE INDEX observations_updated_idx
    ON observations (updated_at, id)
    WHERE NOT deleted;

CREATE TABLE media (
    id uuid PRIMARY KEY,
    observation_id uuid NOT NULL
        REFERENCES observations(id) ON DELETE CASCADE,
    media_type text NOT NULL CHECK (media_type IN ('photo')),
    sort_order smallint NOT NULL CHECK (sort_order BETWEEN 0 AND 5),
    storage_key text UNIQUE,
    original_filename text,
    mime_type text CHECK (mime_type IS NULL OR mime_type = 'image/jpeg'),
    byte_size integer CHECK (byte_size IS NULL OR byte_size > 0),
    sha256 char(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
    width_px integer CHECK (width_px IS NULL OR width_px > 0),
    height_px integer CHECK (height_px IS NULL OR height_px > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    uploaded_at timestamptz,
    CHECK (
        (uploaded_at IS NULL AND storage_key IS NULL AND mime_type IS NULL AND
         byte_size IS NULL AND sha256 IS NULL AND width_px IS NULL AND height_px IS NULL)
        OR
        (uploaded_at IS NOT NULL AND storage_key IS NOT NULL AND mime_type IS NOT NULL AND
         byte_size IS NOT NULL AND sha256 IS NOT NULL AND width_px IS NOT NULL AND
         height_px IS NOT NULL)
    )
);

CREATE INDEX media_observation_idx ON media (observation_id);

CREATE TABLE sensor_measurements (
    id uuid PRIMARY KEY,
    observation_id uuid NOT NULL
        REFERENCES observations(id) ON DELETE CASCADE,
    sensor_type text NOT NULL
        CHECK (sensor_type IN ('noise', 'motion', 'light')),
    started_at timestamptz NOT NULL,
    duration_ms integer NOT NULL CHECK (duration_ms >= 0),
    summary jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(summary) = 'object'),
    samples jsonb
        CHECK (samples IS NULL OR jsonb_typeof(samples) = 'array'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (observation_id, sensor_type)
);

CREATE INDEX sensor_measurements_observation_idx
    ON sensor_measurements (observation_id);
```

## Field semantics

- For the questionnaire option `3+ steps`, store `steps_at_entrance = 3` and `steps_count_is_minimum = true`.
- `inclination_percent` is grade percentage, not degrees. The collection UI must label the unit.
- Noise measurements contain relative level summaries only. Raw audio must not be recorded or uploaded.
- Motion and light samples are optional and device-dependent. Sensor payloads must include their units and sampling metadata in `summary`.
- `storage_key` is an internal object-storage or filesystem key. Never expose a server filesystem path through the public API.
- Media rows are created as pending entries from the observation's photo manifest. Uploading the JPEG fills the nullable file metadata and `uploaded_at`; this makes partial upload retries idempotent.
- Deleting an observation sets `deleted = true`, increments `revision`, clears public payload data as appropriate, and deletes related media and sensor measurements. The observation row remains as a minimal tombstone.

## Deferred additions

The following are deliberately not part of the collection schema:

- User accounts and server-synchronized accessibility profiles
- Aggregated or authoritative accessibility values on map features
- Observation voting, moderation, and dispute resolution
- A pedestrian routing graph and route preferences
- Accessible route calculation
