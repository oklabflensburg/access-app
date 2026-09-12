<?php

declare(strict_types=1);

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class AccessibilityInput
{
    public function __construct(
        public ?bool $wheelchairAccessible,
        #[Assert\Choice(choices: [0, 1, 2, 3, null], strict: true)]
        public ?int $steps,
        public ?bool $ramp,
        public ?bool $accessibleToilet,
        public ?bool $elevator,
        #[Assert\Choice(choices: ['smooth', 'uneven', 'cobblestone', 'gravel', 'other', null], strict: true)]
        public ?string $surface,
    ) {
    }

    /** @return array<string, bool|int|string|null> */
    public function toArray(): array
    {
        return get_object_vars($this);
    }
}
