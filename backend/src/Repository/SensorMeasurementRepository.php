<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Observation;
use App\Entity\SensorMeasurement;
use Doctrine\ORM\EntityManagerInterface;

final class SensorMeasurementRepository
{
    public function __construct(private readonly EntityManagerInterface $entityManager)
    {
    }

    /** @return list<SensorMeasurement> */
    public function findForObservation(Observation $observation): array
    {
        return $this->entityManager->getRepository(SensorMeasurement::class)->findBy(['observation' => $observation]);
    }

    /** @param list<Observation> $observations @return list<SensorMeasurement> */
    public function findForObservations(array $observations): array
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

    public function persist(SensorMeasurement $sensor): void
    {
        $this->entityManager->persist($sensor);
    }

    public function remove(SensorMeasurement $sensor): void
    {
        $this->entityManager->remove($sensor);
    }
}
