<?php

declare(strict_types=1);

namespace App\Service;

use App\Dto\MapFeatureInput;
use App\Dto\MapFeatureListQuery;
use Doctrine\DBAL\Connection;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

final class MapFeatureStore
{
    public function __construct(private readonly Connection $connection)
    {
    }

    /** @return array{id: string} */
    public function save(MapFeatureInput $input, string $tokenHash): array
    {
        try {
            $createdAt = new \DateTimeImmutable($input->createdAt);
        } catch (\DateMalformedStringException) {
            throw new BadRequestHttpException('Invalid creation date.');
        }
        $geometry = json_encode($input->geometry, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $valid = $this->connection->fetchOne(<<<'SQL'
            SELECT ST_IsValid(candidate) AND GeometryType(candidate) = 'POLYGON'
                AND NOT ST_IsEmpty(candidate) AND ST_Area(candidate) > 0
            FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326) AS candidate) geometry
            SQL, ['geometry' => $geometry]);
        if (!$valid) {
            throw new BadRequestHttpException('The polygon is not a valid, non-self-intersecting area.');
        }

        $this->connection->transactional(function (Connection $connection) use ($input, $tokenHash, $createdAt, $geometry): void {
            $inserted = $connection->executeStatement(<<<'SQL'
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
            if (1 === $inserted) {
                return;
            }

            $current = $connection->fetchAssociative(<<<'SQL'
                SELECT feature.edit_token_hash, type.code AS type, COALESCE(feature.name, '') AS name,
                    ST_AsGeoJSON(feature.geometry)::jsonb = CAST(:geometry AS jsonb) AS same_geometry
                FROM map_features feature
                JOIN map_feature_types type ON type.id = feature.type_id
                WHERE feature.id = :id
                FOR UPDATE
                SQL, ['id' => $input->id, 'geometry' => $geometry]);
            if (false === $current) {
                throw new BadRequestHttpException('Unknown map feature type.');
            }
            if (!is_string($current['edit_token_hash'])
                || !hash_equals($current['edit_token_hash'], $tokenHash)) {
                throw new AccessDeniedHttpException('Edit token does not match this map feature.');
            }
            if ($current['type'] !== $input->type || $current['name'] !== $input->name
                || !$current['same_geometry']) {
                throw new ConflictHttpException('A different map feature already uses this id.');
            }
        });

        return ['id' => $input->id];
    }

    /** @return array{features: list<array<string, mixed>>} */
    public function list(MapFeatureListQuery $query): array
    {
        $rows = $this->connection->fetchAllAssociative(<<<'SQL'
            SELECT feature.id, type.code AS type, COALESCE(feature.name, '') AS name,
                ST_AsGeoJSON(feature.geometry, 7) AS geometry, feature.created_at
            FROM map_features feature
            JOIN map_feature_types type ON type.id = feature.type_id
            WHERE feature.status = 'active' AND GeometryType(feature.geometry) = 'POLYGON'
            ORDER BY feature.created_at DESC, feature.id DESC
            LIMIT :limit
            SQL, ['limit' => $query->limit], ['limit' => \Doctrine\DBAL\ParameterType::INTEGER]);

        return ['features' => array_map(static function (array $row): array {
            return [
                'id' => $row['id'],
                'type' => $row['type'],
                'name' => $row['name'],
                'geometry' => json_decode($row['geometry'], true, flags: JSON_THROW_ON_ERROR),
                'createdAt' => (new \DateTimeImmutable($row['created_at']))->format(DATE_ATOM),
            ];
        }, $rows)];
    }
}
