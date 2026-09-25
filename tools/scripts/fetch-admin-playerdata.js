#!/usr/bin/env node
'use strict';

/**
 * Generates the data behind the admin-only "SMP Player Inspector" panel
 * (pages/admin-playerdata.php). Runs in CI on the normal generate schedule
 * (every hour) - NOT shelled out to live by PHP anymore (that approach turned
 * out too fragile in production: OOM-kill risk running SFTP + NBT parsing
 * inside the web container, signal-handling edge cases, a hard timeout
 * racing against real network latency). Up-to-an-hour-stale is an explicit tradeoff the
 * admin using this panel is fine with, in exchange for it just working.
 *
 * Writes admin-playerdata/data/players.json, which
 * tools/scripts/publish-generated-data.js then upserts into Postgres (key
 * "admin-playerdata") and deletes - same "publish-then-prune" pattern as
 * every other generated JSON in this repo, so this still never touches git.
 * Home/death/grave locations and full grave inventories are far more
 * sensitive than anything else generated here, which is exactly why this
 * was live-only in the first place - Postgres (not the public repo)
 * preserves that same guarantee while being far more reliable.
 *
 * Reads command-storage.dat (data.contents.database.player) for
 * home/deaths/graves/experience, resolves each display name to a UUID
 * (primarily via the Discord player-links file + sessionserver.mojang.com,
 * see buildNameToUuidFromLinks - api.mojang.com's username-search endpoint is
 * only a fallback now, since it was observed failing consistently from CI
 * runners' shared IPs even with generous retries), then fetches that
 * player's world/players/data/<uuid>.dat for race/class (Tags) and status at
 * last save (position/health/food/XP/gamemode - "last save" now, not "live",
 * since this runs on a schedule).
 * Personal waypoints (public AND private) come from generate-waypoint-hubs.js's
 * own scratch handoff (BY_OWNER_SCRATCH_FILE below) rather than re-deriving
 * them from command-storage here - that gets each hub's real pre-rendered
 * face-crop icon for free, matching the Waypoint Hubs page and My SMP Profile.
 *
 * Players who have never done anything but log in (only last_safe_pos, no
 * home/death/grave/experience) are dropped - see EXCLUDE-only-safe-pos below.
 *
 * Env vars (same SFTP_* already used by the sibling CI generators):
 *   SFTP_HOST, SFTP_PORT, SFTP_USER, SFTP_PASSWORD
 *   WAYPOINT_SFTP_REMOTE_PATH       - path to command_storage.dat
 *   SMP_WORLD_SFTP_REMOTE_PATH      - path to the world/ save directory
 *   SMP_CONFIG_SFTP_REMOTE_PATH     - path to the config/ directory (player-links file)
 *
 * For local testing without SFTP access:
 *   ADMIN_PLAYERDATA_LOCAL_STORAGE_FILE - path to a local command_storage.dat
 *   ADMIN_PLAYERDATA_LOCAL_WORLD_DIR    - path to a local world/ directory
 *   ADMIN_PLAYERDATA_LOCAL_CONFIG_DIR   - path to a local config/ directory
 * (mirrors WAYPOINT_LOCAL_FILE / SMP_LOCAL_WORLD_DIR in the sibling scripts.)
 */

const fs = require('fs');
const path = require('path');
const nbt = require('prismarine-nbt');
const { prettifyDimension, describeItem } = require('./lib/mc-format');
const { decodeBlockPosLong } = require('./lib/mc-id-codec');
const { loadAllClaims, decodeClaimOwners, decodeClaimTrusted, formatAnchorType } = require('./lib/goml-claims');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'admin-playerdata', 'data');
const OUT_FILE = path.join(OUT_DIR, 'players.json');

