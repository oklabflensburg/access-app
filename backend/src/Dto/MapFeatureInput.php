<?php

declare(strict_types=1);

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Context\ExecutionContextInterface;

final readonly class MapFeatureInput
{
    /** @param array<string, mixed> $geometry */
    public function __construct(
        #[Assert\Uuid(versions: Assert\Uuid::V4_RANDOM)]
        public string $id,
        #[Assert\Choice(choices: ['area'])]
        public string $type,
        #[Assert\Length(max: 120)]
        public string $name,
        public array $geometry,
        #[Assert\Length(max: 40)]
        #[Assert\Regex(pattern: '/^\d{4}-\d{2}-\d{2}T/')]
        public string $createdAt,
    ) {
    }

    #[Assert\Callback]
    public function validateGeometry(ExecutionContextInterface $context): void
    {
        $rings = $this->geometry['coordinates'] ?? null;
        if ('Polygon' !== ($this->geometry['type'] ?? null)
            || !is_array($rings) || 1 !== count($rings) || !is_array($rings[0])
            || !array_is_list($rings[0]) || count($rings[0]) < 4 || count($rings[0]) > 501) {
            $context->buildViolation('Geometry must be one polygon ring with 3 to 500 vertices.')
                ->atPath('geometry')->addViolation();

            return;
        }

        $ring = $rings[0];
        foreach ($ring as $position) {
            if (!is_array($position) || 2 !== count($position)
                || !$this->coordinate($position[0] ?? null, -180, 180)
                || !$this->coordinate($position[1] ?? null, -90, 90)) {
                $context->buildViolation('Polygon coordinates are invalid.')
                    ->atPath('geometry')->addViolation();

                return;
            }
        }
        if ($ring[0][0] !== $ring[array_key_last($ring)][0]
            || $ring[0][1] !== $ring[array_key_last($ring)][1]) {
            $context->buildViolation('The polygon ring must be closed.')
                ->atPath('geometry')->addViolation();
        }

        $unique = array_unique(array_map(
            static fn (array $position): string => $position[0].','.$position[1],
            array_slice($ring, 0, -1),
        ));
        if (count($unique) < 3) {
            $context->buildViolation('A polygon needs at least three distinct vertices.')
                ->atPath('geometry')->addViolation();
        }
    }

    private function coordinate(mixed $value, float $min, float $max): bool
    {
        return (is_int($value) || is_float($value))
            && is_finite((float) $value) && $value >= $min && $value <= $max;
    }
}
