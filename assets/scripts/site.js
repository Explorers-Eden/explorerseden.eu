// If a recipe deep-link gets opened against the root path (older copies of
// the URL were `https://explorerseden.eu/#<slug>/<ns>/<recipePath>` instead
// of `/recipes/#…`), bounce to /recipes/ before the home page even renders.
// The hash for a recipe deep-link always has at least two unescaped slashes.
(() => {
  const path = location.pathname.replace(/\/+$/, '');
  const hash = location.hash;
  if (path === '' && hash.length > 1 && hash.slice(1).split('/').length >= 3) {
    location.replace(`/recipes/${hash}`);
  }
})();

const backgrounds = [
  '/assets/images/backgrounds/1.png',
  '/assets/images/backgrounds/2.png',
  '/assets/images/backgrounds/3.jpg',
  '/assets/images/backgrounds/4.jpg',
  '/assets/images/backgrounds/5.png',
  '/assets/images/backgrounds/6.jpg',
  '/assets/images/backgrounds/7.png',
  '/assets/images/backgrounds/8.png'
];

const lockedPalette = {
  bg: '#0b1018',
  accent: '#b6c8ff',
  accent2: '#ffd18b',
  cardA: 'rgba(10, 12, 22, .88)',
  cardB: 'rgba(3, 5, 10, .94)',
  glass: 'rgba(5, 7, 13, .86)'
};

const fallbackProjects = [
  ['katters-structures', "Katter's Structures", 'Adds 30+ brand new vanilla like structures to the game.', '/assets/images/mods/ks.png'],
  ['enchantments-encore', 'Enchantments Encore', 'Supercharges your Minecraft experience with a vast array of new, creative enchantments to enhance weapons, tools, and armor like never before.', '/assets/images/mods/ee.png'],
  ['warping-wonders', 'Warping Wonders', 'Provides vanilla friendly teleportation methods like Waypoint Hubs to further immerse you in your worlds. No more /tpa, /home, or similar commands needed.', '/assets/images/mods/wawo.png'],
  ['fabled-roots', 'Fabled Roots', 'Fabled Roots adds 10 unique races and 10 powerful classes to Minecraft, along with new weapons, items, spells and structures to explore.', '/assets/images/mods/fabled_roots.png'],
  ['nice-mob-variants', 'Nice Mob Variants', 'Giving your game a whole bunch of new mob variants to check out.', '/assets/images/mods/mob_variants.png'],
  ['nice-keep-inventory', 'Nice Keep Inventory', 'Keep only Equipment and important items upon death. Also includes a fully fletched Graves system and 3 new enchantments. Fully configurable.', '/assets/images/mods/keepinv.png'],
  ['nice-things-eden', 'Nice Things Eden', 'A loose collection of vanilla feeling items, blocks, recipes, structures and small gameplay tweaks.', '/assets/images/mods/nice_things.png'],
  ['nice-name-tags', 'Nice Name Tags', 'Change entity behavior with name tags - make mobs silent, keep them as babies, change villager types, and more.', '/assets/images/mods/nnt.png'],
  ['nice-mob-manager', 'Nice Mob Manager', 'Probably the most advanced mob customizing data pack out there - tweak individual mobs, equipment, behavior and more easily via in-game menus.', '/assets/images/mods/mob_manager.png'],
  ['nice-actions', 'Nice Actions', 'Adding a simple, user-friendly menu for actions like RTP, sitting, and setting a home - no complicated commands required. Perfect for Single and Multiplayer.', '/assets/images/mods/actions.png'],
  ['nice-admin-tools', 'Nice Admin Tools', 'User-friendly & lightweight Admin Tools with intuitive menu navigation. Great for Admins, Operators, and Map Makers.', '/assets/images/mods/nat.png']
].map(([slug, title, description, icon_url]) => ({ slug, title, description, icon_url, downloads: null, followers: null, updated_at: null }));

const preferredOrder = fallbackProjects.map(project => project.slug);
const localIconFallbacks = Object.fromEntries(fallbackProjects.map(project => [project.slug, project.icon_url]));
const siteBg = document.querySelector('.site-bg');

