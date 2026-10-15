<?php

declare(strict_types=1);

namespace App\Validator;

use Symfony\Component\Validator\Constraint;

/**
 * Validates that feature priorities map configured feature types to known
 * priorities; the accepted types come from the map feature config.
 */
#[\Attribute(\Attribute::TARGET_PROPERTY | \Attribute::TARGET_METHOD)]
final class FeaturePrioritySettings extends Constraint
{
    public string $message = 'Feature priorities must map known feature types to neutral, avoid, reduce, or prefer.';

    public function getTargets(): string
    {
        return self::PROPERTY_CONSTRAINT;
    }
}
