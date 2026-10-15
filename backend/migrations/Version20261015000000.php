<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261015000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Store the map feature type code directly on map_features and drop the map_feature_types lookup table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE map_features ADD COLUMN type TEXT');
        $this->addSql(<<<'SQL'
            UPDATE map_features feature
            SET type = lookup.code
            FROM map_feature_types lookup
            WHERE lookup.id = feature.type_id
            SQL);
        $this->addSql('ALTER TABLE map_features DROP COLUMN type_id');
        $this->addSql('DROP TABLE map_feature_types');
    }

    public function down(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE map_feature_types (
                id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                description TEXT
            )
            SQL);
        $this->addSql(<<<'SQL'
            INSERT INTO map_feature_types (code, name)
            SELECT code, INITCAP(code) FROM (SELECT DISTINCT type AS code FROM map_features WHERE type IS NOT NULL) codes
            SQL);
        $this->addSql('ALTER TABLE map_features ADD COLUMN type_id SMALLINT REFERENCES map_feature_types(id)');
        $this->addSql(<<<'SQL'
            UPDATE map_features feature
            SET type_id = lookup.id
            FROM map_feature_types lookup
            WHERE lookup.code = feature.type
            SQL);
        $this->addSql('ALTER TABLE map_features DROP COLUMN type');
        $this->addSql('CREATE INDEX map_features_type_idx ON map_features (type_id)');
    }
}
