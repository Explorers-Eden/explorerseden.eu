(function () {
  const list = document.getElementById('admin-pd-list');
  const searchInput = document.getElementById('admin-pd-search');
  const clearButton = document.getElementById('admin-pd-clear-search');
  const statusEl = document.getElementById('admin-pd-status');
  const refreshButton = document.getElementById('admin-pd-refresh');
  if (!list) return;

  let players = [];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ── Avatar fallback chain ────────────────────────────────────────────────
  //
  // mc-heads.net occasionally can't reach Mojang for a given uuid and
  // silently serves the default Steve skin with an HTTP 200 (no client-side
  // error to catch there), so a genuine load failure - the only kind we CAN
  // detect - gets tried against a small pool of independent services before
  // giving up to the generic placeholder, rather than going straight there.
  const PLACEHOLDER_AVATAR = 'https://mc-heads.net/avatar/MHF_Question/64';

  // Matches the same-origin bot's own cache-busting convention (a random
  // uuid query param) so a previously-served default/stale render isn't
  // reused from any cache sitting in front of minotar.net.
  function minotarUrl(uuid) {
    const randomUuid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    return `https://minotar.net/avatar/${uuid}?randomuuid=${randomUuid}`;
  }

  // Single shared onerror handler (must be global - inline HTML event
  // attributes run in global scope, not this closure) that advances an
  // <img>'s data-fallbacks queue one step at a time.
  window.__admPdAvatarFallback = function (img) {
    let queue;
    try { queue = JSON.parse(img.dataset.fallbacks || '[]'); } catch { queue = []; }
    const next = queue.shift();
    img.dataset.fallbacks = JSON.stringify(queue);
    if (next) img.src = next;
    else img.onerror = null;
  };

  // primaryUrl is tried first if given (e.g. a pre-rendered face-crop icon,
  // or the player's already-resolved mc-heads.net avatar); uuid (if known)
  // fills out the rest of the fallback pool.
  function avatarImg(className, primaryUrl, uuid) {
    const pool = uuid
      ? [`https://crafatar.com/avatars/${uuid}?size=64&overlay`, minotarUrl(uuid), PLACEHOLDER_AVATAR]
      : [PLACEHOLDER_AVATAR];
    const src = primaryUrl || pool.shift();
    return `<img class="${className}" src="${esc(src)}" alt="" loading="lazy" data-fallbacks='${esc(JSON.stringify(pool))}' onerror="window.__admPdAvatarFallback(this)">`;
  }

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('is-error', !!isError);
  }

  function coordsTile(icon, title, loc) {
    if (!loc) {
      return `
        <div class="admin-pd-tile admin-pd-tile--empty">
          <span><i class="bi ${icon}"></i> No ${title.toLowerCase()} set</span>
        </div>
      `;
    }
    return `
      <div class="admin-pd-tile">
        <p class="admin-pd-tile__title"><i class="bi ${icon}"></i> ${esc(title)}</p>
        <p class="admin-pd-tile__coords">${loc.x}, ${loc.y}, ${loc.z}</p>
        <p class="admin-pd-tile__sub">${esc(loc.dimension)}</p>
      </div>
    `;
  }

  function statusTile(status) {
    if (!status) {
      return `
        <div class="admin-pd-tile admin-pd-tile--empty">
          <span><i class="bi bi-person-walking"></i> Live status unavailable</span>
        </div>
      `;
    }
    const bits = [];
    if (status.health != null) bits.push(`<i class="bi bi-heart-fill"></i> ${status.health}/20`);
    if (status.food != null) bits.push(`<i class="bi bi-egg-fried"></i> ${status.food}/20`);
    if (status.xpLevel != null) bits.push(`<i class="bi bi-star-fill"></i> Lvl ${status.xpLevel}`);
    return `
      <div class="admin-pd-tile">
        <p class="admin-pd-tile__title"><i class="bi bi-person-walking"></i> Current Position</p>
        <p class="admin-pd-tile__coords">${status.x}, ${status.y}, ${status.z}</p>
        <p class="admin-pd-tile__sub">${esc(status.dimension)}${status.gameMode ? ` · ${esc(status.gameMode)}` : ''}</p>
        ${bits.length ? `<p class="admin-pd-tile__sub">${bits.join(' &nbsp; ')}</p>` : ''}
      </div>
    `;
  }

  function waypointCardHtml(wp, ownerHeadIconUrl, ownerUuid) {
    // wp.icon is the same pre-rendered face-crop PNG the actual Waypoint
    // Hubs page and My SMP Profile use - only fall back to the owner's
    // mc-heads.net avatar (then the rest of the pool) if that's missing.
    return `
      <article class="waypoint-card">
        ${avatarImg('waypoint-card__avatar', wp.icon || ownerHeadIconUrl, ownerUuid)}
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

  function itemHtml(item) {
    const icon = item.isHead ? 'bi-person-bounding-box' : (item.enchantments.length ? 'bi-stars' : 'bi-box-seam');
    const tip = item.enchantments.length ? ` data-tip="${esc(item.enchantments.join(', '))}"` : '';
    return `
      <div class="admin-pd-item${item.enchantments.length ? ' admin-pd-item--enchanted' : ''}"${tip}>
        <i class="bi ${icon}"></i>
        <span class="admin-pd-item__name">${esc(item.displayName)}</span>
        <span class="admin-pd-item__count">×${item.count}</span>
      </div>
    `;
  }

  function graveSection(grave) {
    if (!grave) {
      return `
        <div class="admin-pd-section">
          <p class="admin-pd-section__title"><i class="bi bi-flower1"></i> Last Grave</p>
          <p class="admin-pd-tile admin-pd-tile--empty"><span>No grave on record</span></p>
        </div>
      `;
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
    const hasEnchants = grave.contents.some((i) => i.enchantments.length);
    return `
      <div class="admin-pd-section">
        <p class="admin-pd-section__title"><i class="bi bi-flower1"></i> Last Grave <span class="admin-pd-tile__sub">${grave.x}, ${grave.y}, ${grave.z} · ${esc(grave.dimension)}</span></p>
        <div class="admin-pd-grave-badges">${badges.join('')}</div>
        ${grave.contents.length
          ? `<div class="admin-pd-item-grid">${grave.contents.map(itemHtml).join('')}</div>`
          : '<p class="admin-pd-tile__sub">Grave is empty.</p>'}
        ${hasEnchants ? '<p class="admin-pd-enchant-tip">Hover a glowing item to see its enchantments.</p>' : ''}
      </div>
    `;
  }

  // Same markup/classes as profile.js's claimCardHtml (My SMP Profile), so
  // land claims read identically wherever an admin sees them.
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

  function cardHtml(player) {
    const badges = [];
    if (player.race) badges.push(`<span class="profile-badge profile-badge--small"><i class="bi bi-stars"></i> ${esc(player.race)}</span>`);
    if (player.class) badges.push(`<span class="profile-badge profile-badge--small"><i class="bi bi-award"></i> ${esc(player.class)}</span>`);
    if (!player.uuid) badges.push('<span class="profile-badge profile-badge--small profile-badge--muted"><i class="bi bi-question-circle"></i> UUID unresolved</span>');

    const waypointsHtml = player.waypoints.length
      ? `
        <div class="admin-pd-section">
          <p class="admin-pd-section__title"><i class="bi bi-signpost-split"></i> Waypoints <span class="profile-count-badge">${player.waypoints.length}</span></p>
          <div class="waypoint-hub-grid">${player.waypoints.map((wp) => waypointCardHtml(wp, player.headIconUrl, player.uuid)).join('')}</div>
        </div>
      `
      : '';

    const claimsHtml = player.claims.length
      ? `
        <div class="admin-pd-section">
          <p class="admin-pd-section__title"><i class="bi bi-shield-lock"></i> Claims <span class="profile-count-badge">${player.claims.length}</span></p>
          <div class="profile-claim-grid">${player.claims.map(claimCardHtml).join('')}</div>
        </div>
      `
      : '';

    return `
      <details class="admin-pd-card">
        <summary>
          ${avatarImg('admin-pd-card__avatar', player.headIconUrl, player.uuid)}
          <span class="admin-pd-card__name">${esc(player.name)}</span>
          <span class="admin-pd-card__badges">${badges.join('')}</span>
          <i class="bi bi-chevron-down admin-pd-card__arrow" aria-hidden="true"></i>
        </summary>
        <div class="admin-pd-card__body">
          <div class="admin-pd-tile-grid">
            ${statusTile(player.status)}
            ${coordsTile('bi-house-door-fill', 'Home', player.home)}
            ${coordsTile('bi-geo-alt-fill', 'Last Safe Position', player.lastSafePos)}
            ${coordsTile('bi-heartbreak-fill', 'Last Death Location', player.lastDeathLoc)}
          </div>
          ${waypointsHtml}
          ${claimsHtml}
          ${graveSection(player.lastGrave)}
        </div>
      </details>
    `;
  }

  function render(filtered) {
    list.innerHTML = filtered.length
      ? filtered.map(cardHtml).join('')
      : '<p class="admin-pd-empty">No matching players.</p>';
  }

  function applyFilter() {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const filtered = query
      ? players.filter((p) => p.name.toLowerCase().includes(query))
      : players;
    render(filtered);
  }

  async function load() {
    setStatus('Loading playerdata…');
    list.innerHTML = '';
    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.querySelector('i')?.classList.add('is-spinning');
    }
    try {
      const response = await fetch('/admin-playerdata/api/data.php', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.message || `Request failed: ${response.status}`);
      }
      players = data.players || [];
      applyFilter();
      // Refreshed on the normal generate schedule (every hour), not live -
      // full date+time here since "just now" isn't a safe assumption anymore.
      const stamp = data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '';
      setStatus(`${players.length} player${players.length === 1 ? '' : 's'} · as of ${stamp}`);
    } catch (err) {
      list.innerHTML = '<p class="admin-pd-empty">Could not load playerdata.</p>';
      setStatus(err.message || 'Could not load playerdata.', true);
    } finally {
      if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.querySelector('i')?.classList.remove('is-spinning');
      }
    }
  }

  if (searchInput) searchInput.addEventListener('input', applyFilter);
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      applyFilter();
      searchInput?.focus();
    });
  }
  if (refreshButton) refreshButton.addEventListener('click', load);

  // Enchantment tooltip on hover, mirrors profile.js's advancement-description
  // tooltip pattern (simple title-attribute would be enough functionally, but
  // this keeps the same floating look used elsewhere on the site).
  list.addEventListener('mouseover', (ev) => {
    const item = ev.target.closest('.admin-pd-item[data-tip]');
    if (item && !item.title) item.title = item.dataset.tip;
  });

  load();
})();
