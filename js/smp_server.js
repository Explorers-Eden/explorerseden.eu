const playerCount = document.querySelector('.sip');

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function updatePlayerCount() {
  if (!playerCount) return;

  playerCount.textContent = '0';

  const ip = playerCount.dataset.ip;
  const port = playerCount.dataset.port || '25565';
  if (!ip) return;

  try {
    const data = await fetchJson(`https://api.mcsrvstat.us/3/${ip}:${port}`);
    playerCount.textContent = String(data?.players?.online ?? 0);
  } catch {
    try {
      const data = await fetchJson(`https://api.bybilly.uk/api/players/${ip}/${port}`);
      playerCount.textContent = String(data?.online ?? 0);
    } catch {
      playerCount.textContent = '0';
    }
  }
}

updatePlayerCount();
setInterval(updatePlayerCount, 60000);
