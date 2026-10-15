<?php

declare(strict_types=1);

namespace App\Service;

/**
 * The configured map feature types, loaded from config/map-features.json. That
 * file is the single source of truth shared with the frontend and the OSM
 * extraction; it defines which feature types exist and how they map to OSM tags.
 */
final class MapFeatureTypes
{
    /** @var list<string> */
    private readonly array $codes;

    public function __construct(string $configFile)
    {
        $raw = file_get_contents($configFile);
        if (false === $raw) {
            throw new \RuntimeException("The map feature config is missing: {$configFile}");
        }
        $config = json_decode($raw, true, flags: JSON_THROW_ON_ERROR);
        if (!is_array($config) || !is_array($config['types'] ?? null)) {
            throw new \RuntimeException('The map feature config must contain a types array.');
        }
        $codes = [];
        foreach ($config['types'] as $type) {
            if (is_array($type) && is_string($type['id'] ?? null) && '' !== $type['id']) {
                $codes[] = $type['id'];
            }
        }
        if ($codes === []) {
            throw new \RuntimeException('The map feature config defines no feature types.');
        }
        $this->codes = array_values(array_unique($codes));
    }

    /** @return list<string> */
    public function codes(): array
    {
        return $this->codes;
    }

    public function isValid(string $code): bool
    {
        return in_array($code, $this->codes, true);
    }
}
