#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const yaml = require('js-yaml');

const repoRoot = process.env.SOURCE_REPO_ROOT || process.cwd();
const workflowRoot = process.env.WORKFLOW_ROOT || path.resolve(__dirname, '..', '..');
const cacheRoot = path.join(workflowRoot, '.cache', 'vanilla-assets');
const activeRoot = path.join(cacheRoot, 'active');

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function versionFromReleaseInfos() {
  for (const name of ['release_infos.yml', 'release_info.yml', 'release_infos.yaml', 'release_info.yaml']) {
    const p = path.join(repoRoot, name);
    if (!exists(p)) continue;
    const y = yaml.load(fs.readFileSync(p, 'utf8')) || {};
    const raw =
      y.minecraft_version ||
      y.minecraft ||
      y.version ||
      y.game_version ||
      y.minecraftVersion ||
      y.release?.minecraft_version ||
      y.release?.minecraft;
    if (raw) return String(Array.isArray(raw) ? raw[0] : raw);
  }
  const vMappings = yaml.load(fs.readFileSync(path.resolve(__dirname, '..', 'version-mappings.yml'), 'utf8'));
  return process.env.MINECRAFT_VERSION || vMappings.latest;
}

function requestBuffer(url, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        requestBuffer(new URL(res.headers.location, url).toString(), timeoutMs).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error(`Timeout for ${url}`)));
    req.on('error', reject);
  });
}

async function download(url, dest, label) {
  if (exists(dest) && fs.statSync(dest).size > 0) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let lastErr = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const buf = await requestBuffer(url, 60000);
      const tmp = `${dest}.tmp`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, dest);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`Download failed (${attempt}/5) for ${label}: ${err.message}`);
      await sleep(1500 * attempt);
    }
  }
  throw lastErr;
}

function copyDir(src, dst) {
  if (!exists(src)) return false;
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
  return true;
}

function activeLooksUsable() {
  return exists(path.join(activeRoot, 'assets', 'minecraft')) &&
    (exists(path.join(activeRoot, 'assets', 'minecraft', 'models')) ||
     exists(path.join(activeRoot, 'assets', 'minecraft', 'items')) ||
     exists(path.join(activeRoot, 'assets', 'minecraft', 'textures')));
}

// Texture files we depend on. If extraction silently drops any of these,
// chains, banners, and dragon heads end up rendered as the brown/blue
// hashColor fallback in chunks. Verify them after extraction so a poisoned
// cache fails the build loudly instead of shipping broken visuals.
//
// These paths aren't as stable as they look - confirmed directly against the
// real 26.3 client jar this session: plain "chain" no longer exists (split
// into iron_chain.png/copper_chain.png/etc.), and banner_base.png moved into
// a new entity/banner/ subfolder. This check was silently rejecting every
// correct 26.3 extraction as "corrupted" and falling back to stale
// pre-26.x cached assets, which is why newer items (cinnabar/sulfur/poplar)
// kept appearing missing even after the manifest/cache-freshness fixes.
const CRITICAL_TEXTURES = [
  'assets/minecraft/textures/block/iron_chain.png',
  'assets/minecraft/textures/entity/banner/banner_base.png',
  'assets/minecraft/textures/entity/enderdragon/dragon.png'
];

function missingCriticalTextures(root) {
  return CRITICAL_TEXTURES.filter(p => !exists(path.join(root, p)));
}

// A version *id* (e.g. "26.3") is not a stable content pin - Mojang can and
// does update a version's manifest entry in place while it's still being
// finished (this bit us: cinnabar/sulfur/poplar were missing from an earlier
// cached "26.3" extraction even though the id never changed). Trusting a
// cached extraction just because 3 long-standing texture files exist can
// silently pin the pipeline to stale content forever. This marker records
// the client jar's sha1 (from the version manifest) at the time it was
// successfully extracted, so a content update under the same version id is
// detected and triggers a fresh download instead of reusing the stale cache.
function shaMarkerFile(versionRoot) {
  return path.join(versionRoot, 'client.sha1');
}

function cachedShaMatches(versionRoot, expectedSha1) {
  const markerFile = shaMarkerFile(versionRoot);
  if (!expectedSha1 || !exists(markerFile)) return false;
  return fs.readFileSync(markerFile, 'utf8').trim() === expectedSha1;
}

