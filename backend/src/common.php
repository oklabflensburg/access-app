<?php
declare(strict_types=1);

function respond(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $message, int $status = 400): never { respond(['error' => $message], $status); }
function uuid(mixed $value): bool { return is_string($value) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $value) === 1; }
function body(): array {
    if (strtolower(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]) !== 'application/json') fail('Expected application/json.', 415);
    $raw = file_get_contents('php://input', false, null, 0, 2097153);
    if ($raw === false || strlen($raw) > 2097152) fail('Request is too large.', 413);
    try { $value = json_decode($raw, true, 64, JSON_THROW_ON_ERROR); } catch (JsonException) { fail('Invalid JSON.'); }
    if (!is_array($value) || array_is_list($value)) fail('Expected a JSON object.');
    return $value;
}
function tokenHash(): string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!str_starts_with($header, 'Bearer ') || !uuid(substr($header, 7))) fail('A valid observation edit token is required.', 401);
    return hash('sha256', substr($header, 7));
}
function db(): PDO {
    return new PDO(getenv('DB_DSN') ?: 'pgsql:host=127.0.0.1;port=55432;dbname=accessapp', getenv('DB_USER') ?: 'accessapp', getenv('DB_PASSWORD') ?: 'accessapp-local', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]);
}
function query(PDO $db, string $sql, array $params = []): PDOStatement { $stmt = $db->prepare($sql); $stmt->execute($params); return $stmt; }
function finiteNumber(mixed $value, float $min, float $max): bool { return (is_int($value) || is_float($value)) && is_finite((float)$value) && $value >= $min && $value <= $max; }
function revision(mixed $value): int { if (!is_int($value) || $value < 1 || $value > 2147483647) fail('Invalid revision.'); return $value; }
function storageDir(): string {
    $path = getenv('PHOTO_DIR') ?: dirname(__DIR__) . '/var/photos';
    if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) throw new RuntimeException('Cannot create photo directory.');
    return $path;
}
function prunePhotos(PDO $db, string $id): void {
    // Serialize cleanup with uploads/edits for this observation. Files have an
    // observation-specific prefix, so no other observation can reference them.
    $db->beginTransaction();
    query($db, 'SELECT id FROM observations WHERE id=? FOR UPDATE', [$id]);
    $keep = query($db, 'SELECT filename FROM photos WHERE observation_id=?', [$id])->fetchAll(PDO::FETCH_COLUMN);
    foreach (glob(storageDir() . '/' . $id . '-*.jpg') ?: [] as $file) {
        if (!in_array(basename($file), $keep, true) && !unlink($file)) error_log('Could not remove unreferenced photo: ' . basename($file));
    }
    $db->commit();
}
function validateObservation(array $p): array {
    if (!uuid($p['id'] ?? null)) fail('Invalid observation id.');
    revision($p['revision'] ?? null);
    if (!is_string($p['createdAt'] ?? null) || strlen($p['createdAt']) > 40 || !preg_match('/^\d{4}-\d{2}-\d{2}T/', $p['createdAt']) || strtotime($p['createdAt']) === false) fail('Invalid creation date.');
    $l = $p['location'] ?? null; $a = $p['accessibility'] ?? null;
    if (!is_array($l) || !finiteNumber($l['latitude'] ?? null, -90, 90) || !finiteNumber($l['longitude'] ?? null, -180, 180)) fail('Invalid coordinates.');
    $location = ['latitude' => $l['latitude'], 'longitude' => $l['longitude']];
    foreach (['accuracy' => [0, 1e8], 'altitude' => [-1e5, 1e6], 'altitudeAccuracy' => [0, 1e8], 'heading' => [0, 360], 'speed' => [0, 1e5], 'timestamp' => [0, 1e15]] as $key => [$min, $max]) {
        $value = $l[$key] ?? null;
        if ($value !== null && !finiteNumber($value, $min, $max)) fail('Invalid location field: ' . $key);
        $location[$key] = $value;
    }
    if (!is_array($a)) fail('Accessibility answers are required.');
    $answers = [];
    foreach (['wheelchairAccessible', 'ramp', 'accessibleToilet', 'elevator'] as $key) {
        if (!array_key_exists($key, $a) || !in_array($a[$key], [true, false, null], true)) fail('Invalid answer: ' . $key);
        $answers[$key] = $a[$key];
    }
    if (!array_key_exists('steps', $a) || !in_array($a['steps'], [0, 1, 2, 3, null], true)) fail('Invalid steps.');
    if (!array_key_exists('surface', $a) || !in_array($a['surface'], ['smooth', 'uneven', 'cobblestone', 'gravel', 'other', null], true)) fail('Invalid surface.');
    $answers['steps'] = $a['steps']; $answers['surface'] = $a['surface'];
    $comment = $p['comment'] ?? '';
    if (!is_string($comment) || mb_strlen($comment) > 2000) fail('Comment must be at most 2000 characters.');
    $photos = $p['photoIds'] ?? [];
    if (!is_array($photos) || !array_is_list($photos) || count($photos) > 6 || count(array_unique($photos, SORT_REGULAR)) !== count($photos)) fail('At most six distinct photos are allowed.');
    foreach ($photos as $id) if (!uuid($id)) fail('Invalid photo id.');
    $result = ['id' => $p['id'], 'revision' => $p['revision'], 'createdAt' => $p['createdAt'], 'location' => $location, 'accessibility' => $answers, 'comment' => $comment, 'photoIds' => $photos];
    if (isset($p['noise'])) {
        $n = $p['noise'];
        if (!is_array($n) || !finiteNumber($n['averageLevel'] ?? null, 0, 10) || !finiteNumber($n['peakLevel'] ?? null, 0, 10) || !finiteNumber($n['duration'] ?? null, 0, 120) || $n['peakLevel'] < $n['averageLevel']) fail('Invalid relative noise measurement.');
        $result['noise'] = array_intersect_key($n, array_flip(['averageLevel', 'peakLevel', 'duration']));
    }
    foreach (['motion' => 150, 'light' => 20] as $kind => $limit) {
        if (!isset($p[$kind])) continue;
        if (!is_array($p[$kind]) || !array_is_list($p[$kind]) || count($p[$kind]) > $limit) fail('Too many sensor samples.');
        $keys = $kind === 'motion' ? ['accelerationX','accelerationY','accelerationZ','rotationAlpha','rotationBeta','rotationGamma','orientationAlpha','orientationBeta','orientationGamma'] : ['illuminance'];
        $result[$kind] = [];
        foreach ($p[$kind] as $sample) {
            if (!is_array($sample) || !finiteNumber($sample['timestamp'] ?? null, 0, 1e15)) fail('Invalid sensor timestamp.');
            $clean = ['timestamp' => $sample['timestamp']];
            foreach ($keys as $key) {
                $v = $sample[$key] ?? null;
                if ($v !== null && !finiteNumber($v, $kind === 'light' ? 0 : -1e9, 1e9)) fail('Invalid sensor value.');
                $clean[$key] = $v;
            }
            $result[$kind][] = $clean;
        }
    }
    return $result;
}
