<?php

declare(strict_types=1);

namespace App\Entity;

use App\Dto\ObservationInput;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'observations')]
final class Observation
{
    #[ORM\Id]
    #[ORM\Column(type: 'guid')]
    private string $id;

    #[ORM\Column(type: 'integer')]
    private int $revision;

    #[ORM\Column(name: 'edit_token_hash', type: 'string', length: 64)]
    private string $editTokenHash;

    #[ORM\Column(name: 'payload_hash', type: 'string', length: 64, nullable: true)]
    private ?string $payloadHash;

    #[ORM\Column(type: 'boolean')]
    private bool $deleted;

    #[ORM\Column(name: 'captured_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $capturedAt;

    #[ORM\Column(type: 'string', nullable: true)]
    private ?string $location;

    #[ORM\Column(name: 'location_accuracy_m', type: 'float', nullable: true)]
    private ?float $locationAccuracy;

    #[ORM\Column(name: 'altitude_m', type: 'float', nullable: true)]
    private ?float $altitude;

    #[ORM\Column(name: 'altitude_accuracy_m', type: 'float', nullable: true)]
    private ?float $altitudeAccuracy;

    #[ORM\Column(name: 'heading_degrees', type: 'float', nullable: true)]
    private ?float $heading;

    #[ORM\Column(name: 'speed_mps', type: 'float', nullable: true)]
    private ?float $speed;

    #[ORM\Column(name: 'location_timestamp_ms', type: 'float', nullable: true)]
    private ?float $locationTimestamp;

    #[ORM\Column(name: 'wheelchair_accessible', type: 'boolean', nullable: true)]
    private ?bool $wheelchairAccessible;

    #[ORM\Column(name: 'ramp_available', type: 'boolean', nullable: true)]
    private ?bool $rampAvailable;

    #[ORM\Column(name: 'accessible_toilet', type: 'boolean', nullable: true)]
    private ?bool $accessibleToilet;

    #[ORM\Column(name: 'elevator_available', type: 'boolean', nullable: true)]
    private ?bool $elevatorAvailable;

    #[ORM\Column(name: 'steps_at_entrance', type: 'smallint', nullable: true)]
    private ?int $stepsAtEntrance;

    #[ORM\Column(name: 'steps_count_is_minimum', type: 'boolean')]
    private bool $stepsCountIsMinimum;

    #[ORM\Column(type: 'string', nullable: true)]
    private ?string $surface;

    #[ORM\Column(name: 'inclination_percent', type: 'float', nullable: true)]
    private ?float $inclination;

    #[ORM\Column(type: 'string', nullable: true)]
    private ?string $comment;

    #[ORM\Column(name: 'map_feature_id', type: 'guid', nullable: true)]
    private ?string $mapFeatureId;

    #[ORM\Column(name: 'updated_at', type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function getId(): string
    {
        return $this->id;
    }

    public function getRevision(): int
    {
        return $this->revision;
    }

    public function getEditTokenHash(): string
    {
        return $this->editTokenHash;
    }

    public function getPayloadHash(): ?string
    {
        return $this->payloadHash;
    }

    public function isDeleted(): bool
    {
        return $this->deleted;
    }

    public function applyPayload(ObservationInput $input, \DateTimeImmutable $capturedAt, string $payloadHash): void
    {
        $this->revision = $input->revision;
        $this->payloadHash = $payloadHash;
        $this->deleted = false;
        $this->capturedAt = $capturedAt;
        $this->locationAccuracy = $input->location->accuracy;
        $this->altitude = $input->location->altitude;
        $this->altitudeAccuracy = $input->location->altitudeAccuracy;
        $this->heading = $input->location->heading;
        $this->speed = $input->location->speed;
        $this->locationTimestamp = $input->location->timestamp;
        $this->wheelchairAccessible = $input->accessibility->wheelchairAccessible;
        $this->rampAvailable = $input->accessibility->ramp;
        $this->accessibleToilet = $input->accessibility->accessibleToilet;
        $this->elevatorAvailable = $input->accessibility->elevator;
        $this->stepsAtEntrance = $input->accessibility->steps;
        $this->stepsCountIsMinimum = 3 === $input->accessibility->steps;
        $this->surface = $input->accessibility->surface;
        $this->comment = $input->comment;
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function markDeleted(int $revision): void
    {
        $this->revision = $revision;
        $this->deleted = true;
        $this->payloadHash = null;
        $this->capturedAt = null;
        $this->location = null;
        $this->locationAccuracy = null;
        $this->altitude = null;
        $this->altitudeAccuracy = null;
        $this->heading = null;
        $this->speed = null;
        $this->locationTimestamp = null;
        $this->wheelchairAccessible = null;
        $this->rampAvailable = null;
        $this->accessibleToilet = null;
        $this->elevatorAvailable = null;
        $this->stepsAtEntrance = null;
        $this->stepsCountIsMinimum = false;
        $this->surface = null;
        $this->inclination = null;
        $this->comment = null;
        $this->mapFeatureId = null;
        $this->updatedAt = new \DateTimeImmutable();
    }

    /** @return array<string, mixed> */
    public function toRow(): array
    {
        if (null === $this->capturedAt || null === $this->location) {
            throw new \LogicException('A non-deleted observation must have a capture time and location.');
        }
        [$longitude, $latitude] = $this->coordinates();

        return [
            'id' => $this->id,
            'revision' => $this->revision,
            'captured_at' => $this->capturedAt->format('Y-m-d H:i:s.uP'),
            'latitude' => $latitude,
            'longitude' => $longitude,
            'location_accuracy_m' => $this->locationAccuracy,
            'altitude_m' => $this->altitude,
            'altitude_accuracy_m' => $this->altitudeAccuracy,
            'heading_degrees' => $this->heading,
            'speed_mps' => $this->speed,
            'location_timestamp_ms' => $this->locationTimestamp,
            'wheelchair_accessible' => $this->wheelchairAccessible,
            'ramp_available' => $this->rampAvailable,
            'accessible_toilet' => $this->accessibleToilet,
            'elevator_available' => $this->elevatorAvailable,
            'steps_at_entrance' => $this->stepsAtEntrance,
            'surface' => $this->surface,
            'comment' => $this->comment,
        ];
    }

    /** @return array{0: float, 1: float} */
    private function coordinates(): array
    {
        $binary = hex2bin($this->location);
        if (false === $binary || strlen($binary) < 21) {
            throw new \LogicException('Observation location is not valid PostGIS EWKB.');
        }

        $littleEndian = 1 === ord($binary[0]);
        $type = unpack($littleEndian ? 'Vtype' : 'Ntype', substr($binary, 1, 4))['type'];
        $offset = 5 + (0 !== ($type & 0x20000000) ? 4 : 0);
        if (strlen($binary) !== $offset + 16) {
            throw new \LogicException('Observation location is not a Point.');
        }

        $coordinates = unpack(
            $littleEndian ? 'elongitude/elatitude' : 'Elongitude/Elatitude',
            substr($binary, $offset, 16),
        );

        return [(float) $coordinates['longitude'], (float) $coordinates['latitude']];
    }
}
