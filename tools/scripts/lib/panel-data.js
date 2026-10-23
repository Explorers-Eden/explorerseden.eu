/*
 * Discord links, land claims and market listings from the Nice Control Center panel, used by
 * generate-player-profiles.js (My SMP Profile). Replaces the DiscordJustSync player-links file
 * and GOML's claim data: the panel copies all of it into its Postgres database
 * (tables discord_links, claims, claim_members, market_listings, market_sync, market_mail, pets_owned), which CI reads
 * through PANEL_DATABASE_URL.
 *
 * Item icons are served by the panel's public info page: set PANEL_PUBLIC_URL to its address
 * (e.g. https://info.explorerseden.eu) and listings get an iconUrl; without it they have none.
 *
 * For local testing without the database:
 *   PANEL_LOCAL_LINKS_FILE  - the panel's discord-links.json (from /data/panel)
 *   PANEL_LOCAL_CLAIMS_FILE - the world's nicecontrolcenter-claims.json
 *   PANEL_LOCAL_MARKET_FILE - the world's nicecontrolcenter-market.json (no icons)
 */
'use strict';

const fs = require('fs');
const { prettifyDimension } = require('./mc-format');

const ROLE_LABELS = { ACCESS: 'Visitor', CONTAINERS: 'Containers', BUILD: 'Builder', MANAGE: 'Co-owner' };

function hex(rgb) {
  return '#' + (Number(rgb) & 0xffffff).toString(16).padStart(6, '0').toUpperCase();
}

/** One claim as the profile pages show it. */
function claimRecord(c) {
  const width = c.maxX - c.minX + 1;
  const length = c.maxZ - c.minZ + 1;
  return {
    id: c.id,
    name: c.name || null,
    color: c.color,
    dimension: prettifyDimension(c.dimension),
    x: Math.floor((c.minX + c.maxX) / 2),
    z: Math.floor((c.minZ + c.maxZ) / 2),
    minX: c.minX,
    minZ: c.minZ,
    maxX: c.maxX,
    maxZ: c.maxZ,
    width,
    length,
    area: width * length,
    subclaims: c.subclaims || 0,
    members: (c.members || []).map((m) => ({ name: m.name, role: ROLE_LABELS[m.role] || m.role })),
  };
}

/** Claims grouped by owner uuid (claims of their own, not subclaims; server claims left out). */
function groupByOwner(claims) {
  const subCount = {};
  for (const c of claims) if (c.parent) subCount[c.parent] = (subCount[c.parent] || 0) + 1;
  const byOwner = {};
  for (const c of claims) {
    if (c.parent || !c.owner) continue;
    (byOwner[c.owner] ||= []).push(claimRecord({ ...c, subclaims: subCount[c.id] || 0 }));
  }
  for (const list of Object.values(byOwner)) list.sort((a, b) => b.area - a.area);
  return byOwner;
}

