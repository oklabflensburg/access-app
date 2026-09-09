<?php
declare(strict_types=1);
require dirname(__DIR__) . '/src/common.php';
try {
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $method = $_SERVER['REQUEST_METHOD'];
    if ($path === '/api/health' && $method === 'GET') { query(db(), 'SELECT 1'); respond(['ok' => true]); }
    if (!preg_match('#^/api/observations(?:/([0-9a-f-]+)(?:/photos(?:/([0-9a-f-]+))?)?)?$#D', $path, $match)) fail('Not found.', 404);
    $id = $match[1] ?? null; $photoId = $match[2] ?? null;
    if ($id !== null && !uuid($id)) fail('Invalid observation id.');
    $isPhotos = str_contains($path, '/photos');
    $db = db();
    if ($method === 'GET' && $photoId) {
        if (!uuid($photoId)) fail('Invalid photo id.');
        $row = query($db, "SELECT p.filename FROM photos p JOIN observations o ON o.id=p.observation_id WHERE p.id=? AND o.id=? AND NOT o.deleted AND o.payload->'photoIds' @> ?::jsonb", [$photoId, $id, json_encode([$photoId])])->fetch(PDO::FETCH_ASSOC);
        if (!$row || !is_file($file = storageDir() . '/' . $row['filename'])) fail('Photo not found.', 404);
        header('Content-Type: image/jpeg'); header('X-Content-Type-Options: nosniff'); header('Cache-Control: no-cache'); header('Content-Length: ' . filesize($file)); readfile($file); exit;
    }
    if ($method === 'GET' && !$isPhotos) {
        if ($id) {
            $row = query($db, 'SELECT payload FROM observations WHERE id=? AND NOT deleted', [$id])->fetchColumn();
            if (!$row) fail('Observation not found.', 404);
            respond(json_decode($row, true));
        }
        $limit = filter_var($_GET['limit'] ?? 100, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 200]]);
        if ($limit === false) fail('Limit must be 1–200.');
        $where = ['NOT deleted']; $params = [];
        if (isset($_GET['cursor'])) { if (!uuid($_GET['cursor'])) fail('Invalid cursor.'); $where[] = 'id < ?'; $params[] = $_GET['cursor']; }
        if (isset($_GET['bbox'])) {
            $bounds = explode(',', $_GET['bbox']);
            if (count($bounds) !== 4 || count(array_filter($bounds, 'is_numeric')) !== 4) fail('bbox must be west,south,east,north.');
            [$west, $south, $east, $north] = array_map('floatval', $bounds);
            if (!finiteNumber($west,-180,180) || !finiteNumber($east,-180,180) || !finiteNumber($south,-90,90) || !finiteNumber($north,-90,90) || $south > $north) fail('Invalid bounding box.');
            $where[] = "(payload->'location'->>'latitude')::double precision BETWEEN ? AND ?"; array_push($params, $south, $north);
            $where[] = "((payload->'location'->>'longitude')::double precision >= ? " . ($west > $east ? 'OR' : 'AND') . " (payload->'location'->>'longitude')::double precision <= ?)"; array_push($params, $west, $east);
        }
        $rows = query($db, 'SELECT id, payload FROM observations WHERE ' . implode(' AND ', $where) . ' ORDER BY id DESC LIMIT ' . ($limit + 1), $params)->fetchAll(PDO::FETCH_ASSOC);
        $more = count($rows) > $limit; $rows = array_slice($rows, 0, $limit);
        $observations = array_map(function($row) { $p = json_decode($row['payload'], true); unset($p['motion'], $p['light']); return $p; }, $rows);
        respond(['observations' => $observations, 'nextCursor' => $more ? end($rows)['id'] : null]);
    }
    $hash = tokenHash();
    if ($method === 'POST' && !$id) {
        $payload = validateObservation(body()); $id = $payload['id']; $rev = $payload['revision']; $json = json_encode($payload, JSON_THROW_ON_ERROR);
        $db->beginTransaction();
        query($db, 'INSERT INTO observations(id,revision,edit_token_hash,payload) VALUES (?,?,?,?::jsonb) ON CONFLICT(id) DO NOTHING', [$id,$rev,$hash,$json]);
        $row = query($db, 'SELECT * FROM observations WHERE id=? FOR UPDATE', [$id])->fetch(PDO::FETCH_ASSOC);
        if (!hash_equals($row['edit_token_hash'], $hash)) fail('Edit token does not match this observation.', 403);
        if ($row['deleted']) fail('This observation has been deleted.', 410);
        if ($rev < $row['revision'] || ($rev === $row['revision'] && json_decode($row['payload'], true) != $payload)) fail('Revision conflict. Save a newer revision.', 409);
        query($db, 'UPDATE observations SET revision=?,payload=?::jsonb,updated_at=now() WHERE id=?', [$rev,$json,$id]);
        query($db, 'DELETE FROM photos WHERE observation_id=? AND NOT (?::jsonb @> to_jsonb(id::text))', [$id,json_encode($payload['photoIds'])]);
        $db->commit(); prunePhotos($db, $id); respond(['id' => $id, 'revision' => $rev]);
    }
    if ($method === 'DELETE' && $id && !$isPhotos) {
        $rev = revision(body()['revision'] ?? null);
        $db->beginTransaction();
        query($db, "INSERT INTO observations(id,revision,edit_token_hash,deleted) VALUES (?,?,?,true) ON CONFLICT(id) DO NOTHING", [$id,$rev,$hash]);
        $row = query($db, 'SELECT * FROM observations WHERE id=? FOR UPDATE', [$id])->fetch(PDO::FETCH_ASSOC);
        if (!hash_equals($row['edit_token_hash'], $hash)) fail('Edit token does not match this observation.', 403);
        if ($rev < $row['revision'] || ($rev === $row['revision'] && !$row['deleted'])) fail('Revision conflict.', 409);
        query($db, "UPDATE observations SET revision=?,deleted=true,payload='{}',updated_at=now() WHERE id=?", [$rev,$id]);
        query($db, 'DELETE FROM photos WHERE observation_id=?', [$id]);
        $db->commit(); prunePhotos($db, $id); respond(['id' => $id, 'revision' => $rev]);
    }
    if ($method === 'POST' && $id && $isPhotos && !$photoId) {
        $photoId = $_POST['id'] ?? null; $rev = filter_var($_POST['revision'] ?? '', FILTER_VALIDATE_INT);
        if (!uuid($photoId) || $rev === false) fail('Invalid photo id or revision.');
        $file = $_FILES['photo'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] > 5 * 1024 * 1024 || !is_uploaded_file($file['tmp_name'])) fail('Upload a JPEG smaller than 5 MB.', 413);
        $size = @getimagesize($file['tmp_name']);
        if (!$size || $size[2] !== IMAGETYPE_JPEG || $size[0] > 1600 || $size[1] > 1600) fail('Expected a JPEG no larger than 1600 pixels.', 415);
        $db->beginTransaction();
        $row = query($db, 'SELECT * FROM observations WHERE id=? FOR UPDATE', [$id])->fetch(PDO::FETCH_ASSOC);
        if (!$row || $row['deleted']) fail('Observation not found.', 404);
        if (!hash_equals($row['edit_token_hash'], $hash)) fail('Edit token does not match this observation.', 403);
        if ($rev !== $row['revision'] || !in_array($photoId, json_decode($row['payload'], true)['photoIds'], true)) fail('Photo does not belong to the current revision.', 409);
        // Decode and re-encode on the server too, so direct API uploads cannot retain EXIF or trailing payloads.
        $image = @imagecreatefromjpeg($file['tmp_name']); if (!$image) fail('Invalid JPEG.', 415);
        ob_start(); imagejpeg($image, null, 85); $bytes = ob_get_clean(); imagedestroy($image);
        if (!$bytes) throw new RuntimeException('Could not encode photo.');
        $digest = hash('sha256', $bytes); $filename = $id . '-' . $photoId . '-' . $digest . '.jpg';
        $existing = query($db, 'SELECT observation_id,sha256 FROM photos WHERE id=?', [$photoId])->fetch(PDO::FETCH_ASSOC);
        if ($existing && ($existing['observation_id'] !== $id || $existing['sha256'] !== $digest)) fail('Photo id already used for different content.', 409);
        $temporary = tempnam(storageDir(), 'upload-');
        if ($temporary === false) throw new RuntimeException('Could not create photo file.');
        try {
            if (file_put_contents($temporary, $bytes, LOCK_EX) !== strlen($bytes) || !rename($temporary, storageDir() . '/' . $filename)) throw new RuntimeException('Could not store complete photo.');
        } finally { if (is_file($temporary)) unlink($temporary); }
        query($db, 'INSERT INTO photos(id,observation_id,filename,sha256) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING', [$photoId,$id,$filename,$digest]);
        $db->commit(); respond(['id' => $photoId]);
    }
    fail('Method not allowed.', 405);
} catch (Throwable $error) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    error_log((string)$error);
    respond(['error' => 'The server could not complete the request. Please retry.'], 500);
}
