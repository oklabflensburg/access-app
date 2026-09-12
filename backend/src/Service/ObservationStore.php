<?php

declare(strict_types=1);

namespace App\Service;

use App\Dto\ObservationInput;
use App\Dto\ObservationListQuery;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Types\Types;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\GoneHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

final class ObservationStore
{
    public function __construct(
        private readonly Connection $connection,
        private readonly PhotoStorage $photoStorage,
    ) {
    }

    /** @return array{id: string, revision: int} */
    public function save(ObservationInput $input, string $tokenHash): array
    {
        try {
            $capturedAt = new \DateTimeImmutable($input->createdAt);
        } catch (\DateMalformedStringException) {
            throw new BadRequestHttpException('Invalid creation date.');
        }
        $dateErrors = \DateTimeImmutable::getLastErrors();
        if (false !== $dateErrors && ($dateErrors['warning_count'] > 0 || $dateErrors['error_count'] > 0)) {
            throw new BadRequestHttpException('Invalid creation date.');
        }

        $payloadHash = hash('sha256', json_encode($input->toArray(), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
        $removedFiles = [];

        $this->connection->transactional(function (Connection $connection) use ($input, $tokenHash, $capturedAt, $payloadHash, &$removedFiles): void {
            $params = $this->observationParameters($input, $tokenHash, $capturedAt, $payloadHash);
            $inserted = $connection->executeStatement(<<<'SQL'
                INSERT INTO observations (
                    id, revision, edit_token_hash, payload_hash, deleted, captured_at, location,
                    location_accuracy_m, altitude_m, altitude_accuracy_m, heading_degrees,
                    speed_mps, location_timestamp_ms, wheelchair_accessible, ramp_available,
                    accessible_toilet, elevator_available, steps_at_entrance,
                    steps_count_is_minimum, surface, comment
                ) VALUES (
                    :id, :revision, :edit_token_hash, :payload_hash, FALSE, :captured_at,
                    ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
                    :location_accuracy_m, :altitude_m, :altitude_accuracy_m, :heading_degrees,
                    :speed_mps, :location_timestamp_ms, :wheelchair_accessible, :ramp_available,
                    :accessible_toilet, :elevator_available, :steps_at_entrance,
                    :steps_count_is_minimum, :surface, :comment
                ) ON CONFLICT (id) DO NOTHING
                SQL, $params, $this->observationParameterTypes());

            $current = $connection->fetchAssociative('SELECT * FROM observations WHERE id = :id FOR UPDATE', ['id' => $input->id]);
            if (false === $current) {
                throw new \RuntimeException('The observation could not be stored.');
            }

            if (0 === $inserted) {
                if (!hash_equals((string) $current['edit_token_hash'], $tokenHash)) {
                    throw new AccessDeniedHttpException('Edit token does not match this observation.');
                }
                if ($this->toBool($current['deleted'])) {
                    throw new GoneHttpException('This observation has been deleted.');
                }
                $currentRevision = (int) $current['revision'];
                if ($input->revision < $currentRevision
                    || ($input->revision === $currentRevision && !hash_equals((string) $current['payload_hash'], $payloadHash))) {
                    throw new ConflictHttpException('Revision conflict. Save a newer revision.');
                }
                if ($input->revision === $currentRevision) {
                    return;
                }

                $connection->executeStatement(<<<'SQL'
                    UPDATE observations SET
                        revision = :revision, payload_hash = :payload_hash, captured_at = :captured_at,
                        location = ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
                        location_accuracy_m = :location_accuracy_m, altitude_m = :altitude_m,
                        altitude_accuracy_m = :altitude_accuracy_m, heading_degrees = :heading_degrees,
                        speed_mps = :speed_mps, location_timestamp_ms = :location_timestamp_ms,
                        wheelchair_accessible = :wheelchair_accessible, ramp_available = :ramp_available,
                        accessible_toilet = :accessible_toilet, elevator_available = :elevator_available,
                        steps_at_entrance = :steps_at_entrance,
                        steps_count_is_minimum = :steps_count_is_minimum,
                        surface = :surface, comment = :comment, updated_at = NOW()
                    WHERE id = :id
                    SQL, $params, $this->observationParameterTypes());
            }

            $removedFiles = $this->syncMediaManifest($connection, $input);
            $this->syncSensors($connection, $input, $capturedAt);
        });

        $this->photoStorage->remove($removedFiles);

        return ['id' => $input->id, 'revision' => $input->revision];
    }

    /** @return array<string, mixed> */
    public function get(string $id): array
    {
        $this->assertUuid($id, 'Invalid observation id.');
        $row = $this->connection->fetchAssociative($this->selectSql().' WHERE id = :id AND NOT deleted', ['id' => $id]);
        if (false === $row) {
            throw new NotFoundHttpException('Observation not found.');
        }

        return $this->hydrate($row, true);
    }

    /** @return array{observations: list<array<string, mixed>>, nextCursor: string|null} */
    public function list(ObservationListQuery $query): array
    {
        $where = ['NOT deleted'];
        $params = [];
        if (null !== $query->cursor) {
            $where[] = 'id < :cursor';
            $params['cursor'] = $query->cursor;
        }
        if (null !== $query->bbox) {
            $bounds = explode(',', $query->bbox);
            if (4 !== count($bounds) || array_filter($bounds, 'is_numeric') !== $bounds) {
                throw new BadRequestHttpException('bbox must be west,south,east,north.');
            }
            [$west, $south, $east, $north] = array_map('floatval', $bounds);
            if ($west < -180 || $west > 180 || $east < -180 || $east > 180
                || $south < -90 || $south > 90 || $north < -90 || $north > 90 || $south > $north) {
                throw new BadRequestHttpException('Invalid bounding box.');
            }
            $where[] = 'ST_Y(location::geometry) BETWEEN :south AND :north';
            $where[] = $west > $east
                ? '(ST_X(location::geometry) >= :west OR ST_X(location::geometry) <= :east)'
                : 'ST_X(location::geometry) BETWEEN :west AND :east';
            $params += ['west' => $west, 'south' => $south, 'east' => $east, 'north' => $north];
        }

        $rows = $this->connection->fetchAllAssociative(
            $this->selectSql().' WHERE '.implode(' AND ', $where).' ORDER BY id DESC LIMIT '.($query->limit + 1),
            $params,
        );
        $hasMore = count($rows) > $query->limit;
        $rows = array_slice($rows, 0, $query->limit);

        return [
            'observations' => array_map(fn (array $row): array => $this->hydrate($row, false), $rows),
            'nextCursor' => $hasMore ? (string) end($rows)['id'] : null,
        ];
    }

    /** @return array{id: string, revision: int} */
    public function delete(string $id, int $revision, string $tokenHash): array
    {
        $this->assertUuid($id, 'Invalid observation id.');
        $removedFiles = [];

        $this->connection->transactional(function (Connection $connection) use ($id, $revision, $tokenHash, &$removedFiles): void {
            $connection->executeStatement(<<<'SQL'
                INSERT INTO observations (id, revision, edit_token_hash, deleted)
                VALUES (:id, :revision, :edit_token_hash, TRUE)
                ON CONFLICT (id) DO NOTHING
                SQL, ['id' => $id, 'revision' => $revision, 'edit_token_hash' => $tokenHash]);
            $current = $connection->fetchAssociative('SELECT * FROM observations WHERE id = :id FOR UPDATE', ['id' => $id]);
            if (false === $current) {
                throw new \RuntimeException('The deletion tombstone could not be stored.');
            }
            if (!hash_equals((string) $current['edit_token_hash'], $tokenHash)) {
                throw new AccessDeniedHttpException('Edit token does not match this observation.');
            }
            if ($revision < (int) $current['revision']
                || ($revision === (int) $current['revision'] && !$this->toBool($current['deleted']))) {
                throw new ConflictHttpException('Revision conflict.');
            }

            $removedFiles = $connection->fetchFirstColumn(
                'SELECT storage_key FROM media WHERE observation_id = :id AND storage_key IS NOT NULL',
                ['id' => $id],
            );
            $connection->executeStatement('DELETE FROM media WHERE observation_id = :id', ['id' => $id]);
            $connection->executeStatement('DELETE FROM sensor_measurements WHERE observation_id = :id', ['id' => $id]);
            $connection->executeStatement(<<<'SQL'
                UPDATE observations SET
                    revision = :revision, deleted = TRUE, payload_hash = NULL, captured_at = NULL,
                    location = NULL, location_accuracy_m = NULL, altitude_m = NULL,
                    altitude_accuracy_m = NULL, heading_degrees = NULL, speed_mps = NULL,
                    location_timestamp_ms = NULL, wheelchair_accessible = NULL, ramp_available = NULL,
                    accessible_toilet = NULL, elevator_available = NULL, steps_at_entrance = NULL,
                    steps_count_is_minimum = FALSE, surface = NULL, inclination_percent = NULL,
                    comment = NULL, map_feature_id = NULL, updated_at = NOW()
                WHERE id = :id
                SQL, ['id' => $id, 'revision' => $revision]);
        });

        $this->photoStorage->remove($removedFiles);

        return ['id' => $id, 'revision' => $revision];
    }

    /** @return array<string, mixed> */
    private function observationParameters(
        ObservationInput $input,
        string $tokenHash,
        \DateTimeImmutable $capturedAt,
        string $payloadHash,
    ): array {
        return [
            'id' => $input->id,
            'revision' => $input->revision,
            'edit_token_hash' => $tokenHash,
            'payload_hash' => $payloadHash,
            'captured_at' => $capturedAt->format('Y-m-d H:i:s.uP'),
            'longitude' => $input->location->longitude,
            'latitude' => $input->location->latitude,
            'location_accuracy_m' => $input->location->accuracy,
            'altitude_m' => $input->location->altitude,
            'altitude_accuracy_m' => $input->location->altitudeAccuracy,
            'heading_degrees' => $input->location->heading,
            'speed_mps' => $input->location->speed,
            'location_timestamp_ms' => $input->location->timestamp,
            'wheelchair_accessible' => $input->accessibility->wheelchairAccessible,
            'ramp_available' => $input->accessibility->ramp,
            'accessible_toilet' => $input->accessibility->accessibleToilet,
            'elevator_available' => $input->accessibility->elevator,
            'steps_at_entrance' => $input->accessibility->steps,
            'steps_count_is_minimum' => 3 === $input->accessibility->steps,
            'surface' => $input->accessibility->surface,
            'comment' => $input->comment,
        ];
    }

    /** @return array<string, string> */
    private function observationParameterTypes(): array
    {
        return [
            'wheelchair_accessible' => Types::BOOLEAN,
            'ramp_available' => Types::BOOLEAN,
            'accessible_toilet' => Types::BOOLEAN,
            'elevator_available' => Types::BOOLEAN,
            'steps_count_is_minimum' => Types::BOOLEAN,
        ];
    }

    /** @return list<string|null> */
    private function syncMediaManifest(Connection $connection, ObservationInput $input): array
    {
        $existing = $connection->fetchAllAssociative(
            'SELECT id, storage_key FROM media WHERE observation_id = :id',
            ['id' => $input->id],
        );
        $removed = [];
        foreach ($existing as $row) {
            if (!in_array((string) $row['id'], $input->photoIds, true)) {
                $removed[] = $row['storage_key'];
                $connection->executeStatement('DELETE FROM media WHERE id = :id', ['id' => $row['id']]);
            }
        }

        foreach ($input->photoIds as $order => $photoId) {
            $connection->executeStatement(<<<'SQL'
                INSERT INTO media (id, observation_id, sort_order)
                VALUES (:id, :observation_id, :sort_order)
                ON CONFLICT (id) DO NOTHING
                SQL, ['id' => $photoId, 'observation_id' => $input->id, 'sort_order' => $order]);
            $owner = $connection->fetchOne('SELECT observation_id FROM media WHERE id = :id', ['id' => $photoId]);
            if ($owner !== $input->id) {
                throw new ConflictHttpException('Photo id already belongs to another observation.');
            }
            $connection->executeStatement(
                'UPDATE media SET sort_order = :sort_order WHERE id = :id',
                ['id' => $photoId, 'sort_order' => $order],
            );
        }

        return $removed;
    }

    private function syncSensors(Connection $connection, ObservationInput $input, \DateTimeImmutable $capturedAt): void
    {
        $connection->executeStatement('DELETE FROM sensor_measurements WHERE observation_id = :id', ['id' => $input->id]);
        $payload = $input->toArray();
        if (isset($payload['noise'])) {
            $this->insertSensor(
                $connection,
                $input->id,
                'noise',
                $capturedAt,
                (int) round((float) $payload['noise']['duration'] * 1000),
                $payload['noise'],
                null,
            );
        }
        foreach (['motion', 'light'] as $type) {
            $samples = $payload[$type] ?? null;
            if (null === $samples) {
                continue;
            }
            $first = (float) ($samples[0]['timestamp'] ?? 0);
            $last = (float) ($samples[array_key_last($samples)]['timestamp'] ?? $first);
            $summary = 'motion' === $type
                ? ['units' => ['acceleration' => 'm/s²', 'rotation' => 'degrees/second', 'orientation' => 'degrees']]
                : ['units' => ['illuminance' => 'lux']];
            $this->insertSensor($connection, $input->id, $type, $capturedAt, (int) max(0, round($last - $first)), $summary, $samples);
        }
    }

    /** @param array<string, mixed> $summary @param list<array<string, mixed>>|null $samples */
    private function insertSensor(
        Connection $connection,
        string $observationId,
        string $type,
        \DateTimeImmutable $startedAt,
        int $durationMs,
        array $summary,
        ?array $samples,
    ): void {
        $connection->executeStatement(<<<'SQL'
            INSERT INTO sensor_measurements (
                observation_id, sensor_type, started_at, duration_ms, summary, samples
            ) VALUES (
                :observation_id, :sensor_type, :started_at, :duration_ms,
                CAST(:summary AS jsonb), CAST(:samples AS jsonb)
            )
            SQL, [
            'observation_id' => $observationId,
            'sensor_type' => $type,
            'started_at' => $startedAt->format('Y-m-d H:i:s.uP'),
            'duration_ms' => $durationMs,
            'summary' => json_encode($summary, JSON_THROW_ON_ERROR),
            'samples' => null === $samples ? null : json_encode($samples, JSON_THROW_ON_ERROR),
        ]);
    }

    private function selectSql(): string
    {
        return <<<'SQL'
            SELECT id, revision, captured_at,
                ST_Y(location::geometry) AS latitude,
                ST_X(location::geometry) AS longitude,
                location_accuracy_m, altitude_m, altitude_accuracy_m, heading_degrees,
                speed_mps, location_timestamp_ms, wheelchair_accessible, ramp_available,
                accessible_toilet, elevator_available, steps_at_entrance, surface, comment
            FROM observations
            SQL;
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function hydrate(array $row, bool $includeSamples): array
    {
        $payload = [
            'id' => (string) $row['id'],
            'revision' => (int) $row['revision'],
            'createdAt' => (new \DateTimeImmutable((string) $row['captured_at']))->format('Y-m-d\TH:i:s.vP'),
            'location' => [
                'latitude' => (float) $row['latitude'],
                'longitude' => (float) $row['longitude'],
                'accuracy' => $this->nullableFloat($row['location_accuracy_m']),
                'altitude' => $this->nullableFloat($row['altitude_m']),
                'altitudeAccuracy' => $this->nullableFloat($row['altitude_accuracy_m']),
                'heading' => $this->nullableFloat($row['heading_degrees']),
                'speed' => $this->nullableFloat($row['speed_mps']),
                'timestamp' => $this->nullableFloat($row['location_timestamp_ms']),
            ],
            'accessibility' => [
                'wheelchairAccessible' => $this->nullableBool($row['wheelchair_accessible']),
                'steps' => null === $row['steps_at_entrance'] ? null : (int) $row['steps_at_entrance'],
                'ramp' => $this->nullableBool($row['ramp_available']),
                'accessibleToilet' => $this->nullableBool($row['accessible_toilet']),
                'elevator' => $this->nullableBool($row['elevator_available']),
                'surface' => $row['surface'],
            ],
            'comment' => (string) ($row['comment'] ?? ''),
            'photoIds' => $this->connection->fetchFirstColumn(
                'SELECT id FROM media WHERE observation_id = :id ORDER BY sort_order, id',
                ['id' => $row['id']],
            ),
        ];

        $sensors = $this->connection->fetchAllAssociative(
            'SELECT sensor_type, summary, samples FROM sensor_measurements WHERE observation_id = :id',
            ['id' => $row['id']],
        );
        foreach ($sensors as $sensor) {
            if ('noise' === $sensor['sensor_type']) {
                $payload['noise'] = json_decode((string) $sensor['summary'], true, flags: JSON_THROW_ON_ERROR);
            } elseif ($includeSamples) {
                $payload[(string) $sensor['sensor_type']] = json_decode((string) $sensor['samples'], true, flags: JSON_THROW_ON_ERROR);
            }
        }

        return $payload;
    }

    private function assertUuid(string $value, string $message): void
    {
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $value)) {
            throw new BadRequestHttpException($message);
        }
    }

    private function nullableFloat(mixed $value): ?float
    {
        return null === $value ? null : (float) $value;
    }

    private function nullableBool(mixed $value): ?bool
    {
        return null === $value ? null : $this->toBool($value);
    }

    private function toBool(mixed $value): bool
    {
        return true === $value || 1 === $value || '1' === $value || 't' === $value || 'true' === $value;
    }
}
