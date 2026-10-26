<?php
// A player's face (head + hat layer) as a PNG, drawn from their Mojang skin and cached for a day.
// /api/head.php?u=<uuid> or ?name=<player>, optional &s=<size> (8-128). Replaces mc-heads.net, whose cache
// sometimes answers with Steve. Falls back to mc-heads.net when Mojang can't be reached.
$uuid = strtolower(preg_replace('/[^0-9a-fA-F]/', '', (string) ($_GET['u'] ?? '')));
$name = preg_replace('/[^A-Za-z0-9_]/', '', (string) ($_GET['name'] ?? ''));
$size = max(8, min(128, (int) ($_GET['s'] ?? 64)));
$dir = sys_get_temp_dir() . '/ee-heads';
$ttl = 86400;

function http_json(string $url): ?array {
  $ctx = stream_context_create(['http' => ['timeout' => 6, 'ignore_errors' => true, 'header' => "Accept: application/json\r\nUser-Agent: explorerseden.eu\r\n"]]);
  $raw = @file_get_contents($url, false, $ctx);
  $json = $raw === false ? null : json_decode($raw, true);
  return is_array($json) ? $json : null;
}

function fallback(string $who, int $size): void {
  header('Cache-Control: public, max-age=300');
  header('Location: https://mc-heads.net/avatar/' . rawurlencode($who) . '/' . $size, true, 302);
  exit;
}

if (strlen($uuid) !== 32 && $name !== '') {
  @mkdir($dir, 0775, true);
  $map = $dir . '/name-' . strtolower($name) . '.txt';
  if (is_file($map) && time() - filemtime($map) < $ttl) {
    $uuid = trim((string) file_get_contents($map));
  } else {
    $p = http_json('https://api.mojang.com/users/profiles/minecraft/' . rawurlencode($name));
    if (!empty($p['id'])) {
      $uuid = strtolower($p['id']);
      @file_put_contents($map, $uuid);
    }
  }
}
if (strlen($uuid) !== 32) {
  if ($name !== '') fallback($name, $size);
  http_response_code(400);
  exit;
}

@mkdir($dir, 0775, true);
$file = "$dir/$uuid.png";
if (!is_file($file) || time() - filemtime($file) > $ttl) {
  $ok = false;
  $profile = http_json("https://sessionserver.mojang.com/session/minecraft/profile/$uuid");
  $skinUrl = null;
  foreach (($profile['properties'] ?? []) as $prop) {
    if (($prop['name'] ?? '') !== 'textures') continue;
    $tex = json_decode(base64_decode((string) $prop['value']), true);
    $skinUrl = $tex['textures']['SKIN']['url'] ?? null;
  }
  if ($skinUrl && function_exists('imagecreatefromstring')) {
    $skinUrl = preg_replace('#^http://#', 'https://', $skinUrl);
    $raw = @file_get_contents($skinUrl, false, stream_context_create(['http' => ['timeout' => 6]]));
    $skin = $raw === false ? false : @imagecreatefromstring($raw);
    if ($skin) {
      $face = imagecreatetruecolor(8, 8);
      imagealphablending($face, false);
      imagesavealpha($face, true);
      imagefill($face, 0, 0, imagecolorallocatealpha($face, 0, 0, 0, 127));
      imagecopy($face, $skin, 0, 0, 8, 8, 8, 8);
      imagealphablending($face, true);
      imagecopy($face, $skin, 0, 0, 40, 8, 8, 8); // the hat layer over the face
      $big = imagecreatetruecolor(128, 128);
      imagealphablending($big, false);
      imagesavealpha($big, true);
      imagecopyresized($big, $face, 0, 0, 0, 0, 128, 128, 8, 8);
      $ok = imagepng($big, "$file.tmp") && rename("$file.tmp", $file);
    }
  }
  if (!$ok && !is_file($file)) fallback($uuid, $size);
}

// Scaled to the asked size without smoothing.
$img = @imagecreatefrompng($file);
if (!$img) fallback($uuid, $size);
$out = imagecreatetruecolor($size, $size);
imagealphablending($out, false);
imagesavealpha($out, true);
imagecopyresized($out, $img, 0, 0, 0, 0, $size, $size, 128, 128);
header('Content-Type: image/png');
header('Cache-Control: public, max-age=3600');
imagepng($out);
