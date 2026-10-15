<?php

declare(strict_types=1);

namespace App\Dto;

use App\Validator\FeaturePrioritySettings;
use Symfony\Component\Validator\Constraints as Assert;

final readonly class RoutingPreferenceInput
{
    public function __construct(
        #[Assert\Type('array')]
        #[FeaturePrioritySettings]
        public array $featurePriorities,
        #[Assert\Positive]
        public int $revision,
    ) {
    }
}
