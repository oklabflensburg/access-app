<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\BrowserKit\AbstractBrowser;

final class MapFeatureTypeControllerTest extends WebTestCase
{
    public function testListReturnsTheConfiguredTypes(): void
    {
        $client = static::createClient();

        $client->request('GET', '/api/map-feature-types');
        self::assertResponseIsSuccessful();
        $types = $this->responseData($client)['types'];

        self::assertSame(
            ['area', 'point', 'building', 'entrance', 'steps', 'ramp', 'toilets', 'elevator', 'path'],
            array_column($types, 'id'),
        );
        $steps = $types[4];
        self::assertTrue($steps['path']);
        self::assertTrue($steps['routeSetting']);
        self::assertCount(1, $steps['osm']);
        self::assertSame('w/highway=steps', $steps['osm'][0]['extract']);
        self::assertSame(['highway' => 'steps'], $steps['osm'][0]['tags']);
        self::assertFalse($types[5]['routeSetting']);
    }

    /** @return array<string, mixed> */
    private function responseData(AbstractBrowser $client): array
    {
        return json_decode($client->getResponse()->getContent(), true);
    }
}
