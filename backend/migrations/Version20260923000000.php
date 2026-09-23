<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260923000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add the selectable map feature types';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            INSERT INTO map_feature_types (code, name, description) VALUES
                ('building', 'Building', 'A building or building footprint'),
                ('entrance', 'Entrance', 'An entrance area'),
                ('staircase', 'Staircase', 'A staircase area'),
                ('ramp', 'Ramp', 'A ramp area'),
                ('toilet', 'Toilet', 'A toilet area'),
                ('elevator', 'Elevator', 'An elevator area'),
                ('path', 'Path', 'A path or route area')
            ON CONFLICT (code) DO NOTHING
            SQL);
    }

    public function down(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            DELETE FROM map_feature_types
            WHERE code IN ('building', 'entrance', 'staircase', 'ramp', 'toilet', 'elevator', 'path')
                AND NOT EXISTS (
                    SELECT 1 FROM map_features WHERE map_features.type_id = map_feature_types.id
                )
            SQL);
    }
}
