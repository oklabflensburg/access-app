<?php

declare(strict_types=1);

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class MapFeatureListQuery
{
    public function __construct(
        #[Assert\Range(min: 1, max: 200)]
        public int $limit = 100,
    ) {
    }
}