// Written by generate-waypoint-hubs.js earlier in the same CI job - reusing
// it (instead of re-deriving waypoints from command-storage ourselves) gets
// each hub's real pre-rendered face-crop icon (waypoint-hubs/data/icons/) for
// free, matching the actual Waypoint Hubs page and My SMP Profile exactly,
// rather than substituting a generic mc-heads.net avatar for it.
const BY_OWNER_SCRATCH_FILE = path.join(ROOT, '.cache', 'waypoint-hubs-by-owner.json');

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function log(msg) { console.log('[admin-playerdata]', msg); }
function warn(msg) { console.warn('[admin-playerdata] WARNING:', msg); }
function fail(msg) {
  console.error('[admin-playerdata] ERROR:', msg);
  process.exit(1);
}

// ── SFTP session (shared for the storage file + every per-player .dat) ──────

let sftpClient = null;

async function connectSftp() {
  const SftpClient = require('ssh2-sftp-client');
  const host = process.env.SFTP_HOST;
  const port = Number(process.env.SFTP_PORT || 22);
  const username = process.env.SFTP_USER;
  const password = process.env.SFTP_PASSWORD;
  if (!host || !username || !password) {
    fail('Missing one or more required env vars: SFTP_HOST, SFTP_USER, SFTP_PASSWORD.');
  }
  const sftp = new SftpClient();
  await sftp.connect({ host, port, username, password, readyTimeout: 15000 });
  return sftp;
}

async function readStorageBuffer() {
  if (process.env.ADMIN_PLAYERDATA_LOCAL_STORAGE_FILE) {
    log(`Reading local storage file ${process.env.ADMIN_PLAYERDATA_LOCAL_STORAGE_FILE} (local test mode).`);
    return fs.readFileSync(process.env.ADMIN_PLAYERDATA_LOCAL_STORAGE_FILE);
  }
  const remotePath = process.env.WAYPOINT_SFTP_REMOTE_PATH;
  if (!remotePath) fail('Missing required env var: WAYPOINT_SFTP_REMOTE_PATH.');
  sftpClient = await connectSftp();
  return sftpClient.get(remotePath);
}

// Fetches world/players/data/<uuid>.dat for every uuid in `uuids`, with a
// small concurrency cap - sequential would be needlessly slow (dozens of
// round-trips), unbounded parallel would be rude to the live game server's
// SFTP daemon over a single connection.
async function fetchPlayerDatFiles(uuids) {
  const results = new Map();
  if (uuids.length === 0) return results;

  const localDir = process.env.ADMIN_PLAYERDATA_LOCAL_WORLD_DIR;
  const remoteWorld = process.env.SMP_WORLD_SFTP_REMOTE_PATH;
  if (!localDir && !remoteWorld) {
    log('No world directory configured (SMP_WORLD_SFTP_REMOTE_PATH) - skipping race/class/status.');
    return results;
  }
  if (!localDir && !sftpClient) {
    try {
      sftpClient = await connectSftp();
    } catch (err) {
      warn(`Could not open SFTP connection for player .dat files (${err.message}) - skipping race/class/status.`);
      return results;
    }
  }

  const CONCURRENCY = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < uuids.length) {
      const uuid = uuids[cursor++];
      try {
        let buffer;
        if (localDir) {
          const file = path.join(localDir, 'players', 'data', `${uuid}.dat`);
          if (!fs.existsSync(file)) continue;
          buffer = fs.readFileSync(file);
        } else {
          buffer = await sftpClient.get(`${remoteWorld}/players/data/${uuid}.dat`);
        }
        const parsed = await nbt.parse(buffer);
        results.set(uuid, nbt.simplify(parsed.parsed));
      } catch (err) {
        warn(`Could not fetch player data for ${uuid} (${err.message}) - skipping.`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, uuids.length) }, worker));
  return results;
}