function applyPalette(palette) {
  const root = document.documentElement;
  root.style.setProperty('--bg', palette.bg);
  root.style.setProperty('--accent', palette.accent);
  root.style.setProperty('--accent-2', palette.accent2);
  root.style.setProperty('--card-a', palette.cardA);
  root.style.setProperty('--card-b', palette.cardB);
  root.style.setProperty('--glass', palette.glass);
}

if (siteBg) {
  siteBg.style.backgroundImage = `url('${backgrounds[Math.floor(Math.random() * backgrounds.length)]}')`;
  applyPalette(lockedPalette);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en', {
    notation: number >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(number);
}

function formatRelativeDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const future = diffMs < 0;
  const absMs = Math.abs(diffMs);
  const units = [['year',31536000000],['month',2592000000],['week',604800000],['day',86400000],['hour',3600000],['minute',60000]];
  for (const [unit, ms] of units) {
    const amount = Math.floor(absMs / ms);
    if (amount >= 1) return future ? `in ${amount} ${unit}${amount === 1 ? '' : 's'}` : `${amount} ${unit}${amount === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

function isKatterSubProject(project) {
  const slug = String(project.slug || '').toLowerCase();
  return slug.startsWith('katters-structures-') && slug !== 'katters-structures';
}

function isDataPack(project) {
  const tags = [...(project.loaders || []), ...(project.categories || []), ...(project.additional_categories || [])]
    .map(tag => String(tag).toLowerCase());
  return tags.includes('datapack') || tags.includes('data pack');
}

function sortProjects(projects) {
  return [...projects].sort((a, b) => {
    const downloadDiff = (Number(b.downloads) || 0) - (Number(a.downloads) || 0);
    if (downloadDiff !== 0) return downloadDiff;
    return String(a.title || a.slug).localeCompare(String(b.title || b.slug));
  });
}

function bestGalleryImage(project) {
  const gallery = Array.isArray(project.gallery) ? project.gallery : [];
  if (!gallery.length) return null;
  const chosen = gallery[Math.floor(Math.random() * gallery.length)];
  return chosen.raw_url || chosen.url || null;
}

function normalizeProjects(projects) {
  return sortProjects(projects)
    .filter(project => project && project.slug)
    .filter(project => !isKatterSubProject(project))
    .filter(project => isDataPack(project) || preferredOrder.includes(project.slug))
    .map(project => ({
      slug: project.slug,
      title: project.title || project.name || project.slug,
      description: project.description || "A Minecraft data pack by Explorer's Eden.",
      icon_url: project.icon_url || localIconFallbacks[project.slug] || '/assets/images/mods/ee.png',
      gallery_url: bestGalleryImage(project),
      downloads: project.downloads,
      followers: project.followers,
      updated_at: project.updated || project.date_updated || project.updated_at || null,
      page_url: `https://modrinth.com/datapack/${project.slug}`
    }));
}

const MARQUEE_SECONDS_PER_CARD = 12.5;

