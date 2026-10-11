<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\BrowserKit\AbstractBrowser;

final class MapFeatureControllerTest extends WebTestCase
{
    private string $featureId = '6f1c2f3e-1111-4c8a-9d3b-3f2e1d0c9a71';
    private string $editToken = '7d2b3e4f-2222-4c8a-8e4c-4a3b2c1d0b82';

    private function cleanup(): void
    {
        static::getContainer()->get(Connection::class)
            ->executeStatement('DELETE FROM map_features WHERE id = :id', ['id' => $this->featureId]);
    }

    /** @return array<string, mixed> */
    private function payload(?int $osmWayId): array
    {
        return [
            'id' => $this->featureId,
            'type' => 'staircase',
            'name' => 'Bahnhofstreppe',
            'geometry' => [
                'type' => 'Polygon',
                'coordinates' => [[
                    [9.43, 54.78],
                    [9.431, 54.78],
                    [9.431, 54.781],
                    [9.43, 54.781],
                    [9.43, 54.78],
                ]],
            ],
            'createdAt' => '2026-10-11T10:00:00+00:00',
            'parentFeatureId' => null,
            'osmWayId' => $osmWayId,
        ];
    }

    public function testOsmWayIdIsStoredListedAndStable(): void
    {
        $client = static::createClient();
        $this->cleanup();

        $client->jsonRequest('POST', '/api/map-features', $this->payload(4016315), [
            'HTTP_AUTHORIZATION' => 'Bearer '.$this->editToken,
        ]);
        self::assertResponseIsSuccessful();
        self::assertSame(['id' => $this->featureId], $this->responseData($client));

        $client->request('GET', '/api/map-features?limit=100');
        self::assertResponseIsSuccessful();
        $feature = array_values(array_filter(
            $this->responseData($client)['features'],
            fn (array $feature): bool => $feature['id'] === $this->featureId,
        ))[0] ?? null;
        self::assertNotNull($feature);
        self::assertSame(4016315, $feature['osmWayId']);
        self::assertSame('staircase', $feature['type']);

        // The sync queue re-uploads unchanged features; the id must stay stable.
        $client->jsonRequest('POST', '/api/map-features', $this->payload(4016315), [
            'HTTP_AUTHORIZATION' => 'Bearer '.$this->editToken,
        ]);
        self::assertResponseIsSuccessful();

        $client->jsonRequest('POST', '/api/map-features', $this->payload(999999), [
            'HTTP_AUTHORIZATION' => 'Bearer '.$this->editToken,
        ]);
        self::assertResponseStatusCodeSame(409);
    }

    public function testFeatureWithoutOsmWayIdListsNull(): void
    {
        $client = static::createClient();
        $this->cleanup();

        $client->jsonRequest('POST', '/api/map-features', $this->payload(null), [
            'HTTP_AUTHORIZATION' => 'Bearer '.$this->editToken,
        ]);
        self::assertResponseIsSuccessful();

        $client->request('GET', '/api/map-features?limit=100');
        $feature = array_values(array_filter(
            $this->responseData($client)['features'],
            fn (array $feature): bool => $feature['id'] === $this->featureId,
        ))[0] ?? null;
        self::assertNotNull($feature);
        self::assertNull($feature['osmWayId']);
    }

    public function testInvalidOsmWayIdIsRejected(): void
    {
        $client = static::createClient();
        $this->cleanup();
        $client->disableReboot();

        foreach ([0, -5] as $osmWayId) {
            $client->jsonRequest('POST', '/api/map-features', $this->payload($osmWayId), [
                'HTTP_AUTHORIZATION' => 'Bearer '.$this->editToken,
            ]);
            self::assertResponseStatusCodeSame(400);
        }

        self::assertFalse((bool) static::getContainer()->get(Connection::class)
            ->fetchOne('SELECT 1 FROM map_features WHERE id = :id', ['id' => $this->featureId]));
    }

    /** @return array<string, mixed> */
    private function responseData(AbstractBrowser $client): array
    {
        return json_decode($client->getResponse()->getContent(), true);
    }
}
