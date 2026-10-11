<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261012000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Link map features to the OSM object they were adopted from';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE map_features ADD COLUMN osm_id BIGINT CHECK (osm_id IS NULL OR osm_id > 0)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE map_features DROP COLUMN osm_id');
    }
}
