<?php
// The logged-in player's market bank (balance, mailbox, recent trades) for the market and profile pages.
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../translate/lib/db.php';
require_once __DIR__ . '/../translate/lib/auth.php';
require_once __DIR__ . '/../translate/lib/panel_web.php';

$user = current_user();
if (!$user) {
  echo json_encode(['loggedIn' => false]);
  exit;
}

[$status, $data] = panel_web_post('account', ['discordId' => (string) $user['discord_id']]);
if ($status !== 200 || isset($data['error'])) {
  http_response_code($status === 200 ? 502 : $status);
  echo json_encode(['loggedIn' => true, 'error' => $data['error'] ?? 'The market can\'t be reached right now.']);
  exit;
}

echo json_encode([
  'loggedIn' => true,
  'csrfToken' => csrf_token(),
  'running' => (bool) ($data['running'] ?? false),
  'accounts' => array_values(array_filter((array) ($data['accounts'] ?? []), 'is_array')),
]);
