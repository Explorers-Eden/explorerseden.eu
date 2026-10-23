<?php
/*
 * The SMP market's player side, from the Nice Control Center panel (PANEL_PUBLIC_URL): a logged-in player's
 * bank balance and buying with it. The panel trusts the Discord id we send because of PANEL_WEB_TOKEN (the
 * panel's WEBSITE_TOKEN), so only call this with the id of the logged-in user.
 */

function panel_web_post(string $path, array $body): array {
  $base = rtrim(getenv('PANEL_PUBLIC_URL') ?: 'https://serverinfo.explorerseden.eu', '/');
  $token = getenv('PANEL_WEB_TOKEN') ?: '';
  if ($token === '') {
    return [503, ['error' => 'Buying on the website isn\'t set up yet.']];
  }
  $ctx = stream_context_create(['http' => [
    'method' => 'POST',
    'timeout' => 12,
    'ignore_errors' => true,
    'header' => "Content-Type: application/json\r\nAccept: application/json\r\nAuthorization: Bearer {$token}\r\n",
    'content' => json_encode($body),
  ]]);
  $raw = @file_get_contents($base . '/info/web/' . $path, false, $ctx);
  $status = 502;
  foreach ($http_response_header ?? [] as $h) {
    if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) $status = (int) $m[1];
  }
  $json = $raw === false ? null : json_decode($raw, true);
  if (!is_array($json)) {
    return [502, ['error' => 'The market can\'t be reached right now.']];
  }
  return [$status, $json];
}
