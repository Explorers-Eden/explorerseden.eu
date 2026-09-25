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
  // timer, same as the homepage lineup's center figure - a real
  // multi-frame animation rather than a static portrait.
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

  function group(id, summaryHtml, bodyHtml, open) {
    return `
      <details class="profile-group" id="profile-group-${id}"${open ? ' open' : ''}>
        <summary>
          ${summaryHtml}
          <i class="bi bi-chevron-down profile-group__arrow" aria-hidden="true"></i>
        </summary>
        <div class="profile-group__body">${bodyHtml}</div>
      </details>
    `;
  }

  // ── Group 1: player headline + skin + summary stats ─────────────────────────

  function playerGroup() {
    const badges = [];
    if (profile.race) badges.push(`<span class="profile-badge"><i class="bi bi-stars"></i> ${esc(profile.race)}</span>`);
    if (profile.class) badges.push(`<span class="profile-badge"><i class="bi bi-award"></i> ${esc(profile.class)}</span>`);

    const home = profile.home
      ? `
        <span class="profile-badge profile-badge--home">
          <i class="bi bi-house-door-fill"></i>
          ${profile.home.x.toLocaleString()}, ${profile.home.y.toLocaleString()}, ${profile.home.z.toLocaleString()}
          <span class="profile-badge__dim">${esc(profile.home.dimension)}</span>
        </span>
      `
      : '';

    const updatedBadge = dataEl.dataset.updatedAt
      ? `<span class="profile-badge profile-badge--small profile-badge--muted"><i class="bi bi-arrow-clockwise"></i> Updated ${esc(new Date(dataEl.dataset.updatedAt).toLocaleString())}</span>`
      : '';

    const summaryHtml = `
      <span class="profile-name-row">
        <span class="profile-group__title"><i class="bi bi-person-fill"></i> <span class="profile-name">${esc(profile.name)}</span></span>
        ${home}
        ${updatedBadge}
        <span class="profile-headline">${badges.join('') || '<span class="profile-badge profile-badge--muted">No race/class chosen yet</span>'}</span>
      </span>
    `;

    // Reuses the homepage skin lineup's wave-animation renders (see
    // tools/scripts/generate-homepage-skin-poses.js) - they're generated
    // for every linked player, not just the ones the homepage happens to
    // pick, so the player's own profile can wave too instead of standing
    // on a single static render.
    const skin = profile.uuid
      ? `<img class="profile-overview__skin" id="profile-skin-frame" src="${esc(skinWaveFramePath(profile.uuid, 0))}" data-uuid="${esc(profile.uuid)}" alt="${esc(profile.name)}'s skin" onerror="this.onerror=null;this.src='${esc(profile.skinIcon || '')}';">`
      : profile.skinIcon
      ? `<img class="profile-overview__skin" src="${esc(profile.skinIcon)}" alt="${esc(profile.name)}'s skin">`
      : '<div class="profile-overview__skin profile-overview__skin--missing"><i class="bi bi-person-fill"></i></div>';

    const s = profile.stats;
    const bodyHtml = `
      <div class="profile-overview">
        ${skin}
        <div class="profile-stat-grid">
          ${statTile('bi-trophy-fill', 'Advancements Completed', profile.advancementsCompleted.toLocaleString())}
          ${statTile('bi-clock-history', 'Hours Played', s.playtimeHours.toLocaleString())}
          ${statTile('bi-heartbreak-fill', 'Deaths', s.deaths.toLocaleString())}
          ${statTile('bi-crosshair', 'Mobs Killed', s.mobKillsTotal.toLocaleString())}
          ${statTile('bi-lightning-charge-fill', 'Damage Dealt', findStatValue('General', 'Damage Dealt'))}
          ${statTile('bi-hammer', 'Blocks Mined', s.blocksMinedTotal.toLocaleString())}
        </div>
      </div>
    `;

    return group('player', summaryHtml, bodyHtml, true);
  }

  // "Damage Dealt" only exists inside statsDetailed's General category (it's
  // not one of the 4 fields on profile.stats), so pull the already
  // human-formatted value straight out of there instead of recomputing it.
  function findStatValue(category, label) {
    const cat = profile.statsDetailed.find((c) => c.category === category);
    const item = cat?.items.find((i) => i.label === label);
    return item?.value ?? '—';
  }

  function statTile(icon, label, value) {
    return `
      <div class="profile-stat-tile">
        <i class="bi ${icon}"></i>
        <div>
          <p class="profile-stat-tile__value">${value}</p>
          <p class="profile-stat-tile__label">${label}</p>
        </div>
      </div>
    `;
  }

  // ── Group 2: Waypoints ────────────────────────────────────────────────────

  function waypointsGroup() {
    const summaryHtml = `<span class="profile-group__title"><i class="bi bi-signpost-split"></i> Waypoints</span><span class="profile-count-badge">${profile.waypoints.length}</span>`;
    const bodyHtml = profile.waypoints.length
      ? `<div class="waypoint-hub-grid">${profile.waypoints.map(waypointCardHtml).join('')}</div>`
      : '<p class="profile-empty-note">No waypoint hubs yet.</p>';
    return group('waypoints', summaryHtml, bodyHtml, false);
  }

  function waypointCardHtml(wp) {
    return `
      <article class="waypoint-card">
        <img class="waypoint-card__avatar" src="${esc(wp.icon || '')}" alt="" loading="lazy">
        <div class="waypoint-card__body">
          <div class="profile-waypoint-title-row">
            <h3>${esc(wp.name)}</h3>
            <span class="profile-access-badge profile-access-badge--${wp.access === 'public' ? 'public' : 'private'}">${wp.access === 'public' ? 'Public' : 'Private'}</span>
          </div>
          <p class="waypoint-card__coords"><i class="bi bi-geo-alt-fill"></i> ${wp.x}, ${wp.y}, ${wp.z} · ${esc(wp.dimension)}</p>
          ${wp.description ? `<p class="waypoint-card__description">${esc(wp.description)}</p>` : ''}
        </div>
      </article>
    `;
  }

  // ── Group 3: Claims ───────────────────────────────────────────────────────

  function claimsGroup() {
    const summaryHtml = `<span class="profile-group__title"><i class="bi bi-shield-lock"></i> Claims</span><span class="profile-count-badge">${profile.claims.length}</span>`;
    const bodyHtml = profile.claims.length
      ? `<div class="profile-claim-grid">${profile.claims.map(claimCardHtml).join('')}</div>`
      : '<p class="profile-empty-note">No land claims yet.</p>';
    return group('claims', summaryHtml, bodyHtml, false);
  }

  function claimCardHtml(claim) {
    return `
      <article class="profile-claim-card">
        <div class="profile-claim-card__header">
          <h3>${esc(claim.anchorType)}</h3>
          <span class="profile-claim-card__dimension">${esc(claim.dimension)}</span>
        </div>
        <p class="profile-claim-card__coords"><i class="bi bi-geo-alt-fill"></i> ${claim.x}, ${claim.y}, ${claim.z}</p>
        <div class="profile-claim-card__trusted">
          <strong>Trusted:</strong>
          ${claim.trusted.length ? claim.trusted.map((n) => `<span class="profile-badge profile-badge--small">${esc(n)}</span>`).join('') : '<span class="profile-empty-note">Nobody trusted yet</span>'}
        </div>
      </article>
    `;
  }

  // ── Group 4: Last Grave (reuses the admin Playerdata Inspector's item/badge
  // classes from admin-playerdata.css, loaded site-wide, for a consistent look) ─

  function graveGroup() {
    const summaryHtml = `<span class="profile-group__title"><i class="bi bi-flower1"></i> Last Grave</span>`;
    const grave = profile.lastGrave;
    if (!grave) {
      return group('grave', summaryHtml, '<p class="profile-empty-note">No grave on record.</p>', false);
    }

    const badges = [
      grave.removed
        ? '<span class="admin-pd-badge admin-pd-badge--muted"><i class="bi bi-check-circle"></i> Cleared</span>'
        : '<span class="admin-pd-badge admin-pd-badge--warn"><i class="bi bi-exclamation-circle"></i> Still standing</span>',
    ];
    if (grave.openedBy === 'expired') {
      badges.push('<span class="admin-pd-badge admin-pd-badge--warn"><i class="bi bi-hourglass-split"></i> Expired unopened</span>');
    } else if (grave.openedBy) {
      badges.push(`<span class="admin-pd-badge"><i class="bi bi-door-open"></i> Opened by ${esc(grave.openedBy)}</span>`);
    }

    const itemHtml = (item) => {
      const icon = item.isHead ? 'bi-person-bounding-box' : (item.enchantments.length ? 'bi-stars' : 'bi-box-seam');
      const tip = item.enchantments.length ? ` title="${esc(item.enchantments.join(', '))}"` : '';
      return `
        <div class="admin-pd-item${item.enchantments.length ? ' admin-pd-item--enchanted' : ''}"${tip}>
          <i class="bi ${icon}"></i>
          <span class="admin-pd-item__name">${esc(item.displayName)}</span>
          <span class="admin-pd-item__count">×${item.count}</span>
        </div>
      `;
    };

    const bodyHtml = `
      <p class="waypoint-card__coords"><i class="bi bi-geo-alt-fill"></i> ${grave.x}, ${grave.y}, ${grave.z} · ${esc(grave.dimension)}</p>
      <div class="admin-pd-grave-badges">${badges.join('')}</div>
      ${grave.contents.length
        ? `<div class="admin-pd-item-grid">${grave.contents.map(itemHtml).join('')}</div>`
        : '<p class="profile-empty-note">Grave is empty.</p>'}
    `;
    return group('grave', summaryHtml, bodyHtml, false);
  }

  // ── Group 5: All Statistics ───────────────────────────────────────────────

  function statsDetailGroup() {
    const summaryHtml = `<span class="profile-group__title"><i class="bi bi-bar-chart-fill"></i> All Statistics</span>`;
    const bodyHtml = profile.statsDetailed.length
      ? profile.statsDetailed.map((cat) => `
          <details class="profile-detail-section">
            <summary class="profile-detail-section__title">${esc(cat.category)} <span class="profile-count-badge">${cat.items.length}</span> <i class="bi bi-chevron-down profile-detail-section__arrow"></i></summary>
            <div class="profile-stat-rows">
              ${cat.items.map((item) => `
                <div class="profile-stat-row">
                  <span>${esc(item.label)}</span>
                  <span class="profile-stat-row__value">${esc(item.value)}</span>
                </div>
              `).join('')}
            </div>
          </details>
        `).join('')
      : '<p class="profile-empty-note">No stats recorded yet.</p>';
    return group('stats-detail', summaryHtml, bodyHtml, false);
  }

  // ── Group 5: All Advancements ─────────────────────────────────────────────

  function advancementsDetailGroup() {
    const totalDone = profile.advancementsDetailed.reduce((sum, g) => sum + g.doneCount, 0);
    const totalItems = profile.advancementsDetailed.reduce((sum, g) => sum + g.items.length, 0);
    const summaryHtml = `<span class="profile-group__title"><i class="bi bi-trophy-fill"></i> All Advancements</span><span class="profile-count-badge">${totalDone}/${totalItems}</span>`;
    const bodyHtml = profile.advancementsDetailed.length
      ? profile.advancementsDetailed.map((cat) => `
          <div class="profile-detail-section">
            <h3 class="profile-detail-section__title">${esc(cat.category)} <span class="profile-count-badge">${cat.doneCount}/${cat.items.length}</span></h3>
            <div class="profile-advancement-list">
              ${cat.items.map((item) => `
                <div class="profile-advancement-row ${item.done ? 'is-done' : 'is-pending'}"${item.description ? ` data-tooltip="${esc(item.description)}"` : ''}>
                  <i class="bi ${item.done ? 'bi-check-circle-fill' : 'bi-circle'}"></i>
                  <span>${esc(item.label)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')
      : '<p class="profile-empty-note">No advancements recorded yet.</p>';
    return group('advancements-detail', summaryHtml, bodyHtml, false);
  }

  root.innerHTML = [
    playerGroup(),
    waypointsGroup(),
    claimsGroup(),
    graveGroup(),
    statsDetailGroup(),
    advancementsDetailGroup(),
  ].join('');

  animateProfileSkin();

  // ── Advancement description tooltip (mirrors the shared floating-tooltip
  // pattern already used by structures.js, styled the same way) ──────────────

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
