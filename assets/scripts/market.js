(function () {
  const shell = document.querySelector('.market-shell');
  if (!shell) return;

  const subtitle = document.getElementById('market-subtitle');
  const groups = document.getElementById('market-groups');
  const search = document.getElementById('market-search');
  const sortChips = document.getElementById('market-sort');
  const clear = document.getElementById('market-clear');
  let sort = 'price';
  let data = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** Minecraft text with § codes as HTML, like the game shows it: the 16 colours, bold, italic, underlined, struck through; §r resets, §k is left out. */
  const MC_COLORS = { 0: '#000000', 1: '#0000AA', 2: '#00AA00', 3: '#00AAAA', 4: '#AA0000', 5: '#AA00AA', 6: '#FFAA00', 7: '#AAAAAA',
    8: '#555555', 9: '#5555FF', a: '#55FF55', b: '#55FFFF', c: '#FF5555', d: '#FF55FF', e: '#FFFF55', f: '#FFFFFF' };
  const MC_STYLES = { l: 'font-weight:800', o: 'font-style:italic', n: 'text-decoration:underline', m: 'text-decoration:line-through' };
  function mcHtml(text) {
    let out = '';
    let open = 0;
    for (const part of String(text ?? '').split(/(\u00a7[0-9a-fk-or])/i)) {
      const code = /^\u00a7([0-9a-fk-or])$/i.exec(part);
      if (!code) {
        out += esc(part);
        continue;
      }
      const c = code[1].toLowerCase();
      if (MC_COLORS[c] || c === 'r') {
        // A colour (or reset) ends the formatting before it, like in the game.
        out += '</span>'.repeat(open);
        open = 0;
        if (MC_COLORS[c]) {
          out += `<span style="color:${MC_COLORS[c]}">`;
          open++;
        }
      } else if (MC_STYLES[c]) {
        out += `<span style="${MC_STYLES[c]}">`;
        open++;
      }
    }
    return out + '</span>'.repeat(open);
  }
  /** The same text without its codes (for searching). */
  const mcPlain = (text) => String(text ?? '').replace(/\u00a7[0-9a-fk-or]/gi, '');

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

  // Same chips as a pet on My SMP Profile, hover for what each perk does.
  function perks(list) {
    return (list || []).length ? `<p class="profile-pet-perks">${list.map((k) => `<span class="profile-pet-perk" title="${esc(`${k.description} (unlocks at bond level ${k.level})`)}">${esc(k.label)}</span>`).join('')}</p>` : '';
  }

  function until(t) {
    return t ? ` · on sale until ${esc(new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' }))}` : '';
  }

  function listingCard(l) {
    const extra = [...l.enchantments, ...l.lore];
    const days = Math.max(0, Math.ceil((l.expires - Date.now()) / 86400000));
    return `<article class="profile-market-card">${icon(l.icon, 'bi-box')}
      <div class="profile-market-card__body">
        <h3>${mcHtml(l.name)} <span class="profile-market-card__amount">×${Number(l.amount).toLocaleString()}</span></h3>
        ${extra.length ? `<p class="profile-market-card__extra">${extra.map(mcHtml).join(' · ')}</p>` : ''}
        <p class="profile-market-card__price">${price(l.price, l.per)}
          <span class="profile-market-card__left">· ${esc(l.seller)} · ${days === 1 ? '1 day' : `${days} days`} left</span></p>
      </div></article>`;
  }

  function render() {
    if (!data) return;
    const q = search.value.trim().toLowerCase();
    const hit = (...texts) => !q || texts.some((t) => mcPlain(t).toLowerCase().includes(q));
    const order = {
      price: (a, b) => a.price / a.per - b.price / b.per,
      new: (a, b) => b.created - a.created,
      name: (a, b) => mcPlain(a.name).localeCompare(mcPlain(b.name)),
    }[sort];
    const listings = data.listings.filter((l) => hit(l.name, l.item, l.seller, ...l.enchantments, ...l.lore)).sort(order);
    const server = data.server.filter((o) => hit(o.name, o.description));
    const pets = data.pets.filter((p) => hit(p.name, p.description, 'pet', ...(p.perks || []).map((k) => k.label)));
    const out = [];
    out.push(group('players', `<span class="profile-group__title"><i class="bi bi-bag"></i> From Players</span><span class="profile-count-badge">${listings.length}</span>`,
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
            ${perks(p.perks)}
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
  clear.addEventListener('click', () => {
    search.value = '';
    render();
    search.focus();
  });
  sortChips.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-sort]');
    if (!chip) return;
    sort = chip.dataset.sort;
    sortChips.querySelectorAll('[data-sort]').forEach((c) => c.classList.toggle('is-active', c === chip));
    render();
  });
  load();
  // Keeps up while the page stays open.
  setInterval(() => { if (!document.hidden) load(); }, 60000);
})();
