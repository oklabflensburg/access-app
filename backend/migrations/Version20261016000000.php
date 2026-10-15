<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261016000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create the map_feature_types table holding the configured feature types';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE map_feature_types (
                code TEXT PRIMARY KEY,
                path BOOLEAN NOT NULL,
                route_setting BOOLEAN NOT NULL,
                osm JSONB NOT NULL,
                sort_order SMALLINT NOT NULL UNIQUE
            )
            SQL);
        $this->addSql(<<<'SQL'
            INSERT INTO map_feature_types (code, path, route_setting, osm, sort_order) VALUES
                ('area', FALSE, FALSE, '[]'::jsonb, 0),
                ('point', FALSE, FALSE, '[]'::jsonb, 1),
                ('building', FALSE, FALSE, '[]'::jsonb, 2),
                ('entrance', FALSE, FALSE, '[]'::jsonb, 3),
                ('steps', TRUE, TRUE, '[{"extract": "w/highway=steps", "tags": {"highway": "steps"}}]'::jsonb, 4),
                ('ramp', FALSE, FALSE, '[{"extract": "w/ramp=wheelchair", "tags": {"ramp": "wheelchair"}}]'::jsonb, 5),
                ('toilets', FALSE, FALSE, '[{"extract": "n/amenity=toilets", "tags": {"amenity": "toilets"}}]'::jsonb, 6),
                ('elevator', FALSE, FALSE, '[{"extract": "n/highway=elevator", "tags": {"highway": "elevator"}}]'::jsonb, 7),
                ('path', TRUE, FALSE, '[]'::jsonb, 8)
            SQL);
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE map_feature_types');
    }
}
