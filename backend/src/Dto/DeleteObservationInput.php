<?php

declare(strict_types=1);

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class DeleteObservationInput
{
    public function __construct(
        #[Assert\Range(min: 1, max: 2147483647)]
        public int $revision,
    ) {
    }
}
