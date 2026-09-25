<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/generated_data.php';

$user = current_user();

if (!$user) {
  echo json_encode(['loggedIn' => false]);
  exit;
}

$avatarUrl = $user['avatar_hash']
  ? "https://cdn.discordapp.com/avatars/{$user['discord_id']}/{$user['avatar_hash']}.png?size=64"
  : '/assets/images/icons/discord-default-avatar.png';

echo json_encode([
  'loggedIn' => true,
  'user' => [
    'username' => $user['global_name'] ?: $user['username'],
    'role' => $user['role'],
    'discordId' => $user['discord_id'],
    'avatarUrl' => $avatarUrl,
    'hasProfile' => get_player_profile($user['discord_id']) !== null,
  ],
  'csrfToken' => csrf_token(),
]);
