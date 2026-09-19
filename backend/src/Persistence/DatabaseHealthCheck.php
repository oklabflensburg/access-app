<?php

declare(strict_types=1);

namespace App\Persistence;

use Doctrine\DBAL\Connection;

final class DatabaseHealthCheck
{
    public function __construct(private readonly Connection $connection)
    {
    }

    public function postgisVersion(): string
    {
        return (string) $this->connection->fetchOne('SELECT PostGIS_Version()');
    }
}
