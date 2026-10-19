#!/usr/bin/env node
'use strict';

/**
 * Reads the data packs' command storage from the Nice Control Center panel's database
 * (smp_command_storage, see lib/smp-world.js; PANEL_WAYPOINT_STORAGE names it, "eden" by
 * default for data/eden/command_storage.dat) and hands each player's own data to
 * generate-player-profiles.js through scratch files:
 *   - every waypoint hub (public AND private) grouped by owner UUID (data.contents.database.waypoints.hubs)
 *   - each player's `home` location and `last_grave` (location + contents) from data.contents.database.player
 *
 * The public hubs are shown on the server's info page (the panel), not on this website.
 *
 * Run during CI after the generate phase (global generator, not per-datapack-repo).
 *
 * For local testing without the database, set WAYPOINT_LOCAL_FILE to the path of a
 * command storage .dat file.
 */

const fs = require('fs');
const path = require('path');
const { decodeUuidIntArray } = require('./lib/mc-id-codec');
const { prettifyDimension, describeItem } = require('./lib/mc-format');
const { loadCommandStorage } = require('./lib/smp-world');
const { skinHash, faceIcon } = require('./lib/head-icon');

const ROOT = path.join(__dirname, '..', '..');

// Uncommitted, job-local handoff for generate-player-profiles.js: every hub
// (public AND private) grouped by owner UUID, so a player's own profile page
// can show their private hubs too without reading the storage twice and
// without ever committing private waypoint data to git.
const BY_OWNER_SCRATCH_FILE = path.join(ROOT, '.cache', 'waypoint-hubs-by-owner.json');

// Same idea, for each player's `home` location - command-storage.dat's
// per-player entries only carry a displayname (no UUID), so this is keyed by
// lowercased Mojang username instead of UUID; generate-player-profiles.js
// already resolves each linked player's current username and can match on it.
const HOMES_SCRATCH_FILE = path.join(ROOT, '.cache', 'player-homes-by-name.json');

// Same idea again, for each player's last_grave (location + contents) -
// shown on My SMP Profile's Last Grave section.
const GRAVES_SCRATCH_FILE = path.join(ROOT, '.cache', 'player-graves-by-name.json');

function log(msg) { console.log('[waypoint-hubs]', msg); }
function warn(msg) { console.warn('[waypoint-hubs] WARNING:', msg); }
function fail(msg) {
  console.error('[waypoint-hubs] ERROR:', msg);
  process.exit(1);
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

// The hub's own head (the icon picked by left-clicking it in game, else its owner's skin), drawn from the
// skin texture into assets/images/generated/hub-icons/<hash>.png once (see lib/head-icon.js).
const HUB_ICONS_DIR = path.join(ROOT, 'assets', 'images', 'generated', 'hub-icons');
const HUB_ICONS_URL = '/assets/images/generated/hub-icons';

function hubTexture(hub) {
  if (hub.icon) return hub.icon;
  const prop = (hub.profile?.properties || []).find((p) => p?.name === 'textures');
  return prop?.value || null;
}

async function extractHubsByOwner(simplified) {
  const hubs = simplified?.data?.contents?.database?.waypoints?.hubs || {};
  const allHubs = Object.values(hubs).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const byOwner = {};
  for (const hub of allHubs) {
    const ownerUuid = ownerUuidOf(hub);
    if (!ownerUuid) continue;
    const hash = skinHash(hubTexture(hub));
    (byOwner[ownerUuid] ||= []).push({
      id: hub.id,
      name: hub.waypoint_name || 'Unnamed Waypoint',
      description: (hub.waypoint_description || '').trim(),
      owner: hub.profile?.name || 'Unknown',
      access: hub.access || 'private',
      // The hub's own head; the owner's face (mc-heads.net) only when that can't be drawn.
      icon: (hash && await faceIcon(hash, HUB_ICONS_DIR, HUB_ICONS_URL, warn)) || `https://mc-heads.net/avatar/${ownerUuid}/64`,
      // The colour of the hub's title in game (dyed with a dye).
      color: /^#[0-9a-f]{6}$/i.test(hub.color || '') ? hub.color : null,
      x: hub.pos?.x ?? 0,
      y: hub.pos?.y ?? 0,
      z: hub.pos?.z ?? 0,
      dimension: hub.dimension_name || hub.pos?.dimension || 'Unknown',
    });
  }
  return byOwner;
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

// Same idea as extractHomesByName, for last_grave (location + contents),
// in the shape My SMP Profile's Last Grave section reads.
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
  const storage = process.env.PANEL_WAYPOINT_STORAGE || 'eden';
  const simplified = await loadCommandStorage(storage, log);
  if (!simplified) fail(`The panel's database has no "${storage}" command storage (yet): is the panel 1.12.32 or newer and the server's world saved once?`);
  const byOwner = await extractHubsByOwner(simplified);
  const homesByName = extractHomesByName(simplified);
  const gravesByName = extractGravesByName(simplified);

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
