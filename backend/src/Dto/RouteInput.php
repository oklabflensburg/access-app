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
        #[Assert\Type('array')]
        public array $featurePriorities = [],
        #[Assert\Type('array')]
        #[Assert\Count(max: 200)]
        public array $priorityAreas = [],
    ) {
    }
}
