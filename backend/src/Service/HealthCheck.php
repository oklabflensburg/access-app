<?php

namespace App\Service;

use Doctrine\DBAL\Connection;

final readonly class HealthCheck
{
    public function __construct(private Connection $connection)
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
            'postgis' => (string) $this->connection->fetchOne('SELECT PostGIS_Version()'),
        ];
    }
}
