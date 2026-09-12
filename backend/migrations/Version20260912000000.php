<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260912000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create the accessibility collection schema with PostGIS, observations, media, and sensor measurements';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE EXTENSION IF NOT EXISTS pgcrypto');
        $this->addSql('CREATE EXTENSION IF NOT EXISTS postgis');

        $this->addSql(<<<'SQL'
            CREATE TABLE map_feature_types (
                id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                description TEXT
            )
            SQL);
        $this->addSql(<<<'SQL'
            CREATE TABLE map_features (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                type_id SMALLINT NOT NULL REFERENCES map_feature_types(id),
                parent_feature_id UUID REFERENCES map_features(id) ON DELETE SET NULL,
                name TEXT,
                geometry geometry(Geometry, 4326) NOT NULL,
                status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'merged', 'removed')),
                merged_into_id UUID REFERENCES map_features(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CHECK (merged_into_id IS NULL OR merged_into_id <> id),
                CHECK (
                    (status = 'merged' AND merged_into_id IS NOT NULL)
                    OR (status <> 'merged' AND merged_into_id IS NULL)
                )
            )
            SQL);
        $this->addSql('CREATE INDEX map_features_geometry_idx ON map_features USING GIST (geometry)');
        $this->addSql('CREATE INDEX map_features_type_idx ON map_features (type_id)');

        $this->addSql(<<<'SQL'
            CREATE TABLE observations (
                id UUID PRIMARY KEY,
                map_feature_id UUID REFERENCES map_features(id) ON DELETE SET NULL,
                revision INTEGER NOT NULL CHECK (revision > 0),
                edit_token_hash CHAR(64) NOT NULL CHECK (edit_token_hash ~ '^[0-9a-f]{64}$'),
                payload_hash CHAR(64),
                deleted BOOLEAN NOT NULL DEFAULT FALSE,
                captured_at TIMESTAMPTZ,
                location geography(Point, 4326),
                location_accuracy_m DOUBLE PRECISION CHECK (location_accuracy_m IS NULL OR location_accuracy_m >= 0),
                altitude_m DOUBLE PRECISION,
                altitude_accuracy_m DOUBLE PRECISION CHECK (altitude_accuracy_m IS NULL OR altitude_accuracy_m >= 0),
                heading_degrees DOUBLE PRECISION CHECK (
                    heading_degrees IS NULL OR (heading_degrees >= 0 AND heading_degrees <= 360)
                ),
                speed_mps DOUBLE PRECISION CHECK (speed_mps IS NULL OR speed_mps >= 0),
                location_timestamp_ms DOUBLE PRECISION CHECK (
                    location_timestamp_ms IS NULL OR location_timestamp_ms >= 0
                ),
                wheelchair_accessible BOOLEAN,
                ramp_available BOOLEAN,
                accessible_toilet BOOLEAN,
                elevator_available BOOLEAN,
                steps_at_entrance SMALLINT CHECK (
                    steps_at_entrance IS NULL OR steps_at_entrance BETWEEN 0 AND 3
                ),
                steps_count_is_minimum BOOLEAN NOT NULL DEFAULT FALSE,
                surface TEXT CHECK (
                    surface IS NULL OR surface IN ('smooth', 'uneven', 'cobblestone', 'gravel', 'other')
                ),
                inclination_percent DOUBLE PRECISION CHECK (
                    inclination_percent IS NULL OR inclination_percent BETWEEN -100 AND 100
                ),
                comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 2000),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CHECK (NOT steps_count_is_minimum OR steps_at_entrance IS NOT NULL),
                CHECK (deleted OR (captured_at IS NOT NULL AND location IS NOT NULL AND payload_hash IS NOT NULL))
            )
            SQL);
        $this->addSql('CREATE INDEX observations_location_idx ON observations USING GIST (location)');
        $this->addSql('CREATE INDEX observations_map_feature_idx ON observations (map_feature_id) WHERE NOT deleted');
        $this->addSql('CREATE INDEX observations_updated_idx ON observations (updated_at, id) WHERE NOT deleted');

        $this->addSql(<<<'SQL'
            CREATE TABLE media (
                id UUID PRIMARY KEY,
                observation_id UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
                media_type TEXT NOT NULL DEFAULT 'photo' CHECK (media_type = 'photo'),
                sort_order SMALLINT NOT NULL CHECK (sort_order BETWEEN 0 AND 5),
                storage_key TEXT UNIQUE,
                original_filename TEXT,
                mime_type TEXT CHECK (mime_type IS NULL OR mime_type = 'image/jpeg'),
                byte_size INTEGER CHECK (byte_size IS NULL OR byte_size > 0),
                sha256 CHAR(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
                width_px INTEGER CHECK (width_px IS NULL OR width_px > 0),
                height_px INTEGER CHECK (height_px IS NULL OR height_px > 0),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                uploaded_at TIMESTAMPTZ,
                CHECK (
                    (uploaded_at IS NULL AND storage_key IS NULL AND mime_type IS NULL AND byte_size IS NULL
                        AND sha256 IS NULL AND width_px IS NULL AND height_px IS NULL)
                    OR
                    (uploaded_at IS NOT NULL AND storage_key IS NOT NULL AND mime_type IS NOT NULL
                        AND byte_size IS NOT NULL AND sha256 IS NOT NULL AND width_px IS NOT NULL
                        AND height_px IS NOT NULL)
                )
            )
            SQL);
        $this->addSql('CREATE INDEX media_observation_idx ON media (observation_id)');

        $this->addSql(<<<'SQL'
            CREATE TABLE sensor_measurements (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                observation_id UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
                sensor_type TEXT NOT NULL CHECK (sensor_type IN ('noise', 'motion', 'light')),
                started_at TIMESTAMPTZ NOT NULL,
                duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
                summary JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(summary) = 'object'),
                samples JSONB CHECK (samples IS NULL OR jsonb_typeof(samples) = 'array'),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (observation_id, sensor_type)
            )
            SQL);
        $this->addSql('CREATE INDEX sensor_measurements_observation_idx ON sensor_measurements (observation_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE sensor_measurements');
        $this->addSql('DROP TABLE media');
        $this->addSql('DROP TABLE observations');
        $this->addSql('DROP TABLE map_features');
        $this->addSql('DROP TABLE map_feature_types');
    }
}
