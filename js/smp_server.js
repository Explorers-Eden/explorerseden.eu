const playerCounts = document.querySelectorAll('.sip');
const discordCount = document.querySelector('.discord-count');

function normalizeCounterText(element) {
  if (!element) return;
  element.textContent = String(element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function animateCounter(element, targetValue, duration = 650) {
  if (!element) return;

  const target = Number(targetValue) || 0;
  const current = Number(String(element.textContent || '0').replace(/[^0-9.-]/g, '')) || 0;

  if (current === target) {
    element.textContent = String(target);
    return;
  }

  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(current + (target - current) * eased);
    element.textContent = String(value);

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      element.textContent = String(target);
    }
  }

  requestAnimationFrame(tick);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

// Each source returns the online player count, or null when it reports the
// server as offline/unresolvable (a single API failing to resolve DNS must not
// be treated as "0 players" while other sources can still reach the server).
const playerSources = [
  async (ip, port) => {
    const data = await fetchJson(`https://api.mcstatus.io/v2/status/java/${ip}:${port}`);
    return data?.online ? Number(data?.players?.online ?? 0) : null;
  },
  async (ip, port) => {
    const data = await fetchJson(`https://api.mcsrvstat.us/3/${ip}:${port}`);
    return data?.online ? Number(data?.players?.online ?? 0) : null;
  },
  async (ip, port) => {
    const data = await fetchJson(`https://api.bybilly.uk/api/players/${ip}/${port}`);
    const online = data?.online ?? data?.players?.online;
    return online == null ? null : Number(online) || 0;
  },
];

async function updatePlayerCount() {
  if (!playerCounts.length) return;

  const [first] = playerCounts;
  const ip = first.dataset.ip;
  const port = first.dataset.port || '25565';
  if (!ip) {
    playerCounts.forEach((el) => animateCounter(el, 0));
    return;
  }

  for (const source of playerSources) {
    try {
      const online = await source(ip, port);
      if (online !== null) {
        playerCounts.forEach((el) => animateCounter(el, online));
        return;
      }
    } catch {
      // try next source
    }
  }

  playerCounts.forEach((el) => animateCounter(el, 0));
}

playerCounts.forEach(normalizeCounterText);
normalizeCounterText(discordCount);

if (discordCount) {
  animateCounter(discordCount, discordCount.dataset.count || discordCount.textContent || 0);
}

updatePlayerCount();
setInterval(updatePlayerCount, 60000);
