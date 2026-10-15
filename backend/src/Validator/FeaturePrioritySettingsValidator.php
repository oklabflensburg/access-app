<?php

declare(strict_types=1);

namespace App\Validator;

use App\Service\FeaturePriorities;
use App\Service\MapFeatureTypes;
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;

final class FeaturePrioritySettingsValidator extends ConstraintValidator
{
    public function __construct(
        private readonly MapFeatureTypes $featureTypes,
    ) {
    }

    public function validate(mixed $value, Constraint $constraint): void
    {
        if (!$constraint instanceof FeaturePrioritySettings || !is_array($value)) {
            return;
        }

        foreach ($value as $type => $priority) {
            if (!is_string($type) || !$this->featureTypes->isValid($type)
                || !is_string($priority) || !in_array($priority, FeaturePriorities::PRIORITIES, true)) {
                $this->context->buildViolation($constraint->message)
                    ->addViolation();

                return;
            }
        }
    }
}
