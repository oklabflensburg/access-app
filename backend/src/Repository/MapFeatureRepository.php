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

    public function exists(string $id): bool
    {
        return (bool) $this->connection->fetchOne(
            'SELECT 1 FROM map_features WHERE id = :id',
            ['id' => $id],
        );
    }

    /**
     * A child is valid inside an enclosing parent feature, or — like the
     * client's way drawing — when a path crosses another path.
     */
    public function acceptsChild(string $geometry, string $parentId, string $childType): bool
    {
        return (bool) $this->connection->fetchOne(<<<'SQL'
            SELECT CASE WHEN parent.type = 'path' AND :child_type = 'path'
                THEN ST_Intersects(parent.geometry, child.geometry)
                ELSE ST_Covers(parent.geometry, child.geometry)
            END
            FROM map_features parent
            CROSS JOIN (
                SELECT ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326) AS geometry
            ) child
            WHERE parent.id = :parent_id AND parent.status = 'active'
                AND GeometryType(parent.geometry) = 'POLYGON'
            SQL, ['geometry' => $geometry, 'parent_id' => $parentId, 'child_type' => $childType]);
    }

    public function insertIfAbsent(
        MapFeatureInput $input,
        string $tokenHash,
        \DateTimeImmutable $createdAt,
        string $geometry,
    ): int {
        return $this->connection->executeStatement(<<<'SQL'
            INSERT INTO map_features (
                id, type, parent_feature_id, name, geometry, status, edit_token_hash, created_at, updated_at, osm_id
            )
            VALUES (:id, :type, :parent_feature_id, NULLIF(:name, ''),
                ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326),
                'active', :edit_token_hash, :created_at, :created_at, :osm_id)
            ON CONFLICT (id) DO NOTHING
            SQL, [
            'id' => $input->id,
            'type' => $input->type,
            'parent_feature_id' => $input->parentFeatureId,
            'name' => $input->name,
            'geometry' => $geometry,
            'edit_token_hash' => $tokenHash,
            'created_at' => $createdAt->format('Y-m-d H:i:s.uP'),
            'osm_id' => $input->osmId,
        ]);
    }

    /** @return array<string, mixed>|false */
    public function findForUpdate(string $id, string $geometry): array|false
    {
        return $this->connection->fetchAssociative(<<<'SQL'
            SELECT feature.edit_token_hash, feature.status, feature.parent_feature_id, feature.osm_id,
                feature.type,
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

    public function updateProperties(string $id, string $type, string $name): void
    {
        $this->connection->executeStatement(<<<'SQL'
            UPDATE map_features
            SET type = :type, name = NULLIF(:name, ''), updated_at = NOW()
            WHERE id = :id
            SQL, ['id' => $id, 'type' => $type, 'name' => $name]);
    }

    /** @return list<array<string, mixed>> */
    public function findActive(int $limit): array
    {
        return $this->connection->fetchAllAssociative(<<<'SQL'
            SELECT feature.id, feature.parent_feature_id, feature.osm_id, feature.type, COALESCE(feature.name, '') AS name,
                ST_AsGeoJSON(feature.geometry, 7) AS geometry, feature.created_at
            FROM map_features feature
            WHERE feature.status = 'active' AND GeometryType(feature.geometry) = 'POLYGON'
            ORDER BY feature.created_at DESC, feature.id DESC
            LIMIT :limit
            SQL, ['limit' => $limit], ['limit' => ParameterType::INTEGER]);
    }
}
