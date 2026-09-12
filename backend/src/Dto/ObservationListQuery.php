<?php

declare(strict_types=1);

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class ObservationListQuery
{
    public function __construct(
        #[Assert\Range(min: 1, max: 200)]
        public int $limit = 100,
        #[Assert\Uuid(versions: Assert\Uuid::V4_RANDOM)]
        public ?string $cursor = null,
        public ?string $bbox = null,
    ) {
    }
}
