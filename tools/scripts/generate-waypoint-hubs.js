#!/usr/bin/env node
'use strict';

/**
 * Pulls the command-storage NBT file from the SMP server via SFTP, extracts the
 * public Waypoint Hubs (data.contents.database.waypoints.hubs), crops each
 * owner's actual head icon out of their skin texture, and writes
 * waypoint-hubs/data/waypoint-hubs.manifest.json + waypoint-hubs/data/icons/*.png
 * for the /waypoint-hubs/ page.
 *
 * Also extracts each player's `home` location and `last_grave` (location +
 * contents) from data.contents.database.player into scratch handoffs for
 * generate-player-profiles.js - piggybacking here rather than a second script
 * avoids downloading/parsing the same file twice.
 *
 * Run during CI after the generate phase (global generator, not per-datapack-repo).
 *
 * For local testing without SFTP access, set WAYPOINT_LOCAL_FILE to a path of an
 * already-downloaded command-storage .dat file instead of SFTP_* env vars.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nbt = require('prismarine-nbt');
const sharp = require('sharp');
const { decodeUuidIntArray } = require('./lib/mc-id-codec');
const { prettifyDimension, describeItem } = require('./lib/mc-format');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'waypoint-hubs', 'data');
const OUT_FILE = path.join(OUT_DIR, 'waypoint-hubs.manifest.json');
const ICONS_DIR = path.join(OUT_DIR, 'icons');
const ICONS_URL_BASE = '/waypoint-hubs/data/icons';
const ICON_SIZE = 128;

// Uncommitted, job-local handoff for generate-player-profiles.js: every hub
// (public AND private) grouped by owner UUID, so a player's own profile page
// can show their private hubs too without a second SFTP round-trip and
// without ever committing private waypoint data to git.
const BY_OWNER_SCRATCH_FILE = path.join(ROOT, '.cache', 'waypoint-hubs-by-owner.json');

// Same idea, for each player's `home` location - command-storage.dat's
// per-player entries only carry a displayname (no UUID), so this is keyed by
// lowercased Mojang username instead of UUID; generate-player-profiles.js
// already resolves each linked player's current username and can match on it.
const HOMES_SCRATCH_FILE = path.join(ROOT, '.cache', 'player-homes-by-name.json');

// Same idea again, for each player's last_grave (location + contents) -
// shown on My SMP Profile's Last Grave section, matching the admin
// Playerdata Inspector's own last_grave handling in fetch-admin-playerdata.js.
const GRAVES_SCRATCH_FILE = path.join(ROOT, '.cache', 'player-graves-by-name.json');

function log(msg) { console.log('[waypoint-hubs]', msg); }
function warn(msg) { console.warn('[waypoint-hubs] WARNING:', msg); }
function fail(msg) {
  console.error('[waypoint-hubs] ERROR:', msg);
  process.exit(1);
}

async function downloadViaSftp() {
  const SftpClient = require('ssh2-sftp-client');
  const host = process.env.SFTP_HOST;
  const port = Number(process.env.SFTP_PORT || 22);
  const username = process.env.SFTP_USER;
  const password = process.env.SFTP_PASSWORD;
  const remotePath = process.env.WAYPOINT_SFTP_REMOTE_PATH;

  if (!host || !username || !password || !remotePath) {
    fail('Missing one or more required env vars: SFTP_HOST, SFTP_USER, SFTP_PASSWORD, WAYPOINT_SFTP_REMOTE_PATH.');
  }

  const sftp = new SftpClient();
  try {
    await sftp.connect({ host, port, username, password, readyTimeout: 15000 });
    log(`Connected to ${host}:${port}, downloading ${remotePath}`);
    return await sftp.get(remotePath);
  } finally {
    await sftp.end();
  }
}

async function readNbtBuffer(buffer) {
  const parsed = await nbt.parse(buffer);
  return nbt.simplify(parsed.parsed);
}

// ── Head icon extraction ─────────────────────────────────────────────────────
//
// Each hub carries a Mojang "textures" property (base64 JSON) pointing at the
// owner's skin PNG. The top-level `icon` field is the same decoded shape when
// present; profile.properties[textures] is the fallback (always present).

function decodeTexturesJson(base64Value) {
  try {
    return JSON.parse(Buffer.from(base64Value, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function extractSkinUrl(hub) {
  if (hub.icon) {
    const url = decodeTexturesJson(hub.icon)?.textures?.SKIN?.url;
    if (url) return url;
  }
  const texturesProp = (hub?.profile?.properties || []).find((p) => p.name === 'textures');
  if (texturesProp?.value) {
    const url = decodeTexturesJson(texturesProp.value)?.textures?.SKIN?.url;
    if (url) return url;
  }
  return null;
}

async function fetchBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

// Crops the 8x8 base face and, for 64x64 skins, composites the 8x8 hat overlay
// on top, then upsamples with nearest-neighbor to keep hard pixel edges.
async function buildHeadIcon(skinUrl) {
  const skinBuffer = await fetchBuffer(skinUrl);
  const meta = await sharp(skinBuffer).metadata();

  const face = await sharp(skinBuffer).extract({ left: 8, top: 8, width: 8, height: 8 }).toBuffer();

  let composed = face;
  if ((meta.height || 0) >= 64) {
    const hat = await sharp(skinBuffer).extract({ left: 40, top: 8, width: 8, height: 8 }).toBuffer();
    composed = await sharp(face).composite([{ input: hat }]).png().toBuffer();
  }

  return sharp(composed).resize(ICON_SIZE, ICON_SIZE, { kernel: 'nearest' }).png().toBuffer();
}

function iconFileNameFor(skinUrl) {
  return `${crypto.createHash('sha1').update(skinUrl).digest('hex').slice(0, 16)}.png`;
}

async function resolveIcon(hub, iconCache) {
  const skinUrl = extractSkinUrl(hub);
  if (!skinUrl) return null;

  if (iconCache.has(skinUrl)) return iconCache.get(skinUrl);

  const fileName = iconFileNameFor(skinUrl);
  const filePath = path.join(ICONS_DIR, fileName);
  const publicUrl = `${ICONS_URL_BASE}/${fileName}`;

  try {
    if (!fs.existsSync(filePath)) {
      const png = await buildHeadIcon(skinUrl);
      fs.mkdirSync(ICONS_DIR, { recursive: true });
      fs.writeFileSync(filePath, png);
    }
    iconCache.set(skinUrl, publicUrl);
    return publicUrl;
  } catch (err) {
    warn(`Could not build head icon for ${hub.waypoint_name || hub.id} (${err.message}).`);
    iconCache.set(skinUrl, null);
    return null;
  }
}

function ownerUuidOf(hub) {
  const idArray = hub?.profile?.id;
  if (!Array.isArray(idArray) || idArray.length !== 4) return null;
  try {
    return decodeUuidIntArray(idArray);
  } catch {
    return null;
  }
}

async function extractHubs(simplified) {
  const hubs = simplified?.data?.contents?.database?.waypoints?.hubs || {};
  const allHubs = Object.values(hubs).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

  const iconCache = new Map();
  const publicManifest = [];
  const byOwner = {};

  for (const hub of allHubs) {
    const record = {
      id: hub.id,
      name: hub.waypoint_name || 'Unnamed Waypoint',
      description: (hub.waypoint_description || '').trim(),
      owner: hub.profile?.name || 'Unknown',
      access: hub.access || 'private',
      icon: await resolveIcon(hub, iconCache),
      x: hub.pos?.x ?? 0,
      y: hub.pos?.y ?? 0,
      z: hub.pos?.z ?? 0,
      dimension: hub.dimension_name || hub.pos?.dimension || 'Unknown',
    };

    if (record.access === 'public') {
      publicManifest.push(record);
    }

    const ownerUuid = ownerUuidOf(hub);
    if (ownerUuid) {
      (byOwner[ownerUuid] ||= []).push(record);
    }
  }

  return { publicManifest, byOwner };
}

// command-storage's data.contents.database.player is keyed by an internal id
// with no usable relationship to a UUID or username - the displayname field
// inside each entry is the only identifier available here.
function extractHomesByName(simplified) {
  const players = simplified?.data?.contents?.database?.player || {};
  const homesByName = {};
  for (const entry of Object.values(players)) {
    if (!entry.displayname || !entry.home) continue;
    homesByName[entry.displayname.toLowerCase()] = {
      x: entry.home.x ?? 0,
      y: entry.home.y ?? 0,
      z: entry.home.z ?? 0,
      dimension: entry.home.dimension || 'minecraft:overworld',
    };
  }
  return homesByName;
}

// Same idea as extractHomesByName, for last_grave (location + contents) -
// shape matches fetch-admin-playerdata.js's own grave object exactly so My
// SMP Profile and the admin Playerdata Inspector read identically.
function extractGravesByName(simplified) {
  const players = simplified?.data?.contents?.database?.player || {};
  const gravesByName = {};
  for (const entry of Object.values(players)) {
    if (!entry.displayname || !entry.last_grave) continue;
    const grave = entry.last_grave;
    gravesByName[entry.displayname.toLowerCase()] = {
      x: grave.x ?? 0,
      y: grave.y ?? 0,
      z: grave.z ?? 0,
      dimension: prettifyDimension(grave.dimension),
      removed: !!grave.removed,
      // opened_by is a fixed {uuid, name} record, not a collection - name is
      // literally "expired" when the grave timed out without being opened.
      openedBy: grave.opened_by?.name || null,
      contents: (grave.contents || [])
        .map(describeItem)
        .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)),
    };
  }
  return gravesByName;
}

async function main() {
  let buffer;
  if (process.env.WAYPOINT_LOCAL_FILE) {
    log(`Reading local file ${process.env.WAYPOINT_LOCAL_FILE} (local test mode, no SFTP).`);
    buffer = fs.readFileSync(process.env.WAYPOINT_LOCAL_FILE);
  } else {
    buffer = await downloadViaSftp();
  }

  const simplified = await readNbtBuffer(buffer);
  const { publicManifest, byOwner } = await extractHubs(simplified);
  const homesByName = extractHomesByName(simplified);
  const gravesByName = extractGravesByName(simplified);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(publicManifest, null, 2), 'utf8');
  log(`Wrote ${publicManifest.length} public hub(s) to ${OUT_FILE}.`);

  fs.mkdirSync(path.dirname(BY_OWNER_SCRATCH_FILE), { recursive: true });
  fs.writeFileSync(BY_OWNER_SCRATCH_FILE, JSON.stringify(byOwner, null, 2), 'utf8');
  log(`Wrote per-owner scratch handoff (${Object.keys(byOwner).length} owner(s)) to ${BY_OWNER_SCRATCH_FILE}.`);

  fs.mkdirSync(path.dirname(HOMES_SCRATCH_FILE), { recursive: true });
  fs.writeFileSync(HOMES_SCRATCH_FILE, JSON.stringify(homesByName, null, 2), 'utf8');
  log(`Wrote per-name home scratch handoff (${Object.keys(homesByName).length} home(s)) to ${HOMES_SCRATCH_FILE}.`);

  fs.mkdirSync(path.dirname(GRAVES_SCRATCH_FILE), { recursive: true });
  fs.writeFileSync(GRAVES_SCRATCH_FILE, JSON.stringify(gravesByName, null, 2), 'utf8');
  log(`Wrote per-name grave scratch handoff (${Object.keys(gravesByName).length} grave(s)) to ${GRAVES_SCRATCH_FILE}.`);
}

main().catch((err) => fail(err.message));
