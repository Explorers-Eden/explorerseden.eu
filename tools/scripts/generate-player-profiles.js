#!/usr/bin/env node
'use strict';

/**
 * Builds one profiles/data/<discordId>.json per SMP player who has linked
 * their Discord account (through the Nice Control Center panel's Discord
 * bridge, which requires this before a player can even join) AND has actually
 * played (has a player file in the world).
 *
 * Sources - all from the panel's database (PANEL_DATABASE_URL), which the panel
 * keeps up to date from the world files (see lib/panel-data.js and lib/smp-world.js;
 * SMP_LOCAL_WORLD_DIR reads a local world folder instead, for testing):
 *   discord_links, claims, market_listings      - discordId <-> uuid links, land claims, market listings
 *   smp_players.tags                            - race/class tags
 *   smp_players.advancements                    - advancement progress
 *   smp_players.stats                           - stats
 *   .cache/waypoint-hubs-by-owner.json          - written by
 *     generate-waypoint-hubs.js in the same CI job (public+private hubs per owner)
 *   .cache/player-homes-by-name.json            - written by
 *     generate-waypoint-hubs.js in the same CI job (home location per username)
 *   .cache/player-graves-by-name.json           - written by
 *     generate-waypoint-hubs.js in the same CI job (last grave per username)
 *
 * Run during CI after "Fetch waypoint hub data" (needs its scratch files).
 */

const fs = require('fs');
const path = require('path');
const { renderSkinBufferToPng } = require('./lib/skin-render');
const { humanize, prettifyDimension } = require('./lib/mc-format');
const { loadPanelData } = require('./lib/panel-data');
const { loadSmpPlayers } = require('./lib/smp-world');
const { faceIcon } = require('./lib/head-icon');

const PET_ICONS_DIR = path.join(__dirname, '..', '..', 'assets', 'images', 'generated', 'pet-heads');
const PET_ICONS_URL = '/assets/images/generated/pet-heads';

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'profiles', 'data');
const SKINS_OUT_DIR = path.join(ROOT, 'assets', 'images', 'generated', 'player-skins');
const SKINS_URL_BASE = '/assets/images/generated/player-skins';
const BY_OWNER_SCRATCH_FILE = path.join(ROOT, '.cache', 'waypoint-hubs-by-owner.json');
const HOMES_SCRATCH_FILE = path.join(ROOT, '.cache', 'player-homes-by-name.json');
const GRAVES_SCRATCH_FILE = path.join(ROOT, '.cache', 'player-graves-by-name.json');
const HTACCESS_FILE = path.join(OUT_DIR, '.htaccess');

const RACES = ['aetherian', 'dunesworn', 'endling', 'frostborne', 'moonshroud', 'netherian', 'oakhearted', 'orebringer', 'palehearted', 'turtlekin'];
const CLASSES = ['archer', 'bard', 'builder', 'cleric', 'fighter', 'hermit', 'miner', 'rancher', 'scout', 'survivor'];


function log(msg) { console.log('[player-profiles]', msg); }
function warn(msg) { console.warn('[player-profiles] WARNING:', msg); }
function fail(msg) {
  console.error('[player-profiles] ERROR:', msg);
  process.exit(1);
}

// ── Race / Class ──────────────────────────────────────────────────────────────

function extractRaceAndClass(tags) {
  const list = Array.isArray(tags) ? tags : [];
  let race = null;
  let playerClass = null;
  for (const tag of list) {
    if (typeof tag !== 'string' || !tag.startsWith('fabled_roots.')) continue;
    const value = tag.slice('fabled_roots.'.length);
    if (RACES.includes(value)) race = value;
    if (CLASSES.includes(value)) playerClass = value;
  }
  const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : null);
  return { race: titleCase(race), class: titleCase(playerClass) };
}

// ── Advancements / Stats ─────────────────────────────────────────────────────

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function stripNamespace(id) {
  return id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
}

// Some data pack namespaces are a single concatenated word with no
// separators to humanize() from - map those known cases by hand.
const NAMESPACE_LABELS = {
  kattersstructures: 'Katters Structures',
};

function humanizeNamespace(namespace) {
  return NAMESPACE_LABELS[namespace] || humanize(namespace);
}

// Recipe-unlock advancements aren't meaningful "achievements" - every namespace
// on this server uses either "recipe/..." or "recipes/..." as the first path
// segment for these, so this filter generalizes past vanilla's "recipes/".
function isRecipeAdvancement(id) {
  const first = stripNamespace(id).split('/')[0] || '';
  return first.startsWith('recipe');
}