// ── Mojang username -> uuid resolution (cached per run) ─────────────────────

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const mojangUuidCache = new Map();
async function resolveUuidForName(name) {
  if (mojangUuidCache.has(name)) return mojangUuidCache.get(name);
  const promise = (async () => {
    // The Mojang lookup API rate-limits fairly aggressively well before this
    // run's ~50-100 names are through - and running from a CI runner's
    // shared/already-hammered egress IP makes this worse than it ever looked
    // in local testing. Only a real 404 (name genuinely doesn't/no longer
    // exists) is treated as final - everything else (429, 5xx, a thrown
    // network error) is retried, generously, rather than silently losing a
    // real player to a transient hiccup.
    let lastErr = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (attempt > 0) await sleep(750 * attempt);
      try {
        const resp = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
        if (resp.status === 404) return null; // genuinely doesn't exist (renamed/never existed) - not retryable
        if (!resp.ok) { lastErr = `HTTP ${resp.status}`; continue; }
        const json = await resp.json();
        if (!json.id) return null;
        const hex = json.id;
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      } catch (err) {
        lastErr = err.message;
      }
    }
    warn(`Could not resolve uuid for "${name}" after retries (${lastErr}) - leaving unresolved.`);
    return null;
  })();
  mojangUuidCache.set(name, promise);
  return promise;
}

