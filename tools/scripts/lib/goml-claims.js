/*
 * Shared "goml" land-claims reading, used by generate-player-profiles.js (My
 * SMP Profile) and fetch-admin-playerdata.js (admin Playerdata Inspector).
 * Claims live in one cardinal-components/world.dat per dimension - callers
 * supply how to actually fetch each file's bytes (local directory read vs.
 * SFTP get) via `fetchBuffer`, since the two callers source them differently.
 */
'use strict';

const nbt = require('prismarine-nbt');
const { decodeUuidIntArray } = require('./mc-id-codec');

const DIMENSION_FILES = [
  { rel: 'dimensions/minecraft/overworld/data/cardinal-components/world.dat', label: 'Overworld' },
  { rel: 'dimensions/minecraft/the_nether/data/cardinal-components/world.dat', label: 'The Nether' },
  { rel: 'dimensions/minecraft/the_end/data/cardinal-components/world.dat', label: 'The End' },
  { rel: 'dimensions/kattersstructures/deep_blue/data/cardinal-components/world.dat', label: 'Deep Blue' },
];

function formatAnchorType(type) {
  if (!type) return 'Unknown Anchor';
  const stripped = type.startsWith('goml:') ? type.slice('goml:'.length) : type;
  return stripped.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function decodeClaimOwners(claim) {
  return (claim.Owners || [])
    .map((arr) => { try { return decodeUuidIntArray(arr); } catch { return null; } })
    .filter(Boolean);
}

function decodeClaimTrusted(claim) {
  return (claim.Trusted || [])
    .map((arr) => { try { return decodeUuidIntArray(arr); } catch { return null; } })
    .filter(Boolean);
}

// fetchBuffer(relPath): async (rel) => Buffer|null (null/thrown = not available, skipped).
async function loadAllClaims(fetchBuffer, warn) {
  const claims = [];
  for (const dim of DIMENSION_FILES) {
    let buffer;
    try {
      buffer = await fetchBuffer(dim.rel);
    } catch (err) {
      warn?.(`Could not fetch claims file for ${dim.label} (${err.message}) - skipping.`);
      continue;
    }
    if (!buffer) continue;
    let simplified;
    try {
      const parsed = await nbt.parse(buffer);
      simplified = nbt.simplify(parsed.parsed);
    } catch (err) {
      warn?.(`Could not parse claims file for ${dim.label} (${err.message}) - skipping.`);
      continue;
    }
    const list = simplified?.data?.cardinal_components?.['goml:claims']?.Claims || [];
    for (const claim of list) {
      claims.push({ ...claim, __dimension: dim.label });
    }
  }
  return claims;
}

module.exports = { DIMENSION_FILES, formatAnchorType, decodeClaimOwners, decodeClaimTrusted, loadAllClaims };
