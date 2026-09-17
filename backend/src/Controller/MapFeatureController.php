<?php

declare(strict_types=1);

namespace App\Controller;

use App\Dto\MapFeatureInput;
use App\Dto\MapFeatureListQuery;
use App\Service\EditToken;
use App\Service\MapFeatureStore;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapQueryString;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/map-features')]
final class MapFeatureController extends AbstractController
{
    #[Route('', name: 'api_map_features_save', methods: ['POST'], format: 'json')]
    public function save(
        #[MapRequestPayload(acceptFormat: 'json', validationFailedStatusCode: Response::HTTP_BAD_REQUEST)]
        MapFeatureInput $input,
        Request $request,
        EditToken $editToken,
        MapFeatureStore $store,
    ): JsonResponse {
        return $this->json($store->save($input, $editToken->hashFrom($request)));
    }

    #[Route('', name: 'api_map_features_list', methods: ['GET'], format: 'json')]
    public function list(
        MapFeatureStore $store,
        #[MapQueryString(validationFailedStatusCode: Response::HTTP_BAD_REQUEST)]
        MapFeatureListQuery $query = new MapFeatureListQuery(),
    ): JsonResponse {
        return $this->json($store->list($query));
    }
}
