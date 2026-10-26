<?php
/*
 * The SMP market right now for /market/: what players and the server sell, from the server info page of the
 * Nice Control Center panel (PANEL_PUBLIC_URL, e.g. https://serverinfo.explorerseden.eu), which already only
 * shows public data. Cached for a minute so visitors don't each ask the panel; the last copy is used while
 * the panel can't be reached.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$base = rtrim(getenv('PANEL_PUBLIC_URL') ?: 'https://serverinfo.explorerseden.eu', '/');
$cacheDir = __DIR__ . '/assets/cache';
$cacheFile = $cacheDir . '/market.json';

if (is_file($cacheFile) && time() - filemtime($cacheFile) < 60) {
    readfile($cacheFile);
    exit;
}

$ctx = stream_context_create(['http' => ['timeout' => 6, 'header' => "Accept: application/json\r\n", 'ignore_errors' => true]]);
$raw = @file_get_contents($base . '/info/data.json', false, $ctx);
$data = $raw === false ? null : json_decode($raw, true);
if (!is_array($data) || isset($data['error'])) {
    if (is_file($cacheFile)) {
        readfile($cacheFile);
        exit;
    }
    http_response_code(502);
    echo json_encode(['error' => "The market can't be reached right now."]);
    exit;
}

function item_icon($base, $hash) {
    return is_string($hash) && preg_match('/^[0-9a-f]{20,80}$/', $hash) ? $base . '/info/items/' . $hash . '.png' : null;
}

function head_icon($base, $hash) {
    return is_string($hash) && preg_match('/^[0-9a-f]{20,80}$/', $hash) ? $base . '/info/heads/' . $hash . '.png' : null;
}

$m = is_array($data['market'] ?? null) ? $data['market'] : null;
$out = [
    'updated' => (int) (microtime(true) * 1000),
    'open' => $m !== null,
    'currency' => $m['currency'] ?? 'minecraft:diamond',
    'currencyIcon' => item_icon($base, $m['currencyIcon'] ?? null),
    'serverName' => $m['serverName'] ?? 'the server',
    'listings' => [],
    'server' => [],
    'pets' => [],
];
foreach (($m['listings'] ?? []) as $l) {
    $out['listings'][] = [
        // For buying with the bank (api/market-buy.php); listing ids are random and say nothing about the seller.
        'id' => (string) ($l['id'] ?? ''),
        'kind' => 'listing',
        'name' => (string) ($l['name'] ?? ''),
        'item' => (string) ($l['item'] ?? ''),
        'lore' => array_values(array_filter((array) ($l['lore'] ?? []), 'is_string')),
        'enchantments' => array_values(array_filter((array) ($l['enchantments'] ?? []), 'is_string')),
        'amount' => (int) ($l['amount'] ?? 0),
        'price' => (int) ($l['price'] ?? 0),
        'per' => max(1, (int) ($l['per'] ?? 1)),
        'seller' => (string) ($l['seller'] ?? ''),
        'created' => (int) ($l['created'] ?? 0),
        'expires' => (int) ($l['expires'] ?? 0),
        'icon' => item_icon($base, $l['icon'] ?? null),
    ];
}
foreach (($m['server'] ?? []) as $o) {
    $out['server'][] = [
        'id' => (string) ($o['id'] ?? ''),
        'kind' => (string) ($o['kind'] ?? ''),
        'name' => (string) ($o['name'] ?? ''),
        'description' => (string) ($o['description'] ?? ''),
        'price' => (int) ($o['price'] ?? 0),
        'until' => isset($o['until']) ? (int) $o['until'] : null,
        'perPlayer' => isset($o['perPlayer']) ? (int) $o['perPlayer'] : null,
        // A player head with its own texture: the head, not the plain head item.
        'icon' => head_icon($base, $o['head'] ?? null) ?? item_icon($base, $o['icon'] ?? null),
    ];
}
foreach ((is_array($data['pets'] ?? null) ? $data['pets'] : []) as $p) {
    $out['pets'][] = [
        'id' => (string) ($p['id'] ?? ''),
        'kind' => 'pet',
        'name' => (string) ($p['name'] ?? ''),
        'description' => (string) ($p['description'] ?? ''),
        'price' => (int) ($p['price'] ?? 0),
        'until' => isset($p['until']) ? (int) $p['until'] : null,
        'left' => isset($p['left']) ? (int) $p['left'] : -1,
        'icon' => head_icon($base, $p['head'] ?? null),
        // What the pet learns as its bond grows (panel 1.16.2+; empty before that).
        'perks' => array_values(array_map(fn($k) => [
            'label' => (string) ($k['label'] ?? ''),
            'description' => (string) ($k['description'] ?? ''),
            'level' => (int) ($k['level'] ?? 0),
        ], array_filter((array) ($p['perks'] ?? []), 'is_array'))),
    ];
}

$json = json_encode($out);
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0775, true);
@file_put_contents($cacheFile, $json);
echo $json;
