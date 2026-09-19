<?php

namespace App\Service;

use App\Persistence\DatabaseHealthCheck;

final readonly class HealthCheck
{
    public function __construct(private DatabaseHealthCheck $database)
    {
    }

    /**
     * @return array{status: string, database: string, postgis: string}
     */
    public function check(): array
    {
        return [
            'status' => 'ok',
            'database' => 'ok',
            'postgis' => $this->database->postgisVersion(),
        ];
    }
}
