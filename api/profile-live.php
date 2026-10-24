<?php
// My SMP Profile, live from the panel: the player's claims, waypoint hubs and market listings, with what they may change.
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../translate/lib/db.php';
require_once __DIR__ . '/../translate/lib/auth.php';
require_once __DIR__ . '/../translate/lib/generated_data.php';
require_once __DIR__ . '/../translate/lib/panel_web.php';

$user = current_user();
if (!$user) {
  echo json_encode(['loggedIn' => false]);
  exit;
}
$profile = get_player_profile((string) $user['discord_id']);
$uuid = (string) ($profile['data']['uuid'] ?? '');
if ($uuid === '') {
  echo json_encode(['loggedIn' => true, 'error' => 'No player linked yet.']);
  exit;
}

[$status, $data] = panel_web_post('profile', ['discordId' => (string) $user['discord_id'], 'uuid' => $uuid]);
if ($status !== 200 || isset($data['error'])) {
  http_response_code($status === 200 ? 502 : $status);
  echo json_encode(['loggedIn' => true, 'error' => $data['error'] ?? 'The server panel can\'t be reached right now.']);
  exit;
}
echo json_encode(['loggedIn' => true, 'csrfToken' => csrf_token(), 'uuid' => $uuid] + $data);