function titleCardHtml(project) {
  const bgImage = project.gallery_url
    ? `<img class="mod-title-card__bg-img" src="${escapeHtml(project.gallery_url)}" alt="" loading="eager" fetchpriority="high" referrerpolicy="no-referrer">`
    : '';
  return `
    <a class="mod-title-card" href="${escapeHtml(project.page_url || `https://modrinth.com/datapack/${project.slug}`)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(project.title)} on Modrinth">
      <div class="mod-title-card__bg">${bgImage}</div>
      <div class="mod-title-card__scrim"></div>
      <div class="mod-title-card__header">
        <div class="mod-title-card__icon">
          <img src="${escapeHtml(project.icon_url)}" alt="" loading="eager" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${escapeHtml(localIconFallbacks[project.slug] || '/assets/images/mods/ee.png')}';">
        </div>
        <div class="mod-title-card__heading">
          <h2>${escapeHtml(project.title)}</h2>
          <p>${escapeHtml(project.description)}</p>
        </div>
      </div>
      <div class="mod-title-card__footer">
        <div class="mod-meta" aria-label="Modrinth stats">
          <span><i class="bi bi-download"></i> ${formatNumber(project.downloads)}</span>
          <span><i class="bi bi-star-fill"></i> ${formatNumber(project.followers)}</span>
          <span><i class="bi bi-clock-history"></i> ${formatRelativeDate(project.updated_at)}</span>
        </div>
        <span class="mod-title-card__cta">View on Modrinth <i class="bi bi-box-arrow-up-right"></i></span>
      </div>
    </a>
  `;
}

function renderProjects(projects, fallback = false) {
  const list = document.querySelector('#mod-list');
  if (!list) return;

  const note = fallback
    ? '<p class="mod-list-note">Live Modrinth data could not be loaded, so fallback entries are shown.</p>'
    : '';

  // Duplicated once so the track can loop seamlessly: translating exactly
  // -50% lands on a pixel-identical copy of the starting frame.
  const marqueeCards = projects.map(project => titleCardHtml(project)).join('');
  const duration = Math.max(24, projects.length * MARQUEE_SECONDS_PER_CARD);

  list.innerHTML = `
    ${note}
    <div class="mod-marquee" id="mod-marquee">
      <div class="mod-marquee__track" style="animation-duration:${duration}s;">
        ${marqueeCards}${marqueeCards}
      </div>
    </div>
  `;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 5500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(`${url} did not return a project array.`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function loadModrinthProjects() {
  const list = document.querySelector('#mod-list');
  if (!list) return;

  renderProjects(fallbackProjects.map(project => ({
    ...project,
    page_url: `https://modrinth.com/datapack/${project.slug}`
  })), true);

  const slugs = preferredOrder;
  const directApi = `https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(slugs))}`;
  const localProxy = list.dataset.modrinthSource || 'modrinth-projects.php';

  try {
    let data;
    try {
      data = await fetchJsonWithTimeout(localProxy, {}, 5000);
    } catch (proxyError) {
      console.warn('Local Modrinth proxy failed, trying direct Modrinth API:', proxyError);
      data = await fetchJsonWithTimeout(directApi, {}, 7000);
    }

    const projects = normalizeProjects(data);
    if (!projects.length) throw new Error('No data pack projects found.');
    renderProjects(projects, false);

    const totalDownloads = projects.reduce((sum, project) => sum + (Number(project.downloads) || 0), 0);
    const downloadsMeta = document.querySelector('#feature-modrinth-downloads');
    if (downloadsMeta && totalDownloads > 0) {
      downloadsMeta.textContent = `${formatNumber(totalDownloads)} total downloads`;
    }
  } catch (error) {
    console.warn('Could not load live Modrinth projects:', error);
    const note = document.querySelector('.mod-list-note');
    if (note) {
      note.textContent = 'Live Modrinth stats could not be loaded right now, so local entries are shown.';
    }
  }
}

loadModrinthProjects();

