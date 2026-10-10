<?php

declare(strict_types=1);

namespace App\Service;

use App\Dto\RoutingPreferenceInput;
use App\Persistence\TransactionManager;
use App\Repository\RoutingPreferenceRepository;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

final class RoutingPreferenceService
{
    private const ID = 'routing';

    public function __construct(
        private readonly RoutingPreferenceRepository $preferences,
        private readonly TransactionManager $transactions,
    ) {
    }

    /** @return array{id: string, featurePriorities: array<string, string>, revision: int, updatedAt: string} */
    public function get(): array
    {
        $row = $this->preferences->find();
        if (null === $row) {
            // No user accounts yet: the default global preference.
            return [
                'id' => self::ID,
                'featurePriorities' => FeaturePriorities::defaults(),
                'revision' => 0,
                'updatedAt' => (new \DateTimeImmutable('@0'))->format(DATE_ATOM),
            ];
        }

        return $this->normalize($row);
    }

    /** @return array{id: string, featurePriorities: array<string, string>, revision: int, updatedAt: string} */
    public function save(RoutingPreferenceInput $input): array
    {
        $row = $this->transactions->transactional(function () use ($input): array {
            $current = $this->preferences->findForUpdate();
            if (null === $current) {
                if (1 !== $input->revision) {
                    throw new ConflictHttpException('The routing preference changed on the server.');
                }
                $this->preferences->insert($input->featurePriorities);
            } else {
                if ($current['revision'] !== $input->revision - 1) {
                    throw new ConflictHttpException('The routing preference changed on the server.');
                }
                $this->preferences->update($input->featurePriorities);
            }

            return $this->preferences->find();
        });

        \assert(null !== $row);

        return $this->normalize($row);
    }

    /**
     * @param array{id: string, feature_priorities: mixed, revision: int, updated_at: string} $row
     * @return array{id: string, featurePriorities: array<string, string>, revision: int, updatedAt: string}
     */
    private function normalize(array $row): array
    {
        $settings = is_string($row['feature_priorities'])
            ? json_decode($row['feature_priorities'], true)
            : $row['feature_priorities'];

        return [
            'id' => $row['id'],
            'featurePriorities' => FeaturePriorities::normalize(is_array($settings) ? $settings : []),
            'revision' => (int) $row['revision'],
            'updatedAt' => (new \DateTimeImmutable($row['updated_at']))->format(DATE_ATOM),
        ];
    }
}
