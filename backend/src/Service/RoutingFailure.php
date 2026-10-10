<?php

declare(strict_types=1);

namespace App\Service;

final class RoutingFailure extends \RuntimeException
{
    public function __construct(public readonly string $reason, public readonly int $status)
    {
        parent::__construct($reason);
    }
}
