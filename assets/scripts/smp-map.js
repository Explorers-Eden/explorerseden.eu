(() => {
  'use strict';

  // The SMP's world map: tiles straight from the server panel, the rest through /api/map-data.php.
  // Ported from the panel's own map (Nice Control Center), in the site's style; logged-in players also see
  // their own claims and hubs marked (and their private hubs).
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isHex = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
  // Blocks to map coordinates: x → lng, z → -lat (north is up).
  const ll = (x, z) => L.latLng(-z, x);
  const head = (uuid, size) => `/api/head.php?u=${encodeURIComponent(uuid)}&s=${size}`;

  // Opened from My SMP Profile ("Map" on a claim or hub): a way back to where the player was.
  {
    const back = new URLSearchParams(location.search).get('back');
    if (back && back.startsWith('/') && !back.startsWith('//')) {
      const a = document.createElement('a');
      a.className = 'filter-chip smp-map-back';
      a.href = back;
      a.innerHTML = '<i class="bi bi-arrow-left"></i> Back to My SMP Profile';
      document.querySelector('.smp-map-head').prepend(a);
    }
  }

  const map = L.map('map', { crs: L.CRS.Simple, minZoom: -5, maxZoom: 3, zoomSnap: 1, attributionControl: false, zoomControl: true });
  const layers = {
    players: L.layerGroup().addTo(map),
    claims: L.layerGroup().addTo(map),
    hubs: L.layerGroup().addTo(map),
    border: L.layerGroup().addTo(map),
  };
  const LABELS = { players: ['bi-people-fill', 'Players'], claims: ['bi-shield-lock', 'Claims'], hubs: ['bi-signpost-split', 'Hubs'], border: ['bi-bounding-box', 'Borders'] };
  let info = null;
  let dim = null;
  let tiles = null;
  let live = null;
  // The logged-in player's claims and hubs (from their profile), to mark them.
  let mine = null;

  map.on('zoomend', () => document.body.classList.toggle('smp-map-crisp', map.getZoom() > 0));

  function hash() {
    const c = map.getCenter();
    history.replaceState(null, '', `#${dim.key}/${Math.round(c.lng)}/${Math.round(-c.lat)}/${map.getZoom()}`);
  }

  function setDim(key, x, z, zoom) {
    dim = info.dimensions.find((d) => d.key === key) || info.dimensions[0];
    if (tiles) map.removeLayer(tiles);
    tiles = L.tileLayer(`${info.base}/map/tiles/${dim.key}/{z}/{x}_{y}.png`, {
      tileSize: 512, minZoom: -5, maxZoom: 3, minNativeZoom: -5, maxNativeZoom: 0, noWrap: true, keepBuffer: 2,
      errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
    }).addTo(map);
    tiles.bringToBack();
    const spawn = dim.spawn || { x: 0, z: 0 };
    map.setView(ll(x ?? spawn.x, z ?? spawn.z), zoom ?? (x != null ? 1 : -1));
    document.querySelectorAll('#mp-dims [data-dim]').forEach((b) => b.classList.toggle('is-active', b.dataset.dim === dim.key));
    drawBorder();
    drawLive();
  }

  function ring(shape, x, z, r, style, label) {
    const shapeLayer = shape === 'circle' ? L.circle(ll(x, z), Object.assign({ radius: r }, style))
      : L.rectangle([ll(x - r, z - r), ll(x + r + 1, z + r + 1)], style);
    return shapeLayer.bindTooltip(label, { sticky: true, className: 'smp-map-tip' }).addTo(layers.border);
  }

  function drawBorder() {
    layers.border.clearLayers();
    const b = dim.borders;
    if (b) {
      ring(b.shape, b.x, b.z, b.soft, { color: '#6fe89b', weight: 2, fill: false }, 'Permanent area: never reset');
      if (b.hard > 0) {
        ring(b.shape, b.x, b.z, b.hard, { color: '#ff9090', weight: 2, dashArray: '8 6', fill: false },
          info.nextReset ? `Outer wilds beyond the green line reset ${when(info.nextReset)}` : 'Edge of the world');
        return;
      }
    }
    const wb = dim.border;
    if (!wb || wb.size >= 59999968) return;
    const h = wb.size / 2;
    L.rectangle([ll(wb.x - h, wb.z - h), ll(wb.x + h, wb.z + h)], { color: '#ff9090', weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(layers.border);
  }

  function when(at) {
    const midnight = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const days = Math.round((midnight(at) - midnight(Date.now())) / 86400000);
    const time = new Date(at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return days <= 0 ? `today (${time})` : days === 1 ? `tomorrow (${time})` : `in ${days} days (${time})`;
  }

  const isMineClaim = (c) => mine && mine.claims.some((m) => m.id === c.id);
  const isMineHub = (h) => mine && mine.hubs.some((m) => m.x === h.x && m.z === h.z && (m.dimension === h.dim || m.dim === h.dim));

  function hubMarker(h, own, privateHub) {
    const color = isHex(h.color) ? h.color : isHex(h.hex) ? h.hex : '';
    const icon = L.divIcon({
      className: `smp-map-hub${own ? ' is-mine' : ''}`,
      html: `<i class="bi ${privateHub ? 'bi-lock-fill' : 'bi-geo-alt-fill'}"${color ? ` style="color:${color}"` : ''}></i>`,
      iconSize: [26, 26], iconAnchor: [13, 24],
    });
    const face = /^[0-9a-f]{20,80}$/.test(h.head || '') ? `<img class="smp-map-face" src="${esc(info.base)}/map/heads/${h.head}" alt="" width="40" height="40" onerror="this.remove()">` : '';
    return L.marker(ll(h.x + 0.5, h.z + 0.5), { icon })
      .bindPopup(`<div class="smp-map-pop">${face}<div><b>${esc(h.name)}</b>${own ? ' <span class="smp-map-mine">Yours</span>' : ''}${privateHub ? ' <span class="smp-map-mine is-private">Private</span>' : ''}
        ${h.description ? `<span class="smp-map-pop__sub">${esc(h.description)}</span>` : ''}
        <small>${h.owner ? 'by ' + esc(h.owner) + ' · ' : ''}${h.x}, ${h.y}, ${h.z}</small></div></div>`, { className: 'smp-map-popup' });
  }

  function drawLive() {
    if (!live || !dim) return;
    for (const k of ['players', 'claims', 'hubs']) layers[k].clearLayers();
    for (const c of (live.claims || []).filter((c) => c.dim === dim.id)) {
      const r = Math.max(c.radius || 0, 1);
      L.rectangle([ll(c.x - r, c.z - r), ll(c.x + r + 1, c.z + r + 1)], { color: '#b6c8ff', weight: 1.5, fillOpacity: 0.12 })
        .bindPopup(`<b>${esc((c.owners || []).join(', ') || 'Claim')}</b><br><small>${c.x}, ${c.z} · radius ${c.radius}</small>`, { className: 'smp-map-popup' })
        .addTo(layers.claims);
    }
    for (const c of (live.landClaims || []).filter((c) => c.dim === dim.id)) {
      const own = isMineClaim(c);
      L.rectangle([ll(c.minX, c.minZ), ll(c.maxX, c.maxZ)], {
        color: own ? '#ffffff' : c.color, weight: own ? 3 : c.sub ? 1 : 2, dashArray: c.sub ? '4 4' : null,
        fillColor: c.color, fillOpacity: own ? 0.3 : c.sub ? 0.08 : 0.18,
      }).bindPopup(`<b>${esc(c.name)}</b>${own ? ' <span class="smp-map-mine">Yours</span>' : ''}<br>${esc(c.owner)}${(c.members || []).length ? `<br><small>Members: ${esc(c.members.join(', '))}</small>` : ''}`
          + `<br><small>${c.maxX - c.minX} × ${c.maxZ - c.minZ} · ${Math.floor((c.minX + c.maxX) / 2)}, ${Math.floor((c.minZ + c.maxZ) / 2)}</small>`, { className: 'smp-map-popup' })
        .addTo(layers.claims);
    }
    const shown = [];
    for (const h of (live.hubs || []).filter((h) => h.dim === dim.id)) {
      hubMarker(h, isMineHub(h), false).addTo(layers.hubs);
      shown.push(`${h.x},${h.z}`);
    }
    // The player's own hubs the public map leaves out (private ones).
    if (mine) for (const h of mine.hubs.filter((h) => (h.dimension || h.dim) === dim.id && !shown.includes(`${h.x},${h.z}`))) {
      hubMarker({ ...h, dim: h.dimension }, true, !h.public).addTo(layers.hubs);
    }
    for (const p of (live.players || []).filter((p) => p.dim === dim.id)) {
      L.marker(ll(p.x + 0.5, p.z + 0.5), { icon: L.icon({ iconUrl: head(p.uuid, 24), iconSize: [24, 24], className: 'smp-map-player' }) })
        .bindTooltip(esc(p.name), { direction: 'top', offset: [0, -12], className: 'smp-map-tip' })
        .addTo(layers.players);
    }
    $('mp-players').innerHTML = (live.players || []).length
      ? `<p class="smp-map-sub">Online now</p>` + live.players.map((p) => `<button type="button" data-player="${esc(p.uuid)}"><img src="${head(p.uuid, 18)}" alt="">${esc(p.name)}<small>${p.dim === dim.id ? `${p.x}, ${p.z}` : esc(p.dim.split(':').pop().replace(/_/g, ' '))}</small></button>`).join('')
      : '';
  }

  let clock = null;
  let clockAt = 0;
  function drawClock() {
    const box = $('mp-clock');
    if (!clock || (live && live.status && live.status.state === 'offline')) {
      box.hidden = true;
      return;
    }
    let time = clock.time || '';
    if (clock.minuteOfDay != null) {
      const elapsed = Math.min(15, (Date.now() - clockAt) / 1000);
      const m = ((Math.floor(clock.minuteOfDay + elapsed * 1.2) % 1440) + 1440) % 1440;
      const h = Math.floor(m / 60);
      const mm = String(m % 60).padStart(2, '0');
      time = clock.twelveHour ? `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}` : `${String(h).padStart(2, '0')}:${mm}`;
    }
    const icon = clock.weather === 'thunder' ? 'bi-cloud-lightning-rain' : clock.weather === 'rain' ? 'bi-cloud-rain' : clock.day ? 'bi-sun' : 'bi-moon-stars';
    box.innerHTML = `<i class="bi ${icon}"></i><b>${esc(time)}</b><span>${clock.weekday ? esc(clock.weekday) + ', ' : ''}${esc(clock.date || '')}</span>`;
    box.hidden = false;
  }
  setInterval(drawClock, 1000);

  function drawStatus() {
    const st = live && live.status;
    $('mp-status').hidden = !st || info.showStatus === false;
    if (!st) return;
    clock = st.clock || null;
    clockAt = Date.now();
    drawClock();
    $('mp-dot').className = 'smp-map-dot is-' + st.state;
    $('mp-state').textContent = { online: 'Online', offline: 'Offline', maintenance: 'Maintenance' }[st.state] || st.state;
    $('mp-count').textContent = st.state === 'offline' ? '' : `${st.players} / ${st.maxPlayers} players`;
    const facts = [];
    if (st.uptime7d != null) facts.push(['Uptime', `${st.uptime7d.toLocaleString(undefined, { maximumFractionDigits: 1 })} % this week`]);
    if (info.nextRestart) facts.push(['Next restart', esc(when(info.nextRestart))]);
    if (info.nextReset && info.dimensions.some((d) => d.borders && d.borders.hard > 0)) facts.push(['Outer wilds reset', esc(when(info.nextReset))]);
    $('mp-facts').innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }

  async function poll() {
    try {
      const res = await fetch('/api/map-data.php?f=live', { cache: 'no-store' });
      if (res.ok) {
        live = await res.json();
        drawLive();
        drawStatus();
      }
    } catch { /* next time */ }
    setTimeout(poll, 5000);
  }

  map.on('mousemove', (e) => { $('mp-coords').textContent = `x ${Math.floor(e.latlng.lng)} · z ${Math.floor(-e.latlng.lat)}`; });
  map.on('moveend', () => dim && hash());

  $('mp-players').addEventListener('click', (e) => {
    const b = e.target.closest('[data-player]');
    const p = b && live && live.players.find((x) => x.uuid === b.dataset.player);
    if (!p) return;
    const key = info.dimensions.find((d) => d.id === p.dim)?.key;
    if (key && key !== dim.key) setDim(key, p.x, p.z, 1);
    else map.setView(ll(p.x, p.z), Math.max(map.getZoom(), 1));
  });

  function message(text) {
    $('mp-message').textContent = text;
    $('mp-message').hidden = false;
  }

  (async () => {
    try {
      const res = await fetch('/api/map-data.php?f=info', { cache: 'no-store' });
      info = await res.json();
      if (!res.ok || info.error || !info.dimensions) throw new Error(info.error || 'off');
    } catch (err) {
      message(err.message && err.message !== 'off' ? err.message : 'The map isn\'t available right now.');
      return;
    }
    if (info.title) $('mp-title').textContent = info.title;
    if (window.matchMedia('(max-width: 700px)').matches) $('mp-status').open = false;
    $('mp-dims').innerHTML = info.dimensions.map((d) => `<button type="button" class="filter-chip" data-dim="${esc(d.key)}"><i class="bi bi-globe2" aria-hidden="true"></i> ${esc(d.name)}</button>`).join('');
    $('mp-dims').addEventListener('click', (e) => { const b = e.target.closest('[data-dim]'); if (b) setDim(b.dataset.dim); });
    $('mp-layers').innerHTML = Object.entries(LABELS).map(([k, [icon, l]]) => `<button type="button" class="filter-chip is-active" data-layer="${k}" aria-pressed="true"><i class="bi ${icon}" aria-hidden="true"></i> ${l}</button>`).join('');
    $('mp-layers').addEventListener('click', (e) => {
      const b = e.target.closest('[data-layer]');
      if (!b) return;
      const on = !b.classList.contains('is-active');
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
      if (on) layers[b.dataset.layer].addTo(map); else map.removeLayer(layers[b.dataset.layer]);
    });
    const [key, x, z, zoom] = decodeURIComponent(location.hash.slice(1)).split('/');
    setDim(key, x === undefined ? undefined : Number(x), z === undefined ? undefined : Number(z), zoom === undefined ? undefined : Number(zoom));
    poll();
    // Logged in: their own claims and hubs (quietly nothing otherwise).
    try {
      const res = await fetch('/api/profile-live.php', { cache: 'no-store' });
      const me = await res.json();
      if (me && me.loggedIn && !me.error) {
        mine = { claims: me.claims || [], hubs: me.hubs || [] };
        drawLive();
      }
    } catch { /* not logged in */ }
  })();
})();
