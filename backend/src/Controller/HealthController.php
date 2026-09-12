<?php

namespace App\Controller;

use App\Service\HealthCheck;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

final class HealthController extends AbstractController
{
    #[Route('/api/health', name: 'api_health', methods: ['GET'])]
    public function __invoke(HealthCheck $healthCheck): JsonResponse
    {
        return $this->json($healthCheck->check());
    }
}
