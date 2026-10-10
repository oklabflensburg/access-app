<?php

declare(strict_types=1);

namespace App\Service;

/**
 * The general routing preference model: every map feature type is mapped to a
 * priority effect that shapes the computed route.
 */
final class FeaturePriorities
{
    public const TYPES = [
        'area',
        'building',
        'entrance',
        'staircase',
        'ramp',
        'toilet',
        'elevator',
        'path',
    ];

    public const PRIORITIES = ['neutral', 'avoid', 'reduce', 'prefer'];

    /** GraphHopper custom-model priority factors per non-neutral priority. */
    public const FACTORS = [
        'avoid' => '0',
        'reduce' => '0.5',
        'prefer' => '2',
    ];

    /** @return array<string, string> all types mapped to their default priority */
    public static function defaults(): array
    {
        return array_fill_keys(self::TYPES, 'neutral');
    }

    /**
     * @param array<mixed> $settings
     * @return array<string, string> the full settings map, ignoring unknown keys
     */
    public static function normalize(array $settings): array
    {
        $normalized = self::defaults();
        foreach ($settings as $type => $priority) {
            if (is_string($type) && in_array($type, self::TYPES, true)
                && is_string($priority) && in_array($priority, self::PRIORITIES, true)) {
                $normalized[$type] = $priority;
            }
        }

        return $normalized;
    }

    private function __construct()
    {
    }
}
