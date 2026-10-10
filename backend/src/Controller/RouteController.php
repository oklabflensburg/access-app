<?php

declare(strict_types=1);

namespace App\Controller;

use App\Dto\RouteInput;
use App\Service\RoutingService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;

final class RouteController extends AbstractController
{
    #[Route('/api/routes', name: 'api_routes', methods: ['POST'], format: 'json')]
    public function __invoke(
        #[MapRequestPayload(acceptFormat: 'json', validationFailedStatusCode: Response::HTTP_BAD_REQUEST)]
        RouteInput $input,
        RoutingService $routing,
    ): JsonResponse {
        return $this->json($routing->calculate($input), headers: ['Cache-Control' => 'no-store']);
    }
}
