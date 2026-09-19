<?php

declare(strict_types=1);

namespace App\Service;

use App\Storage\PhotoFileStorage;
use App\Store\MediaStore;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\UnsupportedMediaTypeHttpException;

final class PhotoService
{
    public function __construct(
        private readonly MediaStore $store,
        private readonly PhotoFileStorage $storage,
    ) {
    }

    /** @return array{id: string} */
    public function upload(
        string $observationId,
        string $photoId,
        int $revision,
        string $tokenHash,
        UploadedFile $upload,
    ): array {
        $this->assertUuid($observationId);
        $this->assertUuid($photoId);
        $imageInfo = @getimagesize($upload->getPathname());
        if (false === $imageInfo || IMAGETYPE_JPEG !== $imageInfo[2]
            || $imageInfo[0] > 1600 || $imageInfo[1] > 1600) {
            throw new UnsupportedMediaTypeHttpException('Expected a JPEG no larger than 1600 pixels.');
        }

        $image = @imagecreatefromjpeg($upload->getPathname());
        if (false === $image) {
            throw new UnsupportedMediaTypeHttpException('Invalid JPEG.');
        }
        ob_start();
        try {
            if (!imagejpeg($image, null, 85)) {
                throw new \RuntimeException('Could not encode the photo.');
            }
            $bytes = ob_get_clean();
        } catch (\Throwable $error) {
            ob_end_clean();
            throw $error;
        } finally {
            imagedestroy($image);
        }
        if (false === $bytes || '' === $bytes) {
            throw new \RuntimeException('Could not encode the photo.');
        }

        $digest = hash('sha256', $bytes);
        $storageKey = $observationId.'-'.$photoId.'-'.$digest.'.jpg';
        $oldStorageKey = null;
        $wroteFile = false;

        try {
            $this->store->transactional(function () use (
                $observationId,
                $photoId,
                $revision,
                $tokenHash,
                $digest,
                $storageKey,
                $bytes,
                $imageInfo,
                $upload,
                &$oldStorageKey,
                &$wroteFile,
            ): void {
                $this->store->clear();
                $observation = $this->store->findObservationForUpdate($observationId);
                if (null === $observation || $observation->isDeleted()) {
                    throw new NotFoundHttpException('Observation not found.');
                }
                if (!hash_equals($observation->getEditTokenHash(), $tokenHash)) {
                    throw new AccessDeniedHttpException('Edit token does not match this observation.');
                }
                if ($revision !== $observation->getRevision()) {
                    throw new ConflictHttpException('Photo does not belong to the current revision.');
                }

                $media = $this->store->findMediaForUpdate($photoId);
                if (null === $media || !$media->belongsTo($observationId)) {
                    throw new ConflictHttpException('Photo does not belong to the current revision.');
                }
                if (null !== $media->getSha256() && $media->getSha256() !== $digest) {
                    throw new ConflictHttpException('Photo id already used for different content.');
                }

                $oldStorageKey = $media->getStorageKey();
                if (!$this->storage->exists($storageKey)) {
                    $this->storage->write($storageKey, $bytes);
                    $wroteFile = true;
                }
                $media->setUpload(
                    $storageKey,
                    $digest,
                    $upload->getClientOriginalName(),
                    strlen($bytes),
                    $imageInfo[0],
                    $imageInfo[1],
                );
            });
        } catch (\Throwable $error) {
            if ($wroteFile) {
                $this->storage->remove([$storageKey]);
            }
            throw $error;
        }

        if (null !== $oldStorageKey && $oldStorageKey !== $storageKey) {
            $this->storage->remove([$oldStorageKey]);
        }

        return ['id' => $photoId];
    }

    public function findPath(string $observationId, string $photoId): string
    {
        $this->assertUuid($observationId);
        $this->assertUuid($photoId);
        $media = $this->store->findMedia($photoId);
        if (null === $media
            || !$media->belongsTo($observationId)
            || !$media->isUploaded()
            || $media->getObservation()->isDeleted()
            || null === $media->getStorageKey()
            || !$this->storage->exists($media->getStorageKey())) {
            throw new NotFoundHttpException('Photo not found.');
        }

        return $this->storage->path($media->getStorageKey());
    }

    private function assertUuid(string $value): void
    {
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $value)) {
            throw new \Symfony\Component\HttpKernel\Exception\BadRequestHttpException('Invalid id.');
        }
    }
}
