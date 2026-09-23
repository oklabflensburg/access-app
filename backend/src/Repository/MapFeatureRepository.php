<?php

declare(strict_types=1);

namespace App\Repository;

use App\Dto\MapFeatureInput;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\ParameterType;

final class MapFeatureRepository
{
    public function __construct(private readonly Connection $connection)
    {
    }

    public function isValidPolygon(string $geometry): bool
    {
        return (bool) $this->connection->fetchOne(<<<'SQL'
            SELECT ST_IsValid(candidate) AND GeometryType(candidate) = 'POLYGON'
                AND NOT ST_IsEmpty(candidate) AND ST_Area(candidate) > 0
            FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326) AS candidate) geometry
            SQL, ['geometry' => $geometry]);
    }

    public function insertIfAbsent(
        MapFeatureInput $input,
        string $tokenHash,
        \DateTimeImmutable $createdAt,
        string $geometry,
    ): int {
        return $this->connection->executeStatement(<<<'SQL'
            INSERT INTO map_features (
                id, type_id, name, geometry, status, edit_token_hash, created_at, updated_at
            )
            SELECT :id, type.id, NULLIF(:name, ''),
                ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326),
                'active', :edit_token_hash, :created_at, :created_at
            FROM map_feature_types type
            WHERE type.code = :type
            ON CONFLICT (id) DO NOTHING
            SQL, [
            'id' => $input->id,
            'type' => $input->type,
            'name' => $input->name,
            'geometry' => $geometry,
            'edit_token_hash' => $tokenHash,
            'created_at' => $createdAt->format('Y-m-d H:i:s.uP'),
        ]);
    }

    /** @return array<string, mixed>|false */
    public function findForUpdate(string $id, string $geometry): array|false
    {
        return $this->connection->fetchAssociative(<<<'SQL'
            SELECT feature.edit_token_hash, feature.status,
                (SELECT type.code FROM map_feature_types type WHERE type.id = feature.type_id) AS type,
                COALESCE(feature.name, '') AS name,
                ST_Equals(
                    feature.geometry,
                    ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)
                ) AS same_geometry
            FROM map_features feature
            WHERE feature.id = :id
            FOR UPDATE
            SQL, ['id' => $id, 'geometry' => $geometry]);
    }

    public function insertTombstoneIfAbsent(string $id, string $tokenHash): void
    {
        $this->connection->executeStatement(<<<'SQL'
            INSERT INTO map_features (id, status, edit_token_hash)
            VALUES (:id, 'removed', :edit_token_hash)
            ON CONFLICT (id) DO NOTHING
            SQL, ['id' => $id, 'edit_token_hash' => $tokenHash]);
    }

    /** @return array<string, mixed>|false */
    public function findByIdForUpdate(string $id): array|false
    {
        return $this->connection->fetchAssociative(<<<'SQL'
            SELECT edit_token_hash, status
            FROM map_features
            WHERE id = :id
            FOR UPDATE
            SQL, ['id' => $id]);
    }

    public function markRemoved(string $id): void
    {
        $this->connection->executeStatement(<<<'SQL'
            UPDATE map_features
            SET status = 'removed', merged_into_id = NULL, updated_at = NOW()
            WHERE id = :id
            SQL, ['id' => $id]);
    }

    public function updateProperties(string $id, string $type, string $name): int
    {
        return $this->connection->executeStatement(<<<'SQL'
            UPDATE map_features feature
            SET type_id = type.id, name = NULLIF(:name, ''), updated_at = NOW()
            FROM map_feature_types type
            WHERE feature.id = :id AND type.code = :type
            SQL, ['id' => $id, 'type' => $type, 'name' => $name]);
    }

    /** @return list<array<string, mixed>> */
    public function findActive(int $limit): array
    {
        return $this->connection->fetchAllAssociative(<<<'SQL'
            SELECT feature.id, type.code AS type, COALESCE(feature.name, '') AS name,
                ST_AsGeoJSON(feature.geometry, 7) AS geometry, feature.created_at
            FROM map_features feature
            JOIN map_feature_types type ON type.id = feature.type_id
            WHERE feature.status = 'active' AND GeometryType(feature.geometry) = 'POLYGON'
            ORDER BY feature.created_at DESC, feature.id DESC
            LIMIT :limit
            SQL, ['limit' => $limit], ['limit' => ParameterType::INTEGER]);
    }
}
