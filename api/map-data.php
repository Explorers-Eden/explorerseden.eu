<?php
// The world map's data from the panel: ?f=info (dimensions, borders, title; cached a minute) or ?f=live (players, claims, hubs, status; 5 s).
require_once __DIR__ . '/../translate/lib/panel_public.php';
$base = getenv('PANEL_MAP_URL') ?: 'https://map.explorerseden.eu';
$live = ($_GET['f'] ?? 'info') === 'live';
panel_public_json($base, $live ? '/map/data/live.json' : '/map/data/info.json', $live ? 5 : 60);
