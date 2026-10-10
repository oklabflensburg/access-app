<?php

declare(strict_types=1);

namespace App\Repository;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Types\Types;

final class RoutingPreferenceRepository
{
    private const ID = 'routing';

    public function __construct(private readonly Connection $connection)
    {
    }

    /** @return array{id: string, wheelchair_accessible: bool, revision: int, updated_at: string}|null */
    public function find(): ?array
    {
        $row = $this->connection->fetchAssociative(<<<'SQL'
            SELECT id, wheelchair_accessible, revision, updated_at
            FROM routing_preferences WHERE id = 'routing'
            SQL);

        return false === $row ? null : $row;
    }

    /** @return array{id: string, wheelchair_accessible: bool, revision: int, updated_at: string}|null */
    public function findForUpdate(): ?array
    {
        $row = $this->connection->fetchAssociative(<<<'SQL'
            SELECT id, wheelchair_accessible, revision, updated_at
            FROM routing_preferences WHERE id = 'routing' FOR UPDATE
            SQL);

        return false === $row ? null : $row;
    }

    public function insert(bool $wheelchairAccessible): void
    {
        $this->connection->executeStatement(<<<'SQL'
            INSERT INTO routing_preferences (id, wheelchair_accessible, revision, updated_at)
            VALUES (:id, :wheelchair_accessible, 1, NOW())
            SQL, [
            'id' => self::ID,
            'wheelchair_accessible' => $wheelchairAccessible,
        ], [
            'id' => Types::TEXT,
            'wheelchair_accessible' => Types::BOOLEAN,
        ]);
    }

    public function update(bool $wheelchairAccessible): void
    {
        $this->connection->executeStatement(<<<'SQL'
            UPDATE routing_preferences
            SET wheelchair_accessible = :wheelchair_accessible, revision = revision + 1, updated_at = NOW()
            WHERE id = 'routing'
            SQL, [
            'wheelchair_accessible' => $wheelchairAccessible,
        ], [
            'wheelchair_accessible' => Types::BOOLEAN,
        ]);
    }
}
