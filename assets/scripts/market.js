(function () {
  const shell = document.querySelector('.market-shell');
  if (!shell) return;

  const subtitle = document.getElementById('market-subtitle');
  const groups = document.getElementById('market-groups');
  const search = document.getElementById('market-search');
  const sort = document.getElementById('market-sort');
  let data = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Same collapsible cards as My SMP Profile and the statistics page.
  function group(id, summaryHtml, bodyHtml) {
    return `
      <details class="profile-group" id="market-group-${id}" open>
        <summary>${summaryHtml}<i class="bi bi-chevron-down profile-group__arrow" aria-hidden="true"></i></summary>
        <div class="profile-group__body">${bodyHtml}</div>
      </details>`;
  }

  function currencyName(n) {
    const name = String(data.currency || 'minecraft:diamond').replace(/^[^:]*:/, '').replace(/_/g, ' ').replace(/\b([a-z])/g, (c) => c.toUpperCase());
    return n === 1 ? name : name + 's';
  }

  function price(n, per) {
    const coin = data.currencyIcon ? `<img class="profile-market-card__coin" src="${esc(data.currencyIcon)}" alt="" loading="lazy">` : '';
    return `${coin}${Number(n).toLocaleString()} ${esc(currencyName(n))}${per > 1 ? ` per ${Number(per).toLocaleString()}` : per === 1 ? ' each' : ''}`;
  }

  function icon(url, fallback) {
    return url ? `<img class="profile-market-card__icon" src="${esc(url)}" alt="" loading="lazy">`
      : `<span class="profile-market-card__icon profile-market-card__icon--none"><i class="bi ${fallback}"></i></span>`;
  }

  function until(t) {
    return t ? ` · on sale until ${esc(new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' }))}` : '';
  }

  function listingCard(l) {
    const extra = [...l.enchantments, ...l.lore];
    const days = Math.max(0, Math.ceil((l.expires - Date.now()) / 86400000));
    return `<article class="profile-market-card">${icon(l.icon, 'bi-box')}
      <div class="profile-market-card__body">
        <h3>${esc(l.name)} <span class="profile-market-card__amount">×${Number(l.amount).toLocaleString()}</span></h3>
        ${extra.length ? `<p class="profile-market-card__extra">${extra.map(esc).join(' · ')}</p>` : ''}
        <p class="profile-market-card__price">${price(l.price, l.per)}
          <span class="profile-market-card__left">· ${esc(l.seller)} · ${days === 1 ? '1 day' : `${days} days`} left</span></p>
      </div></article>`;
  }

  function render() {
    if (!data) return;
    const q = search.value.trim().toLowerCase();
    const hit = (...texts) => !q || texts.some((t) => String(t || '').toLowerCase().includes(q));
    const order = {
      price: (a, b) => a.price / a.per - b.price / b.per,
      new: (a, b) => b.created - a.created,
      name: (a, b) => a.name.localeCompare(b.name),
    }[sort.value];
    const listings = data.listings.filter((l) => hit(l.name, l.item, l.seller, ...l.enchantments, ...l.lore)).sort(order);
    const server = data.server.filter((o) => hit(o.name, o.description));
    const pets = data.pets.filter((p) => hit(p.name, p.description, 'pet'));
    const out = [];
    out.push(group('players', `<span class="profile-group__title"><i class="bi bi-bag"></i> From players</span><span class="profile-count-badge">${listings.length}</span>`,
      listings.length ? `<div class="profile-market-grid">${listings.map(listingCard).join('')}</div>`
        : `<p class="profile-empty-note">${data.listings.length ? 'Nothing matches.' : 'Nothing for sale right now. Type /market in game to sell something.'}</p>`));
    if (data.server.length || data.pets.length) {
      const cards = server.map((o) => `<article class="profile-market-card">${icon(o.icon, 'bi-shop')}
          <div class="profile-market-card__body"><h3>${esc(o.name)}</h3>
            ${o.description ? `<p class="profile-market-card__extra">${esc(o.description)}</p>` : ''}
            <p class="profile-market-card__price">${price(o.price, 0)}<span class="profile-market-card__left">${o.perPlayer ? ` · up to ${o.perPlayer} per player` : ''}${until(o.until)}</span></p></div></article>`)
        .concat(pets.map((p) => `<article class="profile-market-card">${icon(p.icon, 'bi-emoji-smile')}
          <div class="profile-market-card__body"><h3>${esc(p.name)} <span class="profile-market-card__amount">Pet</span></h3>
            ${p.description ? `<p class="profile-market-card__extra">${esc(p.description)}</p>` : ''}
            <p class="profile-market-card__price">${price(p.price, 0)}<span class="profile-market-card__left">${p.left > 0 ? ` · ${p.left} left` : ''}${until(p.until)}</span></p></div></article>`));
      out.push(group('server', `<span class="profile-group__title"><i class="bi bi-shop-window"></i> From ${esc(data.serverName)}</span><span class="profile-count-badge">${cards.length}</span>`,
        cards.length ? `<div class="profile-market-grid">${cards.join('')}</div>` : '<p class="profile-empty-note">Nothing matches.</p>'));
    }
    groups.innerHTML = out.join('');
  }

  async function load() {
    try {
      const res = await fetch('/market-data.php', { cache: 'no-store' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      data = json;
      // Only says something when there's something to say (closed, or an error below).
      subtitle.textContent = data.open ? '' : 'The market is closed right now.';
      subtitle.hidden = data.open;
      render();
    } catch (err) {
      subtitle.textContent = err.message || "The market can't be reached right now.";
      subtitle.hidden = false;
    }
  }

  search.addEventListener('input', render);
  sort.addEventListener('change', render);
  load();
  // Keeps up while the page stays open.
  setInterval(() => { if (!document.hidden) load(); }, 60000);
})();
