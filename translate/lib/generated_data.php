<?php
require_once __DIR__ . '/db.php';

// Reads what tools/scripts/publish-generated-data.js writes (see
// db/migrations/0003_generated_site_data.sql) - the CI-generated JSON
// manifests this app serves at runtime, kept out of the (public) git repo
// so a new generate run is live within minutes instead of waiting for the
// next Docker image redeploy.

// PDO's pgsql driver returns timestamptz as e.g. "2026-09-25 14:22:42.28+00" -
// not reliably parseable by JS's `new Date()` across browsers. Normalize to
// ISO 8601 with an explicit offset once here so every caller (and any JS
// that embeds it, e.g. My SMP Profile's "Updated ..." line) can just new
// Date() it safely.
function normalize_updated_at(string $raw): string {
  try {
    return (new DateTime($raw))->format(DateTime::ATOM);
  } catch (Exception) {
    return $raw;
  }
}

function get_generated_data(string $key): ?array {
  $pdo = get_pdo();
  $stmt = $pdo->prepare('SELECT data, updated_at FROM generated_data WHERE key = ?');
  $stmt->execute([$key]);
  $row = $stmt->fetch();
  if (!$row) {
    return null;
  }
  return ['data' => json_decode($row['data'], true), 'updatedAt' => normalize_updated_at($row['updated_at'])];
}

function get_player_profile(string $discordId): ?array {
  $pdo = get_pdo();
  $stmt = $pdo->prepare('SELECT data, updated_at FROM player_profiles WHERE discord_id = ?');
  $stmt->execute([$discordId]);
  $row = $stmt->fetch();
  if (!$row) {
    return null;
  }
  return ['data' => json_decode($row['data'], true), 'updatedAt' => normalize_updated_at($row['updated_at'])];
}

// Small table (one row per linked player) - full scan mirrors what
// profiles/api/aggregate.php used to do with glob() + json_decode per file.
function get_all_player_profiles(): array {
  $pdo = get_pdo();
  $rows = $pdo->query('SELECT data FROM player_profiles')->fetchAll();
  return array_map(fn($row) => json_decode($row['data'], true), $rows);
}

// Emits $row (from get_generated_data()/get_player_profile()) as JSON,
// honoring If-None-Match with a 304 - reproduces the "revalidate but 304
// when unchanged" behavior the root .htaccess documents for static files,
// now that this data comes from a dynamic PHP response instead of one.
function serve_generated_data_with_etag(?array $row): void {
  header('Content-Type: application/json; charset=utf-8');

  if (!$row) {
    http_response_code(404);
    echo json_encode(['error' => true, 'message' => 'Not found.']);
    return;
  }

  $etag = '"' . sha1($row['updatedAt']) . '"';
  header('Cache-Control: public, max-age=60');
  header("ETag: $etag");

  $ifNoneMatch = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
  if ($ifNoneMatch === $etag) {
    http_response_code(304);
    return;
  }

  echo json_encode($row['data']);
}
