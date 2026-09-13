<?php

declare(strict_types=1);

namespace App\Service;

use App\Dto\ObservationInput;
use App\Dto\ObservationListQuery;
use App\Entity\Media;
use App\Entity\Observation;
use App\Entity\SensorMeasurement;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\LockMode;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\GoneHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

final class ObservationStore
{
    public function __construct(
        private readonly Connection $connection,
        private readonly EntityManagerInterface $entityManager,
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

            $this->entityManager->clear(Observation::class);
            $current = $this->entityManager->find(Observation::class, $input->id, LockMode::PESSIMISTIC_WRITE);
            if (null === $current) {
                throw new \RuntimeException('The observation could not be stored.');
            }

            if (0 === $inserted) {
                if (!hash_equals($current->getEditTokenHash(), $tokenHash)) {
                    throw new AccessDeniedHttpException('Edit token does not match this observation.');
                }
                if ($current->isDeleted()) {
                    throw new GoneHttpException('This observation has been deleted.');
                }
                $currentRevision = $current->getRevision();
                if ($input->revision < $currentRevision
                    || ($input->revision === $currentRevision && !hash_equals((string) $current->getPayloadHash(), $payloadHash))) {
                    throw new ConflictHttpException('Revision conflict. Save a newer revision.');
                }
                if ($input->revision === $currentRevision) {
                    return;
                }

                $current->applyPayload($input, $capturedAt, $payloadHash);
                $connection->executeStatement(
                    'UPDATE observations SET location = ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography WHERE id = :id',
                    [
                        'id' => $input->id,
                        'longitude' => $input->location->longitude,
                        'latitude' => $input->location->latitude,
                    ],
                );
            }

            $removedFiles = $this->syncMediaManifest($connection, $current, $input);
            $this->syncSensors($current, $input, $capturedAt);
            $this->entityManager->flush();
        });

        $this->photoStorage->remove($removedFiles);

        return ['id' => $input->id, 'revision' => $input->revision];
    }

    /** @return array<string, mixed> */
    public function get(string $id): array
    {
        $this->assertUuid($id, 'Invalid observation id.');
        $observation = $this->entityManager->find(Observation::class, $id);
        if (null === $observation || $observation->isDeleted()) {
            throw new NotFoundHttpException('Observation not found.');
        }

        return $this->hydrate($observation, true);
    }

    /** @return array{observations: list<array<string, mixed>>, nextCursor: string|null} */
    public function list(ObservationListQuery $query): array
    {
        $observationIds = null;
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
            $where = [
                'NOT deleted',
                'ST_Y(location::geometry) BETWEEN :south AND :north',
                $west > $east
                    ? '(ST_X(location::geometry) >= :west OR ST_X(location::geometry) <= :east)'
                    : 'ST_X(location::geometry) BETWEEN :west AND :east',
            ];
            $params = ['west' => $west, 'south' => $south, 'east' => $east, 'north' => $north];
            if (null !== $query->cursor) {
                $where[] = 'id < :cursor';
                $params['cursor'] = $query->cursor;
            }
            $observationIds = $this->connection->fetchFirstColumn(
                'SELECT id FROM observations WHERE '.implode(' AND ', $where)
                .' ORDER BY id DESC LIMIT '.($query->limit + 1),
                $params,
            );
        }

        if (null === $observationIds) {
            $builder = $this->entityManager->createQueryBuilder()
                ->select('observation')
                ->from(Observation::class, 'observation')
                ->where('observation.deleted = false')
                ->orderBy('observation.id', 'DESC')
                ->setMaxResults($query->limit + 1);
            if (null !== $query->cursor) {
                $builder->andWhere('observation.id < :cursor')->setParameter('cursor', $query->cursor);
            }
            $observations = $builder->getQuery()->getResult();
        } else {
            $observations = array_values(array_filter(array_map(
                fn (string $id): ?Observation => $this->entityManager->find(Observation::class, $id),
                $observationIds,
            )));
        }
        $hasMore = count($observations) > $query->limit;
        $observations = array_slice($observations, 0, $query->limit);

        return [
            'observations' => array_map(fn (Observation $observation): array => $this->hydrate($observation, false), $observations),
            'nextCursor' => $hasMore ? end($observations)->getId() : null,
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
            $this->entityManager->clear(Observation::class);
            $current = $this->entityManager->find(Observation::class, $id, LockMode::PESSIMISTIC_WRITE);
            if (null === $current) {
                throw new \RuntimeException('The deletion tombstone could not be stored.');
            }
            if (!hash_equals($current->getEditTokenHash(), $tokenHash)) {
                throw new AccessDeniedHttpException('Edit token does not match this observation.');
            }
            if ($revision < $current->getRevision()
                || ($revision === $current->getRevision() && !$current->isDeleted())) {
                throw new ConflictHttpException('Revision conflict.');
            }

            foreach ($this->entityManager->getRepository(Media::class)->findBy(['observation' => $current]) as $media) {
                $storageKey = $media->getStorageKey();
                if (null !== $storageKey) {
                    $removedFiles[] = $storageKey;
                }
                $this->entityManager->remove($media);
            }
            foreach ($this->entityManager->getRepository(SensorMeasurement::class)->findBy(['observation' => $current]) as $sensor) {
                $this->entityManager->remove($sensor);
            }
            $current->markDeleted($revision);
            $this->entityManager->flush();
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
    private function syncMediaManifest(Connection $connection, Observation $observation, ObservationInput $input): array
    {
        $removed = [];
        foreach ($this->entityManager->getRepository(Media::class)->findBy(['observation' => $observation]) as $media) {
            if (!in_array($media->getId(), $input->photoIds, true)) {
                $removed[] = $media->getStorageKey();
                $this->entityManager->remove($media);
            }
        }

        foreach ($input->photoIds as $order => $photoId) {
            $connection->executeStatement(<<<'SQL'
                INSERT INTO media (id, observation_id, sort_order)
                VALUES (:id, :observation_id, :sort_order)
                ON CONFLICT (id) DO NOTHING
                SQL, ['id' => $photoId, 'observation_id' => $input->id, 'sort_order' => $order]);
            $media = $this->entityManager->find(Media::class, $photoId);
            if (null === $media || !$media->belongsTo($input->id)) {
                throw new ConflictHttpException('Photo id already belongs to another observation.');
            }
            $media->setSortOrder($order);
        }

        return $removed;
    }

    private function syncSensors(Observation $observation, ObservationInput $input, \DateTimeImmutable $capturedAt): void
    {
        foreach ($this->entityManager->getRepository(SensorMeasurement::class)->findBy(['observation' => $observation]) as $sensor) {
            $this->entityManager->remove($sensor);
        }
        $this->entityManager->flush();

        $payload = $input->toArray();
        if (isset($payload['noise'])) {
            $this->insertSensor(
                $observation,
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
            $this->insertSensor($observation, $type, $capturedAt, (int) max(0, round($last - $first)), $summary, $samples);
        }
    }

    /** @param array<string, mixed> $summary @param list<array<string, mixed>>|null $samples */
    private function insertSensor(
        Observation $observation,
        string $type,
        \DateTimeImmutable $startedAt,
        int $durationMs,
        array $summary,
        ?array $samples,
    ): void {
        $this->entityManager->persist(new SensorMeasurement(
            $observation,
            $type,
            $startedAt,
            $durationMs,
            $summary,
            $samples,
        ));
    }

    /** @return array<string, mixed> */
    private function hydrate(Observation $observation, bool $includeSamples): array
    {
        $row = $observation->toRow();
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
            'photoIds' => array_map(
                static fn (Media $media): string => $media->getId(),
                $this->entityManager->getRepository(Media::class)->findBy(
                    ['observation' => $observation],
                    ['sortOrder' => 'ASC', 'id' => 'ASC'],
                ),
            ),
        ];

        $sensors = $this->entityManager->getRepository(SensorMeasurement::class)->findBy(['observation' => $observation]);
        foreach ($sensors as $sensor) {
            if ('noise' === $sensor->getType()) {
                $payload['noise'] = $sensor->getSummary();
            } elseif ($includeSamples) {
                $payload[$sensor->getType()] = $sensor->getSamples();
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
