<?php

declare(strict_types=1);

namespace App\Service;

use App\Dto\MapFeatureInput;
use App\Dto\MapFeatureListQuery;
use App\Persistence\TransactionManager;
use App\Repository\MapFeatureRepository;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\GoneHttpException;

final class MapFeatureService
{
    public function __construct(
        private readonly MapFeatureRepository $features,
        private readonly TransactionManager $transactions,
    ) {
    }

    /** @return array{id: string} */
    public function save(MapFeatureInput $input, string $tokenHash): array
    {
        try {
            $createdAt = new \DateTimeImmutable($input->createdAt);
        } catch (\DateMalformedStringException) {
            throw new BadRequestHttpException('Invalid creation date.');
        }
        $geometry = json_encode($input->geometry, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        if (!$this->features->isValidPolygon($geometry)) {
            throw new BadRequestHttpException('The polygon is not a valid, non-self-intersecting area.');
        }
        if ($input->parentFeatureId !== null && !$this->features->isContainedBy($geometry, $input->parentFeatureId)) {
            throw new BadRequestHttpException('A child map feature must be contained within its parent feature.');
        }

        $this->transactions->transactional(function () use ($input, $tokenHash, $createdAt, $geometry): void {
            $inserted = $this->features->insertIfAbsent($input, $tokenHash, $createdAt, $geometry);
            if (1 === $inserted) {
                return;
            }

            $current = $this->features->findForUpdate($input->id, $geometry);
            if (false === $current) {
                throw new BadRequestHttpException('Unknown map feature type.');
            }
            if (!is_string($current['edit_token_hash'])
                || !hash_equals($current['edit_token_hash'], $tokenHash)) {
                throw new AccessDeniedHttpException('Edit token does not match this map feature.');
            }
            if ('removed' === $current['status']) {
                throw new GoneHttpException('This map feature has been deleted.');
            }
            if (!$current['same_geometry']) {
                throw new ConflictHttpException('A different map feature already uses this id.');
            }
            if (($current['parent_feature_id'] ?? null) !== $input->parentFeatureId) {
                throw new ConflictHttpException('A different parent map feature already uses this id.');
            }
            if ($current['type'] !== $input->type || $current['name'] !== $input->name) {
                $updated = $this->features->updateProperties($input->id, $input->type, $input->name);
                if (1 !== $updated) {
                    throw new BadRequestHttpException('Unknown map feature type.');
                }
            }
        });

        return ['id' => $input->id];
    }

    /** @return array{id: string} */
    public function delete(string $id, string $tokenHash): array
    {
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $id)) {
            throw new BadRequestHttpException('Invalid map feature id.');
        }

        $this->transactions->transactional(function () use ($id, $tokenHash): void {
            $this->features->insertTombstoneIfAbsent($id, $tokenHash);
            $current = $this->features->findByIdForUpdate($id);
            if (false === $current) {
                throw new \RuntimeException('The map feature deletion tombstone could not be stored.');
            }
            if (!is_string($current['edit_token_hash'])
                || !hash_equals($current['edit_token_hash'], $tokenHash)) {
                throw new AccessDeniedHttpException('Edit token does not match this map feature.');
            }
            $this->features->markRemoved($id);
        });

        return ['id' => $id];
    }

    /** @return array{features: list<array<string, mixed>>} */
    public function list(MapFeatureListQuery $query): array
    {
        $rows = $this->features->findActive($query->limit);

        return ['features' => array_map(static function (array $row): array {
            return [
                'id' => $row['id'],
                'type' => $row['type'],
                'name' => $row['name'],
                'geometry' => json_decode($row['geometry'], true, flags: JSON_THROW_ON_ERROR),
                'createdAt' => (new \DateTimeImmutable($row['created_at']))->format(DATE_ATOM),
                'parentFeatureId' => $row['parent_feature_id'],
            ];
        }, $rows)];
    }
}
