<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class ObservationControllerTest extends WebTestCase
{
    public function testPolygonMapFeatureCanBeCreatedIdempotentlyAndListed(): void
    {
        $client = static::createClient();
        $id = $this->uuid();
        $token = $this->uuid();
        $headers = ['HTTP_AUTHORIZATION' => 'Bearer '.$token];
        $payload = [
            'id' => $id,
            'type' => 'area',
            'name' => '',
            'createdAt' => '2026-09-17T10:00:00.000Z',
            'geometry' => [
                'type' => 'Polygon',
                'coordinates' => [[[13.4, 52.5], [13.41, 52.5], [13.405, 52.51], [13.4, 52.5]]],
            ],
        ];

        $client->jsonRequest('POST', '/api/map-features', $payload, $headers);
        self::assertResponseIsSuccessful();
        self::assertSame(['id' => $id], $this->responseData($client));

        $client->jsonRequest('POST', '/api/map-features', $payload, $headers);
        self::assertResponseIsSuccessful();

        $client->request('GET', '/api/map-features?limit=200');
        self::assertResponseIsSuccessful();
        $features = $this->responseData($client)['features'];
        self::assertContains($id, array_column($features, 'id'));

        $client->jsonRequest('POST', '/api/map-features', $payload, [
            'HTTP_AUTHORIZATION' => 'Bearer '.$this->uuid(),
        ]);
        self::assertResponseStatusCodeSame(403);

        static::getContainer()->get('doctrine.dbal.default_connection')
            ->executeStatement('DELETE FROM map_features WHERE id = :id', ['id' => $id]);
    }

    public function testSelfIntersectingPolygonIsRejected(): void
    {
        $client = static::createClient();
        $client->jsonRequest('POST', '/api/map-features', [
            'id' => $this->uuid(),
            'type' => 'area',
            'name' => '',
            'createdAt' => '2026-09-17T10:00:00.000Z',
            'geometry' => [
                'type' => 'Polygon',
                'coordinates' => [[[13.4, 52.5], [13.41, 52.51], [13.4, 52.51], [13.41, 52.5], [13.4, 52.5]]],
            ],
        ], ['HTTP_AUTHORIZATION' => 'Bearer '.$this->uuid()]);

        self::assertResponseStatusCodeSame(400);
    }

    public function testObservationLifecycleAndAuthorization(): void
    {
        $client = static::createClient();
        $id = $this->uuid();
        $token = $this->uuid();
        $headers = ['HTTP_AUTHORIZATION' => 'Bearer '.$token];
        $payload = $this->payload($id);

        $client->jsonRequest('POST', '/api/observations', $payload, $headers);
        self::assertResponseIsSuccessful();
        self::assertSame(['id' => $id, 'revision' => 1], $this->responseData($client));

        $client->jsonRequest('POST', '/api/observations', $payload, $headers);
        self::assertResponseIsSuccessful();

        $client->request('GET', '/api/observations/'.$id);
        self::assertResponseIsSuccessful();
        self::assertSame('Functional test', $this->responseData($client)['comment']);

        $client->jsonRequest('POST', '/api/observations', $payload, [
            'HTTP_AUTHORIZATION' => 'Bearer '.$this->uuid(),
        ]);
        self::assertResponseStatusCodeSame(403);

        $client->jsonRequest('POST', '/api/observations', [
            ...$payload,
            'revision' => 2,
            'comment' => 'Updated',
        ], $headers);
        self::assertResponseIsSuccessful();

        $client->request('GET', '/api/observations?bbox=13,52,14,53');
        self::assertResponseIsSuccessful();
        self::assertContains($id, array_column($this->responseData($client)['observations'], 'id'));

        $client->jsonRequest('DELETE', '/api/observations/'.$id, ['revision' => 3], $headers);
        self::assertResponseIsSuccessful();

        $client->request('GET', '/api/observations/'.$id);
        self::assertResponseStatusCodeSame(404);

        $client->jsonRequest('POST', '/api/observations', [...$payload, 'revision' => 4], $headers);
        self::assertResponseStatusCodeSame(410);
    }

    public function testInvalidCoordinatesReturnJsonProblem(): void
    {
        $client = static::createClient();
        $payload = $this->payload($this->uuid());
        $payload['location']['latitude'] = 200;

        $client->jsonRequest('POST', '/api/observations', $payload, [
            'HTTP_AUTHORIZATION' => 'Bearer '.$this->uuid(),
        ]);

        self::assertResponseStatusCodeSame(400);
        self::assertResponseHeaderSame('content-type', 'application/json');
        self::assertArrayHasKey('error', $this->responseData($client));
    }

    public function testSensorMeasurementsAreStoredAndLargeSamplesAreOmittedFromCollections(): void
    {
        $client = static::createClient();
        $id = $this->uuid();
        $headers = ['HTTP_AUTHORIZATION' => 'Bearer '.$this->uuid()];
        $payload = [
            ...$this->payload($id),
            'noise' => ['averageLevel' => 0.2, 'peakLevel' => 0.8, 'duration' => 10],
            'motion' => [[
                'timestamp' => 1000,
                'accelerationX' => 1.5,
                'accelerationY' => null,
                'accelerationZ' => null,
                'rotationAlpha' => null,
                'rotationBeta' => null,
                'rotationGamma' => null,
                'orientationAlpha' => null,
                'orientationBeta' => null,
                'orientationGamma' => null,
            ]],
            'light' => [['timestamp' => 1000, 'illuminance' => 42]],
        ];

        $client->jsonRequest('POST', '/api/observations', $payload, $headers);
        self::assertResponseIsSuccessful();

        $client->request('GET', '/api/observations/'.$id);
        self::assertResponseIsSuccessful();
        $detail = $this->responseData($client);
        self::assertEquals($payload['noise'], $detail['noise']);
        self::assertEquals($payload['motion'], $detail['motion']);
        self::assertEquals($payload['light'], $detail['light']);

        $client->request('GET', '/api/observations?bbox=13,52,14,53&limit=200');
        self::assertResponseIsSuccessful();
        $summary = current(array_filter(
            $this->responseData($client)['observations'],
            static fn (array $observation): bool => $observation['id'] === $id,
        ));
        self::assertIsArray($summary);
        self::assertArrayHasKey('noise', $summary);
        self::assertArrayNotHasKey('motion', $summary);
        self::assertArrayNotHasKey('light', $summary);

        $client->jsonRequest('DELETE', '/api/observations/'.$id, ['revision' => 2], $headers);
        self::assertResponseIsSuccessful();
    }

    /** @return array<string, mixed> */
    private function payload(string $id): array
    {
        return [
            'id' => $id,
            'revision' => 1,
            'createdAt' => '2026-09-12T14:00:00.000Z',
            'location' => ['latitude' => 52.52, 'longitude' => 13.405],
            'accessibility' => [
                'wheelchairAccessible' => true,
                'steps' => 0,
                'ramp' => null,
                'accessibleToilet' => false,
                'elevator' => null,
                'surface' => 'smooth',
            ],
            'comment' => 'Functional test',
            'photoIds' => [],
        ];
    }

    private function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);

        return substr($hex, 0, 8).'-'.substr($hex, 8, 4).'-'.substr($hex, 12, 4).'-'.substr($hex, 16, 4).'-'.substr($hex, 20);
    }

    /** @return array<string, mixed> */
    private function responseData(\Symfony\Bundle\FrameworkBundle\KernelBrowser $client): array
    {
        return json_decode((string) $client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);
    }
}