// ── Advancement definitions (only advancements with a "display" block are
// ever shown in the in-game advancement menu - everything else is a hidden
// datapack trigger). Data pack definitions come from the repo clones that
// persist on disk for the rest of this CI job (see run-generate-wiki-for-
// repositories.js's sourceRoot); vanilla ones are fetched on demand from the
// misode/mcmeta mirror (already used elsewhere in this codebase), cached per
// unique id/lang lookup so 32+ players sharing the same vanilla advancement
// only ever fetch it once. ─────────────────────────────────────────────────

const SOURCE_REPOS_DIR = path.join(ROOT, '.cache', 'source-repos');

// Resolves the exact Minecraft version (e.g. "26.2") a given save file's
// DataVersion int corresponds to, then pins all vanilla advancement
// definition/lang fetches for that file to that version's misode/mcmeta tag -
// never the "data"/"assets" branches, which track whatever the latest MC
// version is and would silently drift out of sync as the server updates.
// Different players' advancement files can carry different DataVersions
// (whichever version they last saved under), so this is cached per
// DataVersion, not once globally.
let mcVersionListPromise = null;
function getMcVersionList() {
  if (!mcVersionListPromise) {
    mcVersionListPromise = fetch('https://raw.githubusercontent.com/misode/mcmeta/summary/versions/data.json')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  }
  return mcVersionListPromise;
}

const mcVersionTagCache = new Map();
async function resolveMcVersionTag(dataVersion) {
  if (!mcVersionTagCache.has(dataVersion)) {
    mcVersionTagCache.set(dataVersion, getMcVersionList().then((versions) => {
      const match = versions.find((v) => v.data_version === dataVersion);
      if (!match) {
        warn(`Could not find a misode/mcmeta version matching DataVersion ${dataVersion} - vanilla advancement titles/descriptions will be skipped for it.`);
        return null;
      }
      log(`Resolved DataVersion ${dataVersion} to Minecraft ${match.id} for vanilla advancement lookups.`);
      return match.id;
    }));
  }
  return mcVersionTagCache.get(dataVersion);
}

function walkFiles(dir, cb) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkFiles(p, cb);
    else cb(p);
  }
}

// id -> { def, lang } for every advancement definition found across all
// cloned data pack repos (built once, reused for every player).
function loadDatapackAdvancementIndex() {
  const index = new Map();
  if (!fs.existsSync(SOURCE_REPOS_DIR)) return index;
  for (const slug of fs.readdirSync(SOURCE_REPOS_DIR)) {
    const repoDir = path.join(SOURCE_REPOS_DIR, slug);
    const dataDir = path.join(repoDir, 'data');
    if (!fs.existsSync(dataDir)) continue;
    for (const namespace of fs.readdirSync(dataDir)) {
      const advDir = path.join(dataDir, namespace, 'advancement');
      if (!fs.existsSync(advDir)) continue;
      const langFile = path.join(repoDir, 'assets', namespace, 'lang', 'en_us.json');
      const lang = fs.existsSync(langFile) ? (readJsonSafe(langFile) || {}) : {};
      walkFiles(advDir, (file) => {
        if (!file.endsWith('.json')) return;
        const rel = path.relative(advDir, file).replace(/\.json$/, '').split(path.sep).join('/');
        const id = `${namespace}:${rel}`;
        const def = readJsonSafe(file);
        if (def) index.set(id, { def, lang });
      });
    }
  }
  return index;
}

