<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

final class RouteControllerTest extends WebTestCase
{
    private const INPUT = [
        'start' => ['latitude' => 54.78, 'longitude' => 9.43],
        'end' => ['latitude' => 54.79, 'longitude' => 9.44],
    ];

    private const PATH = [
        'points' => ['type' => 'LineString', 'coordinates' => [[9.4302, 54.7802], [9.435, 54.782], [9.4402, 54.7902]]],
        'snapped_waypoints' => ['type' => 'LineString', 'coordinates' => [[9.4301, 54.7801], [9.4401, 54.7901]]],
        'distance' => 1234.5,
    ];

    public function testWalkingRouteIsNormalizedAndUsesShortestProfile(): void
    {
        $client = static::createClient();
        static::getContainer()->set('http_client', new MockHttpClient(function ($method, $url, $options) {
            self::assertSame('POST', $method);
            self::assertStringEndsWith('/route', $url);
            self::assertSame([
                'points' => [[9.43, 54.78], [9.44, 54.79]],
                'profile' => 'foot_shortest',
                'points_encoded' => false,
                'instructions' => false,
                'elevation' => false,
            ], json_decode($options['body'], true));
            self::assertSame(15.0, $options['timeout']);
            self::assertEquals(15, $options['max_duration']);

            return self::routeResponse();
        }));

        $client->jsonRequest('POST', '/api/routes', self::INPUT);
        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('cache-control', 'no-store, private');
        $data = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('LineString', $data['geometry']['type']);
        self::assertCount(3, $data['geometry']['coordinates']);
        self::assertSame(self::PATH['points'], $data['geometry']);
        self::assertSame(1234.5, $data['distanceMeters']);
        self::assertSame(['latitude' => 54.7801, 'longitude' => 9.4301], $data['snappedStart']);
        self::assertSame(['latitude' => 54.7901, 'longitude' => 9.4401], $data['snappedEnd']);
    }

    public function testWheelchairPreferenceUsesTheWheelchairProfile(): void
    {
        $client = static::createClient();
        static::getContainer()->set('http_client', new MockHttpClient(function ($method, $url, $options) {
            self::assertSame('foot_wheelchair', json_decode($options['body'], true)['profile']);
            return self::routeResponse();
        }));

        $client->jsonRequest('POST', '/api/routes', self::INPUT + ['wheelchairAccessible' => true]);
        self::assertResponseIsSuccessful();
    }

    public function testInvalidInputNeverCallsTheEngine(): void
    {
        $client = static::createClient();
        $client->disableReboot();
        static::getContainer()->set('http_client', new MockHttpClient(function () {
            self::fail('Invalid input must not reach the engine.');
        }));
        foreach ([
            [],
            ['start' => ['latitude' => 91, 'longitude' => 9.43], 'end' => self::INPUT['end']],
            ['start' => self::INPUT['start'], 'end' => ['latitude' => 54.79, 'longitude' => -181]],
            ['start' => ['latitude' => null, 'longitude' => 9.43], 'end' => self::INPUT['end']],
            ['start' => ['latitude' => 'invalid', 'longitude' => 9.43], 'end' => self::INPUT['end']],
        ] as $input) {
            $client->jsonRequest('POST', '/api/routes', $input);
            self::assertResponseStatusCodeSame(400);
            self::assertSame('invalid_input', json_decode($client->getResponse()->getContent(), true)['code']);
        }
        $client->jsonRequest('POST', '/api/routes', ['start' => self::INPUT['start'], 'end' => self::INPUT['start']]);
        self::assertResponseStatusCodeSame(400);
        self::assertSame('identical_points', json_decode($client->getResponse()->getContent(), true)['code']);
    }