// ── SMP live panel (community stats + random skin lineup) ───────────────
// Loaded on every page, so guard on the elements existing rather than
// assuming anything about the current page.
(() => {
  const advancementsEl = document.querySelector('#smp-stat-advancements');
  const playtimeEl = document.querySelector('#smp-stat-playtime');
  const blocksEl = document.querySelector('#smp-stat-blocks');
  const mobsEl = document.querySelector('#smp-stat-mobs');
  const skinRow = document.querySelector('#skin-row');
  if (!advancementsEl && !playtimeEl && !blocksEl && !mobsEl && !skinRow) return;

  function shuffled(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // Each player has pre-rendered homepage lineup poses (see
  // tools/scripts/generate-homepage-skin-poses.js): a 14-frame wave-hello
  // animation for the "center" camera (near front-on), and a single
  // mid-stride walking pose - in "forward"/"back" foot variants - for the
  // "left"/"right" cameras (turned slightly toward the middle slot). Must
  // match that script's WAVE_FRAME_COUNT.
  const SKIN_POSE_BASE = '/assets/images/generated/player-skins-home';
  const SKIN_WAVE_FRAME_COUNT = 28;
  const SKIN_FRAME_INTERVAL_MS = 70;
  const SKIN_WALK_VARIANTS = ['forward', 'back'];

  function skinWaveFramePath(uuid, frameIndex) {
    const padded = String(frameIndex).padStart(2, '0');
    return `${SKIN_POSE_BASE}/${encodeURIComponent(uuid)}-center-${padded}.png`;
  }

  function skinWalkFramePath(uuid, camera, variant) {
    return `${SKIN_POSE_BASE}/${encodeURIComponent(uuid)}-${camera}-${variant}.png`;
  }

  function skinFigureHtml(player, camera, isCenter) {
    // The center figure starts on frame 0 and gets animated (see
    // animateCenterFigure); side figures just freeze on one random
    // walking-pose variant so the lineup shows varied, non-identical poses.
    const src = isCenter
      ? skinWaveFramePath(player.uuid, 0)
      : skinWalkFramePath(player.uuid, camera, SKIN_WALK_VARIANTS[Math.floor(Math.random() * SKIN_WALK_VARIANTS.length)]);
    const raceBadge = player.race ? `<span class="skin-row__race"><i class="bi bi-stars"></i> ${escapeHtml(player.race)}</span>` : '';

    return `
      <figure class="skin-row__item${isCenter ? ' skin-row__item--center' : ''}">
        <div class="skin-row__figure">
          <img class="skin-row__frame" src="${src}" alt="" loading="lazy" data-uuid="${escapeHtml(player.uuid)}">
        </div>
        <figcaption class="skin-row__caption">
          <span class="skin-row__name">${escapeHtml(player.name)}</span>
          ${raceBadge}
        </figcaption>
      </figure>
    `;
  }

  // Cycles the center figure's <img> through its full wave-frame sequence
  // on a timer - a real multi-frame animation, not a two-pose toggle.
  // Frames are preloaded up front so the loop plays smoothly instead of
  // stalling on the network the first time each frame comes up.
  function animateCenterFigure(img) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const { uuid } = img.dataset;
    const frameUrls = Array.from({ length: SKIN_WAVE_FRAME_COUNT }, (_, i) => skinWaveFramePath(uuid, i));
    frameUrls.forEach((url) => { new Image().src = url; });

    let index = 0;
    setInterval(() => {
      index = (index + 1) % frameUrls.length;
      img.src = frameUrls[index];
    }, SKIN_FRAME_INTERVAL_MS);
  }

  function renderSkinRow(roster) {
    if (!skinRow || !roster.length) return;
    const picks = shuffled(roster).slice(0, 5);
    const centerIndex = Math.floor((picks.length - 1) / 2);
    const cameraForIndex = (i) => (i === centerIndex ? 'center' : i < centerIndex ? 'left' : 'right');

    skinRow.innerHTML = picks.map((player, i) => skinFigureHtml(player, cameraForIndex(i), i === centerIndex)).join('');

    const centerImg = skinRow.querySelector('.skin-row__item--center .skin-row__frame');
    if (centerImg) animateCenterFigure(centerImg);
  }

  fetch('/profiles/api/aggregate.php', { cache: 'no-store' })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) throw new Error(data.message || 'Request failed');
      // These are exact community totals, not "1.3M"-style stat-tile
      // numbers, so a plain grouped integer reads better than formatNumber's
      // compact notation.
      const exact = (n) => new Intl.NumberFormat('en').format(Math.round(Number(n) || 0));
      if (advancementsEl) advancementsEl.textContent = exact(data.totals?.advancementsCompleted ?? 0);
      if (playtimeEl) playtimeEl.textContent = exact(data.totals?.playtimeHours ?? 0);
      if (blocksEl) blocksEl.textContent = exact(data.totals?.blocksMinedTotal ?? 0);
      if (mobsEl) mobsEl.textContent = exact(data.totals?.mobKillsTotal ?? 0);
      renderSkinRow(data.roster || []);
    })
    .catch((error) => console.warn('Could not load SMP community stats:', error));
})();

