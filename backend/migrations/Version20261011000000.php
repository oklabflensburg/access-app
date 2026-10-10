<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261011000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Replace the wheelchair routing preference with per-feature-type priorities';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE routing_preferences ADD COLUMN feature_priorities JSONB NOT NULL DEFAULT \'{}\'::jsonb');
        $this->addSql('UPDATE routing_preferences SET feature_priorities = \'{"staircase": "avoid"}\'::jsonb WHERE wheelchair_accessible');
        $this->addSql('ALTER TABLE routing_preferences DROP COLUMN wheelchair_accessible');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE routing_preferences ADD COLUMN wheelchair_accessible BOOLEAN NOT NULL DEFAULT FALSE');
        $this->addSql('UPDATE routing_preferences SET wheelchair_accessible = TRUE WHERE feature_priorities->>\'staircase\' = \'avoid\'');
        $this->addSql('ALTER TABLE routing_preferences DROP COLUMN feature_priorities');
    }
}
