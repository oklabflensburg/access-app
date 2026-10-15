<?php

declare(strict_types=1);

namespace App\Service;

/**
 * The general routing preference model: every configured map feature type is
 * mapped to a priority effect that shapes the computed route.
 */
final class FeaturePriorities
{
    public const PRIORITIES = ['neutral', 'avoid', 'reduce', 'prefer'];

    /** GraphHopper custom-model priority factors per non-neutral priority. */
    public const FACTORS = [
        'avoid' => '0',
        'reduce' => '0.5',
        'prefer' => '2',
    ];

    public function __construct(
        private readonly MapFeatureTypes $featureTypes,
    ) {
    }

    /** @return array<string, string> all types mapped to their default priority */
    public function defaults(): array
    {
        return array_fill_keys($this->featureTypes->codes(), 'neutral');
    }

    /**
     * @param array<mixed> $settings
     * @return array<string, string> the full settings map, ignoring unknown keys
     */
    public function normalize(array $settings): array
    {
        $normalized = $this->defaults();
        foreach ($settings as $type => $priority) {
            if (is_string($type) && $this->featureTypes->isValid($type)
                && is_string($priority) && in_array($priority, self::PRIORITIES, true)) {
                $normalized[$type] = $priority;
            }
        }

        return $normalized;
    }
}