/** "minecraft:diamond" -> "Diamond". */
function itemName(id) {
  const p = String(id || '').replace(/^[^:]*:/, '').replace(/_/g, ' ');
  return p.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

function iconUrl(icon) {
  const base = (process.env.PANEL_PUBLIC_URL || '').replace(/\/+$/, '');
  return base && icon ? `${base}/info/items/${encodeURIComponent(icon)}.png` : null;
}

/** One listing as the profile pages show it. */
function listingRecord(l) {
  return {
    id: l.id,
    name: l.name,
    item: l.item,
    iconUrl: iconUrl(l.icon),
    amount: l.amount,
    price: l.price,
    lore: l.lore || [],
    enchantments: l.enchantments || [],
    expires: l.expires,
    // The price is for this many, bought that many at a time.
    per: l.per || 1,
  };
}

/** Listings grouped by seller uuid, newest first. */
function listingsBySeller(listings) {
  const out = {};
  for (const l of listings) (out[l.seller] ||= []).push(listingRecord(l));
  for (const list of Object.values(out)) list.sort((a, b) => String(b.expires).localeCompare(String(a.expires)));
  return out;
}

async function fromDatabase(connectionString) {
  const { Client } = require('pg');
  const client = new Client({ connectionString, ssl: process.env.PANEL_DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    const links = (await client.query('SELECT player_uuid, player_name, discord_id, discord_name FROM discord_links')).rows
      .map((r) => ({ uuid: r.player_uuid, name: r.player_name, discordId: String(r.discord_id), discordName: r.discord_name }));
    let claims = [];
    try {
      const rows = (await client.query(`
        SELECT c.id, c.parent_id, c.owner_uuid, c.dimension, c.min_x, c.min_z, c.max_x, c.max_z, c.name, c.color,
               COALESCE(json_agg(json_build_object('name', m.player_name, 'role', m.role)) FILTER (WHERE m.player_uuid IS NOT NULL), '[]') AS members
        FROM claims c LEFT JOIN claim_members m ON m.claim_id = c.id
        GROUP BY c.id`)).rows;
      claims = rows.map((r) => ({
        id: r.id, parent: r.parent_id, owner: r.owner_uuid, dimension: r.dimension,
        minX: r.min_x, minZ: r.min_z, maxX: r.max_x, maxZ: r.max_z, name: r.name, color: r.color, members: r.members,
      }));
    } catch (err) {
      // The claims tables come with panel 1.8.0; older panels have none.
      claims = [];
    }
    let listings = [];
    let market = null;
    try {
      listings = (await client.query(`SELECT id, seller_uuid, item_id, item_name, lore, enchantments, amount, price, per, expires_at, icon FROM market_listings`)).rows
        .map((r) => ({ id: r.id, seller: r.seller_uuid, item: r.item_id, name: r.item_name, lore: r.lore, enchantments: r.enchantments,
          amount: r.amount, price: r.price, per: r.per, expires: new Date(r.expires_at).toISOString(), icon: r.icon }));
      const sync = (await client.query('SELECT currency, currency_icon FROM market_sync WHERE id = 1')).rows[0];
      if (sync && sync.currency) market = { currency: sync.currency, currencyIcon: sync.currency_icon };
    } catch (err) {
      // The market tables come with panel 1.9.0, icons with 1.10.0.
      listings = [];
    }
    // Market mailboxes and pets come with panel 1.13.0 (tables market_mail, pets_owned).
    const mail = {};
    try {
      // The bank balance and website purchases to claim come with panel 1.25.0 (database V13).
      let rows;
      try {
        rows = (await client.query('SELECT player_uuid, currency, parcels, balance, orders FROM market_mail')).rows;
      } catch (err) {
        rows = (await client.query('SELECT player_uuid, currency, parcels FROM market_mail')).rows;
      }
      for (const r of rows) {
        mail[r.player_uuid] = { currency: r.currency, balance: Number(r.balance || 0), orders: (r.orders || []).map((o) => ({ name: o.name, times: o.times })),
          parcels: (r.parcels || []).map((p) => ({ item: p.item_id, name: p.item_name, amount: p.amount, iconUrl: iconUrl(p.icon) })) };
      }
    } catch (err) { /* older panel */ }
    const pets = {};
    // Names, bond levels and perks come with panel 1.16.2 (database V12); older panels only have the rest.
    let petRows = null;
    try {
      petRows = (await client.query('SELECT player_uuid, pet_id, pet_name, head, since, active, nickname, name_color, bond_level, perks FROM pets_owned ORDER BY since')).rows;
    } catch (err) {
      try {
        petRows = (await client.query('SELECT player_uuid, pet_id, pet_name, head, since, active FROM pets_owned ORDER BY since')).rows;
      } catch (err2) { /* older panel */ }
    }
    for (const r of petRows || []) {
      (pets[r.player_uuid] ||= []).push({ id: r.pet_id, name: r.pet_name, head: r.head, since: r.since ? new Date(r.since).toISOString() : null, active: r.active,
        nickname: r.nickname || null, nameColor: r.name_color || null, level: r.bond_level ?? null,
        perks: (r.perks || []).map((k) => ({ label: k.label, description: k.description, level: k.level, unlocked: !!k.unlocked })) });
    }
    return { links, claims, listings, market, mail, pets };
  } finally {
    await client.end();
  }
}

function fromLocalFiles() {
  const links = [];
  if (process.env.PANEL_LOCAL_LINKS_FILE && fs.existsSync(process.env.PANEL_LOCAL_LINKS_FILE)) {
    for (const l of JSON.parse(fs.readFileSync(process.env.PANEL_LOCAL_LINKS_FILE, 'utf8'))) {
      links.push({ uuid: l.uuid, name: l.name, discordId: String(l.discordId), discordName: l.discordName });
    }
  }
  const claims = [];
  if (process.env.PANEL_LOCAL_CLAIMS_FILE && fs.existsSync(process.env.PANEL_LOCAL_CLAIMS_FILE)) {
    const data = JSON.parse(fs.readFileSync(process.env.PANEL_LOCAL_CLAIMS_FILE, 'utf8'));
    for (const c of Object.values(data.claims || {})) {
      claims.push({
        id: c.id, parent: c.parent, owner: c.owner, dimension: c.dim,
        minX: c.minX, minZ: c.minZ, maxX: c.maxX, maxZ: c.maxZ, name: c.name, color: hex(c.color),
        members: Object.values(c.members || {}).map((m) => ({ name: m.name, role: m.role })),
      });
    }
  }
  const listings = [];
  let market = null;
  if (process.env.PANEL_LOCAL_MARKET_FILE && fs.existsSync(process.env.PANEL_LOCAL_MARKET_FILE)) {
    const data = JSON.parse(fs.readFileSync(process.env.PANEL_LOCAL_MARKET_FILE, 'utf8'));
    for (const l of Object.values(data.listings || {})) {
      listings.push({ id: l.id, seller: l.seller, item: l.item?.id, name: l.item?.name, lore: l.item?.lore, enchantments: l.item?.enchantments,
        amount: l.amount, price: l.price, expires: new Date(l.expires).toISOString(), icon: null });
    }
    market = { currency: process.env.PANEL_LOCAL_MARKET_CURRENCY || 'minecraft:diamond', currencyIcon: null };
  }
  return { links, claims, listings, market, mail: {}, pets: {} };
}

/**
 * { links: [{uuid, name, discordId, discordName}], claimsByOwner: {uuid: [claim]},
 *   listingsBySeller: {uuid: [listing]}, market: {currency, currencyName, currencyIconUrl} | null }.
 * Throws when neither the database nor local files are configured.
 */
async function loadPanelData(log = () => {}) {
  let data;
  if (process.env.PANEL_LOCAL_LINKS_FILE || process.env.PANEL_LOCAL_CLAIMS_FILE || process.env.PANEL_LOCAL_MARKET_FILE) {
    log('Reading links, claims and the market from local panel files (test mode).');
    data = fromLocalFiles();
  } else if (process.env.PANEL_DATABASE_URL) {
    data = await fromDatabase(process.env.PANEL_DATABASE_URL);
  } else {
    throw new Error('Set PANEL_DATABASE_URL (the Nice Control Center panel database) for Discord links and claims.');
  }
  log(`Loaded ${data.links.length} Discord link(s), ${data.claims.length} claim(s) and ${data.listings.length} market listing(s) from the panel.`);
  const market = data.market
    ? { currency: data.market.currency, currencyName: itemName(data.market.currency), currencyIconUrl: iconUrl(data.market.currencyIcon) }
    : null;
  return { links: data.links, claimsByOwner: groupByOwner(data.claims), listingsBySeller: listingsBySeller(data.listings), market,
    mailByPlayer: data.mail || {}, petsByPlayer: data.pets || {} };
}

module.exports = { loadPanelData };
