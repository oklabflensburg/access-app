<?php

declare(strict_types=1);

namespace App\Controller;

use App\Dto\RoutingPreferenceInput;
use App\Service\RoutingPreferenceService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/preferences/routing')]
final class RoutingPreferenceController extends AbstractController
{
    #[Route('', name: 'api_routing_preferences_get', methods: ['GET'], format: 'json')]
    public function get(RoutingPreferenceService $service): JsonResponse
    {
        return $this->json($service->get(), headers: ['Cache-Control' => 'no-store']);
    }

    #[Route('', name: 'api_routing_preferences_save', methods: ['PUT'], format: 'json')]
    public function save(
        #[MapRequestPayload(acceptFormat: 'json', validationFailedStatusCode: Response::HTTP_BAD_REQUEST)]
        RoutingPreferenceInput $input,
        RoutingPreferenceService $service,
    ): JsonResponse {
        return $this->json($service->save($input), headers: ['Cache-Control' => 'no-store']);
    }
}
