<?php
// Weekly leaderboards (games, dungeons, Rogue Runs) from the Nice Control Center panel: this week and last week, top 10
// each. Cached for 5 minutes so the panel isn't asked on every page view.
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../translate/lib/panel_web.php';

$cache = __DIR__ . '/../assets/cache/weekly.json';
if (is_file($cache) && time() - filemtime($cache) < 300) {
  readfile($cache);
  exit;
}
[$status, $data] = panel_web_post('weekly', []);
if ($status !== 200 || isset($data['error'])) {
  if (is_file($cache)) {
    readfile($cache);
    exit;
  }
  http_response_code($status === 200 ? 502 : $status);
  echo json_encode(['error' => $data['error'] ?? 'The server panel can\'t be reached right now.']);
  exit;
}
$json = json_encode($data);
@mkdir(dirname($cache), 0775, true);
@file_put_contents($cache, $json);
echo $json;