// ── Translate overview (progress bar + open-votes stat) ──────────────────
// Loaded on every page, so guard on the elements existing rather than
// assuming anything about the current page.
(() => {
  const percentEl = document.querySelector('#translate-overview-percent');
  const fillEl = document.querySelector('#translate-overview-fill');
  const openEl = document.querySelector('#translate-overview-open');
  const topPacksEl = document.querySelector('#translate-top-packs');
  if (!percentEl && !fillEl && !openEl && !topPacksEl) return;

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      throw new Error(data.message || `Request failed: ${response.status}`);
    }
    return data;
  }

  function packPercent(pack) {
    let translated = 0;
    let total = 0;
    for (const locale of pack.locales || []) {
      translated += Number(locale.translated) || 0;
      total += Number(locale.total) || 0;
    }
    return total > 0 ? Math.round((100 * translated) / total) : 0;
  }

  function renderTopPacks(progress) {
    if (!topPacksEl) return;
    const top = (progress.datapacks || [])
      .map((pack) => ({ name: pack.displayName || pack.slug, pct: packPercent(pack) }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
    topPacksEl.innerHTML = top.map((pack) => `
      <div class="translate-top-packs__row">
        <span class="translate-top-packs__name">${escapeHtml(pack.name)}</span>
        <div class="translate-top-packs__bar translate-progress-bar">
          <div class="translate-progress-bar__fill" style="width:${pack.pct}%"></div>
        </div>
        <span class="translate-top-packs__pct">${pack.pct}%</span>
      </div>
    `).join('');
  }

  Promise.all([
    fetchJson('/translate/api/progress.php').catch(() => null),
    fetchJson('/translate/api/voting-progress.php').catch(() => null),
  ]).then(([progress, voting]) => {
    if (progress) {
      let translated = 0;
      let total = 0;
      for (const pack of progress.datapacks || []) {
        for (const locale of pack.locales || []) {
          translated += Number(locale.translated) || 0;
          total += Number(locale.total) || 0;
        }
      }
      const pct = total > 0 ? Math.round((100 * translated) / total) : 0;
      if (percentEl) percentEl.textContent = `${pct}%`;
      if (fillEl) fillEl.style.width = `${pct}%`;
      renderTopPacks(progress);
    } else {
      if (percentEl) percentEl.textContent = 'N/A';
    }

    if (voting) {
      const openTotal = (voting.datapacks || []).reduce((sum, pack) => sum + (Number(pack.totalOpen) || 0), 0);
      if (openEl) openEl.textContent = new Intl.NumberFormat('en').format(openTotal);
    } else if (openEl) {
      openEl.textContent = 'N/A';
    }
  }).catch((error) => console.warn('Could not load translation overview:', error));
})();

// ── Mobile nav burger menu ───────────────────────────────────────────────
// Loaded on every page (shared header), so guard on the elements existing
// rather than assuming anything about the current page.
(() => {
  const burger = document.getElementById('nav-burger');
  const navLinks = document.getElementById('nav-links');
  if (!burger || !navLinks) return;

  const burgerIcon = burger.querySelector('i');

  function closeDropdowns() {
    navLinks.querySelectorAll('.nav-dropdown.is-open').forEach((d) => d.classList.remove('is-open'));
  }

  function setMenuOpen(open) {
    navLinks.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    if (burgerIcon) burgerIcon.className = open ? 'bi bi-x-lg' : 'bi bi-list';
    if (!open) closeDropdowns();
  }

  burger.addEventListener('click', () => {
    setMenuOpen(!navLinks.classList.contains('is-open'));
  });

  // Dropdown triggers are <button>s with no default action, so this only
  // ever toggles - on desktop the .is-open class has no visual effect since
  // that CSS is scoped inside the max-width:900px block; hover still drives
  // it there.
  navLinks.querySelectorAll('.nav-dropdown__trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const dropdown = trigger.closest('.nav-dropdown');
      const wasOpen = dropdown.classList.contains('is-open');
      closeDropdowns();
      if (!wasOpen) dropdown.classList.add('is-open');
    });
  });

  document.addEventListener('click', (e) => {
    if (!navLinks.classList.contains('is-open')) return;
    if (navLinks.contains(e.target) || burger.contains(e.target)) return;
    setMenuOpen(false);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navLinks.classList.contains('is-open')) setMenuOpen(false);
  });
})();
