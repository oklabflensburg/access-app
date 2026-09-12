<?php

declare(strict_types=1);

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Context\ExecutionContextInterface;

final readonly class ObservationInput
{
    /**
     * @param list<string>              $photoIds
     * @param array<string, mixed>|null $noise
     * @param list<array<string, mixed>>|null $motion
     * @param list<array<string, mixed>>|null $light
     */
    public function __construct(
        #[Assert\Uuid(versions: Assert\Uuid::V4_RANDOM)]
        public string $id,
        #[Assert\Range(min: 1, max: 2147483647)]
        public int $revision,
        #[Assert\Length(max: 40)]
        #[Assert\Regex(pattern: '/^\d{4}-\d{2}-\d{2}T/')]
        public string $createdAt,
        #[Assert\Valid]
        public LocationInput $location,
        #[Assert\Valid]
        public AccessibilityInput $accessibility,
        #[Assert\Length(max: 2000)]
        public string $comment = '',
        #[Assert\Count(max: 6)]
        #[Assert\Unique]
        #[Assert\All([new Assert\Uuid(versions: Assert\Uuid::V4_RANDOM)])]
        public array $photoIds = [],
        public ?array $noise = null,
        public ?array $motion = null,
        public ?array $light = null,
    ) {
    }

    #[Assert\Callback]
    public function validateSensors(ExecutionContextInterface $context): void
    {
        if (null !== $this->noise) {
            $average = $this->noise['averageLevel'] ?? null;
            $peak = $this->noise['peakLevel'] ?? null;
            $duration = $this->noise['duration'] ?? null;
            if (!$this->numberInRange($average, 0, 10)
                || !$this->numberInRange($peak, 0, 10)
                || !$this->numberInRange($duration, 0, 120)
                || (float) $peak < (float) $average) {
                $context->buildViolation('Invalid relative noise measurement.')->atPath('noise')->addViolation();
            }
        }

        $this->validateSamples($context, 'motion', $this->motion, 150, [
            'accelerationX', 'accelerationY', 'accelerationZ',
            'rotationAlpha', 'rotationBeta', 'rotationGamma',
            'orientationAlpha', 'orientationBeta', 'orientationGamma',
        ]);
        $this->validateSamples($context, 'light', $this->light, 20, ['illuminance']);
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        $payload = [
            'id' => $this->id,
            'revision' => $this->revision,
            'createdAt' => $this->createdAt,
            'location' => $this->location->toArray(),
            'accessibility' => $this->accessibility->toArray(),
            'comment' => $this->comment,
            'photoIds' => $this->photoIds,
        ];
        if (null !== $this->noise) {
            $payload['noise'] = array_intersect_key(
                $this->noise,
                array_flip(['averageLevel', 'peakLevel', 'duration']),
            );
        }
        if (null !== $this->motion) {
            $payload['motion'] = $this->normalizedSamples($this->motion, [
                'accelerationX', 'accelerationY', 'accelerationZ',
                'rotationAlpha', 'rotationBeta', 'rotationGamma',
                'orientationAlpha', 'orientationBeta', 'orientationGamma',
            ]);
        }
        if (null !== $this->light) {
            $payload['light'] = $this->normalizedSamples($this->light, ['illuminance']);
        }

        return $payload;
    }

    /**
     * @param list<array<string, mixed>>|null $samples
     * @param list<string>                    $valueKeys
     */
    private function validateSamples(
        ExecutionContextInterface $context,
        string $kind,
        ?array $samples,
        int $limit,
        array $valueKeys,
    ): void {
        if (null === $samples) {
            return;
        }
        if (!array_is_list($samples) || count($samples) > $limit) {
            $context->buildViolation('Too many or malformed sensor samples.')->atPath($kind)->addViolation();

            return;
        }
        foreach ($samples as $sample) {
            if (!is_array($sample) || !$this->numberInRange($sample['timestamp'] ?? null, 0, 1000000000000000)) {
                $context->buildViolation('Invalid sensor timestamp.')->atPath($kind)->addViolation();

                return;
            }
            foreach ($valueKeys as $key) {
                $value = $sample[$key] ?? null;
                if (null !== $value && !$this->numberInRange($value, 'light' === $kind ? 0 : -1000000000, 1000000000)) {
                    $context->buildViolation('Invalid sensor value.')->atPath($kind)->addViolation();

                    return;
                }
            }
        }
    }

    private function numberInRange(mixed $value, float $min, float $max): bool
    {
        return (is_int($value) || is_float($value)) && is_finite((float) $value)
            && $value >= $min && $value <= $max;
    }

    /**
     * @param list<array<string, mixed>> $samples
     * @param list<string>               $valueKeys
     *
     * @return list<array<string, mixed>>
     */
    private function normalizedSamples(array $samples, array $valueKeys): array
    {
        return array_map(
            static fn (array $sample): array => array_intersect_key(
                $sample,
                array_flip(['timestamp', ...$valueKeys]),
            ),
            $samples,
        );
    }
}
