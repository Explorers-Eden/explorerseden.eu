(function () {
  const dataEl = document.getElementById('profile-data');
  const root = document.getElementById('profile-groups');
  if (!dataEl || !root) return;

  let profile;
  try {
    profile = JSON.parse(dataEl.textContent);
  } catch {
    return;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // Must match tools/scripts/generate-homepage-skin-poses.js's WAVE_FRAME_COUNT
  // and assets/scripts/site.js's SKIN_WAVE_FRAME_COUNT.
  const SKIN_WAVE_FRAME_COUNT = 28;
  const SKIN_FRAME_INTERVAL_MS = 70;

  function skinWaveFramePath(uuid, frameIndex) {
    const padded = String(frameIndex).padStart(2, '0');
    return `/assets/images/generated/player-skins-home/${encodeURIComponent(uuid)}-center-${padded}.png`;
  }

  // Cycles the profile skin <img> through its full wave-frame sequence on a
  // timer, same as the homepage lineup's center figure.
  function animateProfileSkin() {
    const img = document.getElementById('profile-skin-frame');
    if (!img || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const { uuid } = img.dataset;
    const frameUrls = Array.from({ length: SKIN_WAVE_FRAME_COUNT }, (_, i) => skinWaveFramePath(uuid, i));
    frameUrls.forEach((url) => { new Image().src = url; });
    let index = 0;
    setInterval(() => {
      index = (index + 1) % frameUrls.length;
      img.src = frameUrls[index];
    }, SKIN_FRAME_INTERVAL_MS);
  }

  /** Minecraft text with § codes as HTML, like the game shows it; §r resets, §k is left out. */
  const MC_COLORS = { 0: '#000000', 1: '#0000AA', 2: '#00AA00', 3: '#00AAAA', 4: '#AA0000', 5: '#AA00AA', 6: '#FFAA00', 7: '#AAAAAA',
    8: '#555555', 9: '#5555FF', a: '#55FF55', b: '#55FFFF', c: '#FF5555', d: '#FF55FF', e: '#FFFF55', f: '#FFFFFF' };
  const MC_STYLES = { l: 'font-weight:800', o: 'font-style:italic', n: 'text-decoration:underline', m: 'text-decoration:line-through' };
  function mcHtml(text) {
    let out = '';
    let open = 0;
    for (const part of String(text ?? '').split(/(§[0-9a-fk-or])/i)) {
      const code = /^§([0-9a-fk-or])$/i.exec(part);
      if (!code) {
        out += esc(part);
        continue;
      }
      const c = code[1].toLowerCase();
      if (MC_COLORS[c] || c === 'r') {
        out += '</span>'.repeat(open);
        open = 0;
        if (MC_COLORS[c]) {
          out += `<span style="color:${MC_COLORS[c]}">`;
          open++;
        }
      } else if (MC_STYLES[c]) {
        out += `<span style="${MC_STYLES[c]}">`;
        open++;
      }
    }
    return out + '</span>'.repeat(open);
  }
  const mcPlain = (text) => String(text ?? '').replace(/§[0-9a-fk-or]/gi, '');

  const isHex = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
  const dimName = (id) => String(id || '').replace(/^minecraft:/, '').replace(/^[^:]*:/, '').replace(/_/g, ' ').replace(/\b([a-z])/g, (c) => c.toUpperCase());
  const plural = (n, one, many) => `${Number(n).toLocaleString()} ${n === 1 ? one : many}`;

  // ── Live data from the server panel (claims, hubs, listings, what may be changed) ──────────────
  // The rest of the profile is a copy made once an hour; these come fresh, and only they can be changed.

  let live = null;
  let liveError = null;
  // The bank right now, from the market (null until it answers).
  let bankBalance = null;
  // Recent trades (bought and sold), from the same answer.
  let accountSales = [];

  /** "Member since" in the header, once the live data says when they first joined. */
  function showSince() {
    const el = document.getElementById('profile-since');
    const first = live?.seen?.firstJoin;
    if (!el || !first) return;
    el.outerHTML = `<span class="profile-badge" id="profile-since" title="${live.seen.firstJoinEstimated ? 'Estimated from the save files' : 'First joined'}"><i class="bi bi-calendar-heart"></i> Member since ${esc(new Date(first).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</span>`;
  }

  async function loadLive() {
    try {
      const res = await fetch('/api/profile-live.php', { cache: 'no-store' });
      const json = await res.json();
      if (json.error) {
        liveError = typeof json.error === 'string' ? json.error : json.message;
        live = null;
      } else {
        live = json;
        liveError = null;
      }
    } catch {
      liveError = 'The server panel can\'t be reached right now.';
    }
    showSince();
    renderTabs();
  }

  async function send(body) {
    const res = await fetch('/api/profile-edit.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': live?.csrfToken || '' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw new Error(json.message || 'That didn\'t work. Try again in a moment.');
    return json;
  }

  // ── Building blocks ─────────────────────────────────────────────────────────

  function panel(id, icon, title, count, aside, body) {
    return `
      <section class="profile-panel" id="profile-panel-${id}">
        <header class="profile-panel__head">
          <span class="profile-panel__icon"><i class="bi ${icon}" aria-hidden="true"></i></span>
          <h2>${title}</h2>
          ${count != null ? `<span class="profile-count-badge">${count}</span>` : ''}
          ${aside ? `<span class="profile-panel__aside">${aside}</span>` : ''}
        </header>
        <div class="profile-panel__body">${body}</div>
      </section>`;
  }

  function action(icon, label, attrs) {
    return `<button type="button" class="profile-action" ${attrs}><span class="profile-action__icon"><i class="bi ${icon}" aria-hidden="true"></i></span>${label}</button>`;
  }

  function note(text, kind) {
    return `<span class="profile-note${kind ? ` profile-note--${kind}` : ''}">${text}</span>`;
  }

  function statTile(icon, label, value) {
    return `
      <div class="profile-stat-tile">
        <i class="bi ${icon}"></i>
        <div>
          <p class="profile-stat-tile__value">${value}</p>
          <p class="profile-stat-tile__label">${label}</p>
        </div>
      </div>`;
  }

  // "Damage Dealt" only exists inside statsDetailed's General category.
  function findStatValue(category, label) {
    const cat = (profile.statsDetailed || []).find((c) => c.category === category);
    const item = cat?.items.find((i) => i.label === label);
    return item?.value ?? '—';
  }

  // ── Header: skin, name, race/class, home ───────────────────────────────────

  function hero() {
    const badges = [];
    if (profile.race) badges.push(`<span class="profile-badge"><i class="bi bi-stars"></i> ${esc(profile.race)}</span>`);
    if (profile.class) badges.push(`<span class="profile-badge"><i class="bi bi-award"></i> ${esc(profile.class)}</span>`);
    if (!badges.length) badges.push('<span class="profile-badge profile-badge--muted">No race or class chosen yet</span>');
    if (profile.home) {
      badges.push(`<span class="profile-badge"><i class="bi bi-house-door-fill"></i> ${profile.home.x.toLocaleString()}, ${profile.home.y.toLocaleString()}, ${profile.home.z.toLocaleString()}
        <span class="profile-badge__dim">${esc(profile.home.dimension)}</span></span>`);
    }
    const skin = profile.uuid
      ? `<img class="profile-hero__skin" id="profile-skin-frame" src="${esc(skinWaveFramePath(profile.uuid, 0))}" data-uuid="${esc(profile.uuid)}" alt="${esc(profile.name)}'s skin" onerror="this.onerror=null;this.src='${esc(profile.skinIcon || '')}';">`
      : profile.skinIcon
        ? `<img class="profile-hero__skin" src="${esc(profile.skinIcon)}" alt="${esc(profile.name)}'s skin">`
        : '<div class="profile-hero__skin profile-hero__skin--missing"><i class="bi bi-person-fill"></i></div>';
    const updated = dataEl.dataset.updatedAt
      ? `<p class="profile-hero__updated"><i class="bi bi-arrow-clockwise"></i> Stats updated ${esc(new Date(dataEl.dataset.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))}</p>`
      : '';
    return `
      <section class="profile-hero">
        ${skin}
        <div class="profile-hero__main">
          <p class="profile-hero__eyebrow">My SMP Profile</p>
          <h1 class="profile-hero__name">${esc(profile.name)}</h1>
          <div class="profile-hero__badges">${badges.join('')}<span id="profile-since"></span></div>
          ${updated}
        </div>
      </section>`;
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────

  const TABS = [
    { id: 'overview', icon: 'bi-grid-1x2', label: 'Overview' },
    { id: 'claims', icon: 'bi-shield-lock', label: 'Claims' },
    { id: 'waypoints', icon: 'bi-signpost-split', label: 'Waypoints' },
    { id: 'market', icon: 'bi-shop', label: 'Market' },
    { id: 'pets', icon: 'bi-emoji-smile', label: 'Pets' },
    { id: 'stats', icon: 'bi-bar-chart-fill', label: 'Statistics' },
    { id: 'advancements', icon: 'bi-trophy-fill', label: 'Advancements' },
  ];
  let activeTab = TABS.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : 'overview';

  function claimsList() {
    return live ? live.claims || [] : (profile.claims || []).map((c) => ({ ...c, displayName: c.name || 'Unnamed claim', canEdit: false, roleLabel: 'Owner', dim: c.dimension }));
  }
  function hubsList() {
    if (live && Array.isArray(live.hubs)) {
      const icons = Object.fromEntries((profile.waypoints || []).map((w) => [String(w.id), w.icon]));
      return live.hubs.map((h) => ({ ...h, icon: icons[String(h.id)] || `/api/head.php?${profile.uuid ? 'u=' + encodeURIComponent(profile.uuid) : 'name=' + encodeURIComponent(profile.name)}&s=64`,
        hex: (live.hubColors || {})[h.color] || null, access: h.public ? 'public' : 'private', editable: true }));
    }
    return (profile.waypoints || []).map((w) => ({ ...w, hex: w.color, editable: false }));
  }
  function listingsList() {
    if (live && Array.isArray(live.listings)) {
      // Item pictures come with the copy; listings put up since then show a box.
      const saved = profile.marketListings || [];
      return live.listings.map((l) => ({ ...l, iconUrl: (saved.find((x) => x.id && x.id === l.id) || saved.find((x) => mcPlain(x.name) === mcPlain(l.name)) || {}).iconUrl }));
    }
    return (profile.marketListings || []).map((l) => ({ ...l, expires: new Date(l.expires).getTime(), iconUrl: l.iconUrl }));
  }

  function counts() {
    const advDone = (profile.advancementsDetailed || []).reduce((sum, g) => sum + g.doneCount, 0);
    const advAll = (profile.advancementsDetailed || []).reduce((sum, g) => sum + g.items.length, 0);
    return { claims: claimsList().length, waypoints: hubsList().length, market: listingsList().length, pets: (live?.pets?.pets || profile.pets || []).length, advancements: advAll ? `${advDone}/${advAll}` : null };
  }

  function tabBar() {
    const n = counts();
    return `<nav class="profile-tabs" role="tablist" aria-label="Profile sections">${TABS.map((t) => `
      <button type="button" class="filter-chip profile-tab${t.id === activeTab ? ' is-active' : ''}" role="tab" aria-selected="${t.id === activeTab}" data-tab="${t.id}">
        <i class="bi ${t.icon}" aria-hidden="true"></i> ${t.label}${n[t.id] != null && n[t.id] !== 0 ? ` <span class="profile-tab__count">${n[t.id]}</span>` : ''}
      </button>`).join('')}</nav>`;
  }

  // ── Overview: the key numbers and the last grave ───────────────────────────

  function overviewTab() {
    const s = profile.stats || {};
    const tiles = `<div class="profile-stat-grid profile-stat-grid--wide">
      ${statTile('bi-trophy-fill', 'Advancements Completed', Number(profile.advancementsCompleted || 0).toLocaleString())}
      ${statTile('bi-clock-history', 'Hours Played', Number(s.playtimeHours || 0).toLocaleString())}
      ${statTile('bi-heartbreak-fill', 'Deaths', Number(s.deaths || 0).toLocaleString())}
      ${statTile('bi-crosshair', 'Mobs Killed', Number(s.mobKillsTotal || 0).toLocaleString())}
      ${statTile('bi-lightning-charge-fill', 'Damage Dealt', findStatValue('General', 'Damage Dealt'))}
      ${statTile('bi-hammer', 'Blocks Mined', Number(s.blocksMinedTotal || 0).toLocaleString())}
    </div>`;
    const n = counts();
    const shortcuts = [
      ['claims', 'bi-shield-lock', plural(n.claims, 'claim', 'claims')],
      ['waypoints', 'bi-signpost-split', plural(n.waypoints, 'waypoint hub', 'waypoint hubs')],
      ['market', 'bi-shop', plural(n.market, 'listing on the market', 'listings on the market')],
      ['pets', 'bi-emoji-smile', plural(n.pets, 'pet', 'pets')],
    ].map(([tab, icon, text]) => `<button type="button" class="profile-shortcut" data-tab="${tab}"><i class="bi ${icon}" aria-hidden="true"></i>${text}<i class="bi bi-chevron-right profile-shortcut__go" aria-hidden="true"></i></button>`).join('');
    return panel('summary', 'bi-person-fill', 'At a glance', null, null, tiles + `<div class="profile-shortcuts">${shortcuts}</div>`) + noticesCard() + graveCard();
  }

  const NOTICE_LABELS = {
    sales: ['Something of yours sold on the market', 'Bundled, at most one message every few minutes'],
    mail: ['Items wait in your inbox', 'Expired listings, purchases that didn\'t fit; at most once an hour'],
    claims: ['A claim of yours expires within a week', 'Because you haven\'t played for a while'],
    messages: ['An admin writes to you', 'You answer in game with /nccreply'],
  };

  /** Which Discord DMs the bot sends this player. */
  function noticesCard() {
    if (!live) return '';
    if (!live.notices) {
      const why = live.error ? esc(live.error) : 'The server\'s panel needs its latest update for this.';
      return panel('notices', 'bi-discord', 'Discord messages', null, null,
        `<p class="profile-empty-note">Here you choose which direct messages the Discord bot sends you (sales, inbox, expiring claims, admin messages). ${why}</p>`);
    }
    const n = live.notices;
    const body = n.available
      ? `<p class="profile-dialog__text profile-notices-intro">The server's Discord bot can send you a direct message when:</p>
        <div class="profile-toggles">${Object.entries(NOTICE_LABELS).map(([k, [label, hint]]) => toggle(`notice:${k}`, label, n.kinds[k] !== false, hint).replace('<input', `<input data-notice="${k}"`)).join('')}</div>`
      : '<p class="profile-empty-note">Discord messages are switched off on this server.</p>';
    return panel('notices', 'bi-discord', 'Discord messages', null, null, body);
  }

  function graveCard() {
    const grave = profile.lastGrave;
    if (!grave) return panel('grave', 'bi-flower1', 'Last grave', null, null, '<p class="profile-empty-note">No grave on record.</p>');
    const badges = [
      grave.removed
        ? '<span class="profile-grave-badge profile-grave-badge--muted"><i class="bi bi-check-circle"></i> Cleared</span>'
        : '<span class="profile-grave-badge profile-grave-badge--warn"><i class="bi bi-exclamation-circle"></i> Still standing</span>',
    ];
    if (grave.openedBy === 'expired') badges.push('<span class="profile-grave-badge profile-grave-badge--warn"><i class="bi bi-hourglass-split"></i> Expired unopened</span>');
    else if (grave.openedBy) badges.push(`<span class="profile-grave-badge"><i class="bi bi-door-open"></i> Opened by ${esc(grave.openedBy)}</span>`);
    const itemHtml = (item) => {
      const icon = item.isHead ? 'bi-person-bounding-box' : (item.enchantments.length ? 'bi-stars' : 'bi-box-seam');
      const tip = item.enchantments.length ? ` title="${esc(item.enchantments.join(', '))}"` : '';
      return `<div class="profile-grave-item${item.enchantments.length ? ' profile-grave-item--enchanted' : ''}"${tip}>
          <i class="bi ${icon}"></i><span class="profile-grave-item__name">${esc(item.displayName)}</span><span class="profile-grave-item__count">×${item.count}</span></div>`;
    };
    const body = `<div class="profile-grave-head"><p class="waypoint-card__coords"><i class="bi bi-geo-alt-fill"></i> ${grave.x}, ${grave.y}, ${grave.z} · ${esc(grave.dimension)}</p>
      <div class="profile-grave-grave-badges">${badges.join('')}</div></div>
      ${grave.contents.length ? `<div class="profile-grave-item-grid">${grave.contents.map(itemHtml).join('')}</div>` : '<p class="profile-empty-note">The grave is empty.</p>'}`;
    return panel('grave', 'bi-flower1', 'Last grave', null, null, body);
  }

  // ── Claims ──────────────────────────────────────────────────────────────────

  function claimsAside() {
    if (liveError) return note(`<i class="bi bi-exclamation-triangle"></i> ${esc(liveError)} Showing the last copy.`, 'warn');
    if (!live) return note('<i class="bi bi-arrow-repeat"></i> Loading…');
    if (!live.claimsOn) return note('<i class="bi bi-slash-circle"></i> Land claims are switched off', 'warn');
    return note('<i class="bi bi-check2-circle"></i> Changes apply right away', 'ok');
  }

  /** Earned / bonus / bought / used / left, above the claims. */
  function blocksStrip() {
    const b = live?.claimBlocks;
    if (!b || !live.claimsOn) return '';
    const cell = (label, v, cls = '') => `<div class="profile-blocks__cell ${cls}"><b>${Number(v).toLocaleString()}</b><span>${label}</span></div>`;
    return `<div class="profile-blocks">
      ${cell('earned by playing', b.earned)}${b.bonus ? cell('given by admins', b.bonus) : ''}${cell('bought', b.bought)}${cell('used by your claims', b.used)}
      ${cell('claim blocks left', b.left, 'is-left')}
      <a class="profile-action profile-blocks__buy" href="/market/"><span class="profile-action__icon"><i class="bi bi-cart-plus" aria-hidden="true"></i></span>Buy claim blocks</a>
    </div>`;
  }

  function claimsTab() {
    const list = claimsList();
    const body = blocksStrip() + (list.length
      ? `<div class="profile-claim-grid">${list.map(claimCard).join('')}</div>`
      : '<p class="profile-empty-note">No land claims yet. Claim land in game with <b>/claim</b>.</p>');
    return panel('claims', 'bi-shield-lock', 'Claims', list.length, claimsAside(), body);
  }

  function claimCard(c) {
    const color = isHex(c.color) ? c.color : '#f2b233';
    const members = c.members || [];
    const sub = c.parent ? `<span class="profile-tag"><i class="bi bi-diagram-2"></i> Subclaim of ${esc(c.parentName || 'a claim')}</span>` : '';
    const role = c.role && c.role !== 'OWNER' ? `<span class="profile-tag profile-tag--accent">${esc(c.roleLabel)}${c.ownerName ? ` · ${esc(c.ownerName)}'s` : ''}</span>` : '';
    const canEdit = c.canEdit && live && live.claimsOn;
    return `
      <article class="profile-claim-card" style="--claim-color: ${color}">
        <div class="profile-claim-card__header">
          <h3><span class="profile-claim-card__swatch"></span>${esc(c.displayName || c.name || 'Unnamed claim')}</h3>
          <span class="profile-claim-card__dimension">${esc(dimName(c.dim))}</span>
        </div>
        ${sub || role ? `<div class="profile-tags">${sub}${role}</div>` : ''}
        <p class="profile-claim-card__coords"><i class="bi bi-geo-alt-fill"></i> ${c.x}, ${c.z}
          <span class="profile-claim-card__size">· ${c.width} × ${c.length} (${Number(c.area).toLocaleString()} blocks)</span></p>
        <div class="profile-claim-card__trusted">
          ${members.length ? members.map((m) => `<span class="profile-member" title="${esc(m.label || m.role)}"><img src="/api/head.php?${m.uuid ? 'u=' + encodeURIComponent(m.uuid) : 'name=' + encodeURIComponent(m.name)}&s=16" alt="" loading="lazy">${esc(m.name)}</span>`).join('') : '<span class="profile-muted">No members</span>'}
        </div>
        ${expiryLine(c)}
        <div class="profile-card-foot">${mapLink(c.dim, c.x, c.z)}${canEdit ? action('bi-pencil', 'Edit', `data-edit-claim="${esc(c.id)}"`) : ''}</div>
      </article>`;
  }

  /** When an owned claim goes if its owner stays away; highlighted within 30 days. */
  function expiryLine(c) {
    if (!c.isOwner || c.parent || !c.expires) return '';
    const days = Math.ceil((c.expires - Date.now()) / 86400000);
    const soon = days <= 30;
    const date = new Date(c.expires).toLocaleDateString(undefined, { dateStyle: 'medium' });
    return `<p class="profile-expiry${soon ? ' is-soon' : ''}" title="Claims of players away for ${live?.claimBlocks?.inactiveDays || '…'} days expire. Playing pushes the date back.">
      <i class="bi bi-hourglass-split"></i> ${soon ? `Expires in ${days <= 1 ? '1 day' : days + ' days'}` : `Kept until ${esc(date)}`}${soon ? ` · ${esc(date)}` : ''}</p>`;
  }

  /** "Show on map": the website's map, centred there. */
  function mapLink(dim, x, z) {
    if (dim == null || x == null || z == null) return '';
    const key = String(dim).includes(':') ? String(dim).replace(':', '_') : String(dim).toLowerCase().replace(/\s+/g, '_');
    const back = encodeURIComponent(location.pathname + location.search + location.hash);
    return `<a class="profile-action" href="/map/?back=${back}#${encodeURIComponent(key)}/${Math.round(x)}/${Math.round(z)}"><span class="profile-action__icon"><i class="bi bi-map" aria-hidden="true"></i></span>Map</a>`;
  }

  // ── Waypoint hubs ───────────────────────────────────────────────────────────

  function hubsAside() {
    if (liveError) return note(`<i class="bi bi-exclamation-triangle"></i> ${esc(liveError)}`, 'warn');
    if (!live) return note('<i class="bi bi-arrow-repeat"></i> Loading…');
    if (!live.running) return note('<i class="bi bi-power"></i> Server offline · hubs can be changed while it runs', 'warn');
    return note('<i class="bi bi-check2-circle"></i> Changes apply right away', 'ok');
  }

  function waypointsTab() {
    const list = hubsList();
    const body = list.length
      ? `<div class="waypoint-hub-grid">${list.map(hubCard).join('')}</div>`
      : '<p class="profile-empty-note">No waypoint hubs yet.</p>';
    return panel('waypoints', 'bi-signpost-split', 'Waypoint hubs', list.length, hubsAside(), body);
  }

  function hubCard(h) {
    const trusted = h.trusted || [];
    return `
      <article class="waypoint-card profile-hub-card"${isHex(h.hex) ? ` style="--hub-color:${h.hex}"` : ''}>
        <img class="waypoint-card__avatar" src="${esc(h.icon || '')}" alt="" loading="lazy">
        <div class="waypoint-card__body">
          <div class="profile-waypoint-title-row">
            <h3>${esc(h.name)}</h3>
            <span class="profile-access-badge profile-access-badge--${h.access === 'public' ? 'public' : 'private'}">${h.access === 'public' ? 'Public' : 'Private'}</span>
          </div>
          <p class="waypoint-card__coords"><i class="bi bi-geo-alt-fill"></i> ${h.x}, ${h.y}, ${h.z} · ${esc(dimName(h.dimension))}</p>
          ${h.description ? `<p class="waypoint-card__description">${esc(h.description)}</p>` : ''}
          ${h.editable && trusted.length ? `<p class="profile-hub-trusted"><i class="bi bi-people"></i> ${trusted.map(esc).join(', ')}</p>` : ''}
        </div>
        <div class="profile-card-foot">${mapLink(h.dimension, h.x, h.z)}${h.editable ? action('bi-pencil', 'Edit', `data-edit-hub="${esc(h.id)}"`) : ''}</div>
      </article>`;
  }

  // ── Market: bank, mailbox and the player's own listings ────────────────────

  function currencyName(n) {
    const name = (profile.market || {}).currencyName || 'Diamond';
    return n === 1 ? name : name + 's';
  }
  function coin(cls) {
    const url = (profile.market || {}).currencyIconUrl;
    return url ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy">` : '';
  }

  function marketTab() {
    const inbox = profile.marketInbox || { currency: 0, parcels: [] };
    const balance = Number(bankBalance ?? inbox.balance ?? 0);
    const waiting = [];
    for (const o of inbox.orders || []) waiting.push(`<li><i class="bi bi-bag-check"></i>${o.times > 1 ? `${Number(o.times)} × ` : ''}${esc(o.name)}<small>bought on the website</small></li>`);
    if (inbox.currency > 0) waiting.push(`<li>${coin('profile-coin')}${plural(Number(inbox.currency), currencyName(1), currencyName(2))}<small>earnings from sales</small></li>`);
    for (const p of inbox.parcels || []) waiting.push(`<li>${p.iconUrl ? `<img class="profile-coin" src="${esc(p.iconUrl)}" alt="" loading="lazy">` : '<i class="bi bi-box"></i>'}${esc(p.name)} <span class="profile-muted">×${Number(p.amount).toLocaleString()}</span></li>`);
    const bank = `
      <div class="profile-bank">
        <div class="profile-bank__balance">${coin('profile-bank__coin')}<div><b>${balance.toLocaleString()}</b><span>${currencyName(balance)} in your bank</span></div></div>
        <p class="profile-bank__hint">Deposit and withdraw with <b>/market → Bank</b> in game; sales are paid into the bank. <a href="/market/">Spend it on the market <i class="bi bi-arrow-right"></i></a></p>
        ${waiting.length ? `<div class="profile-bank__mail"><p class="profile-subhead"><i class="bi bi-mailbox"></i> Waiting in your inbox <span class="profile-muted">· collect with /inbox</span></p><ul>${waiting.join('')}</ul></div>` : ''}
      </div>`;
    const listings = listingsList();
    const canWithdraw = live && live.running;
    const aside = liveError ? note(`<i class="bi bi-exclamation-triangle"></i> ${esc(liveError)}`, 'warn')
      : !live ? note('<i class="bi bi-arrow-repeat"></i> Loading…')
        : !live.running ? note('<i class="bi bi-power"></i> Server offline · listings can be taken back while it runs', 'warn') : '';
    const cards = listings.length
      ? `<div class="profile-market-grid profile-listing-grid">${listings.map((l) => listingCard(l, canWithdraw)).join('')}</div>`
      : '<p class="profile-empty-note">Nothing for sale right now. Type <b>/market</b> in game to sell something.</p>';
    const trades = accountSales.length
      ? `<ul class="profile-trades">${accountSales.slice(0, 20).map((x) => `<li>
          <span class="profile-trades__kind is-${x.role === 'bought' ? 'bought' : 'sold'}">${x.role === 'bought' ? 'Bought' : 'Sold'}</span>
          <span class="profile-trades__what">${x.amount > 1 ? `${Number(x.amount).toLocaleString()} × ` : ''}${mcHtml(x.name)}</span>
          <span class="profile-price">${coin('profile-coin')}<b>${Number(x.total).toLocaleString()}</b></span>
          <span class="profile-muted">${x.role === 'bought' ? 'from' : 'to'} ${esc(x.other || 'someone')} · ${esc(new Date(x.time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))}</span></li>`).join('')}</ul>`
      : '<p class="profile-empty-note">No trades yet.</p>';
    return panel('bank', 'bi-bank', 'Bank & inbox', null, null, bank) + panel('listings', 'bi-shop', 'Your listings', listings.length, aside, cards)
      + panel('trades', 'bi-receipt', 'Recent trades', accountSales.length || null, null, trades);
  }

  function listingCard(l, canWithdraw) {
    const days = Math.max(0, Math.ceil((Number(l.expires) - Date.now()) / 86400000));
    const per = Number(l.per || 1);
    const icon = l.iconUrl ? `<img class="profile-market-card__icon" src="${esc(l.iconUrl)}" alt="" loading="lazy">` : '<span class="profile-market-card__icon profile-market-card__icon--none"><i class="bi bi-box"></i></span>';
    return `
      <article class="profile-listing">
        <div class="profile-listing__top">${icon}<div class="profile-listing__title"><h3>${mcHtml(l.name)}</h3><p>×${Number(l.amount).toLocaleString()} · ${days === 1 ? '1 day' : `${days} days`} left</p></div></div>
        ${[...(l.enchantments || []), ...(l.lore || [])].length ? `<p class="profile-listing__extra">${[...(l.enchantments || []), ...(l.lore || [])].map(mcHtml).join(' · ')}</p>` : ''}
        <div class="profile-listing__foot">
          <span class="profile-price">${coin('profile-coin')}<b>${Number(l.price).toLocaleString()}</b><small>${per > 1 ? `per ${per.toLocaleString()}` : 'each'}</small></span>
          ${canWithdraw && l.id ? `<span class="profile-listing__actions">${action('bi-pencil', 'Edit', `data-edit-listing="${esc(l.id)}"`)}${action('bi-box-arrow-in-down', 'Take back', `data-withdraw="${esc(l.id)}" data-name="${esc(mcPlain(l.name))}" data-amount="${Number(l.amount)}"`)}</span>` : ''}
        </div>
      </article>`;
  }

  // ── Pets, statistics, advancements ─────────────────────────────────────────

  function petIcon(id, fallback) {
    const saved = (profile.pets || []).find((p) => p.id === id || p.name === fallback);
    return saved?.icon ? `<img class="profile-market-card__icon profile-pet-head" src="${esc(saved.icon)}" alt="" loading="lazy">`
      : '<span class="profile-market-card__icon profile-market-card__icon--none"><i class="bi bi-emoji-smile"></i></span>';
  }

  function petName(p) {
    return p.nickname ? `<span${isHex(p.nameColor) ? ` style="color:${esc(p.nameColor)}"` : ''}>${esc(p.nickname)}</span> <span class="profile-pet-kind">(${esc(p.name)})</span>` : esc(p.name);
  }

  function petsTab() {
    const lp = live?.pets;
    if (lp && live.running && lp.enabled && Array.isArray(lp.pets) && lp.pets.length) return petsLive(lp);
    const pets = profile.pets || [];
    const why = !live ? '' : live.error ? live.error
      : !live.running ? ''
      : !lp ? 'Changing pets here needs the server\'s latest mod update.'
      : lp.enabled === false ? 'Pets are switched off on the server right now.' : '';
    const aside = !live ? note('<i class="bi bi-arrow-repeat"></i> Loading…')
      : why ? note(`<i class="bi bi-info-circle"></i> ${esc(why)}`, 'warn')
      : live.running ? '' : note('<i class="bi bi-power"></i> Server offline · pets can be changed while it runs', 'warn');
    const body = pets.length
      ? `<div class="profile-market-grid">${pets.map((p) => `<article class="profile-market-card">
          ${p.icon ? `<img class="profile-market-card__icon profile-pet-head" src="${esc(p.icon)}" alt="" loading="lazy">` : '<span class="profile-market-card__icon profile-market-card__icon--none"><i class="bi bi-emoji-smile"></i></span>'}
          <div class="profile-market-card__body"><h3>${petName(p)}${p.active ? ' <span class="profile-access-badge profile-access-badge--public">Out</span>' : ''}</h3>
            ${p.level != null ? `<p class="profile-market-card__extra">Bond level ${Number(p.level)}</p>` : ''}
            ${(p.perks || []).length ? `<p class="profile-pet-perks">${p.perks.map((k) => `<span class="profile-pet-perk${k.unlocked ? '' : ' is-locked'}" title="${esc(k.description + (k.unlocked ? '' : ` (unlocks at bond level ${k.level})`))}">${k.unlocked ? '' : '<i class="bi bi-lock"></i> '}${esc(k.label)}</span>`).join('')}</p>` : ''}
            ${p.since ? `<p class="profile-market-card__extra">Since ${esc(new Date(p.since).toLocaleDateString(undefined, { dateStyle: 'medium' }))}</p>` : ''}</div></article>`).join('')}</div>`
      : '<p class="profile-empty-note">No pets yet. Get one in the Server shop of <b>/market</b> in game.</p>';
    return panel('pets', 'bi-emoji-smile', 'Pets', pets.length, aside, body);
  }

  /** The pets with what /pets can change: settings for all of them, and each pet's card. */
  function petsLive(lp) {
    const select = (name, options, current) => `<select data-pet-setting="${name}">${options.map((o) => `<option value="${esc(o.id)}"${o.id === current ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    const settings = `<div class="profile-pet-settings">
        <label class="profile-field"><span>How your pet moves</span>${select('move', lp.behaviors || [], lp.behavior)}</label>
        ${lp.particles ? `<label class="profile-field"><span>Particle trail</span>${select('trail', lp.trails || [], lp.trail)}</label>` : ''}
      </div>
      <div class="profile-toggles profile-toggles--row">
        ${lp.pets.length > 1 ? toggle('random', 'Random pet', lp.random, 'A different one of your pets every time you teleport, die or take it out').replace('<input', '<input data-pet-toggle="random"') : ''}
        ${toggle('reactions', 'Reactions', lp.reactions, 'Little moves, particles and speech bubbles').replace('<input', '<input data-pet-toggle="reactions"')}
        ${lp.names ? toggle('showname', 'Name above the pet', lp.showName, 'Hidden while you sneak anyway').replace('<input', '<input data-pet-toggle="showname"') : ''}
      </div>`;
    const cards = lp.pets.map((p) => {
      const next = p.level >= p.maxLevel ? 'highest bond level' : `next level in about ${p.nextLevelMinutes >= 120 ? Math.round(p.nextLevelMinutes / 60) + ' hours' : p.nextLevelMinutes + ' minutes'} out together`;
      const perks = (p.perks || []).map((k) => k.unlocked && lp.perksEnabled
        ? `<label class="profile-perk${k.off ? ' is-off' : ''}" title="${esc(k.description)}"><input type="checkbox" data-pet-perk="${esc(k.id)}"${k.off ? '' : ' checked'}><span class="profile-toggle__switch" aria-hidden="true"></span>${esc(k.label)}</label>`
        : `<span class="profile-pet-perk is-locked" title="${esc(k.description)}"><i class="bi bi-lock"></i> ${esc(k.label)} · level ${k.level}</span>`).join('');
      return `<article class="profile-pet${p.active ? ' is-out' : ''}">
        <div class="profile-pet__top">${petIcon(p.id, p.name)}<div class="profile-pet__title"><h3>${petName(p)}</h3>
          <p>Bond level ${Number(p.level)} · ${esc(next)}</p></div>${p.active ? '<span class="profile-access-badge profile-access-badge--public">Out</span>' : p.alsoOut ? '<span class="profile-access-badge profile-access-badge--public">Along</span>' : ''}</div>
        ${perks ? `<div class="profile-pet__perks">${perks}</div>` : ''}
        <div class="profile-card-foot">
          ${lp.names ? action('bi-tag', 'Name', `data-pet-name="${esc(p.id)}"`) : ''}
          ${p.active ? action('bi-house', 'Put away', 'data-pet-away="1"') : action('bi-box-arrow-up', 'Take out', `data-pet-out="${esc(p.id)}"`)}
          ${!p.active && lp.slots > 0 && lp.pets.some((x) => x.active) ? (p.alsoOut ? action('bi-dash-circle', 'Put back', `data-pet-also="${esc(p.id)}" data-on="0"`) : action('bi-plus-circle', 'Also out', `data-pet-also="${esc(p.id)}" data-on="1"`)) : ''}
        </div>
      </article>`;
    }).join('');
    return panel('pet-settings', 'bi-sliders', 'Your pets\' settings', null, note('<i class="bi bi-check2-circle"></i> Changes apply right away', 'ok'), settings)
      + panel('pets', 'bi-emoji-smile', 'Pets', lp.pets.length, null, `<div class="profile-pet-grid">${cards}</div>`);
  }

  async function petChange(body, okText) {
    try {
      const res = await send({ kind: 'pet', ...body });
      await loadLive();
      flash(document.getElementById('profile-panel-pet-settings') ? 'pet-settings' : 'pets', res.message || okText || 'Saved.');
    } catch (err) {
      await loadLive();
      flash('pets', err.message);
    }
  }

  function renamePet(id) {
    const p = (live?.pets?.pets || []).find((x) => x.id === id);
    if (!p) return;
    const colors = live.pets.nameColors || {};
    const current = Object.keys(colors).find((k) => String(colors[k]).toLowerCase() === String(p.nameColor).toLowerCase()) || null;
    return dialog({
      icon: 'bi-tag', title: `Name ${esc(p.name)}`,
      body: `<label class="profile-field"><span>Name <small class="profile-muted">· up to 16 characters, empty for none</small></span><input type="text" name="nickname" maxlength="16" value="${esc(p.nickname || '')}"></label>
        <div class="profile-field"><span>Colour</span>${swatches('color', colors, current)}
          <label class="profile-own-color"><span>or your own</span><input type="text" name="hex" maxlength="7" placeholder="#3FC9E8" value="${current ? '' : esc(p.nameColor || '')}"></label></div>`,
      async onSave(dlg) {
        const f = dlg.querySelector('form');
        const picked = f.querySelector('input[name="color"]:checked');
        const color = f.elements.hex.value.trim() || (picked ? picked.dataset.hex : p.nameColor || '#FFFFFF');
        const res = await send({ kind: 'pet', change: 'name', pet: id, nickname: f.elements.nickname.value, color });
        await loadLive();
        flash('pets', res.message || 'Saved.');
      },
    });
  }

  function statsTab() {
    const list = profile.statsDetailed || [];
    const body = list.length
      ? list.map((cat, i) => `
          <details class="profile-detail-section"${i === 0 ? ' open' : ''}>
            <summary class="profile-detail-section__title">${esc(cat.category)} <span class="profile-count-badge">${cat.items.length}</span> <i class="bi bi-chevron-down profile-detail-section__arrow"></i></summary>
            <div class="profile-stat-rows">${cat.items.map((item) => `<div class="profile-stat-row"><span>${esc(item.label)}</span><span class="profile-stat-row__value">${esc(item.value)}</span></div>`).join('')}</div>
          </details>`).join('')
      : '<p class="profile-empty-note">No stats recorded yet.</p>';
    return panel('stats', 'bi-bar-chart-fill', 'All statistics', null, null, body);
  }

  function advancementsTab() {
    const list = profile.advancementsDetailed || [];
    const done = list.reduce((sum, g) => sum + g.doneCount, 0);
    const all = list.reduce((sum, g) => sum + g.items.length, 0);
    const body = list.length
      ? list.map((cat) => `
          <div class="profile-detail-section">
            <h3 class="profile-detail-section__title">${esc(cat.category)} <span class="profile-count-badge">${cat.doneCount}/${cat.items.length}</span></h3>
            <div class="profile-advancement-list">${cat.items.map((item) => `
              <div class="profile-advancement-row ${item.done ? 'is-done' : 'is-pending'}"${item.description ? ` data-tooltip="${esc(item.description)}"` : ''}>
                <i class="bi ${item.done ? 'bi-check-circle-fill' : 'bi-circle'}"></i><span>${esc(item.label)}</span></div>`).join('')}
            </div>
          </div>`).join('')
      : '<p class="profile-empty-note">No advancements recorded yet.</p>';
    return panel('advancements', 'bi-trophy-fill', 'All advancements', all ? `${done}/${all}` : null, null, body);
  }

  const RENDER = { overview: overviewTab, claims: claimsTab, waypoints: waypointsTab, market: marketTab, pets: petsTab, stats: statsTab, advancements: advancementsTab };

  function renderTabs() {
    document.getElementById('profile-tabbar').innerHTML = tabBar();
    document.getElementById('profile-tab').innerHTML = RENDER[activeTab]();
  }

  function selectTab(tab) {
    if (!RENDER[tab]) return;
    activeTab = tab;
    history.replaceState(null, '', tab === 'overview' ? location.pathname : `#${tab}`);
    renderTabs();
  }

  root.innerHTML = `${hero()}<div id="profile-tabbar"></div><div class="profile-tab-panel" id="profile-tab" role="tabpanel"></div>`;
  renderTabs();
  animateProfileSkin();

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) {
      selectTab(t.dataset.tab);
      if (t.classList.contains('profile-shortcut')) document.getElementById('profile-tabbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const claim = e.target.closest('[data-edit-claim]');
    if (claim) return editClaim(claim.dataset.editClaim);
    const hub = e.target.closest('[data-edit-hub]');
    if (hub) return editHub(hub.dataset.editHub);
    const el = e.target.closest('[data-edit-listing]');
    if (el) return editListing(el.dataset.editListing);
    const pn = e.target.closest('[data-pet-name]');
    if (pn) return renamePet(pn.dataset.petName);
    const po = e.target.closest('[data-pet-out]');
    if (po) return petChange({ change: 'out', pet: po.dataset.petOut });
    if (e.target.closest('[data-pet-away]')) return petChange({ change: 'away' });
    const pa = e.target.closest('[data-pet-also]');
    if (pa) return petChange({ change: 'also', pet: pa.dataset.petAlso, on: pa.dataset.on === '1' });
    const w = e.target.closest('[data-withdraw]');
    if (w) return withdraw(w.dataset.withdraw, w.dataset.name, Number(w.dataset.amount));
  });
  root.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('[data-pet-setting]')) return petChange({ change: t.dataset.petSetting, how: t.value });
    if (t.matches('[data-pet-toggle]')) return petChange({ change: t.dataset.petToggle, on: t.checked });
    if (t.matches('[data-pet-perk]')) return petChange({ change: 'perk', perk: t.dataset.petPerk, on: t.checked });
    if (t.matches('[data-notice]')) {
      try {
        const res = await send({ kind: 'notices', kindName: t.dataset.notice, on: t.checked });
        if (live?.notices && res.kinds) live.notices.kinds = res.kinds;
        flash('notices', 'Saved.');
      } catch (err) {
        t.checked = !t.checked;
        flash('notices', err.message);
      }
    }
  });
  window.addEventListener('hashchange', () => {
    const tab = location.hash.slice(1) || 'overview';
    if (tab !== activeTab && RENDER[tab]) {
      activeTab = tab;
      renderTabs();
    }
  });

  // The bank right now (the profile itself is copied once an hour).
  fetch('/api/market-account.php', { cache: 'no-store' }).then((r) => r.json()).then((json) => {
    const a = (json.accounts || []).find((x) => x.uuid === profile.uuid);
    if (!a || a.balance == null) return;
    bankBalance = Number(a.balance);
    accountSales = Array.isArray(a.sales) ? a.sales : [];
    if (activeTab === 'market') renderTabs();
  }).catch(() => {});

  loadLive();

  // ── Dialogs: one of the site's glass cards over the page ───────────────────

  /**
   * Opens a dialog with the given body; onSave runs on the primary button and closes the dialog unless it
   * throws (its message shows in the dialog). Returns a promise that settles when the dialog closes.
   */
  function dialog({ icon, title, body, save = 'Save', saveIcon = 'bi-check2', danger = false, onOpen, onSave }) {
    const dlg = document.createElement('dialog');
    dlg.className = 'profile-dialog';
    dlg.innerHTML = `<form method="dialog" novalidate>
      <header class="profile-dialog__head"><span class="profile-panel__icon"><i class="bi ${icon}" aria-hidden="true"></i></span><h3>${title}</h3>
        <button type="button" class="profile-dialog__x" value="close" aria-label="Close"><i class="bi bi-x-lg"></i></button></header>
      <div class="profile-dialog__body">${body}</div>
      <p class="profile-dialog__msg" role="alert" hidden></p>
      <footer class="profile-dialog__foot">
        <button type="button" class="profile-btn" data-close>Cancel</button>
        <button type="submit" class="profile-btn profile-btn--primary${danger ? ' profile-btn--danger' : ''}"><span class="profile-action__icon"><i class="bi ${saveIcon}" aria-hidden="true"></i></span>${save}</button>
      </footer></form>`;
    document.body.appendChild(dlg);
    const msg = dlg.querySelector('.profile-dialog__msg');
    const showMsg = (text, ok) => { msg.hidden = !text; msg.textContent = text || ''; msg.classList.toggle('is-ok', !!ok); };
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => { dlg.remove(); resolve(); });
      dlg.querySelectorAll('[data-close], .profile-dialog__x').forEach((b) => b.addEventListener('click', () => dlg.close()));
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      dlg.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = dlg.querySelector('[type="submit"]');
        btn.disabled = true;
        showMsg('');
        try {
          await onSave(dlg);
          dlg.close();
        } catch (err) {
          showMsg(err.message);
        } finally {
          btn.disabled = false;
        }
      });
      dlg.showModal();
      if (onOpen) onOpen(dlg, showMsg);
    });
  }

  function swatches(name, colors, current) {
    return `<div class="profile-swatches" role="radiogroup">${Object.entries(colors).map(([label, hex]) => `
      <label class="profile-swatch" title="${esc(label.replace(/_/g, ' '))}"><input type="radio" name="${name}" value="${esc(label)}" data-hex="${esc(hex)}"${current === label ? ' checked' : ''}>
        <span style="--swatch:${esc(hex)}"></span></label>`).join('')}</div>`;
  }

  function toggle(name, label, checked, hint) {
    return `<label class="profile-toggle"><span><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span>
      <input type="checkbox" name="${esc(name)}"${checked ? ' checked' : ''}><span class="profile-toggle__switch" aria-hidden="true"></span></label>`;
  }

  // ── Editing a claim ─────────────────────────────────────────────────────────

  function editClaim(id) {
    const find = () => (live?.claims || []).find((c) => c.id === id);
    const c = find();
    if (!c) return;
    // Colours by name, the one the claim has picked (or none when it's a colour off the list).
    const colors = live.claimColors || {};
    const currentColor = Object.keys(colors).find((k) => String(colors[k]).toLowerCase() === String(c.color).toLowerCase()) || null;
    const roleOptions = (current, owner) => (live.roles || []).map((r) => `<option value="${r.id}"${r.id === current ? ' selected' : ''}${r.id === 'MANAGE' && !owner ? ' disabled' : ''}>${esc(r.label)}</option>`).join('');
    const memberRows = (claim) => {
      const rows = (claim.members || []).map((m) => {
        const locked = m.role === 'MANAGE' && !claim.isOwner;
        return `<div class="profile-member-row" data-member="${esc(m.uuid)}">
          <img src="/api/head.php?u=${encodeURIComponent(m.uuid)}&s=24" alt="" loading="lazy"><b>${esc(m.name)}</b>
          <select data-role aria-label="Role of ${esc(m.name)}"${locked ? ' disabled title="Only the owner can change co-owners"' : ''}>${roleOptions(m.role, claim.isOwner)}</select>
          <button type="button" class="profile-icon-btn" data-remove aria-label="Remove ${esc(m.name)}"${locked ? ' disabled' : ''}><i class="bi bi-x-lg"></i></button></div>`;
      }).join('');
      return rows || '<p class="profile-muted profile-member-empty">No members yet.</p>';
    };
    const body = `
      <label class="profile-field"><span>Name</span><input type="text" name="name" maxlength="32" value="${esc(c.name)}" placeholder="${esc(c.displayName)}"></label>
      ${Object.keys(colors).length ? `<div class="profile-field"><span>Colour</span>${swatches('color', colors, currentColor)}</div>` : ''}
      <div class="profile-field"><span>Rules for everyone else</span><div class="profile-toggles">${(live.flags || []).map((f) => toggle(`flag:${f.id}`, f.label, c.flags && c.flags[f.id])).join('')}</div></div>
      <div class="profile-field"><span>Members <small class="profile-muted">· saved as you change them</small></span>
        <div class="profile-members" data-members>${memberRows(c)}</div>
        <div class="profile-member-add"><input type="text" data-add-name maxlength="16" placeholder="Player name" autocomplete="off">
          <select data-add-role aria-label="Role">${roleOptions('BUILD', c.isOwner)}</select>
          <button type="button" class="profile-btn" data-add><i class="bi bi-person-plus"></i> Add</button></div>
        <details class="profile-roles-help"><summary>What the roles may do</summary><ul>${(live.roles || []).map((r) => `<li><b>${esc(r.label)}</b> ${esc(r.description.toLowerCase())}</li>`).join('')}</ul></details>
      </div>`;
    return dialog({
      icon: 'bi-shield-lock', title: `Edit ${esc(c.displayName)}`, body,
      onOpen(dlg, showMsg) {
        const box = dlg.querySelector('[data-members]');
        const refresh = (claims) => {
          live.claims = claims;
          const now = find();
          if (now) box.innerHTML = memberRows(now);
          renderTabs();
        };
        const member = async (bodyFields, okText) => {
          showMsg('');
          try {
            const res = await send({ kind: 'claim', claim: id, ...bodyFields });
            refresh(res.claims || live.claims);
            showMsg(okText, true);
          } catch (err) {
            showMsg(err.message);
          }
        };
        dlg.querySelector('[data-add]').addEventListener('click', () => {
          const name = dlg.querySelector('[data-add-name]').value.trim();
          if (!name) return showMsg('Type a player name.');
          member({ action: 'member_set', playerName: name, role: dlg.querySelector('[data-add-role]').value }, `${name} was added.`)
            .then(() => { dlg.querySelector('[data-add-name]').value = ''; });
        });
        box.addEventListener('change', (e) => {
          const row = e.target.closest('[data-member]');
          if (row && e.target.matches('[data-role]')) member({ action: 'member_set', uuid_member: row.dataset.member, role: e.target.value }, 'Role changed.');
        });
        box.addEventListener('click', (e) => {
          const row = e.target.closest('[data-member]');
          if (row && e.target.closest('[data-remove]')) member({ action: 'member_remove', uuid_member: row.dataset.member }, 'Member removed.');
        });
      },
      async onSave(dlg) {
        const form = dlg.querySelector('form');
        const flags = {};
        (live.flags || []).forEach((f) => { flags[f.id] = form.elements[`flag:${f.id}`].checked; });
        const picked = form.querySelector('input[name="color"]:checked');
        const body = { kind: 'claim', claim: id, action: 'update', name: form.elements.name.value.trim(), flags };
        if (picked) body.color = picked.dataset.hex;
        const res = await send(body);
        live.claims = res.claims || live.claims;
        renderTabs();
      },
    });
  }

  // ── Editing a waypoint hub ──────────────────────────────────────────────────

  function editHub(id) {
    const h = hubsList().find((x) => String(x.id) === String(id));
    if (!h) return;
    const max = live.hubMaxText || 50;
    let trusted = [...(h.trusted || [])];
    const chips = () => trusted.length
      ? trusted.map((n) => `<span class="profile-chip">${esc(n)}<button type="button" data-untrust="${esc(n)}" aria-label="Remove ${esc(n)}"><i class="bi bi-x"></i></button></span>`).join('')
      : '<span class="profile-muted">Nobody yet. Public hubs are open to everyone anyway.</span>';
    const body = `
      <label class="profile-field"><span>Name</span><input type="text" name="name" maxlength="${max}" value="${esc(h.name)}" required></label>
      <label class="profile-field"><span>Description <small class="profile-muted">· optional</small></span><input type="text" name="description" maxlength="${max}" value="${esc(h.description || '')}"></label>
      <div class="profile-field"><span>Colour of the floating name</span>${swatches('color', live.hubColors || {}, h.color)}</div>
      <div class="profile-field">${toggle('public', 'Public', h.public, 'Shows in everyone\'s waypoint list; private hubs only for you and trusted players')}</div>
      <div class="profile-field"><span>Trusted players</span><div class="profile-chips" data-chips>${chips()}</div>
        <div class="profile-member-add"><input type="text" data-trust-name maxlength="16" placeholder="Player name" autocomplete="off"><button type="button" class="profile-btn" data-trust><i class="bi bi-person-plus"></i> Add</button></div></div>`;
    return dialog({
      icon: 'bi-signpost-split', title: `Edit ${esc(h.name)}`, body,
      onOpen(dlg) {
        const box = dlg.querySelector('[data-chips]');
        const add = () => {
          const input = dlg.querySelector('[data-trust-name]');
          const name = input.value.trim();
          if (name && !trusted.some((t) => t.toLowerCase() === name.toLowerCase())) trusted.push(name);
          input.value = '';
          box.innerHTML = chips();
        };
        dlg.querySelector('[data-trust]').addEventListener('click', add);
        dlg.querySelector('[data-trust-name]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
        box.addEventListener('click', (e) => {
          const b = e.target.closest('[data-untrust]');
          if (!b) return;
          trusted = trusted.filter((t) => t !== b.dataset.untrust);
          box.innerHTML = chips();
        });
      },
      async onSave(dlg) {
        const form = dlg.querySelector('form');
        const name = form.elements.name.value.trim();
        if (!name) throw new Error('Give the hub a name.');
        const picked = form.querySelector('input[name="color"]:checked');
        await send({ kind: 'hub', id: h.id, name, description: form.elements.description.value.trim(), public: form.elements.public.checked,
          trusted, ...(picked ? { color: picked.value } : {}) });
        await loadLive();
      },
    });
  }

  // ── Changing a listing ─────────────────────────────────────────────────────

  function editListing(id) {
    const l = listingsList().find((x) => x.id === id);
    if (!l) return;
    const per = Number(l.per || 1);
    const max = live.maxPrice || 100000;
    const canAdd = Number(l.canAdd || 0);
    const most = Number(l.amount) + canAdd;
    const body = `
      <div class="profile-dialog__item">${l.iconUrl ? `<img class="profile-listing__icon" src="${esc(l.iconUrl)}" alt="">` : '<span class="profile-listing__icon"><i class="bi bi-box"></i></span>'}<b>${mcHtml(l.name)}</b></div>
      <div class="profile-field-row">
        <label class="profile-field"><span>Price ${coin('profile-coin')}</span><input type="number" name="price" min="1" max="${max}" value="${Number(l.price)}" inputmode="numeric"></label>
        <label class="profile-field"><span>For how many</span><input type="number" name="per" min="1" max="${most}" value="${per}" inputmode="numeric"></label>
      </div>
      <label class="profile-field"><span>Amount on the market <small class="profile-muted">· up to ${most.toLocaleString()}${canAdd ? ` (${canAdd.toLocaleString()} more from your inbox or inventory)` : ''}</small></span>
        <input type="number" name="amount" min="1" max="${most}" value="${Number(l.amount)}" inputmode="numeric"></label>
      ${canAdd ? '' : '<p class="profile-muted profile-small">To put more on sale, have the items in your inbox, or be online with them in your inventory.</p>'}
      <p class="profile-dialog__text profile-listing-preview" data-preview></p>`;
    return dialog({
      icon: 'bi-pencil', title: 'Change listing', body,
      onOpen(dlg) {
        const f = dlg.querySelector('form');
        const preview = () => {
          const price = Math.max(0, Math.floor(Number(f.elements.price.value) || 0));
          const p = Math.max(1, Math.floor(Number(f.elements.per.value) || 1));
          const amount = Math.max(0, Math.floor(Number(f.elements.amount.value) || 0));
          const spare = Number(l.amount) - amount;
          const add = -spare;
          const lots = Math.floor(amount / p);
          dlg.querySelector('[data-preview]').innerHTML = `Sells in <b>${lots.toLocaleString()} ${lots === 1 ? 'lot' : 'lots'} of ${p.toLocaleString()}</b> for <b>${price.toLocaleString()} ${esc(currencyName(price))}</b> each lot`
            + (lots ? ` · <b>${(lots * price).toLocaleString()}</b> in all` : '')
            + (spare > 0 ? `. <b>${spare.toLocaleString()}</b> go back to your inbox.` : '.')
            + (add > 0 && add <= canAdd ? ` <b>${add.toLocaleString()}</b> more come from your inbox or inventory, and the listing runs its full time again.` : '')
            + (add > canAdd ? ` <span class="profile-warn">You have ${canAdd.toLocaleString()} more to add.</span>` : '')
            + (amount % p ? ` <span class="profile-warn">The amount has to split into lots of ${p}.</span>` : '');
        };
        f.addEventListener('input', preview);
        preview();
      },
      async onSave(dlg) {
        const f = dlg.querySelector('form');
        const res = await send({ kind: 'listing', id, price: Math.floor(Number(f.elements.price.value)), per: Math.floor(Number(f.elements.per.value)), amount: Math.floor(Number(f.elements.amount.value)) });
        await loadLive();
        flash('listings', res.message || 'Saved.');
      },
    });
  }

  // ── Taking a listing back ──────────────────────────────────────────────────

  function withdraw(id, name, amount) {
    return dialog({
      icon: 'bi-box-arrow-in-down', title: 'Take back a listing', save: 'Take back', saveIcon: 'bi-box-arrow-in-down',
      body: `<p class="profile-dialog__text">Take <b>${Number(amount).toLocaleString()} × ${esc(name)}</b> off the market? The items go to your inbox; collect them with <b>/inbox</b> in game.</p>`,
      async onSave() {
        const res = await send({ kind: 'withdraw', id });
        await loadLive();
        flash('listings', res.message || 'Taken back.');
      },
    });
  }

  function flash(panelId, text) {
    const head = document.querySelector(`#profile-panel-${panelId} .profile-panel__head`);
    if (!head) return;
    // One note at a time: a quick second change replaces the first.
    head.querySelectorAll('.profile-flash').forEach((old) => old.remove());
    const el = document.createElement('span');
    el.className = 'profile-note profile-note--ok profile-flash';
    el.innerHTML = `<i class="bi bi-check2-circle"></i> ${esc(text)}`;
    head.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  // ── Advancement description tooltip ────────────────────────────────────────

  const tooltip = document.createElement('div');
  tooltip.className = 'profile-tooltip';
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  function positionTooltip(anchorEl) {
    const aRect = anchorEl.getBoundingClientRect();
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let top = aRect.top - th - 10;
    let left = aRect.left;
    if (top < 10) top = aRect.bottom + 10;
    top = Math.max(10, Math.min(top, window.innerHeight - th - 10));
    left = Math.max(10, Math.min(left, window.innerWidth - tw - 10));
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  root.addEventListener('mouseover', (ev) => {
    const row = ev.target.closest('.profile-advancement-row[data-tooltip]');
    if (!row) return;
    tooltip.textContent = row.dataset.tooltip;
    tooltip.hidden = false;
    positionTooltip(row);
  });
  root.addEventListener('mouseout', (ev) => {
    if (ev.target.closest('.profile-advancement-row[data-tooltip]')) tooltip.hidden = true;
  });
})();
