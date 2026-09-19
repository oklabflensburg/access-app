<?php

declare(strict_types=1);

namespace App\Service;

use App\Dto\MapFeatureInput;
use App\Dto\MapFeatureListQuery;
use App\Store\MapFeatureStore;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

final class MapFeatureService
{
    public function __construct(private readonly MapFeatureStore $store)
    {
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
        if (!$this->store->isValidPolygon($geometry)) {
            throw new BadRequestHttpException('The polygon is not a valid, non-self-intersecting area.');
        }

        $this->store->transactional(function () use ($input, $tokenHash, $createdAt, $geometry): void {
            $inserted = $this->store->insertIfAbsent($input, $tokenHash, $createdAt, $geometry);
            if (1 === $inserted) {
                return;
            }

            $current = $this->store->findForUpdate($input->id, $geometry);
            if (false === $current) {
                throw new BadRequestHttpException('Unknown map feature type.');
            }
            if (!is_string($current['edit_token_hash'])
                || !hash_equals($current['edit_token_hash'], $tokenHash)) {
                throw new AccessDeniedHttpException('Edit token does not match this map feature.');
            }
            if ($current['type'] !== $input->type || $current['name'] !== $input->name
                || !$current['same_geometry']) {
                throw new ConflictHttpException('A different map feature already uses this id.');
            }
        });

        return ['id' => $input->id];
    }

    /** @return array{features: list<array<string, mixed>>} */
    public function list(MapFeatureListQuery $query): array
    {
        $rows = $this->store->findActive($query->limit);

        return ['features' => array_map(static function (array $row): array {
            return [
                'id' => $row['id'],
                'type' => $row['type'],
                'name' => $row['name'],
                'geometry' => json_decode($row['geometry'], true, flags: JSON_THROW_ON_ERROR),
                'createdAt' => (new \DateTimeImmutable($row['created_at']))->format(DATE_ATOM),
            ];
        }, $rows)];
    }
}
