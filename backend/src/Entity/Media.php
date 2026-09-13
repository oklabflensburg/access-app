<?php

declare(strict_types=1);

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'media')]
final class Media
{
    #[ORM\Id]
    #[ORM\Column(type: 'guid')]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Observation::class, fetch: 'EAGER')]
    #[ORM\JoinColumn(name: 'observation_id', referencedColumnName: 'id', nullable: false)]
    private Observation $observation;

    #[ORM\Column(name: 'sort_order', type: 'smallint')]
    private int $sortOrder;

    #[ORM\Column(name: 'storage_key', type: 'string', nullable: true)]
    private ?string $storageKey;

    #[ORM\Column(name: 'sha256', type: 'string', length: 64, nullable: true)]
    private ?string $sha256;

    #[ORM\Column(name: 'uploaded_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $uploadedAt;

    #[ORM\Column(name: 'original_filename', type: 'string', nullable: true)]
    private ?string $originalFilename;

    #[ORM\Column(name: 'mime_type', type: 'string', nullable: true)]
    private ?string $mimeType;

    #[ORM\Column(name: 'byte_size', type: 'integer', nullable: true)]
    private ?int $byteSize;

    #[ORM\Column(name: 'width_px', type: 'integer', nullable: true)]
    private ?int $width;

    #[ORM\Column(name: 'height_px', type: 'integer', nullable: true)]
    private ?int $height;

    public function getId(): string
    {
        return $this->id;
    }

    public function belongsTo(string $observationId): bool
    {
        return $this->observation->getId() === $observationId;
    }

    public function getObservation(): Observation
    {
        return $this->observation;
    }

    public function getStorageKey(): ?string
    {
        return $this->storageKey;
    }

    public function getSha256(): ?string
    {
        return $this->sha256;
    }

    public function isUploaded(): bool
    {
        return null !== $this->uploadedAt;
    }

    public function setSortOrder(int $sortOrder): void
    {
        $this->sortOrder = $sortOrder;
    }

    public function setUpload(
        string $storageKey,
        string $sha256,
        string $originalFilename,
        int $byteSize,
        int $width,
        int $height,
    ): void {
        $this->storageKey = $storageKey;
        $this->sha256 = $sha256;
        $this->originalFilename = $originalFilename;
        $this->mimeType = 'image/jpeg';
        $this->byteSize = $byteSize;
        $this->width = $width;
        $this->height = $height;
        $this->uploadedAt = new \DateTimeImmutable();
    }

}
