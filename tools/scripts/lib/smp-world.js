'use strict';

/**
 * The SMP world data the profile and waypoint scripts need, from the Nice Control Center panel's database
 * (PANEL_DATABASE_URL): the panel copies each player's tags, stats and advancements (smp_players) and the
 * data packs' command storage (smp_command_storage) there whenever the files change, so no SFTP is needed.
 *
 * The command storage comes back in prismarine-nbt's "simplified" shape (the panel stores it that way), so
 * code written against nbt.simplify() works on it unchanged.
 *
 * For local testing without the database:
 *   SMP_LOCAL_WORLD_DIR  - a world folder (players/data, players/stats, players/advancements)
 *   WAYPOINT_LOCAL_FILE  - a command storage .dat file
 */

const fs = require('fs');
const path = require('path');

function dbClient() {
  const { Client } = require('pg');
  return new Client({
    connectionString: process.env.PANEL_DATABASE_URL,
    ssl: process.env.PANEL_DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

async function readNbtFile(file) {
  const nbt = require('prismarine-nbt');
  const parsed = await nbt.parse(fs.readFileSync(file));
  return nbt.simplify(parsed.parsed);
}

/**
 * Every player of the world: uuid -> { tags, dataVersion, stats, advancements }.
 * Players without a player file (linked on Discord but never joined) aren't in it.
 */
async function loadSmpPlayers(log = () => {}) {
  const players = new Map();
  if (process.env.SMP_LOCAL_WORLD_DIR) {
    const world = process.env.SMP_LOCAL_WORLD_DIR;
    log(`Reading players from a local world folder (test mode): ${world}`);
    const dataDir = path.join(world, 'players', 'data');
    for (const file of fs.existsSync(dataDir) ? fs.readdirSync(dataDir) : []) {
      if (!file.endsWith('.dat')) continue;
      const uuid = file.slice(0, -4);
      let dat;
      try {
        dat = await readNbtFile(path.join(dataDir, file));
      } catch (err) {
        log(`Could not read ${file}: ${err.message}`);
        continue;
      }
      players.set(uuid, {
        tags: Array.isArray(dat.Tags) ? dat.Tags : [],
        dataVersion: dat.DataVersion ?? null,
        stats: readJsonSafe(path.join(world, 'players', 'stats', `${uuid}.json`)),
        advancements: readJsonSafe(path.join(world, 'players', 'advancements', `${uuid}.json`)),
      });
    }
    return players;
  }
  if (!process.env.PANEL_DATABASE_URL) throw new Error('Set PANEL_DATABASE_URL (the Nice Control Center panel database) for the player data.');
  const client = dbClient();
  await client.connect();
  try {
    const rows = (await client.query('SELECT player_uuid, tags, data_version, stats, advancements FROM smp_players')).rows;
    for (const r of rows) {
      players.set(r.player_uuid, { tags: r.tags || [], dataVersion: r.data_version, stats: r.stats, advancements: r.advancements });
    }
    const sync = (await client.query('SELECT level_name, synced_at FROM smp_sync WHERE id = 1')).rows[0];
    log(`Loaded ${players.size} player(s) from the panel (world "${sync?.level_name ?? '?'}", copied ${sync?.synced_at ? new Date(sync.synced_at).toISOString() : 'never'}).`);
  } finally {
    await client.end();
  }
  return players;
}

/** A data pack's command storage (e.g. "eden" for data/eden/command_storage.dat), simplified; null when there's none. */
async function loadCommandStorage(name, log = () => {}) {
  if (process.env.WAYPOINT_LOCAL_FILE) {
    log(`Reading local file ${process.env.WAYPOINT_LOCAL_FILE} (local test mode).`);
    return readNbtFile(process.env.WAYPOINT_LOCAL_FILE);
  }
  if (!process.env.PANEL_DATABASE_URL) throw new Error('Set PANEL_DATABASE_URL (the Nice Control Center panel database) for the command storage.');
  const client = dbClient();
  await client.connect();
  try {
    const row = (await client.query('SELECT data, saved_at FROM smp_command_storage WHERE name = $1', [name])).rows[0];
    if (!row) return null;
    log(`Loaded the "${name}" command storage from the panel (saved ${new Date(row.saved_at).toISOString()}).`);
    return row.data;
  } finally {
    await client.end();
  }
}

module.exports = { loadSmpPlayers, loadCommandStorage };