async function main() {
  const version = versionFromReleaseInfos();
  const versionRoot = path.join(cacheRoot, version);
  const extractedRoot = path.join(versionRoot, 'extracted');

  const manifestPath = path.join(cacheRoot, 'version_manifest_v2.json');
  try {
    // Unlike a specific version's client jar, the manifest is a live index of
    // every currently-available version - it changes constantly (this is
    // exactly why "26.3 not found in manifest" happened despite 26.3 being a
    // real, current release: download()'s skip-if-exists check was reusing a
    // manifest snapshot frozen inside the persistent vanilla-assets cache
    // from whenever that cache entry was first populated, possibly before
    // 26.3 existed at all). Always force a fresh fetch for this one file.
    fs.rmSync(manifestPath, { force: true });
    await download('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', manifestPath, 'version manifest');
    const manifest = readJson(manifestPath);
    const entry = (manifest.versions || []).find(v => v.id === version);
    if (!entry) throw new Error(`Minecraft version ${version} not found in manifest.`);

    const versionJsonPath = path.join(versionRoot, `${version}.json`);
    await download(entry.url, versionJsonPath, `${version}.json`);
    const versionJson = readJson(versionJsonPath);
    const clientUrl = versionJson.downloads?.client?.url;
    const clientSha1 = versionJson.downloads?.client?.sha1;
    if (!clientUrl) throw new Error(`Client jar URL missing for Minecraft ${version}.`);

    if (exists(extractedRoot) && exists(path.join(extractedRoot, 'assets', 'minecraft'))) {
      const missing = missingCriticalTextures(extractedRoot);
      if (missing.length === 0 && cachedShaMatches(versionRoot, clientSha1)) {
        copyDir(extractedRoot, activeRoot);
        console.log(`Vanilla assets ready for Minecraft ${version} (cache matches current client jar).`);
        return;
      }
      console.warn(
        missing.length > 0
          ? `Cached vanilla extraction for ${version} is missing critical files (${missing.join(', ')}); re-downloading client jar.`
          : `Cached vanilla extraction for ${version} doesn't match the current client jar (Mojang updated this version's content); re-downloading.`
      );
      fs.rmSync(extractedRoot, { recursive: true, force: true });
    }

    const jarPath = path.join(versionRoot, 'client.jar');
    await download(clientUrl, jarPath, `${version} client jar`);

    fs.rmSync(extractedRoot, { recursive: true, force: true });
    fs.mkdirSync(extractedRoot, { recursive: true });

    // Extract only assets. unzip exists on GitHub runners; jar also works, but unzip is faster.
    try {
      execFileSync('unzip', ['-q', jarPath, 'assets/*', 'data/*', '-d', extractedRoot], { stdio: 'ignore' });
    } catch {
      execFileSync('jar', ['xf', jarPath], { cwd: extractedRoot, stdio: 'ignore' });
    }

    if (!exists(path.join(extractedRoot, 'assets', 'minecraft'))) {
      throw new Error(`Minecraft ${version} assets were not extracted.`);
    }
    // data/minecraft contains vanilla tags needed for recipe ingredient tag expansion.
    if (!exists(path.join(extractedRoot, 'data', 'minecraft'))) {
      console.warn(`Minecraft ${version} data folder was not extracted; vanilla tag fallback may be incomplete.`);
    }
    const missing = missingCriticalTextures(extractedRoot);
    if (missing.length > 0) {
      // Wipe so the next run re-downloads from scratch instead of using this partial extraction.
      fs.rmSync(extractedRoot, { recursive: true, force: true });
      throw new Error(`Minecraft ${version} extraction missing critical textures: ${missing.join(', ')}`);
    }

    if (clientSha1) {
      fs.writeFileSync(shaMarkerFile(versionRoot), clientSha1, 'utf8');
    }
    copyDir(extractedRoot, activeRoot);
    console.log(`Vanilla assets ready for Minecraft ${version}.`);
  } catch (err) {
    // Network failure should not kill the entire wiki run if an older active cache is present.
    if (activeLooksUsable()) {
      console.warn(`Could not refresh vanilla assets for Minecraft ${version}; reusing existing active cache. ${err.message}`);
      return;
    }
    if (exists(extractedRoot) && exists(path.join(extractedRoot, 'assets', 'minecraft'))) {
      copyDir(extractedRoot, activeRoot);
      console.warn(`Could not refresh vanilla assets for Minecraft ${version}; reusing cached ${version} assets. ${err.message}`);
      return;
    }
    console.warn(`Vanilla assets unavailable for Minecraft ${version}; continuing without vanilla fallback. ${err.message}`);
    fs.rmSync(activeRoot, { recursive: true, force: true });
    fs.mkdirSync(activeRoot, { recursive: true });
    // Do not fail the whole workflow. Custom repo assets and non-recipe generation can still work.
  }
}

main().catch(err => {
  console.warn(`Vanilla asset preparation skipped: ${err.message}`);
  process.exit(0);
});
