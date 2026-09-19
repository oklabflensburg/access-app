<?php

declare(strict_types=1);

namespace App\Storage;

use Symfony\Component\DependencyInjection\Attribute\Autowire;

final class PhotoFileStorage
{
    public function __construct(
        #[Autowire('%kernel.project_dir%/var/photos')]
        private readonly string $directory,
    ) {
    }

    public function write(string $storageKey, string $bytes): void
    {
        $this->ensureDirectory();
        $temporary = tempnam($this->directory, 'upload-');
        if (false === $temporary) {
            throw new \RuntimeException('Could not create a temporary photo file.');
        }

        try {
            if (strlen($bytes) !== file_put_contents($temporary, $bytes, LOCK_EX)) {
                throw new \RuntimeException('Could not store the complete photo.');
            }
            if (!rename($temporary, $this->path($storageKey))) {
                throw new \RuntimeException('Could not publish the photo.');
            }
        } finally {
            if (is_file($temporary)) {
                unlink($temporary);
            }
        }
    }

    public function path(string $storageKey): string
    {
        return $this->directory.'/'.basename($storageKey);
    }

    public function exists(string $storageKey): bool
    {
        return is_file($this->path($storageKey));
    }

    /** @param iterable<string|null> $storageKeys */
    public function remove(iterable $storageKeys): void
    {
        foreach ($storageKeys as $storageKey) {
            if (null === $storageKey) {
                continue;
            }
            $path = $this->path($storageKey);
            if (is_file($path) && !unlink($path)) {
                throw new \RuntimeException('Could not remove an obsolete photo.');
            }
        }
    }

    private function ensureDirectory(): void
    {
        if (!is_dir($this->directory) && !mkdir($this->directory, 0700, true) && !is_dir($this->directory)) {
            throw new \RuntimeException('Could not create the photo storage directory.');
        }
    }
}
