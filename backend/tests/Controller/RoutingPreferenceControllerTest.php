<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\BrowserKit\AbstractBrowser;

final class RoutingPreferenceControllerTest extends WebTestCase
{
    private function resetPreference(): void
    {
        static::getContainer()->get(Connection::class)
            ->executeStatement("DELETE FROM routing_preferences WHERE id = 'routing'");
    }

    public function testPreferenceDefaultsToFalseAndCanBeUpdated(): void
    {
        $client = static::createClient();
        $this->resetPreference();

        $client->request('GET', '/api/preferences/routing');
        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('cache-control', 'no-store, private');
        $data = $this->responseData($client);
        self::assertSame('routing', $data['id']);
        self::assertFalse($data['wheelchairAccessible']);
        self::assertSame(0, $data['revision']);

        $client->jsonRequest('PUT', '/api/preferences/routing', [
            'wheelchairAccessible' => true,
            'revision' => 1,
        ]);
        self::assertResponseIsSuccessful();
        $data = $this->responseData($client);
        self::assertSame('routing', $data['id']);
        self::assertTrue($data['wheelchairAccessible']);
        self::assertSame(1, $data['revision']);

        $client->jsonRequest('PUT', '/api/preferences/routing', [
            'wheelchairAccessible' => false,
            'revision' => 2,
        ]);
        self::assertResponseIsSuccessful();
        $data = $this->responseData($client);
        self::assertFalse($data['wheelchairAccessible']);
        self::assertSame(2, $data['revision']);

        $client->request('GET', '/api/preferences/routing');
        self::assertResponseIsSuccessful();
        $data = $this->responseData($client);
        self::assertFalse($data['wheelchairAccessible']);
        self::assertSame(2, $data['revision']);
    }

    public function testStaleRevisionsConflict(): void
    {
        $client = static::createClient();
        $this->resetPreference();

        $client->jsonRequest('PUT', '/api/preferences/routing', [
            'wheelchairAccessible' => true,
            'revision' => 1,
        ]);
        self::assertResponseIsSuccessful();

        $client->jsonRequest('PUT', '/api/preferences/routing', [
            'wheelchairAccessible' => false,
            'revision' => 1,
        ]);
        self::assertResponseStatusCodeSame(409);
        self::assertResponseHeaderSame('cache-control', 'no-store, private');

        $client->jsonRequest('PUT', '/api/preferences/routing', [
            'wheelchairAccessible' => false,
            'revision' => 3,
        ]);
        self::assertResponseStatusCodeSame(409);

        // The stored preference is unchanged by the rejected writes.
        $client->request('GET', '/api/preferences/routing');
        $data = $this->responseData($client);
        self::assertTrue($data['wheelchairAccessible']);
        self::assertSame(1, $data['revision']);
    }

    public function testInvalidInputIsRejected(): void
    {
        $client = static::createClient();
        $this->resetPreference();
        $client->disableReboot();

        foreach ([
            [],
            ['wheelchairAccessible' => true],
            ['revision' => 1],
            ['wheelchairAccessible' => 'yes', 'revision' => 1],
            ['wheelchairAccessible' => true, 'revision' => 0],
            ['wheelchairAccessible' => true, 'revision' => -1],
        ] as $payload) {
            $client->jsonRequest('PUT', '/api/preferences/routing', $payload);
            self::assertResponseStatusCodeSame(400);
        }

        $client->request('GET', '/api/preferences/routing');
        $data = $this->responseData($client);
        self::assertFalse($data['wheelchairAccessible']);
        self::assertSame(0, $data['revision']);
    }

    /** @return array<string, mixed> */
    private function responseData(AbstractBrowser $client): array
    {
        return json_decode($client->getResponse()->getContent(), true);
    }
}
