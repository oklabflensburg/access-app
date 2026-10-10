<?php

declare(strict_types=1);

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class RoutingPreferenceInput
{
    public function __construct(
        #[Assert\Type('bool')]
        public bool $wheelchairAccessible,
        #[Assert\Positive]
        public int $revision,
    ) {
    }
}