// Reverse direction (uuid -> current name). Needed for claims' "Trusted"
// player lists (those are only stored as uuid-int-arrays in the claim NBT),
// and - more importantly - this is now the *primary* path for resolving a
// display name to a uuid too (see buildNameToUuidFromLinks below): sessionserver
// is a different Mojang endpoint from the username-search one, with its own
// separate rate-limit bucket, and is the same one generate-player-profiles.js
// already relies on successfully in production for every linked player.
const mojangNameCache = new Map();
async function resolveNameForUuid(uuid) {
  if (mojangNameCache.has(uuid)) return mojangNameCache.get(uuid);
  const promise = (async () => {
    let lastErr = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (attempt > 0) await sleep(750 * attempt);
      try {
        const resp = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid.replace(/-/g, '')}`);
        if (resp.status === 404) return null; // no such account
        if (!resp.ok) { lastErr = `HTTP ${resp.status}`; continue; }
        const json = await resp.json();
        return json.name || null;
      } catch (err) {
        lastErr = err.message;
      }
    }
    warn(`Could not resolve name for uuid ${uuid} after retries (${lastErr}).`);
    return null;
  })();
  mojangNameCache.set(uuid, promise);
  return promise;
}

// Builds a name->uuid map from every Discord-linked player (joining this
// server requires linking first, so this covers effectively everyone) by
// resolving each linked uuid's current name via sessionserver.mojang.com -
// avoiding api.mojang.com's username-search endpoint (see resolveUuidForName)
// entirely for the common case, since that's the one observed failing
// consistently from CI runners even with generous retries, while this same
// sessionserver-based approach already works reliably in production for
// generate-player-profiles.js. Falls back to resolveUuidForName only for a
// displayname this map doesn't cover.
async function buildNameToUuidFromLinks() {
  const localConfigDir = process.env.ADMIN_PLAYERDATA_LOCAL_CONFIG_DIR;
  const remoteConfig = process.env.SMP_CONFIG_SFTP_REMOTE_PATH;
  if (!localConfigDir && !remoteConfig) {
    warn('No config directory configured (SMP_CONFIG_SFTP_REMOTE_PATH) - falling back to live Mojang username lookups for every player.');
    return {};
  }

  let buffer;
  try {
    if (localConfigDir) {
      const file = path.join(localConfigDir, 'discord-js', 'discord-justsync.player-links.json');
      if (!fs.existsSync(file)) return {};
      buffer = fs.readFileSync(file);
    } else {
      if (!sftpClient) sftpClient = await connectSftp();
      buffer = await sftpClient.get(`${remoteConfig}/discord-js/discord-justsync.player-links.json`);
    }
  } catch (err) {
    warn(`Could not fetch player-links file (${err.message}) - falling back to live Mojang username lookups.`);
    return {};
  }

  let links;
  try {
    links = JSON.parse(buffer.toString('utf8'));
  } catch (err) {
    warn(`Could not parse player-links file (${err.message}).`);
    return {};
  }

  const nameToUuid = {};
  const CONCURRENCY = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < links.length) {
      const uuid = links[cursor++]?.playerId;
      if (!uuid) continue;
      const name = await resolveNameForUuid(uuid);
      if (name) nameToUuid[name.toLowerCase()] = uuid;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, links.length) }, worker));
  log(`Resolved ${Object.keys(nameToUuid).length} of ${links.length} linked player(s) to a current name.`);
  return nameToUuid;
}

// ── Formatting helpers ───────────────────────────────────────────────────────

const RACES = ['aetherian', 'dunesworn', 'endling', 'frostborne', 'moonshroud', 'netherian', 'oakhearted', 'orebringer', 'palehearted', 'turtlekin'];
const CLASSES = ['archer', 'bard', 'builder', 'cleric', 'fighter', 'hermit', 'miner', 'rancher', 'scout', 'survivor'];

function titleCase(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : null; }

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
  return { race: titleCase(race), class: titleCase(playerClass) };
}

const GAME_MODES = { 0: 'Survival', 1: 'Creative', 2: 'Adventure', 3: 'Spectator' };

function extractLoc(loc) {
  if (!loc) return null;
  return { x: loc.x ?? 0, y: loc.y ?? 0, z: loc.z ?? 0, dimension: prettifyDimension(loc.dimension) };
}


// Loads every goml land claim across all dimensions and groups them by owner
// uuid, with each claim's "Trusted" uuids resolved to current names - same
// shape generate-player-profiles.js exposes on My SMP Profile's Claims tab.
async function loadClaimsByOwner() {
  const localDir = process.env.ADMIN_PLAYERDATA_LOCAL_WORLD_DIR;
  const remoteWorld = process.env.SMP_WORLD_SFTP_REMOTE_PATH;
  if (!localDir && !remoteWorld) return {};

  if (!localDir && !sftpClient) {
    try {
      sftpClient = await connectSftp();
    } catch (err) {
      warn(`Could not open SFTP connection for claims (${err.message}) - skipping claims.`);
      return {};
    }
  }

  const allClaims = await loadAllClaims(async (rel) => {
    if (localDir) {
      const file = path.join(localDir, rel);
      return fs.existsSync(file) ? fs.readFileSync(file) : null;
    }
    try {
      return await sftpClient.get(`${remoteWorld}/${rel}`);
    } catch {
      return null; // dimension file missing on this server - not every server has every dimension
    }
  }, warn);

  const byOwner = {};
  for (const claim of allClaims) {
    const owners = decodeClaimOwners(claim);
    if (owners.length === 0) continue;
    const trustedUuids = decodeClaimTrusted(claim);
    const trustedNames = (await Promise.all(trustedUuids.map(resolveNameForUuid))).filter(Boolean);
    const pos = Array.isArray(claim.Box?.OriginPos) && claim.Box.OriginPos.length === 2
      ? decodeBlockPosLong(claim.Box.OriginPos[0], claim.Box.OriginPos[1])
      : { x: 0, y: 0, z: 0 };
    const record = {
      dimension: claim.__dimension,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      anchorType: formatAnchorType(claim.Type),
      trusted: trustedNames,
    };
    for (const owner of owners) {
      (byOwner[owner] ||= []).push(record);
    }
  }
  return byOwner;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const storageBuffer = await readStorageBuffer();
  const parsed = await nbt.parse(storageBuffer);
  const simplified = nbt.simplify(parsed.parsed);
  const db = simplified?.data?.contents?.database;
  if (!db) fail('Unexpected command-storage format: data.contents.database missing.');

  const playerEntries = Object.entries(db.player || {});

  // EXCLUDE-only-safe-pos: a player who has only ever logged in (never set a
  // home, died, or accumulated stored experience) has nothing worth an
  // admin's attention here.
  const qualifying = playerEntries.filter(([, v]) => {
    const keys = Object.keys(v);
    return !(keys.length === 1 && v.last_safe_pos);
  });

  log(`${qualifying.length} of ${playerEntries.length} player entries qualify (excluding safe-pos-only).`);

  const waypointsByOwner = readJsonSafe(BY_OWNER_SCRATCH_FILE) || {};
  const nameToUuidFromLinks = await buildNameToUuidFromLinks();

  // Resolve every displayname to a uuid up front (concurrency-capped so a
  // few dozen players doesn't look like a burst attack to the Mojang API),
  // then batch-fetch every player .dat file over one shared SFTP connection.
  // The pre-built links map above is tried first (see buildNameToUuidFromLinks
  // for why); resolveUuidForName only runs for a name it doesn't cover.
  const withUuid = new Array(qualifying.length);
  {
    const CONCURRENCY = 3;
    let cursor = 0;
    async function worker() {
      while (cursor < qualifying.length) {
        const i = cursor++;
        const [key, value] = qualifying[i];
        const lower = value.displayname ? value.displayname.toLowerCase() : null;
        const uuid = lower
          ? (nameToUuidFromLinks[lower] || await resolveUuidForName(value.displayname))
          : null;
        withUuid[i] = { key, value, uuid };
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, qualifying.length) }, worker));
  }

  const playerDatFiles = await fetchPlayerDatFiles(withUuid.filter((p) => p.uuid).map((p) => p.uuid));
  const claimsByOwner = await loadClaimsByOwner();

  if (sftpClient) {
    await sftpClient.end();
  }

  const players = withUuid.map(({ value, uuid }) => {
    const playerNbt = uuid ? playerDatFiles.get(uuid) : null;
    const { race, class: playerClass } = extractRaceAndClass(playerNbt?.Tags);

    let status = null;
    if (playerNbt) {
      const pos = Array.isArray(playerNbt.Pos) ? playerNbt.Pos : null;
      status = {
        dimension: prettifyDimension(playerNbt.Dimension),
        x: pos ? Math.round(pos[0]) : null,
        y: pos ? Math.round(pos[1]) : null,
        z: pos ? Math.round(pos[2]) : null,
        health: playerNbt.Health != null ? Math.round(playerNbt.Health) : null,
        food: playerNbt.foodLevel ?? null,
        xpLevel: playerNbt.XpLevel ?? null,
        gameMode: GAME_MODES[playerNbt.playerGameType] ?? null,
      };
    }

    const grave = value.last_grave ? {
      x: value.last_grave.x ?? 0,
      y: value.last_grave.y ?? 0,
      z: value.last_grave.z ?? 0,
      dimension: prettifyDimension(value.last_grave.dimension),
      removed: !!value.last_grave.removed,
      // opened_by is a fixed {uuid, name} record, not a collection - name is
      // literally "expired" when the grave timed out without being opened.
      openedBy: value.last_grave.opened_by?.name || null,
      contents: (value.last_grave.contents || [])
        .map(describeItem)
        .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)),
    } : null;

    return {
      name: value.displayname || 'Unknown',
      uuid,
      headIconUrl: uuid ? `https://mc-heads.net/avatar/${uuid}/64` : null,
      race,
      class: playerClass,
      status,
      home: extractLoc(value.home),
      lastSafePos: extractLoc(value.last_safe_pos),
      lastDeathLoc: extractLoc(value.last_death_loc),
      lastGrave: grave,
      waypoints: (uuid && waypointsByOwner[uuid]) || [],
      claims: (uuid && claimsByOwner[uuid]) || [],
    };
  });

  players.sort((a, b) => a.name.localeCompare(b.name));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), players }, null, 2), 'utf8');
  log(`Wrote ${players.length} player(s) to ${OUT_FILE}.`);
}

main().catch((err) => fail(err.stack || err.message));
