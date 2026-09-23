<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260924000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Allow authenticated map feature deletion tombstones';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE map_features ALTER COLUMN type_id DROP NOT NULL');
        $this->addSql('ALTER TABLE map_features ALTER COLUMN geometry DROP NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql("DELETE FROM map_features WHERE status = 'removed' AND type_id IS NULL");
        $this->addSql('ALTER TABLE map_features ALTER COLUMN type_id SET NOT NULL');
        $this->addSql('ALTER TABLE map_features ALTER COLUMN geometry SET NOT NULL');
    }
}
