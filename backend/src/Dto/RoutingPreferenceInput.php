<?php

declare(strict_types=1);

namespace App\Dto;

use App\Service\FeaturePriorities;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Context\ExecutionContextInterface;

final readonly class RoutingPreferenceInput
{
    public function __construct(
        #[Assert\Type('array')]
        public array $featurePriorities,
        #[Assert\Positive]
        public int $revision,
    ) {
    }

    #[Assert\Callback]
    public function validateFeaturePriorities(ExecutionContextInterface $context): void
    {
        foreach ($this->featurePriorities as $type => $priority) {
            if (!is_string($type) || !in_array($type, FeaturePriorities::TYPES, true)
                || !is_string($priority) || !in_array($priority, FeaturePriorities::PRIORITIES, true)) {
                $context->buildViolation('Feature priorities must map known feature types to neutral, avoid, reduce, or prefer.')
                    ->atPath('featurePriorities')->addViolation();

                return;
            }
        }
    }
}
