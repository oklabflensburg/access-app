<?php

declare(strict_types=1);

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class LocationInput
{
    public function __construct(
        #[Assert\Range(min: -90, max: 90)]
        public float $latitude,
        #[Assert\Range(min: -180, max: 180)]
        public float $longitude,
        #[Assert\Range(min: 0, max: 100000000)]
        public ?float $accuracy = null,
        #[Assert\Range(min: -100000, max: 1000000)]
        public ?float $altitude = null,
        #[Assert\Range(min: 0, max: 100000000)]
        public ?float $altitudeAccuracy = null,
        #[Assert\Range(min: 0, max: 360)]
        public ?float $heading = null,
        #[Assert\Range(min: 0, max: 100000)]
        public ?float $speed = null,
        #[Assert\Range(min: 0, max: 1000000000000000)]
        public ?float $timestamp = null,
    ) {
    }

    /** @return array<string, float|null> */
    public function toArray(): array
    {
        return get_object_vars($this);
    }
}
