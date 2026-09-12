<?php

declare(strict_types=1);

namespace App\Controller;

use App\Dto\DeleteObservationInput;
use App\Dto\ObservationInput;
use App\Dto\ObservationListQuery;
use App\Service\EditToken;
use App\Service\ObservationStore;
use App\Service\PhotoStore;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapQueryString;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\HttpKernel\Attribute\MapUploadedFile;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Validator\Constraints as Assert;

#[Route('/api/observations')]
final class ObservationController extends AbstractController
{
    #[Route('', name: 'api_observations_save', methods: ['POST'], format: 'json')]
    public function save(
        #[MapRequestPayload(acceptFormat: 'json', validationFailedStatusCode: Response::HTTP_BAD_REQUEST)]
        ObservationInput $input,
        Request $request,
        EditToken $editToken,
        ObservationStore $store,
    ): JsonResponse {
        return $this->json($store->save($input, $editToken->hashFrom($request)));
    }

    #[Route('', name: 'api_observations_list', methods: ['GET'], format: 'json')]
    public function list(
        ObservationStore $store,
        #[MapQueryString(validationFailedStatusCode: Response::HTTP_BAD_REQUEST)]
        ObservationListQuery $query = new ObservationListQuery(),
    ): JsonResponse {
        return $this->json($store->list($query));
    }

    #[Route('/{id}', name: 'api_observations_get', methods: ['GET'], format: 'json')]
    public function getOne(string $id, ObservationStore $store): JsonResponse
    {
        return $this->json($store->get($id));
    }

    #[Route('/{id}', name: 'api_observations_delete', methods: ['DELETE'], format: 'json')]
    public function delete(
        string $id,
        #[MapRequestPayload(acceptFormat: 'json', validationFailedStatusCode: Response::HTTP_BAD_REQUEST)]
        DeleteObservationInput $input,
        Request $request,
        EditToken $editToken,
        ObservationStore $store,
    ): JsonResponse {
        return $this->json($store->delete($id, $input->revision, $editToken->hashFrom($request)));
    }

    #[Route('/{id}/photos', name: 'api_observations_photo_upload', methods: ['POST'])]
    public function uploadPhoto(
        string $id,
        Request $request,
        #[MapUploadedFile(
            name: 'photo',
            constraints: [new Assert\NotNull(), new Assert\File(maxSize: '5M')],
            validationFailedStatusCode: Response::HTTP_REQUEST_ENTITY_TOO_LARGE,
        )]
        UploadedFile $photo,
        EditToken $editToken,
        PhotoStore $photoStore,
    ): JsonResponse {
        $photoId = $request->request->get('id');
        $revision = filter_var($request->request->get('revision'), FILTER_VALIDATE_INT);
        if (!is_string($photoId)
            || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $photoId)
            || false === $revision || $revision < 1) {
            throw new BadRequestHttpException('Invalid photo id or revision.');
        }

        return $this->json($photoStore->upload($id, $photoId, $revision, $editToken->hashFrom($request), $photo));
    }

    #[Route('/{id}/photos/{photoId}', name: 'api_observations_photo_get', methods: ['GET'])]
    public function getPhoto(string $id, string $photoId, PhotoStore $photoStore): BinaryFileResponse
    {
        $response = $this->file($photoStore->findPath($id, $photoId));
        $response->headers->set('Content-Type', 'image/jpeg');
        $response->headers->set('Cache-Control', 'no-cache');
        $response->headers->set('X-Content-Type-Options', 'nosniff');

        return $response;
    }
}
