<?php

declare(strict_types=1);

namespace App\Repository;

use Doctrine\DBAL\Connection;

final class MapFeatureTypeRepository
{
    public function __construct(private readonly Connection $connection)
    {
    }

    /** @return list<array<string, mixed>> */
    public function findAll(): array
    {
        return $this->connection->fetchAllAssociative(<<<'SQL'
            SELECT code, path, route_setting, osm
            FROM map_feature_types
            ORDER BY sort_order
            SQL);
    }
}
