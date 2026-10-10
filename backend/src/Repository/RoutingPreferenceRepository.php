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

    /** @return array{id: string, feature_priorities: mixed, revision: int, updated_at: string}|null */
    public function find(): ?array
    {
        $row = $this->connection->fetchAssociative(<<<'SQL'
            SELECT id, feature_priorities, revision, updated_at
            FROM routing_preferences WHERE id = 'routing'
            SQL);

        return false === $row ? null : $row;
    }

    /** @return array{id: string, feature_priorities: mixed, revision: int, updated_at: string}|null */
    public function findForUpdate(): ?array
    {
        $row = $this->connection->fetchAssociative(<<<'SQL'
            SELECT id, feature_priorities, revision, updated_at
            FROM routing_preferences WHERE id = 'routing' FOR UPDATE
            SQL);

        return false === $row ? null : $row;
    }

    /** @param array<string, string> $featurePriorities */
    public function insert(array $featurePriorities): void
    {
        $this->connection->executeStatement(<<<'SQL'
            INSERT INTO routing_preferences (id, feature_priorities, revision, updated_at)
            VALUES (:id, :feature_priorities, 1, NOW())
            SQL, [
            'id' => self::ID,
            'feature_priorities' => $featurePriorities,
        ], [
            'id' => Types::TEXT,
            'feature_priorities' => Types::JSON,
        ]);
    }

    /** @param array<string, string> $featurePriorities */
    public function update(array $featurePriorities): void
    {
        $this->connection->executeStatement(<<<'SQL'
            UPDATE routing_preferences
            SET feature_priorities = :feature_priorities, revision = revision + 1, updated_at = NOW()
            WHERE id = 'routing'
            SQL, [
            'feature_priorities' => $featurePriorities,
        ], [
            'feature_priorities' => Types::JSON,
        ]);
    }
}
