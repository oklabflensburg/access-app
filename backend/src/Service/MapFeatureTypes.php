<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\MapFeatureTypeRepository;

/**
 * The configured map feature types, loaded from the map_feature_types table.
 * That table is the single source of truth for which feature types exist and
 * how they map to OSM tags; the frontend requests it via /api/map-feature-types.
 */
final class MapFeatureTypes
{
    /** @var list<array{id: string, path: bool, routeSetting: bool, osm: list<array{extract: string, tags: array<string, string>}>}> */
    private readonly array $types;

    public function __construct(MapFeatureTypeRepository $types)
    {
        $this->types = array_map(static function (array $row): array {
            return [
                'id' => $row['code'],
                'path' => (bool) $row['path'],
                'routeSetting' => (bool) $row['route_setting'],
                'osm' => json_decode($row['osm'], true, flags: JSON_THROW_ON_ERROR),
            ];
        }, $types->findAll());
        if ($this->types === []) {
            throw new \RuntimeException('The map_feature_types table defines no feature types.');
        }
    }

    /**
     * @return list<array{id: string, path: bool, routeSetting: bool, osm: list<array{extract: string, tags: array<string, string>}>}>
     */
    public function all(): array
    {
        return $this->types;
    }

    /** @return list<string> */
    public function codes(): array
    {
        return array_column($this->types, 'id');
    }

    public function isValid(string $code): bool
    {
        return in_array($code, $this->codes(), true);
    }
}
