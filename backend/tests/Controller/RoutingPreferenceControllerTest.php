<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Service\FeaturePriorities;
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

    public function testPreferenceDefaultsToNeutralAndCanBeUpdated(): void
    {
        $client = static::createClient();
        $this->resetPreference();

        $client->request('GET', '/api/preferences/routing');
        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('cache-control', 'no-store, private');
        $data = $this->responseData($client);
        self::assertSame('routing', $data['id']);
        self::assertSame(FeaturePriorities::defaults(), $data['featurePriorities']);
        self::assertSame(0, $data['revision']);

        $client->jsonRequest('PUT', '/api/preferences/routing', [
            'featurePriorities' => ['staircase' => 'avoid'],
            'revision' => 1,
        ]);
        self::assertResponseIsSuccessful();
        $data = $this->responseData($client);
        self::assertSame('routing', $data['id']);
        self::assertSame('avoid', $data['featurePriorities']['staircase']);
        self::assertSame('neutral', $data['featurePriorities']['ramp']);
        self::assertSame(1, $data['revision']);

        $client->jsonRequest('PUT', '/api/preferences/routing', [
            'featurePriorities' => ['staircase' => 'neutral', 'ramp' => 'prefer'],
            'revision' => 2,
        ]);
        self::assertResponseIsSuccessful();
        $data = $this->responseData($client);
        self::assertSame('neutral', $data['featurePriorities']['staircase']);
        self::assertSame('prefer', $data['featurePriorities']['ramp']);
        self::assertSame(2, $data['revision']);

        $client->request('GET', '/api/preferences/routing');
        self::assertResponseIsSuccessful();
        $data = $this->responseData($client);
        self::assertSame('prefer', $data['featurePriorities']['ramp']);
        self::assertSame(2, $data['revision']);
    }

    public function testStaleRevisionsConflict(): void
    {
        $client = static::createClient();
        $this->resetPreference();

        $client->jsonRequest('PUT', '/api/preferences/routing', [
            'featurePriorities' => ['staircase' => 'avoid'],
            'revision' => 1,
        ]);
        self::assertResponseIsSuccessful();

        $client->jsonRequest('PUT', '/api/preferences/routing', [
            'featurePriorities' => ['staircase' => 'neutral'],
            'revision' => 1,
        ]);
        self::assertResponseStatusCodeSame(409);
        self::assertResponseHeaderSame('cache-control', 'no-store, private');

        $client->jsonRequest('PUT', '/api/preferences/routing', [
            'featurePriorities' => ['staircase' => 'neutral'],
            'revision' => 3,
        ]);
        self::assertResponseStatusCodeSame(409);

        // The stored preference is unchanged by the rejected writes.
        $client->request('GET', '/api/preferences/routing');
        $data = $this->responseData($client);
        self::assertSame('avoid', $data['featurePriorities']['staircase']);
        self::assertSame(1, $data['revision']);
    }

    public function testInvalidInputIsRejected(): void
    {
        $client = static::createClient();
        $this->resetPreference();
        $client->disableReboot();

        foreach ([
            [],
            ['featurePriorities' => ['staircase' => 'avoid']],
            ['revision' => 1],
            ['featurePriorities' => 'yes', 'revision' => 1],
            ['featurePriorities' => ['staircase' => 'maybe'], 'revision' => 1],
            ['featurePriorities' => ['unknown' => 'avoid'], 'revision' => 1],
            ['featurePriorities' => ['staircase' => 'avoid'], 'revision' => 0],
            ['featurePriorities' => ['staircase' => 'avoid'], 'revision' => -1],
        ] as $payload) {
            $client->jsonRequest('PUT', '/api/preferences/routing', $payload);
            self::assertResponseStatusCodeSame(400);
        }

        $client->request('GET', '/api/preferences/routing');
        $data = $this->responseData($client);
        self::assertSame(FeaturePriorities::defaults(), $data['featurePriorities']);
        self::assertSame(0, $data['revision']);
    }

    /** @return array<string, mixed> */
    private function responseData(AbstractBrowser $client): array
    {
        return json_decode($client->getResponse()->getContent(), true);
    }
}
