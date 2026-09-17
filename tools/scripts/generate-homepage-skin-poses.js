#!/usr/bin/env node
'use strict';

/**
 * Renders the homepage skin lineup's poses for every linked player in
 * profiles/data/*.json (see assets/scripts/site.js):
 *
 *   - "center" camera (near front-on): a 14-frame wave-hello animation
 *     sequence, played back as a real multi-frame loop for whichever
 *     player lands in the middle slot.
 *   - "left"/"right" cameras (turned slightly toward the middle): a single
 *     mid-stride walking pose, in both left-foot-forward and
 *     right-foot-forward variants, for the two players on each side.
 *
 * Deliberately writes to its own output directory instead of touching
 * assets/images/generated/player-skins/ (the profile/leaderboard renders) -
 * this uses different camera angles and poses that only this one homepage
 * feature needs.
 *
 * Re-run whenever profiles/data/ gains new players. Safe to wipe OUT_DIR
 * first if pruning old frames after changing FRAME_COUNT/CAMERAS matters.
 */

// Smaller than the default 512 (and a lighter supersample) - these are
// small decorative homepage thumbnails, not the full-size profile/
// leaderboard renders, and there are several poses/frames of them.
process.env.PLAYER_SKIN_RENDER_SIZE = process.env.PLAYER_SKIN_RENDER_SIZE || '320';
process.env.PLAYER_SKIN_RENDER_SUPERSAMPLE = process.env.PLAYER_SKIN_RENDER_SUPERSAMPLE || '3';

const fs = require('fs');
const path = require('path');
const {
  renderPoseSequenceToPng,
  renderSinglePoseToPng,
  computeReferenceFraming,
  waveAnimationPose,
  walkPose,
} = require('./lib/skin-render');

const ROOT = path.join(__dirname, '..', '..');
const PROFILES_DIR = path.join(ROOT, 'profiles', 'data');
const OUT_DIR = path.join(ROOT, 'assets', 'images', 'generated', 'player-skins-home');

const WAVE_FRAME_COUNT = 28;
// Sampled densely enough to cover the wave's actual range of motion for
// computeReferenceFraming's framing pass below - the wiggle oscillates 2.5
// times over the cycle, so this is ~35 samples per cycle. Too sparse here
// (this used to be 12, ~5/cycle) meant the true widest arm extent fell
// between two sampled angles and never got included in the crop, clipping
// the raised hand at the actual peak frame during rendering.
const WAVE_REFERENCE_POSES = Array.from({ length: 90 }, (_, i) => waveAnimationPose(i / 90));
const WALK_POSES = { forward: walkPose(false), back: walkPose(true) };

// "left"/"right" are only a slight turn now (a strong turn read as
// "broken" - more like the character facing away than angled toward the
// middle), and "center" stays close to front-on.
const CAMERAS = {
  center: { x: -0.25, y: 0.5, z: -1.4 },
  left: { x: -0.55, y: 0.52, z: -1.25 },
  right: { x: 0.55, y: 0.52, z: -1.25 },
};

function warn(message) {
  console.warn(`[generate-homepage-skin-poses] ${message}`);
}

function wavePath(uuid, frameIndex) {
  return path.join(OUT_DIR, `${uuid}-center-${String(frameIndex).padStart(2, '0')}.png`);
}

function walkPath(uuid, camera, variant) {
  return path.join(OUT_DIR, `${uuid}-${camera}-${variant}.png`);
}

const mojangCache = new Map();

// Resolves both the skin texture URL and whether it's the "slim" (Alex)
// arm model, from Mojang's own metadata - the old heuristic here
// (checking whether the URL string happened to contain the word "slim",
// mirrored from generate-player-profiles.js) essentially never matches
// real texture URLs, which are just content hashes. That silently treated
// every slim-armed player as the wide model, sampling a UV column a pixel
// too wide and bleeding in a neighboring texture region - the "skins break
// for slim players" bug.
async function resolveSkin(uuid) {
  if (mojangCache.has(uuid)) return mojangCache.get(uuid);
  const promise = (async () => {
    try {
      const resp = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid.replace(/-/g, '')}`);
      if (!resp.ok) return null;
      const json = await resp.json();
      const texturesProp = (json.properties || []).find((p) => p.name === 'textures');
      if (!texturesProp?.value) return null;
      const decoded = JSON.parse(Buffer.from(texturesProp.value, 'base64').toString('utf8'));
      const skin = decoded?.textures?.SKIN;
      if (!skin?.url) return null;
      return { url: skin.url, model: skin.metadata?.model === 'slim' ? 'slim' : 'wide' };
    } catch {
      return null;
    }
  })();
  mojangCache.set(uuid, promise);
  return promise;
}

async function renderPlayer(uuid, framingByCamera) {
  const waveDone = Array.from({ length: WAVE_FRAME_COUNT }, (_, i) => i).every((i) => fs.existsSync(wavePath(uuid, i)));
  const walkDone = ['left', 'right'].every((cam) => ['forward', 'back'].every((v) => fs.existsSync(walkPath(uuid, cam, v))));
  if (waveDone && walkDone) return true;

  const skin = await resolveSkin(uuid);
  if (!skin) {
    warn(`Could not resolve a skin for ${uuid}.`);
    return false;
  }

  try {
    const resp = await fetch(skin.url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const skinBuffer = Buffer.from(await resp.arrayBuffer());

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const waveFrames = renderPoseSequenceToPng(skinBuffer, skin.model, WAVE_FRAME_COUNT, framingByCamera.center);
    waveFrames.forEach((png, i) => fs.writeFileSync(wavePath(uuid, i), png));

    for (const camera of ['left', 'right']) {
      for (const [variant, pose] of Object.entries(WALK_POSES)) {
        const png = renderSinglePoseToPng(skinBuffer, skin.model, pose, framingByCamera[camera]);
        fs.writeFileSync(walkPath(uuid, camera, variant), png);
      }
    }
    return true;
  } catch (err) {
    warn(`Could not render poses for ${uuid} (${err.message}).`);
    return false;
  }
}

async function main() {
  const framingByCamera = {
    center: computeReferenceFraming(CAMERAS.center, WAVE_REFERENCE_POSES),
    left: computeReferenceFraming(CAMERAS.left, Object.values(WALK_POSES)),
    right: computeReferenceFraming(CAMERAS.right, Object.values(WALK_POSES)),
  };

  const files = fs.existsSync(PROFILES_DIR) ? fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith('.json')) : [];
  let rendered = 0;
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, file), 'utf8'));
    if (!data.uuid) continue;
    const ok = await renderPlayer(data.uuid, framingByCamera);
    if (ok) rendered++;
  }
  console.log(`Rendered/verified ${rendered}/${files.length} homepage skin poses.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
