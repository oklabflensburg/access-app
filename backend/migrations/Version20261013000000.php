<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261013000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Rename map feature type codes to OSM tag terminology (staircase -> steps, toilet -> toilets)';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            UPDATE map_feature_types
            SET code = CASE code
                WHEN 'staircase' THEN 'steps'
                WHEN 'toilet' THEN 'toilets'
                ELSE code
            END
            WHERE code IN ('staircase', 'toilet')
            SQL);
        $this->addSql(<<<'SQL'
            UPDATE routing_preferences
            SET feature_priorities = feature_priorities - 'staircase' - 'toilet'
                || jsonb_build_object(
                    'steps', COALESCE(feature_priorities->'staircase', to_jsonb('neutral'::text)),
                    'toilets', COALESCE(feature_priorities->'toilet', to_jsonb('neutral'::text))
                )
            SQL);
    }

    public function down(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            UPDATE map_feature_types
            SET code = CASE code
                WHEN 'steps' THEN 'staircase'
                WHEN 'toilets' THEN 'toilet'
                ELSE code
            END
            WHERE code IN ('steps', 'toilets')
            SQL);
        $this->addSql(<<<'SQL'
            UPDATE routing_preferences
            SET feature_priorities = feature_priorities - 'steps' - 'toilets'
                || jsonb_build_object(
                    'staircase', COALESCE(feature_priorities->'steps', to_jsonb('neutral'::text)),
                    'toilet', COALESCE(feature_priorities->'toilets', to_jsonb('neutral'::text))
                )
            SQL);
    }
}
