<?php

namespace App\Tests\Controller;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class HealthControllerTest extends WebTestCase
{
    public function testHealthEndpointReportsPostgis(): void
    {
        $client = static::createClient();
        $client->request('GET', '/api/health');

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('content-type', 'application/json');

        $response = $client->getResponse();
        $data = json_decode((string) $response->getContent(), true, flags: JSON_THROW_ON_ERROR);

        self::assertSame('ok', $data['status']);
        self::assertSame('ok', $data['database']);
        self::assertMatchesRegularExpression('/^\d+\.\d+(?:\.\d+)?(?:\s|$)/', $data['postgis']);
    }
}