const vanillaLangCache = new Map();
function getVanillaLang(dataVersion) {
  if (!vanillaLangCache.has(dataVersion)) {
    vanillaLangCache.set(dataVersion, resolveMcVersionTag(dataVersion).then((tag) => {
      if (!tag) return {};
      return fetch(`https://raw.githubusercontent.com/misode/mcmeta/${tag}-assets/assets/minecraft/lang/en_us.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}));
    }));
  }
  return vanillaLangCache.get(dataVersion);
}

const vanillaDefCache = new Map();
function getVanillaAdvancementDef(advPath, dataVersion) {
  const key = `${dataVersion}:${advPath}`;
  if (!vanillaDefCache.has(key)) {
    vanillaDefCache.set(key, resolveMcVersionTag(dataVersion).then((tag) => {
      if (!tag) return null;
      return fetch(`https://raw.githubusercontent.com/misode/mcmeta/${tag}-data/data/minecraft/advancement/${advPath}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }));
  }
  return vanillaDefCache.get(key);
}

async function getAdvancementDefinition(id, datapackIndex, dataVersion) {
  if (datapackIndex.has(id)) return datapackIndex.get(id);
  const [namespace, ...rest] = id.split(':');
  if (namespace !== 'minecraft') return null; // no local source and not vanilla - can't verify, exclude
  const def = await getVanillaAdvancementDef(rest.join(':'), dataVersion);
  if (!def) return null;
  const lang = await getVanillaLang(dataVersion);
  return { def, lang };
}

// Resolves a Minecraft text component: a plain string, {text}, {translate}
// (preferring an actual lang lookup, falling back to the JSON's own
// "fallback" field when present, e.g. data packs using modern translate
// syntax), or an array of components concatenated together.
function resolveText(component, langMap) {
  if (component == null) return '';
  if (typeof component === 'string') return component;
  if (Array.isArray(component)) return component.map((c) => resolveText(c, langMap)).join('');
  if (component.text) return component.text;
  if (component.translate) return langMap[component.translate] || component.fallback || component.translate;
  if (component.fallback) return component.fallback;
  return '';
}

// The in-game tab of an advancement: follows "parent" up to the root. A vanilla root ("minecraft:story/root")
// names the tab after its folder (Story, Nether, The End, Adventure, Husbandry); a data pack's own root is named
// by its title. Null when the chain can't be followed.
const tabCache = new Map();
async function tabOf(id, datapackIndex, dataVersion) {
  const key = `${dataVersion}:${id}`;
  if (tabCache.has(key)) return tabCache.get(key);
  let current = id;
  let label = null;
  for (let depth = 0; current && depth < 64; depth++) {
    // Vanilla advancements live in their tab's folder (minecraft:adventure/…): no need to look further (or to fetch
    // vanilla definitions, which fails for a save version the mirror doesn't know).
    if (current.startsWith('minecraft:')) {
      label = humanize(current.slice('minecraft:'.length).split('/')[0]);
      break;
    }
    const resolved = await getAdvancementDefinition(current, datapackIndex, dataVersion);
    if (!resolved) break;
    const parent = resolved.def.parent;
    if (!parent) {
      const [ns, ...rest] = current.split(':');
      label = ns === 'minecraft' ? humanize(rest.join(':').split('/')[0]) : resolveText(resolved.def.display?.title, resolved.lang) || null;
      break;
    }
    current = parent.includes(':') ? parent : `minecraft:${parent}`;
  }
  tabCache.set(key, label);
  return label;
}

// Shows every known advancement definition (from the data packs, plus
// whatever vanilla ones the player has touched), not just the ones this
// specific player has made progress on - so freshly-added advancements
// appear (as not-done) even before anyone on the server has earned them.
async function extractDetailedAdvancements(advancements, datapackIndex, fallbackDataVersion) {
  const playerAdvancements = advancements || {};
  const dataVersion = playerAdvancements.DataVersion ?? fallbackDataVersion;
  const ids = new Set(datapackIndex.keys());
  for (const id of Object.keys(playerAdvancements)) {
    if (id !== 'DataVersion') ids.add(id);
  }

  const groups = new Map();
  for (const id of ids) {
    if (isRecipeAdvancement(id)) continue;
    const value = playerAdvancements[id];

    const resolved = await getAdvancementDefinition(id, datapackIndex, dataVersion);
    if (!resolved || !resolved.def?.display) continue; // not shown in the in-game advancement menu

    const [namespace, ...rest] = id.split(':');
    const advPath = rest.join(':');
    const parts = advPath.split('/');
    const category = parts.length > 1 ? parts[0] : 'general';
    // The tab it shows in in game: data pack advancements whose parents lead to a vanilla tab (Nice Things'
    // "vanilla/…" and "eden:adventure/…" ones) belong to that tab, not to a group of their own.
    const groupLabel = (await tabOf(id, datapackIndex, dataVersion))
      || (namespace === 'minecraft' ? humanize(category) : `${humanizeNamespace(namespace)} (${humanize(category)})`);

    const fallbackLabel = humanize((parts.length > 1 ? parts.slice(1) : parts).join(' '));
    const title = resolveText(resolved.def.display.title, resolved.lang) || fallbackLabel;
    const description = resolveText(resolved.def.display.description, resolved.lang);

    if (!groups.has(groupLabel)) groups.set(groupLabel, []);
    groups.get(groupLabel).push({ label: title, description, done: value?.done === true });
  }
  return [...groups.entries()]
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
      doneCount: items.filter((i) => i.done).length,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function sumValues(obj) {
  return Object.values(obj || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

// Custom stat ids that are more meaningful shown as hours/minutes than raw ticks.
const TIME_STAT_IDS = new Set([
  'minecraft:play_time', 'minecraft:total_world_time', 'minecraft:time_since_death',
  'minecraft:time_since_rest', 'minecraft:sneak_time',
]);
// Custom stat ids stored in centimeters, more meaningful shown as blocks.
const DISTANCE_STAT_SUFFIX = '_one_cm';

function formatCustomStatValue(id, raw) {
  const value = Number(raw) || 0;
  if (TIME_STAT_IDS.has(id)) {
    const hours = value / 20 / 3600;
    return hours >= 1 ? `${hours.toLocaleString(undefined, { maximumFractionDigits: 1 })} h` : `${Math.round(value / 20 / 60)} min`;
  }
  if (id.endsWith(DISTANCE_STAT_SUFFIX)) {
    return `${Math.round(value / 100).toLocaleString()} blocks`;
  }
  return value.toLocaleString();
}

const STAT_CATEGORY_LABELS = {
  'minecraft:custom': 'General',
  'minecraft:mined': 'Blocks Mined',
  'minecraft:crafted': 'Items Crafted',
  'minecraft:used': 'Items Used',
  'minecraft:broken': 'Items Broken',
  'minecraft:picked_up': 'Items Picked Up',
  'minecraft:dropped': 'Items Dropped',
  'minecraft:killed': 'Mobs Killed',
  'minecraft:killed_by': 'Killed By',
};

function customStatLabel(id) {
  const bare = stripNamespace(id);
  const withoutDistanceSuffix = bare.endsWith(DISTANCE_STAT_SUFFIX) ? bare.slice(0, -DISTANCE_STAT_SUFFIX.length) : bare;
  return humanize(withoutDistanceSuffix);
}

function extractDetailedStats(statsJson) {
  const stats = statsJson?.stats || {};
  const groups = [];
  for (const [categoryId, label] of Object.entries(STAT_CATEGORY_LABELS)) {
    const entries = stats[categoryId];
    if (!entries) continue;
    const isCustom = categoryId === 'minecraft:custom';
    const items = Object.entries(entries)
      .map(([id, raw]) => ({
        label: isCustom ? customStatLabel(id) : humanize(stripNamespace(id)),
        value: isCustom ? formatCustomStatValue(id, raw) : Number(raw).toLocaleString(),
        raw: Number(raw) || 0,
      }))
      .filter((item) => item.raw > 0)
      .sort((a, b) => b.raw - a.raw);
    if (items.length) groups.push({ category: label, items });
  }
  return groups;
}

function extractStatsSummary(statsJson) {
  const stats = statsJson?.stats || {};
  const custom = stats['minecraft:custom'] || {};
  const playTicks = custom['minecraft:play_time'] ?? custom['minecraft:play_one_minute'] ?? 0;
  return {
    playtimeHours: Math.round((playTicks / 20 / 3600) * 10) / 10,
    deaths: custom['minecraft:deaths'] ?? 0,
    mobKillsTotal: sumValues(stats['minecraft:killed']),
    blocksMinedTotal: sumValues(stats['minecraft:mined']),
  };
}

// ── Claims ────────────────────────────────────────────────────────────────────

// ── Mojang name/skin resolution (shared cache across the whole run) ─────────

const mojangCache = new Map();

async function resolveMojangProfile(uuid) {
  if (mojangCache.has(uuid)) return mojangCache.get(uuid);
  const promise = (async () => {
    try {
      const resp = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid.replace(/-/g, '')}`);
      if (!resp.ok) return null;
      const json = await resp.json();
      const texturesProp = (json.properties || []).find((p) => p.name === 'textures');
      let skinUrl = null;
      if (texturesProp?.value) {
        try {
          skinUrl = JSON.parse(Buffer.from(texturesProp.value, 'base64').toString('utf8'))?.textures?.SKIN?.url || null;
        } catch { /* ignore */ }
      }
      return { name: json.name || null, skinUrl };
    } catch {
      return null;
    }
  })();
  mojangCache.set(uuid, promise);
  return promise;
}

// ── Skin render ───────────────────────────────────────────────────────────────

async function renderAndSaveSkin(uuid, skinUrl) {
  const fileName = `${uuid}.png`;
  const filePath = path.join(SKINS_OUT_DIR, fileName);
  if (fs.existsSync(filePath)) return `${SKINS_URL_BASE}/${fileName}`;
  try {
    const resp = await fetch(skinUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const skinBuffer = Buffer.from(await resp.arrayBuffer());
    const model = skinUrl.includes('slim') ? 'slim' : 'wide'; // refined below via metadata if needed
    const png = renderSkinBufferToPng(skinBuffer, model);
    fs.mkdirSync(SKINS_OUT_DIR, { recursive: true });
    fs.writeFileSync(filePath, png);
    return `${SKINS_URL_BASE}/${fileName}`;
  } catch (err) {
    warn(`Could not render skin for ${uuid} (${err.message}).`);
    return null;
  }
}

// ── Privacy lockdown (self-healing across full profiles/data wipes) ─────────

function ensureHtaccess() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(HTACCESS_FILE, 'Require all denied\n', 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  ensureHtaccess();

  const players = await loadSmpPlayers(log);

  const { links, claimsByOwner, listingsBySeller, market, mailByPlayer, petsByPlayer } = await loadPanelData(log);

  const byOwnerHubs = readJsonSafe(BY_OWNER_SCRATCH_FILE) || {};
  const homesByName = readJsonSafe(HOMES_SCRATCH_FILE) || {};
  const gravesByName = readJsonSafe(GRAVES_SCRATCH_FILE) || {};


  const datapackAdvancementIndex = loadDatapackAdvancementIndex();
  log(`Loaded ${datapackAdvancementIndex.size} data pack advancement definition(s) from ${fs.existsSync(SOURCE_REPOS_DIR) ? 'cloned repos' : 'nowhere (no local clones found)'}.`);

  let written = 0;
  for (const link of links) {
    const uuid = link.uuid;
    const discordId = String(link.discordId);
    if (!uuid || !discordId) continue;

    const player = players.get(uuid);
    if (!player) continue; // linked in Discord, never actually joined

    const { race, class: playerClass } = extractRaceAndClass(player.tags);

    const advancements = player.advancements;
    const advancementsDetailed = await extractDetailedAdvancements(advancements, datapackAdvancementIndex, player.dataVersion);
    const advancementsCompleted = advancementsDetailed.reduce((sum, g) => sum + g.doneCount, 0);

    const statsJson = player.stats;
    const stats = extractStatsSummary(statsJson);
    const statsDetailed = extractDetailedStats(statsJson);

    const mojangProfile = await resolveMojangProfile(uuid);
    const name = mojangProfile?.name || link.name || link.uuid;
    const skinIcon = mojangProfile?.skinUrl ? await renderAndSaveSkin(uuid, mojangProfile.skinUrl) : null;
    // No local render/storage needed - mc-heads.net already holds the raw
    // skin texture and crops the face server-side from the uuid alone.
    const headIcon = `https://mc-heads.net/avatar/${uuid}/64`;

    const ownedClaims = claimsByOwner[uuid] || [];

    const waypoints = byOwnerHubs[uuid] || [];

    // command-storage's per-player entries have no UUID to key off of, only
    // a displayname - matched here against this same player's current
    // Mojang username, resolved a few lines up for the skin/head render.
    const rawHome = name ? homesByName[name.toLowerCase()] : null;
    const home = rawHome ? { x: rawHome.x, y: rawHome.y, z: rawHome.z, dimension: prettifyDimension(rawHome.dimension) } : null;
    const lastGrave = name ? (gravesByName[name.toLowerCase()] || null) : null;

    const profile = {
      discordId,
      uuid,
      name,
      skinIcon,
      headIcon,
      race,
      class: playerClass,
      advancementsCompleted,
      advancementsDetailed,
      stats,
      statsDetailed,
      claims: ownedClaims,
      // What the player has on the market right now (/market in game).
      marketListings: listingsBySeller[uuid] || [],
      market,
      // What waits for them in /market's mailbox: earnings and items (sold-out leftovers, purchases that didn't fit).
      marketInbox: mailByPlayer[uuid] || null,
      // The pets they own (heads drawn from the skins, like the hub icons).
      pets: await Promise.all((petsByPlayer[uuid] || []).map(async (p) => ({
        name: p.name || p.id,
        since: p.since,
        active: !!p.active,
        icon: p.head ? await faceIcon(p.head, PET_ICONS_DIR, PET_ICONS_URL, warn) : null,
      }))),
      waypoints,
      home,
      lastGrave,
    };

    fs.writeFileSync(path.join(OUT_DIR, `${discordId}.json`), JSON.stringify(profile, null, 2), 'utf8');
    written++;
  }

  log(`Wrote ${written} player profile(s) to ${OUT_DIR}.`);
}

main().catch((err) => fail(err.stack || err.message));
