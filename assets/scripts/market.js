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
  // The logged-in player's bank ({loggedIn, csrfToken, running, accounts}), null until loaded.
  let account = null;
  let accountUuid = null;
  let note = null;
  // Whether the bank's details are unfolded (kept when the page is drawn again).
  let bankOpen = false;
  // What the Buy buttons point at, by "kind:id".
  const buyables = new Map();

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
  function group(id, summaryHtml, bodyHtml, open = true) {
    return `
      <details class="profile-group" id="market-group-${id}" ${open ? 'open' : ''}>
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
        ${buyRow(l)}
      </div></article>`;
  }

  // ── The bank and buying ──────────────────────────────────────────────────

  function me() {
    return account?.accounts?.find((a) => a.uuid === accountUuid) || null;
  }

  /** The Buy controls under a card: how many (when more than one can be bought) and the button. */
  function buyRow(o) {
    const a = me();
    if (!a || !account.running || !o.id) return '';
    buyables.set(`${o.kind}:${o.id}`, o);
    const key = esc(`${o.kind}:${o.id}`);
    const balance = Number(a.balance || 0);
    let max = 64;
    let unit = '';
    if (o.kind === 'listing') {
      if (o.seller === a.name) return '<p class="market-buy__note">Your listing</p>';
      max = Math.floor(o.amount / o.per);
      unit = o.per > 1 ? `lots of ${o.per}` : '';
    } else if (o.kind === 'pet') {
      if ((a.pets || []).includes(o.id)) return '<p class="market-buy__note">You have this pet</p>';
      max = 1;
    } else if (o.kind === 'command' && o.perPlayer) {
      max = Math.min(64, o.perPlayer - Number((a.commandsBought || {})[o.id] || 0));
      if (max <= 0) return '<p class="market-buy__note">You\'ve bought as many as you can</p>';
    }
    const afford = o.price > 0 ? Math.floor(balance / o.price) : max;
    const can = Math.min(max, afford);
    const amount = max > 1 ? `<label class="market-buy__amount"><span class="sr-only">How many${unit ? ` (${esc(unit)})` : ''}</span>
        <input type="number" min="1" max="${Math.max(1, can)}" value="1" inputmode="numeric" data-amount="${key}" ${can < 1 ? 'disabled' : ''}>${unit ? `<small>${esc(unit)}</small>` : ''}</label>` : '';
    return `<div class="market-buy">${amount}<button type="button" class="market-buy__btn" data-buy="${key}" ${can < 1 ? 'disabled title="Not enough in your bank"' : ''}>
      <i class="bi bi-bag-check" aria-hidden="true"></i> Buy</button></div>`;
  }

  /** The bank above the listings: one line with the balance (and anything waiting), unfolding to recent trades. */
  function bankCard() {
    if (!account) return '';
    const title = '<span class="profile-group__title"><i class="bi bi-bank"></i> Your Bank</span>';
    // Nothing to unfold: just the title and why there's no balance.
    const bar = (text) => `<div class="profile-group market-bank-bar" id="market-group-bank">${title}<span class="market-bank-bar__text">${text}</span></div>`;
    if (!account.loggedIn) {
      const login = `/translate/auth/login.php?return_to=${encodeURIComponent(window.location.pathname)}`;
      return bar(`<a href="${esc(login)}"><i class="bi bi-discord"></i> Log in with Discord</a> to see your bank and buy here with it.`);
    }
    if (account.error) return bar(esc(account.error));
    if (!account.accounts.length) return bar('Your Discord account isn\'t linked to a player on the server yet. Join the server once to link it.');

    const a = me();
    const parcels = (a.parcels || []).length;
    const orders = (a.orders || []).length;
    const waiting = parcels + orders;
    const summary = `${title}${account.accounts.length > 1 ? '' : `<span class="market-bank__name">${esc(a.name)}</span>`}
      <span class="market-bank__balance">${price(Number(a.balance || 0), 0)}</span>
      ${waiting ? `<span class="profile-count-badge market-bank__flag" title="Waiting in your mailbox in game"><i class="bi bi-mailbox" aria-hidden="true"></i> ${waiting}</span>` : ''}
      ${account.running ? '' : '<span class="profile-count-badge market-bank__flag market-bank__flag--offline" title="Buying works while the server runs"><i class="bi bi-power" aria-hidden="true"></i> Server offline</span>'}`;

    const pick = account.accounts.length > 1 ? `<label class="market-bank__pick">Player <select id="market-account">${account.accounts.map((x) =>
      `<option value="${esc(x.uuid)}" ${x.uuid === accountUuid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : '';
    const mail = waiting ? `<p class="market-bank__mail"><i class="bi bi-mailbox" aria-hidden="true"></i> Waiting in your mailbox in game (/market → Mailbox):
        ${[parcels ? `${parcels} ${parcels === 1 ? 'parcel' : 'parcels'}` : '', orders ? `${orders} ${orders === 1 ? 'purchase' : 'purchases'} to claim` : ''].filter(Boolean).join(' and ')}</p>` : '';
    const trades = (a.sales || []).slice(0, 5).map((x) => `<li><span class="market-bank__${x.role}">${x.role === 'bought' ? 'Bought' : 'Sold'}</span>
        ${x.amount > 1 ? `${Number(x.amount).toLocaleString()} × ` : ''}${mcHtml(x.name)} · ${price(x.total, 0)} · ${x.role === 'bought' ? 'from' : 'to'} ${esc(x.other || '')}
        <small>${esc(new Date(x.time).toLocaleDateString(undefined, { dateStyle: 'medium' }))}</small></li>`).join('');
    const body = `<div class="market-bank">
        ${note ? `<p class="market-bank__note ${note.error ? 'is-error' : ''}" role="status">${esc(note.text)}</p>` : ''}
        ${pick}
        ${mail}
        ${trades ? `<ul class="market-bank__trades">${trades}</ul>` : '<p class="market-bank__hint">No trades yet.</p>'}
        <p class="market-bank__hint">Deposit and withdraw in game with /market → Bank. Bought items wait in your mailbox there; command purchases run when you claim them.</p>
      </div>`;
    // A purchase's result unfolds it, so the message is seen.
    return group('bank', summary, body, bankOpen || !!note || account.accounts.length > 1);
  }

  async function loadAccount() {
    try {
      const res = await fetch('/api/market-account.php', { cache: 'no-store' });
      const json = await res.json();
      account = json.loggedIn ? { loggedIn: true, accounts: [], ...json } : { loggedIn: false };
      if (json.error) account.error = typeof json.error === 'string' ? json.error : json.message;
      if (account.accounts?.length && !account.accounts.some((a) => a.uuid === accountUuid)) accountUuid = account.accounts[0].uuid;
    } catch {
      account = null;
    }
    render();
  }

  async function buy(key) {
    const o = buyables.get(key);
    const a = me();
    if (!o || !a) return;
    const input = groups.querySelector(`[data-amount="${CSS.escape(key)}"]`);
    const amount = input ? Math.max(1, Math.floor(Number(input.value) || 1)) : 1;
    const name = mcPlain(o.name);
    const what = o.kind === 'listing' ? `${(amount * o.per).toLocaleString()} × ${name}` : amount > 1 ? `${amount} × ${name}` : name;
    const total = amount * o.price;
    if (!window.confirm(`Buy ${what} for ${total.toLocaleString()} ${currencyName(total)} from ${a.name}'s bank?`)) return;
    groups.querySelectorAll('[data-buy]').forEach((b) => { b.disabled = true; });
    try {
      const res = await fetch('/api/market-buy.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': account.csrfToken || '' },
        body: JSON.stringify({ uuid: a.uuid, kind: o.kind, id: o.id, amount, price: o.price, per: o.per || 1 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.message || 'That didn\'t work. Try again in a moment.');
      note = { text: json.message };
    } catch (err) {
      note = { text: err.message, error: true };
    }
    await Promise.all([load(), loadAccount()]);
    document.getElementById('market-group-bank')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    buyables.clear();
    out.push(bankCard());
    out.push(group('players', `<span class="profile-group__title"><i class="bi bi-bag"></i> From Players</span><span class="profile-count-badge">${listings.length}</span>`,
      listings.length ? `<div class="profile-market-grid">${listings.map(listingCard).join('')}</div>`
        : `<p class="profile-empty-note">${data.listings.length ? 'Nothing matches.' : 'Nothing for sale right now. Type /market in game to sell something.'}</p>`));
    if (data.server.length || data.pets.length) {
      const cards = server.map((o) => `<article class="profile-market-card">${icon(o.icon, 'bi-shop')}
          <div class="profile-market-card__body"><h3>${esc(o.name)}</h3>
            ${o.description ? `<p class="profile-market-card__extra">${esc(o.description)}</p>` : ''}
            <p class="profile-market-card__price">${price(o.price, 0)}<span class="profile-market-card__left">${o.perPlayer ? ` · up to ${o.perPlayer} per player` : ''}${until(o.until)}</span></p>
            ${buyRow(o)}</div></article>`)
        .concat(pets.map((p) => `<article class="profile-market-card">${icon(p.icon, 'bi-emoji-smile')}
          <div class="profile-market-card__body"><h3>${esc(p.name)} <span class="profile-market-card__amount">Pet</span></h3>
            ${p.description ? `<p class="profile-market-card__extra">${esc(p.description)}</p>` : ''}
            ${perks(p.perks)}
            <p class="profile-market-card__price">${price(p.price, 0)}<span class="profile-market-card__left">${p.left > 0 ? ` · ${p.left} left` : ''}${until(p.until)}</span></p>
            ${buyRow(p)}</div></article>`));
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

  groups.addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]');
    if (b && !b.disabled) buy(b.dataset.buy);
  });
  groups.addEventListener('toggle', (e) => {
    if (e.target.id !== 'market-group-bank') return;
    bankOpen = e.target.open;
    // Folding it away dismisses a purchase's message too.
    if (!bankOpen) note = null;
  }, true);
  groups.addEventListener('change', (e) => {
    if (e.target.id !== 'market-account') return;
    accountUuid = e.target.value;
    note = null;
    render();
  });
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
  loadAccount();
  // Keeps up while the page stays open.
  setInterval(() => {
    // Not while someone types how many to buy (the cards are drawn again).
    if (!document.hidden && !document.activeElement?.matches('[data-amount]')) { load(); loadAccount(); }
  }, 60000);
})();
