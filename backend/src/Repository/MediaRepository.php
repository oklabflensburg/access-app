<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Media;
use App\Entity\Observation;
use Doctrine\DBAL\LockMode;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;

final class MediaRepository
{
    public function __construct(
        private readonly Connection $connection,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    public function findMediaForUpdate(string $id): ?Media
    {
        $this->entityManager->clear(Media::class);

        return $this->entityManager->find(Media::class, $id, LockMode::PESSIMISTIC_WRITE);
    }

    public function findMedia(string $id): ?Media
    {
        return $this->entityManager->find(Media::class, $id);
    }

    /** @return list<Media> */
    public function findForObservation(Observation $observation): array
    {
        return $this->entityManager->getRepository(Media::class)->findBy(
            ['observation' => $observation],
            ['sortOrder' => 'ASC', 'id' => 'ASC'],
        );
    }

    /** @param list<Observation> $observations @return list<Media> */
    public function findForObservations(array $observations): array
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

    public function insertIfAbsent(string $id, string $observationId, int $sortOrder): void
    {
        $this->connection->executeStatement(<<<'SQL'
            INSERT INTO media (id, observation_id, sort_order)
            VALUES (:id, :observation_id, :sort_order)
            ON CONFLICT (id) DO NOTHING
            SQL, ['id' => $id, 'observation_id' => $observationId, 'sort_order' => $sortOrder]);
    }

    public function remove(Media $media): void
    {
        $this->entityManager->remove($media);
    }
}
