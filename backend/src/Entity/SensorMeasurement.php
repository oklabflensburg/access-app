<?php

declare(strict_types=1);

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'sensor_measurements')]
final class SensorMeasurement
{
    #[ORM\Id]
    #[ORM\Column(type: 'guid')]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Observation::class, fetch: 'EAGER')]
    #[ORM\JoinColumn(name: 'observation_id', referencedColumnName: 'id', nullable: false)]
    private Observation $observation;

    #[ORM\Column(name: 'sensor_type', type: 'string')]
    private string $type;

    #[ORM\Column(name: 'started_at', type: 'datetime_immutable')]
    private \DateTimeImmutable $startedAt;

    #[ORM\Column(name: 'duration_ms', type: 'integer')]
    private int $durationMs;

    /** @var array<string, mixed> */
    #[ORM\Column(type: Types::JSONB)]
    private array $summary;

    /** @var list<array<string, mixed>>|null */
    #[ORM\Column(type: Types::JSONB, nullable: true)]
    private ?array $samples;

    /**
     * @param array<string, mixed> $summary
     * @param list<array<string, mixed>>|null $samples
     */
    public function __construct(
        Observation $observation,
        string $type,
        \DateTimeImmutable $startedAt,
        int $durationMs,
        array $summary,
        ?array $samples,
    ) {
        $this->id = self::uuidV4();
        $this->observation = $observation;
        $this->type = $type;
        $this->startedAt = $startedAt;
        $this->durationMs = $durationMs;
        $this->summary = $summary;
        $this->samples = $samples;
    }

    public function getType(): string
    {
        return $this->type;
    }

    public function getObservation(): Observation
    {
        return $this->observation;
    }

    /** @return array<string, mixed> */
    public function getSummary(): array
    {
        return $this->summary;
    }

    /** @return list<array<string, mixed>>|null */
    public function getSamples(): ?array
    {
        return $this->samples;
    }

    private static function uuidV4(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);

        return substr($hex, 0, 8).'-'.substr($hex, 8, 4).'-'.substr($hex, 12, 4).'-'.substr($hex, 16, 4).'-'.substr($hex, 20);
    }
}
