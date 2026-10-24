<?php
// Changes from My SMP Profile: a claim (name, colour, switches, members), a waypoint hub, or a market listing (change it, take it back).
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../translate/lib/db.php';
require_once __DIR__ . '/../translate/lib/auth.php';
require_once __DIR__ . '/../translate/lib/generated_data.php';
require_once __DIR__ . '/../translate/lib/panel_web.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  http_response_code(405);
  echo json_encode(['error' => true, 'message' => 'POST only.']);
  exit;
}
$user = require_auth();
require_csrf();

$profile = get_player_profile((string) $user['discord_id']);
$uuid = (string) ($profile['data']['uuid'] ?? '');
$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) $in = [];
$kind = (string) ($in['kind'] ?? '');
// Only the fields each change may carry go on to the panel, which checks the rights again.
$fields = [
  'claim' => ['claim', 'action', 'name', 'color', 'flags', 'uuid_member', 'playerName', 'role'],
  'hub' => ['id', 'name', 'description', 'color', 'public', 'trusted'],
  'withdraw' => ['id'],
  'listing' => ['id', 'price', 'per', 'amount'],
];
if ($uuid === '' || !isset($fields[$kind])) {
  http_response_code(400);
  echo json_encode(['error' => true, 'message' => 'What should be changed?']);
  exit;
}
$body = ['discordId' => (string) $user['discord_id'], 'uuid' => $uuid];
foreach ($fields[$kind] as $k) {
  if (!array_key_exists($k, $in)) continue;
  // A member's id travels as uuid_member, so it can't stand in for the player's own uuid.
  if ($k === 'uuid_member') $body['memberUuid'] = (string) $in[$k];
  else $body[$k] = $in[$k];
}

[$status, $data] = panel_web_post($kind, $body);
if ($status !== 200 || isset($data['error'])) {
  http_response_code($status === 200 ? 502 : $status);
  echo json_encode(['error' => true, 'message' => $data['error'] ?? 'That didn\'t work. Try again in a moment.']);
  exit;
}
echo json_encode($data);
