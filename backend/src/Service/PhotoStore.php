<?php

declare(strict_types=1);

namespace App\Service;

use Doctrine\DBAL\Connection;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\UnsupportedMediaTypeHttpException;

final class PhotoStore
{
    public function __construct(
        private readonly Connection $connection,
        private readonly PhotoStorage $photoStorage,
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
            $this->connection->transactional(function (Connection $connection) use (
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
                $observation = $connection->fetchAssociative(
                    'SELECT revision, edit_token_hash, deleted FROM observations WHERE id = :id FOR UPDATE',
                    ['id' => $observationId],
                );
                if (false === $observation || $this->toBool($observation['deleted'])) {
                    throw new NotFoundHttpException('Observation not found.');
                }
                if (!hash_equals((string) $observation['edit_token_hash'], $tokenHash)) {
                    throw new AccessDeniedHttpException('Edit token does not match this observation.');
                }
                if ($revision !== (int) $observation['revision']) {
                    throw new ConflictHttpException('Photo does not belong to the current revision.');
                }

                $media = $connection->fetchAssociative('SELECT * FROM media WHERE id = :id FOR UPDATE', ['id' => $photoId]);
                if (false === $media || $media['observation_id'] !== $observationId) {
                    throw new ConflictHttpException('Photo does not belong to the current revision.');
                }
                if (null !== $media['sha256'] && $media['sha256'] !== $digest) {
                    throw new ConflictHttpException('Photo id already used for different content.');
                }

                $oldStorageKey = $media['storage_key'];
                if (!is_file($this->photoStorage->path($storageKey))) {
                    $this->photoStorage->write($storageKey, $bytes);
                    $wroteFile = true;
                }
                $connection->executeStatement(<<<'SQL'
                    UPDATE media SET
                        storage_key = :storage_key,
                        original_filename = :original_filename,
                        mime_type = 'image/jpeg',
                        byte_size = :byte_size,
                        sha256 = :sha256,
                        width_px = :width_px,
                        height_px = :height_px,
                        uploaded_at = NOW()
                    WHERE id = :id
                    SQL, [
                    'id' => $photoId,
                    'storage_key' => $storageKey,
                    'original_filename' => $upload->getClientOriginalName(),
                    'byte_size' => strlen($bytes),
                    'sha256' => $digest,
                    'width_px' => $imageInfo[0],
                    'height_px' => $imageInfo[1],
                ]);
            });
        } catch (\Throwable $error) {
            if ($wroteFile) {
                $this->photoStorage->remove([$storageKey]);
            }
            throw $error;
        }

        if (null !== $oldStorageKey && $oldStorageKey !== $storageKey) {
            $this->photoStorage->remove([$oldStorageKey]);
        }

        return ['id' => $photoId];
    }

    public function findPath(string $observationId, string $photoId): string
    {
        $this->assertUuid($observationId);
        $this->assertUuid($photoId);
        $storageKey = $this->connection->fetchOne(<<<'SQL'
            SELECT media.storage_key
            FROM media
            INNER JOIN observations ON observations.id = media.observation_id
            WHERE media.id = :photo_id
                AND media.observation_id = :observation_id
                AND media.uploaded_at IS NOT NULL
                AND NOT observations.deleted
            SQL, ['photo_id' => $photoId, 'observation_id' => $observationId]);
        if (false === $storageKey || !is_file($path = $this->photoStorage->path((string) $storageKey))) {
            throw new NotFoundHttpException('Photo not found.');
        }

        return $path;
    }

    private function toBool(mixed $value): bool
    {
        return true === $value || 1 === $value || '1' === $value || 't' === $value || 'true' === $value;
    }

    private function assertUuid(string $value): void
    {
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $value)) {
            throw new \Symfony\Component\HttpKernel\Exception\BadRequestHttpException('Invalid id.');
        }
    }
}
