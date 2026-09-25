#!/usr/bin/env node
'use strict';

/**
 * Publishes every CI-generated JSON manifest into Postgres (generated_data /
 * player_profiles tables - see db/migrations/0003_generated_site_data.sql),
 * then deletes the local file so it's never picked up by the commit job's
 * `git add -A <dir>` calls.
 *
 * Runs last in the generate job, after every other generator. Generators
 * themselves are unmodified - they keep writing these files locally exactly
 * as before; this script is the only thing that knows they're now DB-backed.
 *
 * Why: the site's Docker image only gets redeployed once a day (Watchtower),
 * so committing generated data to git ties its freshness to that cadence.
 * Reading it from Postgres at request time instead means a new generate run
 * is live within minutes, and - for profiles/data especially - stops
 * committing player coordinates into this (public) repo's history at all.
 *
 * A missing/failed upstream generator (several run with continue-on-error)
 * just means that one key is skipped this run, leaving its previous DB row
 * in place - never a reason to fail the whole publish step.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..', '..');

function log(msg) { console.log('[publish-generated-data]', msg); }
function warn(msg) { console.warn('[publish-generated-data] WARNING:', msg); }

// key -> { file, wrap } - wrap() turns raw file contents into the JS value
// stored in generated_data.data. Defaults to JSON.parse.
const SINGLETON_FILES = {
  'enchantments': { file: 'enchantments/data/enchantments.json' },
  'recipes-manifest': { file: 'recipes/data/recipes.manifest.json' },
  'structures-manifest': { file: 'structures/structure-viewers.manifest.json' },
  'data-pack-configurator': { file: 'data-pack-configurator/data/pack-data.json' },
  'resource-pack-assembler': { file: 'resource-pack-assembler/data/pack-data.json' },
  'waypoint-hubs-manifest': { file: 'waypoint-hubs/data/waypoint-hubs.manifest.json' },
  'admin-playerdata': { file: 'admin-playerdata/data/players.json' },
  'overview-readme': { file: 'overview/data/readme.html', wrap: (raw) => ({ html: raw }) },
};

async function publishSingletons(client) {
  let published = 0;
  for (const [key, { file, wrap }] of Object.entries(SINGLETON_FILES)) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) {
      warn(`${file} not found - skipping "${key}" (previous DB row, if any, left untouched).`);
      continue;
    }
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      const data = wrap ? wrap(raw) : JSON.parse(raw);
      await client.query(
        `INSERT INTO generated_data (key, data, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = now()`,
        [key, JSON.stringify(data)]
      );
      fs.unlinkSync(fullPath);
      published++;
      log(`Published "${key}" from ${file} (${raw.length.toLocaleString()} bytes) and removed the local copy.`);
    } catch (err) {
      warn(`Could not publish "${key}" from ${file} (${err.message}) - leaving the local file in place.`);
    }
  }
  return published;
}

async function publishPlayerProfiles(client) {
  const dir = path.join(ROOT, 'profiles', 'data');
  if (!fs.existsSync(dir)) {
    warn('profiles/data not found - skipping player profiles.');
    return 0;
  }

  let published = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue; // skip .htaccess
    const discordId = name.slice(0, -'.json'.length);
    const fullPath = path.join(dir, name);
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      const data = JSON.parse(raw);
      await client.query(
        `INSERT INTO player_profiles (discord_id, data, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (discord_id) DO UPDATE SET data = $2, updated_at = now()`,
        [discordId, JSON.stringify(data)]
      );
      fs.unlinkSync(fullPath);
      published++;
    } catch (err) {
      warn(`Could not publish player profile ${name} (${err.message}) - leaving the local file in place.`);
    }
  }
  log(`Published ${published} player profile(s).`);
  return published;
}

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.TRANSLATIONS_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Set DATABASE_URL (or TRANSLATIONS_DATABASE_URL) before running publish-generated-data.js');
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const singletons = await publishSingletons(client);
    const profiles = await publishPlayerProfiles(client);
    log(`Done: ${singletons} singleton key(s), ${profiles} player profile(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[publish-generated-data] ERROR:', err.stack || err.message);
  process.exit(1);
});
