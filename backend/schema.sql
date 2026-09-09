CREATE TABLE IF NOT EXISTS observations (
  id uuid PRIMARY KEY,
  revision integer NOT NULL CHECK (revision > 0),
  edit_token_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  deleted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY,
  observation_id uuid NOT NULL REFERENCES observations(id),
  filename text NOT NULL,
  sha256 text NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_observation_idx ON photos(observation_id);
CREATE INDEX IF NOT EXISTS observations_live_idx ON observations(id) WHERE NOT deleted;
