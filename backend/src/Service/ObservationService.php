<?php

declare(strict_types=1);

namespace App\Service;

use App\Dto\ObservationInput;
use App\Dto\ObservationListQuery;
use App\Entity\Media;
use App\Entity\Observation;
use App\Entity\SensorMeasurement;
use App\Persistence\TransactionManager;
use App\Repository\MediaRepository;
use App\Repository\ObservationRepository;
use App\Repository\SensorMeasurementRepository;
use App\Storage\PhotoFileStorage;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\GoneHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

final class ObservationService
{
    public function __construct(
        private readonly ObservationRepository $observations,
        private readonly MediaRepository $media,
        private readonly SensorMeasurementRepository $sensors,
        private readonly TransactionManager $transactions,
        private readonly PhotoFileStorage $photoFiles,
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

        $this->transactions->transactional(function () use ($input, $tokenHash, $capturedAt, $payloadHash, &$removedFiles): void {
            $inserted = $this->observations->insertIfAbsent($input, $tokenHash, $capturedAt, $payloadHash);

            $current = $this->observations->findForUpdate($input->id);
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
                $this->observations->updateLocation(
                    $input->id,
                    $input->location->longitude,
                    $input->location->latitude,
                );
            }

            $removedFiles = $this->syncMediaManifest($current, $input);
            $this->syncSensors($current, $input, $capturedAt);
            $this->transactions->flush();
        });

        $this->photoFiles->remove($removedFiles);

        return ['id' => $input->id, 'revision' => $input->revision];
    }

    /** @return array<string, mixed> */
    public function get(string $id): array
    {
        $this->assertUuid($id, 'Invalid observation id.');
        $observation = $this->observations->find($id);
        if (null === $observation || $observation->isDeleted()) {
            throw new NotFoundHttpException('Observation not found.');
        }

        return $this->hydrate($observation, true);
    }

    /** @return array{observations: list<array<string, mixed>>, nextCursor: string|null} */
    public function list(ObservationListQuery $query): array
    {
        $bounds = null;
        if (null !== $query->bbox) {
            $parts = explode(',', $query->bbox);
            if (4 !== count($parts) || array_filter($parts, 'is_numeric') !== $parts) {
                throw new BadRequestHttpException('bbox must be west,south,east,north.');
            }
            [$west, $south, $east, $north] = array_map('floatval', $parts);
            if ($west < -180 || $west > 180 || $east < -180 || $east > 180
                || $south < -90 || $south > 90 || $north < -90 || $north > 90 || $south > $north) {
                throw new BadRequestHttpException('Invalid bounding box.');
            }
            $bounds = [$west, $south, $east, $north];
        }

        $observations = $this->observations->findActivePage($query->cursor, $query->limit + 1, $bounds);
        $hasMore = count($observations) > $query->limit;
        $observations = array_slice($observations, 0, $query->limit);
        $media = $this->groupMedia($this->media->findForObservations($observations));
        $sensors = $this->groupSensors($this->sensors->findForObservations($observations));

        return [
            'observations' => array_map(
                fn (Observation $observation): array => $this->hydrate(
                    $observation,
                    false,
                    $media[$observation->getId()] ?? [],
                    $sensors[$observation->getId()] ?? [],
                ),
                $observations,
            ),
            'nextCursor' => $hasMore ? end($observations)->getId() : null,
        ];
    }

    /** @return array{id: string, revision: int} */
    public function delete(string $id, int $revision, string $tokenHash): array
    {
        $this->assertUuid($id, 'Invalid observation id.');
        $removedFiles = [];

        $this->transactions->transactional(function () use ($id, $revision, $tokenHash, &$removedFiles): void {
            $this->observations->insertTombstoneIfAbsent($id, $revision, $tokenHash);
            $current = $this->observations->findForUpdate($id);
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

            foreach ($this->media->findForObservation($current) as $media) {
                $storageKey = $media->getStorageKey();
                if (null !== $storageKey) {
                    $removedFiles[] = $storageKey;
                }
                $this->media->remove($media);
            }
            foreach ($this->sensors->findForObservation($current) as $sensor) {
                $this->sensors->remove($sensor);
            }
            $current->markDeleted($revision);
            $this->transactions->flush();
        });

        $this->photoFiles->remove($removedFiles);

        return ['id' => $id, 'revision' => $revision];
    }

    /** @return list<string|null> */
    private function syncMediaManifest(Observation $observation, ObservationInput $input): array
    {
        $removed = [];
        foreach ($this->media->findForObservation($observation) as $media) {
            if (!in_array($media->getId(), $input->photoIds, true)) {
                $removed[] = $media->getStorageKey();
                $this->media->remove($media);
            }
        }

        foreach ($input->photoIds as $order => $photoId) {
            $this->media->insertIfAbsent($photoId, $input->id, $order);
            $media = $this->media->findMedia($photoId);
            if (null === $media || !$media->belongsTo($input->id)) {
                throw new ConflictHttpException('Photo id already belongs to another observation.');
            }
            $media->setSortOrder($order);
        }

        return $removed;
    }

    private function syncSensors(Observation $observation, ObservationInput $input, \DateTimeImmutable $capturedAt): void
    {
        foreach ($this->sensors->findForObservation($observation) as $sensor) {
            $this->sensors->remove($sensor);
        }
        $this->transactions->flush();

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
        $this->sensors->persist(new SensorMeasurement(
            $observation,
            $type,
            $startedAt,
            $durationMs,
            $summary,
            $samples,
        ));
    }

    /**
     * @param list<Media>|null $media
     * @param list<SensorMeasurement>|null $sensors
     *
     * @return array<string, mixed>
     */
    private function hydrate(
        Observation $observation,
        bool $includeSamples,
        ?array $media = null,
        ?array $sensors = null,
    ): array
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
                $media ?? $this->media->findForObservation($observation),
            ),
        ];

        $sensors ??= $this->sensors->findForObservation($observation);
        foreach ($sensors as $sensor) {
            if ('noise' === $sensor->getType()) {
                $payload['noise'] = $sensor->getSummary();
            } elseif ($includeSamples) {
                $payload[$sensor->getType()] = $sensor->getSamples();
            }
        }

        return $payload;
    }

    /** @param list<Media> $media @return array<string, list<Media>> */
    private function groupMedia(array $media): array
    {
        $grouped = [];
        foreach ($media as $item) {
            $grouped[$item->getObservation()->getId()][] = $item;
        }

        return $grouped;
    }

    /** @param list<SensorMeasurement> $sensors @return array<string, list<SensorMeasurement>> */
    private function groupSensors(array $sensors): array
    {
        $grouped = [];
        foreach ($sensors as $sensor) {
            $grouped[$sensor->getObservation()->getId()][] = $sensor;
        }

        return $grouped;
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
