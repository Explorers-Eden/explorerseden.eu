<?php
/*
 * Public JSON from the Nice Control Center panel (map and server info), cached in the system temp folder so
 * the website asks the panel at most once per $ttl seconds. Adds "base": the panel address, for the icons
 * and tiles the data points to.
 */
function panel_public_json(string $base, string $path, int $ttl): void {
  header('Content-Type: application/json; charset=utf-8');
  $base = rtrim($base, '/');
  $file = sys_get_temp_dir() . '/ee-panel-' . md5($base . $path) . '.json';
  if (is_file($file) && time() - filemtime($file) < $ttl) {
    header('Cache-Control: public, max-age=' . $ttl);
    readfile($file);
    return;
  }
  $ctx = stream_context_create(['http' => ['timeout' => 8, 'ignore_errors' => true, 'header' => "Accept: application/json\r\n"]]);
  $raw = @file_get_contents($base . $path, false, $ctx);
  $status = 502;
  foreach ($http_response_header ?? [] as $h) {
    if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) $status = (int) $m[1];
  }
  $json = $raw === false ? null : json_decode($raw, true);
  if ($status !== 200 || !is_array($json)) {
    // An older copy is better than nothing while the panel is away.
    if (is_file($file)) {
      header('Cache-Control: no-store');
      readfile($file);
      return;
    }
    http_response_code($status === 404 ? 404 : 502);
    echo json_encode(['error' => $status === 404 ? 'This page is switched off on the server.' : 'The server panel can\'t be reached right now.']);
    return;
  }
  $json['base'] = $base;
  $out = json_encode($json);
  @file_put_contents($file . '.tmp', $out) && @rename($file . '.tmp', $file);
  header('Cache-Control: public, max-age=' . $ttl);
  echo $out;
}
