<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/auth.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
  http_response_code(405);
  echo json_encode(['error' => true, 'message' => 'POST required.']);
  exit;
}

$user = require_auth();
require_csrf();

$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$suggestionId = (int) ($input['suggestion_id'] ?? 0);
$body = trim($input['body'] ?? '');

if ($suggestionId <= 0 || $body === '') {
  http_response_code(400);
  echo json_encode(['error' => true, 'message' => 'suggestion_id and body are required.']);
  exit;
}
if (mb_strlen($body) > 2000) {
  http_response_code(400);
  echo json_encode(['error' => true, 'message' => 'Suggestion is too long.']);
  exit;
}

$pdo = null;
try {
  $pdo = get_pdo();
  $pdo->beginTransaction();

  $stmt = $pdo->prepare('
    SELECT ts.user_id, ts.status, tk.source_hash
    FROM translation_suggestions ts
    JOIN translation_keys tk ON tk.id = ts.translation_key_id
    WHERE ts.id = ?
    FOR UPDATE OF ts
  ');
  $stmt->execute([$suggestionId]);
  $suggestion = $stmt->fetch();

  if (!$suggestion) {
    $pdo->rollBack();
    http_response_code(404);
    echo json_encode(['error' => true, 'message' => 'Suggestion not found.']);
    exit;
  }
  if ((int) $suggestion['user_id'] !== (int) $user['id']) {
    $pdo->rollBack();
    http_response_code(403);
    echo json_encode(['error' => true, 'message' => 'You can only edit your own suggestions.']);
    exit;
  }
  if ($suggestion['status'] !== 'pending') {
    $pdo->rollBack();
    http_response_code(409);
    echo json_encode(['error' => true, 'message' => 'Only pending suggestions can be edited.']);
    exit;
  }

  // created_at is left untouched on purpose - editing refines the wording of
  // an existing pending suggestion rather than starting a new one, so it must
  // not restart that suggestion's time-limit countdown (see
  // resolveExpiredPending in tools/scripts/export-translations.js).
  // source_hash_at_submission IS refreshed, since re-submitting the wording
  // now is also confirmation it still matches the current English source.
  $pdo->prepare("
    UPDATE translation_suggestions
    SET body = ?, source_hash_at_submission = ?, updated_at = now()
    WHERE id = ?
  ")->execute([$body, $suggestion['source_hash'], $suggestionId]);

  $pdo->commit();

  echo json_encode(['ok' => true, 'suggestion' => ['id' => $suggestionId, 'body' => $body]]);
} catch (Throwable $e) {
  if ($pdo && $pdo->inTransaction()) {
    $pdo->rollBack();
  }
  http_response_code(502);
  echo json_encode(['error' => true, 'message' => $e->getMessage()]);
}
