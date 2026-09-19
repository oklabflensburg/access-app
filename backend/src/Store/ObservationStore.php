<?php

declare(strict_types=1);

namespace App\Store;

use App\Dto\ObservationInput;
use App\Entity\Media;
use App\Entity\Observation;
use App\Entity\SensorMeasurement;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\LockMode;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\EntityManagerInterface;

final class ObservationStore
{
    public function __construct(
        private readonly Connection $connection,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /** @template T @param callable(): T $operation @return T */
    public function transactional(callable $operation): mixed
    {
        return $this->entityManager->wrapInTransaction(static fn (): mixed => $operation());
    }

    public function insertIfAbsent(
        ObservationInput $input,
        string $tokenHash,
        \DateTimeImmutable $capturedAt,
        string $payloadHash,
    ): int {
        return $this->connection->executeStatement(<<<'SQL'
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
            SQL, [
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
        ], [
            'wheelchair_accessible' => Types::BOOLEAN,
            'ramp_available' => Types::BOOLEAN,
            'accessible_toilet' => Types::BOOLEAN,
            'elevator_available' => Types::BOOLEAN,
            'steps_count_is_minimum' => Types::BOOLEAN,
        ]);
    }

    public function find(string $id): ?Observation
    {
        return $this->entityManager->find(Observation::class, $id);
    }

    public function findForUpdate(string $id): ?Observation
    {
        $this->entityManager->clear(Observation::class);

        return $this->entityManager->find(Observation::class, $id, LockMode::PESSIMISTIC_WRITE);
    }

    public function updateLocation(string $id, float $longitude, float $latitude): void
    {
        $this->connection->executeStatement(
            'UPDATE observations SET location = ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography WHERE id = :id',
            ['id' => $id, 'longitude' => $longitude, 'latitude' => $latitude],
        );
    }

    /**
     * @param array{0: float, 1: float, 2: float, 3: float}|null $bounds
     *
     * @return list<Observation>
     */
    public function findActivePage(?string $cursor, int $limit, ?array $bounds): array
    {
        if (null === $bounds) {
            $builder = $this->entityManager->createQueryBuilder()
                ->select('observation')
                ->from(Observation::class, 'observation')
                ->where('observation.deleted = false')
                ->orderBy('observation.id', 'DESC')
                ->setMaxResults($limit);
            if (null !== $cursor) {
                $builder->andWhere('observation.id < :cursor')->setParameter('cursor', $cursor);
            }

            return $builder->getQuery()->getResult();
        }

        [$west, $south, $east, $north] = $bounds;
        $where = [
            'NOT deleted',
            'ST_Y(location::geometry) BETWEEN :south AND :north',
            $west > $east
                ? '(ST_X(location::geometry) >= :west OR ST_X(location::geometry) <= :east)'
                : 'ST_X(location::geometry) BETWEEN :west AND :east',
        ];
        $params = ['west' => $west, 'south' => $south, 'east' => $east, 'north' => $north];
        if (null !== $cursor) {
            $where[] = 'id < :cursor';
            $params['cursor'] = $cursor;
        }
        $ids = $this->connection->fetchFirstColumn(
            'SELECT id FROM observations WHERE '.implode(' AND ', $where).' ORDER BY id DESC LIMIT '.$limit,
            $params,
        );
        if ([] === $ids) {
            return [];
        }

        return $this->entityManager->createQueryBuilder()
            ->select('observation')
            ->from(Observation::class, 'observation')
            ->where('observation.id IN (:ids)')
            ->setParameter('ids', $ids)
            ->orderBy('observation.id', 'DESC')
            ->getQuery()
            ->getResult();
    }

    public function insertTombstoneIfAbsent(string $id, int $revision, string $tokenHash): void
    {
        $this->connection->executeStatement(<<<'SQL'
            INSERT INTO observations (id, revision, edit_token_hash, deleted)
            VALUES (:id, :revision, :edit_token_hash, TRUE)
            ON CONFLICT (id) DO NOTHING
            SQL, ['id' => $id, 'revision' => $revision, 'edit_token_hash' => $tokenHash]);
    }

    /** @return list<Media> */
    public function findMedia(Observation $observation): array
    {
        return $this->entityManager->getRepository(Media::class)->findBy(
            ['observation' => $observation],
            ['sortOrder' => 'ASC', 'id' => 'ASC'],
        );
    }

    /** @param list<Observation> $observations @return list<Media> */
    public function findMediaForObservations(array $observations): array
    {
        if ([] === $observations) {
            return [];
        }

        return $this->entityManager->createQueryBuilder()
            ->select('media')
            ->from(Media::class, 'media')
            ->where('media.observation IN (:observations)')
            ->setParameter('observations', $observations)
            ->orderBy('media.sortOrder', 'ASC')
            ->addOrderBy('media.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    public function insertMediaIfAbsent(string $id, string $observationId, int $sortOrder): void
    {
        $this->connection->executeStatement(<<<'SQL'
            INSERT INTO media (id, observation_id, sort_order)
            VALUES (:id, :observation_id, :sort_order)
            ON CONFLICT (id) DO NOTHING
            SQL, ['id' => $id, 'observation_id' => $observationId, 'sort_order' => $sortOrder]);
    }

    public function findMediaById(string $id): ?Media
    {
        return $this->entityManager->find(Media::class, $id);
    }

    public function removeMedia(Media $media): void
    {
        $this->entityManager->remove($media);
    }

    /** @return list<SensorMeasurement> */
    public function findSensors(Observation $observation): array
    {
        return $this->entityManager->getRepository(SensorMeasurement::class)->findBy(['observation' => $observation]);
    }

    /** @param list<Observation> $observations @return list<SensorMeasurement> */
    public function findSensorsForObservations(array $observations): array
    {
        if ([] === $observations) {
            return [];
        }

        return $this->entityManager->createQueryBuilder()
            ->select('sensor')
            ->from(SensorMeasurement::class, 'sensor')
            ->where('sensor.observation IN (:observations)')
            ->setParameter('observations', $observations)
            ->orderBy('sensor.type', 'ASC')
            ->getQuery()
            ->getResult();
    }

    public function persistSensor(SensorMeasurement $sensor): void
    {
        $this->entityManager->persist($sensor);
    }

    public function removeSensor(SensorMeasurement $sensor): void
    {
        $this->entityManager->remove($sensor);
    }

    public function flush(): void
    {
        $this->entityManager->flush();
    }
}
