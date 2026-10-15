<?php

declare(strict_types=1);

namespace App\Controller;

use App\Service\MapFeatureTypes;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/map-feature-types')]
final class MapFeatureTypeController extends AbstractController
{
    #[Route('', name: 'api_map_feature_types', methods: ['GET'], format: 'json')]
    public function list(MapFeatureTypes $featureTypes): JsonResponse
    {
        return $this->json(['types' => $featureTypes->all()]);
    }
}
