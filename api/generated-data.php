<?php
require_once __DIR__ . '/../translate/lib/db.php';
require_once __DIR__ . '/../translate/lib/generated_data.php';

// Allow-list, not a free-form key passthrough - keeps this from becoming an
// arbitrary read oracle over the generated_data table.
const ALLOWED_KEYS = [
  'enchantments',
  'recipes-manifest',
  'structures-manifest',
  'data-pack-configurator',
  'resource-pack-assembler',
  'waypoint-hubs-manifest',
];

$key = $_GET['key'] ?? '';

if (!in_array($key, ALLOWED_KEYS, true)) {
  http_response_code(404);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['error' => true, 'message' => 'Unknown key.']);
  exit;
}

try {
  serve_generated_data_with_etag(get_generated_data($key));
} catch (Throwable $e) {
  http_response_code(502);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['error' => true, 'message' => $e->getMessage()]);
}
