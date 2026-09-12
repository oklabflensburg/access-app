<?php

declare(strict_types=1);

namespace App\Service;

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\UnauthorizedHttpException;

final class EditToken
{
    public function hashFrom(Request $request): string
    {
        $authorization = $request->headers->get('Authorization', '');
        if (!preg_match('/^Bearer ([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/D', $authorization, $matches)) {
            throw new UnauthorizedHttpException('Bearer', 'A valid observation edit token is required.');
        }

        return hash('sha256', $matches[1]);
    }
}
