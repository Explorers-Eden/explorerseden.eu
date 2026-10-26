<?php
// The server's public info (settings, game rules, data pack settings, commands, claims, tweaks, market, hubs…) from the panel, cached a minute.
require_once __DIR__ . '/../translate/lib/panel_public.php';
panel_public_json(getenv('PANEL_PUBLIC_URL') ?: 'https://serverinfo.explorerseden.eu', '/info/data.json', 60);
