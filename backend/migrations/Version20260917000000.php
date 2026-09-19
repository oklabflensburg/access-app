<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260917000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Enable authenticated, persistent user-drawn polygon map features';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("INSERT INTO map_feature_types (code, name, description) VALUES ('area', 'Area', 'A user-drawn polygonal map feature') ON CONFLICT (code) DO NOTHING");
        $this->addSql("ALTER TABLE map_features ADD COLUMN edit_token_hash CHAR(64) CHECK (edit_token_hash IS NULL OR edit_token_hash ~ '^[0-9a-f]{64}$')");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE map_features DROP COLUMN edit_token_hash');
    }
}
