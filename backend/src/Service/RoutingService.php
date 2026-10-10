<?php

declare(strict_types=1);

namespace App\Service;

use App\Dto\RouteInput;
use App\Dto\RoutePointInput;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Contracts\HttpClient\Exception\DecodingExceptionInterface;
use Symfony\Contracts\HttpClient\Exception\TransportExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

final class RoutingService
{
    private const MAX_SNAP_DISTANCE_METERS = 100;
    private const NO_ROUTE_ERRORS = [
        'com.graphhopper.util.exceptions.PointNotFoundException',
        'com.graphhopper.util.exceptions.PointOutOfBoundsException',
        'com.graphhopper.util.exceptions.ConnectionNotFoundException',
    ];

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        #[Autowire(env: 'GRAPHHOPPER_BASE_URL')]
        private readonly string $baseUrl,
    ) {
    }

    /** @return array<string, mixed> */
    public function calculate(RouteInput $input): array
    {
        if ($input->start == $input->end) {
            throw new RoutingFailure('identical_points', 400);
        }

        $priorities = $this->featurePriorities($input->featurePriorities);
        $areas = $this->priorityAreas($input->priorityAreas);

        $request = [
            'points' => [
                [$input->start->longitude, $input->start->latitude],
                [$input->end->longitude, $input->end->latitude],
            ],
            'profile' => 'avoid' === ($priorities['staircase'] ?? 'neutral')
                ? 'foot_wheelchair'
                : 'foot_shortest',
            'points_encoded' => false,
            'instructions' => false,
            'elevation' => false,
        ];
        if ($areas !== []) {
            $areaFeatures = [];
            $priority = [];
            foreach ($areas as $index => $area) {
                $id = 'area_'.$index;
                $areaFeatures[] = [
                    'type' => 'Feature',
                    'id' => $id,
                    'properties' => new \stdClass(),
                    'geometry' => $area['geometry'],
                ];
                $priority[] = ['if' => 'in_'.$id, 'multiply_by' => FeaturePriorities::FACTORS[$area['priority']]];
            }
            $request['custom_model'] = [
                'areas' => ['type' => 'FeatureCollection', 'features' => $areaFeatures],
                'priority' => $priority,
            ];
            // Request custom models use flexible routing rather than the precomputed CH graph.
            $request['ch.disable'] = true;
        }

        try {
            $response = $this->httpClient->request('POST', rtrim($this->baseUrl, '/').'/route', [
                'json' => $request,
                'timeout' => 15,
                'max_duration' => 15,
            ]);
            $status = $response->getStatusCode();
            if ($status >= 500 || 429 === $status) {
                $response->cancel();
                throw new RoutingFailure('unavailable', 503);
            }
            $data = $response->toArray(false);
            if (200 !== $status) {
                $hints = $data['hints'] ?? null;
                if (is_array($hints)) {
                    foreach ($hints as $hint) {
                        if (is_array($hint) && in_array($hint['details'] ?? null, self::NO_ROUTE_ERRORS, true)) {
                            throw new RoutingFailure('no_route', 422);
                        }
                    }
                }
                throw new RoutingFailure('invalid_response', 502);
            }
        } catch (TransportExceptionInterface) {
            throw new RoutingFailure('unavailable', 503);
        } catch (DecodingExceptionInterface) {
            throw new RoutingFailure('invalid_response', 502);
        }

        $paths = $data['paths'] ?? null;
        $path = is_array($paths) ? ($paths[0] ?? null) : null;
        if (!is_array($path)) {
            throw new RoutingFailure('invalid_response', 502);
        }
        $geometry = $path['points'] ?? null;
        $waypoints = $path['snapped_waypoints'] ?? null;
        $distance = $path['distance'] ?? null;
        if (!$this->validLineString($geometry) || !$this->validLineString($waypoints)
            || 2 !== count($waypoints['coordinates'])
            || !$this->validNumber($distance) || $distance < 0) {
            throw new RoutingFailure('invalid_response', 502);
        }
        $coordinates = $geometry['coordinates'];
        [$start, $end] = $waypoints['coordinates'];
        // GraphHopper has no ORS-style per-point radiuses: enforce our API's
        // existing 100 m limit using its actual snapped waypoints instead.
        if ($this->snapDistance($input->start, $start) > self::MAX_SNAP_DISTANCE_METERS
            || $this->snapDistance($input->end, $end) > self::MAX_SNAP_DISTANCE_METERS) {
            throw new RoutingFailure('no_route', 422);
        }

        return [
            'geometry' => ['type' => 'LineString', 'coordinates' => $coordinates],
            'distanceMeters' => $distance,
            'snappedStart' => ['latitude' => $start[1], 'longitude' => $start[0]],
            'snappedEnd' => ['latitude' => $end[1], 'longitude' => $end[0]],
        ];
    }

    /** @param array<mixed> $settings @return array<string, string> */
    private function featurePriorities(array $settings): array
    {
        $valid = [];
        foreach ($settings as $type => $priority) {
            if (!is_string($type) || !in_array($type, FeaturePriorities::TYPES, true)
                || !is_string($priority) || !in_array($priority, FeaturePriorities::PRIORITIES, true)) {
                throw new RoutingFailure('invalid_input', 400);
            }
            $valid[$type] = $priority;
        }

        return $valid;
    }

    /**
     * @param list<mixed> $areas
     * @return list<array{priority: string, geometry: array{type: 'Polygon', coordinates: array{list<array{int|float, int|float}>}}}>
     */
    private function priorityAreas(array $areas): array
    {
        if (count($areas) > 200) {
            throw new RoutingFailure('invalid_input', 400);
        }
        $valid = [];
        foreach ($areas as $area) {
            if (!is_array($area) || !is_string($area['priority'] ?? null)
                || !array_key_exists($area['priority'], FeaturePriorities::FACTORS)) {
                throw new RoutingFailure('invalid_input', 400);
            }
            $valid[] = ['priority' => $area['priority'], 'geometry' => $this->polygon($area['geometry'] ?? null)];
        }

        return $valid;
    }

    /** @return array{type: 'Polygon', coordinates: array{list<array{int|float, int|float}>}} */
    private function polygon(mixed $area): array
    {
        if (!is_array($area) || 'Polygon' !== ($area['type'] ?? null)
            || !is_array($area['coordinates'] ?? null) || !array_is_list($area['coordinates'])
            || 1 !== count($area['coordinates'])) {
            throw new RoutingFailure('invalid_input', 400);
        }
        $ring = $area['coordinates'][0];
        if (!is_array($ring) || !array_is_list($ring) || count($ring) < 4 || count($ring) > 501) {
            throw new RoutingFailure('invalid_input', 400);
        }
        foreach ($ring as $point) {
            if (!is_array($point) || !array_is_list($point) || 2 !== count($point)
                || !$this->validNumber($point[0]) || !$this->validNumber($point[1])
                || abs($point[0]) > 180 || abs($point[1]) > 90) {
                throw new RoutingFailure('invalid_input', 400);
            }
        }
        if ($ring[0] !== $ring[array_key_last($ring)]) {
            throw new RoutingFailure('invalid_input', 400);
        }

        return ['type' => 'Polygon', 'coordinates' => [$ring]];
    }

    private function validLineString(mixed $geometry): bool
    {
        if (!is_array($geometry) || 'LineString' !== ($geometry['type'] ?? null)) {
            return false;
        }
        $coordinates = $geometry['coordinates'] ?? null;
        if (!is_array($coordinates) || !array_is_list($coordinates) || count($coordinates) < 2) {
            return false;
        }
        foreach ($coordinates as $point) {
            if (!is_array($point) || !array_is_list($point) || 2 !== count($point)
                || !$this->validNumber($point[0]) || !$this->validNumber($point[1])
                || abs($point[0]) > 180 || abs($point[1]) > 90) {
                return false;
            }
        }

        return true;
    }

    /** @param array{int|float, int|float} $snapped */
    private function snapDistance(RoutePointInput $requested, array $snapped): float
    {
        $latDelta = deg2rad($snapped[1] - $requested->latitude);
        $lonDelta = deg2rad($snapped[0] - $requested->longitude);
        $a = sin($latDelta / 2) ** 2
            + cos(deg2rad($requested->latitude)) * cos(deg2rad($snapped[1])) * sin($lonDelta / 2) ** 2;

        return 2 * 6371000 * asin(sqrt(min(1.0, max(0.0, $a))));
    }

    private function validNumber(mixed $value): bool
    {
        return (is_int($value) || is_float($value)) && is_finite((float) $value);
    }
}
