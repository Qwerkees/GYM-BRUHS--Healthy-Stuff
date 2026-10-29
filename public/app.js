(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const t = (k) => I18N.t(k);

  let MENU = { categories: [], items: [] };
  let CONFIG = { cardEnabled: false, taxRate: 0, locations: [] };
  let category = 'all';
  let cart = loadCart();

  const params = new URLSearchParams(location.search);
  const presetLoc = params.get('loc');

  function loadCart() {
    try { const c = JSON.parse(localStorage.getItem('gb_cart') || '[]'); return Array.isArray(c) ? c : []; } catch { return []; }
  }
  function saveCart() { localStorage.setItem('gb_cart', JSON.stringify(cart)); }

  function applyStrings() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $('#langBtn').textContent = I18N.lang === 'en' ? 'ES' : 'EN';
    const hero = $('#heroTitle'); if (hero) hero.innerHTML = t('heroTitle'); // string ships with the app, not user input
    document.title = `GYM BRUHS — ${t('tagline')}`;
  }

  function renderShareQr() {
    const img = $('#shareQr'); const sel = $('#loc');
    if (!img || !sel || !sel.value) return;
    img.src = `/api/locations/${encodeURIComponent(sel.value)}/qr.svg`;
  }

  function itemPrice(item, opts) {
    let p = item.price;
    for (const g of item.options) {
      if (g.multi) {
        for (const id of (opts[g.id] || [])) { const c = g.choices.find(x => x.id === id); if (c) p += c.price; }
      } else {
        const c = g.choices.find(x => x.id === (opts[g.id] ?? g.choices[0].id)); if (c) p += c.price;
      }
    }
    return Math.max(0, p);
  }

  function defaultOpts(item) {
    const o = {};
    for (const g of item.options) o[g.id] = g.multi ? [] : g.choices[0].id;
    return o;
  }

  function renderCats() {
    const el = $('#cats');
    el.innerHTML = '';
    const mk = (id, label) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pill' + (category === id ? ' active' : ''); b.textContent = label;
      b.onclick = () => { category = id; renderCats(); renderMenu(); };
      return b;
    };
    el.appendChild(mk('all', t('all')));
    for (const c of MENU.categories) el.appendChild(mk(c.id, `${c.emoji} ${I18N.pick(c)}`));
  }

  function renderMenu() {
    const grid = $('#menu');
    grid.innerHTML = '';
    const items = MENU.items.filter(i => category === 'all' || i.category === category);
    for (const item of items) grid.appendChild(card(item));
  }

  function card(item) {
    const opts = defaultOpts(item);
    let qty = 1;
    const el = document.createElement('article');
    el.className = 'card';
    el.dataset.item = item.id;

    const head = document.createElement('div'); head.className = 'head';
    head.innerHTML = `<div class="emoji">${item.emoji}</div><div><h3></h3><p class="desc"></p></div><div class="price"></div>`;
    $('h3', head).textContent = I18N.pick(item);
    $('.desc', head).textContent = I18N.pick(item, 'desc');
    el.appendChild(head);

    if (item.healthier) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = `✓ ${t('healthier')}`; el.appendChild(b); }

    const m = document.createElement('div'); m.className = 'macros';
    m.innerHTML = [['kcal', item.kcal, ''], ['protein', item.protein, 'g'], ['carbs', item.carbs, 'g'], ['sugar', item.sugar, 'g'], ['fat', item.fat, 'g']]
      .map(([k, v, u]) => `<span><b>${v}${u}</b> ${t(k)}</span>`).join('');
    el.appendChild(m);

    if (item.swap) {
      const target = MENU.items.find(i => i.id === item.swap.to);
      if (target) {
        const s = document.createElement('div'); s.className = 'swap';
        s.innerHTML = `💡 <span></span> <button type="button"></button>`;
        $('span', s).textContent = I18N.pick(item.swap);
        const b = $('button', s); b.textContent = `${t('swapTo')} ${I18N.pick(target)} →`;
        b.onclick = () => { category = target.category; renderCats(); renderMenu(); const c = document.querySelector(`[data-item="${target.id}"]`); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.style.outline = '2px solid var(--warn)'; setTimeout(() => c.style.outline = '', 1600); } };
        el.appendChild(s);
      }
    }

    const priceEl = $('.price', head);
    const refresh = () => { priceEl.textContent = I18N.money(itemPrice(item, opts) * qty); };

    if (item.options.length) {
      const o = document.createElement('div'); o.className = 'opts';
      for (const g of item.options) {
        if (g.multi) {
          const wrap = document.createElement('div');
          wrap.innerHTML = `<label><span></span></label><div class="addons"></div>`;
          $('span', wrap).textContent = I18N.pick(g);
          const box = $('.addons', wrap);
          for (const c of g.choices) {
            const l = document.createElement('label');
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = c.id; cb.name = `${item.id}-${g.id}`;
            cb.onchange = () => { opts[g.id] = [...box.querySelectorAll('input:checked')].map(x => x.value); refresh(); };
            l.appendChild(cb);
            l.appendChild(document.createTextNode(` ${I18N.pick(c)}${c.price ? ' (+' + I18N.money(c.price) + ')' : ''}`));
            box.appendChild(l);
          }
          o.appendChild(wrap);
        } else {
          const l = document.createElement('label');
          const span = document.createElement('span'); span.textContent = I18N.pick(g);
          const sel = document.createElement('select'); sel.name = `${item.id}-${g.id}`; sel.setAttribute('aria-label', I18N.pick(g));
          for (const c of g.choices) {
            const op = document.createElement('option'); op.value = c.id;
            op.textContent = I18N.pick(c) + (c.price > 0 ? ` (+${I18N.money(c.price)})` : c.price < 0 ? ` (−${I18N.money(-c.price)})` : '');
            sel.appendChild(op);
          }
          sel.onchange = () => { opts[g.id] = sel.value; refresh(); };
          l.appendChild(span); l.appendChild(sel); o.appendChild(l);
        }
      }
      el.appendChild(o);
    }

    const row = document.createElement('div'); row.className = 'add-row';
    row.innerHTML = `<div class="qty"><button type="button" aria-label="Less">−</button><output>1</output><button type="button" aria-label="More">+</button></div><button type="button" class="btn flex add"></button>`;
    const [minus, plus] = row.querySelectorAll('.qty button');
    const out = $('output', row); const addBtn = $('.add', row);
    addBtn.textContent = t('add');
    minus.onclick = () => { qty = Math.max(1, qty - 1); out.value = qty; refresh(); };
    plus.onclick = () => { qty = Math.min(20, qty + 1); out.value = qty; refresh(); };
    addBtn.onclick = () => {
      addToCart(item.id, JSON.parse(JSON.stringify(opts)), qty);
      addBtn.textContent = t('added'); addBtn.classList.add('orange');
      setTimeout(() => { addBtn.textContent = t('add'); addBtn.classList.remove('orange'); }, 1200);
    };
    el.appendChild(row);
    refresh();
    return el;
  }

  function addToCart(itemId, options, qty) {
    const key = JSON.stringify(options);
    const existing = cart.find(l => l.itemId === itemId && JSON.stringify(l.options) === key);
    if (existing) existing.qty = Math.min(20, existing.qty + qty); else cart.push({ itemId, options, qty });
    saveCart(); renderCartBar();
  }

  function cartTotals() {
    let sub = 0, n = 0;
    for (const l of cart) { const item = MENU.items.find(i => i.id === l.itemId); if (!item) continue; sub += itemPrice(item, l.options) * l.qty; n += l.qty; }
    const tax = Math.round(sub * CONFIG.taxRate);
    return { sub, tax, total: sub + tax, n };
  }

  function renderCartBar() {
    const { total, n } = cartTotals();
    const bar = $('#cartbar');
    bar.hidden = n === 0; document.body.classList.toggle('has-cart', n > 0);
    $('#cartTotal').textContent = I18N.money(total);
    $('#cartCount').textContent = `${n} ${n === 1 ? t('item') : t('items')}`;
  }

  function describeOptions(item, options) {
    const parts = [];
    for (const g of item.options) {
      if (g.multi) { for (const id of (options[g.id] || [])) { const c = g.choices.find(x => x.id === id); if (c) parts.push(I18N.pick(c).replace(/\s*\(.*\)$/, '')); } }
      else { const c = g.choices.find(x => x.id === options[g.id]); if (c) parts.push(I18N.pick(c).replace(/\s*\(.*\)$/, '')); }
    }
    return parts.join(' · ');
  }

  function renderCart() {
    const box = $('#lines'); box.innerHTML = '';
    if (!cart.length) { box.innerHTML = `<p class="hint">${t('empty')}</p>`; }
    cart.forEach((l, idx) => {
      const item = MENU.items.find(i => i.id === l.itemId); if (!item) return;
      const row = document.createElement('div'); row.className = 'line';
      row.innerHTML = `<div class="t"><b></b><small></small></div><div class="p"></div><button type="button" class="rm"></button>`;
      $('b', row).textContent = `${l.qty}× ${item.emoji} ${I18N.pick(item)}`;
      $('small', row).textContent = describeOptions(item, l.options);
      $('.p', row).textContent = I18N.money(itemPrice(item, l.options) * l.qty);
      const rm = $('.rm', row); rm.textContent = t('remove');
      rm.onclick = () => { cart.splice(idx, 1); saveCart(); renderCart(); renderCartBar(); };
      box.appendChild(row);
    });
    const { sub, tax, total } = cartTotals();
    $('#subtotal').textContent = I18N.money(sub);
    $('#tax').textContent = I18N.money(tax);
    $('#taxRow').style.display = CONFIG.taxRate > 0 ? '' : 'none';
    $('#total').textContent = I18N.money(total);
    $('#placeBtn').disabled = cart.length === 0;
  }

  function setupPayment() {
    const card = $('#payCard'), counter = $('#payCounter');
    const cardInput = $('input', card);
    if (!CONFIG.cardEnabled) { cardInput.disabled = true; card.style.opacity = .5; $('small', card).textContent = t('cardOff'); }
    document.querySelectorAll('#payOpts input').forEach(r => r.addEventListener('change', () => {
      card.classList.toggle('sel', cardInput.checked); counter.classList.toggle('sel', !cardInput.checked);
    }));
  }

  async function placeOrder(ev) {
    ev.preventDefault();
    const err = $('#err'); err.textContent = '';
    const btn = $('#placeBtn'); btn.disabled = true; btn.textContent = t('placing');
    const payment = document.querySelector('#payOpts input:checked').value;
    try {
      const res = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('#name').value, phone: $('#phone').value, location: $('#loc').value, payment, lang: I18N.lang, items: cart }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not place order.');
      cart = []; saveCart();
      location.href = data.checkoutUrl || `/order/${data.code}`;
    } catch (e) {
      err.textContent = e.message; btn.disabled = false; btn.textContent = t('placeOrder');
    }
  }

  function renderAll() { applyStrings(); renderCats(); renderMenu(); renderCartBar(); renderCart(); setupPayment(); }

  async function init() {
    const [menu, config] = await Promise.all([fetch('/api/menu').then(r => r.json()), fetch('/api/config').then(r => r.json())]);
    MENU = menu; CONFIG = config;
    const sel = $('#loc');
    for (const l of config.locations) { const o = document.createElement('option'); o.value = l.slug; o.textContent = l.name; sel.appendChild(o); }
    const remembered = presetLoc || localStorage.getItem('gb_loc');
    if (remembered && config.locations.some(l => l.slug === remembered)) sel.value = remembered;
    sel.onchange = () => { localStorage.setItem('gb_loc', sel.value); renderShareQr(); };
    renderShareQr();

    $('#trackForm').addEventListener('submit', e => {
      e.preventDefault();
      const code = $('#trackCode').value.trim().toUpperCase();
      if (code) location.href = `/order/${encodeURIComponent(code)}`;
    });
    $('#copyLink').onclick = async () => {
      const url = `${location.origin}/?loc=${encodeURIComponent(sel.value)}`;
      const btn = $('#copyLink');
      try { await navigator.clipboard.writeText(url); btn.textContent = t('copied'); }
      catch { prompt('Copy this link:', url); }
      setTimeout(() => { btn.textContent = t('copyLink'); }, 1500);
    };
    if (presetLoc && config.locations.some(l => l.slug === presetLoc)) localStorage.setItem('gb_loc', presetLoc);

    $('#langBtn').onclick = () => { I18N.set(I18N.lang === 'en' ? 'es' : 'en'); renderAll(); };
    $('#openCart').onclick = () => { renderCart(); $('#sheet').classList.add('open'); };
    $('#closeCart').onclick = () => $('#sheet').classList.remove('open');
    $('#sheet').addEventListener('click', e => { if (e.target === $('#sheet')) $('#sheet').classList.remove('open'); });
    $('#checkoutForm').addEventListener('submit', placeOrder);
    renderAll();
  }

  init().catch(err => { $('#menu').innerHTML = `<p class="err">Could not load the menu: ${err.message}</p>`; });
})();