    public function testEngineFailuresHaveStableErrorCodes(): void
    {
        $client = static::createClient();
        $client->disableReboot();
        $cases = [
            [self::errorResponse('PointNotFoundException'), 422, 'no_route'],
            [self::errorResponse('PointOutOfBoundsException'), 422, 'no_route'],
            [self::errorResponse('ConnectionNotFoundException'), 422, 'no_route'],
            [self::errorResponse('IllegalArgumentException'), 502, 'invalid_response'],
            [new MockResponse('{"message":"Unknown profile","hints":"invalid"}', ['http_code' => 400]), 502, 'invalid_response'],
            [new MockResponse('unavailable', ['http_code' => 503]), 503, 'unavailable'],
            [new MockResponse('quota', ['http_code' => 429]), 503, 'unavailable'],
            [new MockResponse('not JSON'), 502, 'invalid_response'],
            [new MockResponse('{"paths":[]}'), 502, 'invalid_response'],
            [new MockResponse('{"paths":"invalid"}'), 502, 'invalid_response'],
            [self::routeResponse(['points' => 'encoded-polyline']), 502, 'invalid_response'],
            [self::routeResponse(['points' => ['type' => 'Point', 'coordinates' => [9, 54]]]), 502, 'invalid_response'],
            [self::routeResponse(['points' => ['type' => 'LineString', 'coordinates' => [[9, 54], [200, 54]]]]), 502, 'invalid_response'],
            [self::routeResponse(['points' => ['type' => 'LineString', 'coordinates' => [[9, 54], [9, 91]]]]), 502, 'invalid_response'],
            [self::routeResponse(['points' => ['type' => 'LineString', 'coordinates' => [[9, 54, 0], [9, 55, 0]]]]), 502, 'invalid_response'],
            [self::routeResponse(['points' => ['type' => 'LineString', 'coordinates' => [[9, 54], ['9', 55]]]]), 502, 'invalid_response'],
            [self::routeResponse(['snapped_waypoints' => null]), 502, 'invalid_response'],
            [self::routeResponse(['snapped_waypoints' => ['type' => 'LineString', 'coordinates' => [[9, 54], [9, 55], [9, 56]]]]), 502, 'invalid_response'],
            [self::routeResponse(['snapped_waypoints' => ['type' => 'LineString', 'coordinates' => [[9, 54], [200, 54]]]]), 502, 'invalid_response'],
            [self::routeResponse(['distance' => -1]), 502, 'invalid_response'],
            [self::routeResponse(['distance' => '1234']), 502, 'invalid_response'],
            [new MockResponse('', ['error' => 'Idle timeout reached']), 503, 'unavailable'],
        ];
        static::getContainer()->set('http_client', new MockHttpClient(array_column($cases, 0)));
        foreach ($cases as [$response, $status, $code]) {
            $client->jsonRequest('POST', '/api/routes', self::INPUT);
            self::assertResponseStatusCodeSame($status);
            self::assertSame($code, json_decode($client->getResponse()->getContent(), true)['code']);
        }
    }

    public function testSnapDistanceIsLimitedToOneHundredMetersAtBothEndpoints(): void
    {
        $client = static::createClient();
        $client->disableReboot();
        $cases = [
            [[[9.43, 54.78089], [9.44, 54.79089]], 200],
            [[[9.43, 54.78091], [9.44, 54.79]], 422],
            [[[9.43, 54.78], [9.44, 54.79091]], 422],
        ];
        $responses = array_map(fn (array $case) => self::routeResponse([
            'snapped_waypoints' => ['type' => 'LineString', 'coordinates' => $case[0]],
        ]), $cases);
        static::getContainer()->set('http_client', new MockHttpClient($responses));
        foreach ($cases as [$coordinates, $status]) {
            $client->jsonRequest('POST', '/api/routes', self::INPUT);
            self::assertResponseStatusCodeSame($status);
            $data = json_decode($client->getResponse()->getContent(), true);
            if (422 === $status) {
                self::assertSame('no_route', $data['code']);
            } else {
                self::assertSame(['latitude' => $coordinates[0][1], 'longitude' => $coordinates[0][0]], $data['snappedStart']);
            }
        }
    }

    /** @param array<string, mixed> $overrides */
    private static function routeResponse(array $overrides = []): MockResponse
    {
        return new MockResponse(json_encode(['paths' => [array_replace(self::PATH, $overrides)]], JSON_THROW_ON_ERROR));
    }

    private static function errorResponse(string $exception): MockResponse
    {
        return new MockResponse(json_encode(['message' => 'Cannot route', 'hints' => [[
            'message' => 'Cannot route', 'details' => 'com.graphhopper.util.exceptions.'.$exception,
        ]]], JSON_THROW_ON_ERROR), ['http_code' => 400]);
    }
}
