/*
 * Small formatting helpers shared by the SMP-data generators
 * (generate-waypoint-hubs.js, generate-player-profiles.js,
 * fetch-admin-playerdata.js) - dimension names, item ids, and the grave/
 * inventory item shape shown on both the admin Playerdata Inspector and
 * My SMP Profile's Last Grave section.
 */
'use strict';

const DIMENSION_LABELS = {
  'minecraft:overworld': 'Overworld',
  'minecraft:the_nether': 'The Nether',
  'minecraft:the_end': 'The End',
  'kattersstructures:deep_blue': 'Deep Blue',
};

function humanize(str) {
  return String(str || '')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function prettifyDimension(id) {
  if (!id) return 'Unknown';
  if (DIMENSION_LABELS[id]) return DIMENSION_LABELS[id];
  const bare = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  return humanize(bare);
}

function prettifyItemId(id) {
  const bare = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  return humanize(bare);
}

// Resolves a Minecraft text component (string, {text}, {translate}/{fallback}, or array) to plain text.
function resolveText(component) {
  if (component == null) return '';
  if (typeof component === 'string') return component;
  if (Array.isArray(component)) return component.map(resolveText).join('');
  if (component.text) return component.text;
  if (component.fallback) return component.fallback;
  if (component.translate) return component.translate;
  return '';
}

function describeItem(item) {
  const components = item.components || {};
  const profile = components['minecraft:profile'];
  const isHead = item.id === 'minecraft:player_head' && profile?.name;
  const enchantmentsMap = components['minecraft:stored_enchantments'] || components['minecraft:enchantments'] || null;
  const enchantments = enchantmentsMap
    ? Object.entries(enchantmentsMap).map(([id, level]) => `${prettifyItemId(id)} ${level}`)
    : [];
  const customName = components['minecraft:custom_name'] ? resolveText(components['minecraft:custom_name']) : null;

  return {
    slot: item.Slot ?? null,
    id: item.id,
    displayName: isHead ? `Player Head (${profile.name})` : (customName || prettifyItemId(item.id)),
    count: item.count ?? 1,
    enchantments,
    isHead: !!isHead,
  };
}

module.exports = { humanize, prettifyDimension, prettifyItemId, resolveText, describeItem };
