<?php

declare(strict_types=1);

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class RouteInput
{
    public function __construct(
        #[Assert\Valid]
        public RoutePointInput $start,
        #[Assert\Valid]
        public RoutePointInput $end,
        #[Assert\Type('bool')]
        public bool $wheelchairAccessible = false,
        #[Assert\Type('array')]
        #[Assert\Count(max: 200)]
        public array $staircaseAreas = [],
    ) {
    }
}
