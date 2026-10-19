'use strict';

/*
 * Player-head faces from a skin's texture hash (textures.minecraft.net/texture/<hash>): the face and its hat
 * layer, 64×64 without smoothing, saved once as <dir>/<hash>.png. Used for waypoint hub icons and pets, whose
 * heads aren't players' skins (mc-heads.net only knows players).
 */

const fs = require('fs');
const path = require('path');

/** The texture hash in a base64 "textures" value, or null. */
function skinHash(textureValue) {
  if (typeof textureValue !== 'string' || !textureValue) return null;
  try {
    const url = JSON.parse(Buffer.from(textureValue, 'base64').toString('utf8'))?.textures?.SKIN?.url || '';
    const m = url.match(/textures\.minecraft\.net\/texture\/([0-9a-f]{20,80})$/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The face's URL (dir is where the file goes, urlBase how the site serves it); null when it can't be drawn. */
async function faceIcon(hash, dir, urlBase, warn = () => {}) {
  if (!/^[0-9a-f]{20,80}$/.test(hash || '')) return null;
  const file = path.join(dir, `${hash}.png`);
  if (fs.existsSync(file)) return `${urlBase}/${hash}.png`;
  try {
    const sharp = require('sharp');
    const resp = await fetch(`https://textures.minecraft.net/texture/${hash}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const skin = Buffer.from(await resp.arrayBuffer());
    const face = await sharp(skin).extract({ left: 8, top: 8, width: 8, height: 8 }).png().toBuffer();
    const hat = await sharp(skin).extract({ left: 40, top: 8, width: 8, height: 8 }).png().toBuffer();
    const both = await sharp(face).composite([{ input: hat }]).png().toBuffer();
    const png = await sharp(both).resize(64, 64, { kernel: 'nearest' }).png().toBuffer();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, png);
    return `${urlBase}/${hash}.png`;
  } catch (err) {
    warn(`Could not draw head ${hash} (${err.message}).`);
    return null;
  }
}

module.exports = { skinHash, faceIcon };
