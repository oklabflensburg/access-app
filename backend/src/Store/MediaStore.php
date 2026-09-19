<?php

declare(strict_types=1);

namespace App\Store;

use App\Entity\Media;
use App\Entity\Observation;
use Doctrine\DBAL\LockMode;
use Doctrine\ORM\EntityManagerInterface;

final class MediaStore
{
    public function __construct(private readonly EntityManagerInterface $entityManager)
    {
    }

    /** @template T @param callable(): T $operation @return T */
    public function transactional(callable $operation): mixed
    {
        return $this->entityManager->wrapInTransaction(static fn (): mixed => $operation());
    }

    public function clear(): void
    {
        $this->entityManager->clear(Observation::class);
        $this->entityManager->clear(Media::class);
    }

    public function findObservationForUpdate(string $id): ?Observation
    {
        return $this->entityManager->find(Observation::class, $id, LockMode::PESSIMISTIC_WRITE);
    }

    public function findMediaForUpdate(string $id): ?Media
    {
        return $this->entityManager->find(Media::class, $id, LockMode::PESSIMISTIC_WRITE);
    }

    public function findMedia(string $id): ?Media
    {
        return $this->entityManager->find(Media::class, $id);
    }
}
