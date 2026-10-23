<?php
// Buys something on the SMP market with the logged-in player's bank (only while the server runs).
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../translate/lib/db.php';
require_once __DIR__ . '/../translate/lib/auth.php';
require_once __DIR__ . '/../translate/lib/panel_web.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  http_response_code(405);
  echo json_encode(['error' => true, 'message' => 'POST only.']);
  exit;
}
$user = require_auth();
require_csrf();

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) $in = [];
$kind = (string) ($in['kind'] ?? '');
if (!in_array($kind, ['listing', 'claims', 'command', 'pet'], true)) {
  http_response_code(400);
  echo json_encode(['error' => true, 'message' => 'What should be bought?']);
  exit;
}

[$status, $data] = panel_web_post('buy', [
  'discordId' => (string) $user['discord_id'],
  'uuid' => (string) ($in['uuid'] ?? ''),
  'kind' => $kind,
  'id' => (string) ($in['id'] ?? ''),
  'amount' => (string) (int) ($in['amount'] ?? 1),
  'price' => (string) (int) ($in['price'] ?? 0),
  'per' => (string) (int) ($in['per'] ?? 1),
]);
// The site's scripts read "message" for errors (like the other APIs here).
if ($status !== 200 || isset($data['error'])) {
  http_response_code($status === 200 ? 502 : $status);
  echo json_encode(['error' => true, 'message' => $data['error'] ?? 'That didn\'t work. Try again in a moment.']);
  exit;
}
// The market page shows the new listings at once.
@unlink(__DIR__ . '/../assets/cache/market.json');
echo json_encode(['ok' => true, 'message' => (string) ($data['message'] ?? 'Bought.'), 'balance' => $data['balance'] ?? null]);
