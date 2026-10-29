(function () {
  const $ = (s) => document.querySelector(s);
  const t = (k) => I18N.t(k);
  const code = location.pathname.split('/').pop().toUpperCase();
  const params = new URLSearchParams(location.search);
  let MENU = null, CONFIG = null, ORDER = null, timer = null;

  function applyStrings() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $('#langBtn').textContent = I18N.lang === 'en' ? 'ES' : 'EN';
  }

  function nameOf(itemId) { const i = MENU.items.find(x => x.id === itemId); return i ? `${i.emoji} ${I18N.pick(i)}` : itemId; }
  function optText(itemId, options) {
    const item = MENU.items.find(x => x.id === itemId); if (!item) return '';
    const parts = [];
    for (const g of item.options) {
      const ids = g.multi ? (options[g.id] || []) : [options[g.id]];
      for (const id of ids) { const c = g.choices.find(x => x.id === id); if (c) parts.push(I18N.pick(c).replace(/\s*\(.*\)$/, '')); }
    }
    return parts.join(' · ');
  }

  function render() {
    applyStrings();
    const o = ORDER;
    const loc = CONFIG.locations.find(l => l.slug === o.location);
    $('#forLine').textContent = `${t('orderFor')} ${o.name} · ${loc ? loc.name : o.location}`;
    $('#code').textContent = o.code;
    $('#qr').innerHTML = `<img alt="QR ${o.code}" src="/api/orders/${o.code}/qr.svg?v=${Date.now()}">`;
    const st = $('#status'); st.className = `status ${o.status}`; st.textContent = t(o.status);
    const stepIdx = { awaiting_payment: 0, paid: 1, ready: 2, picked_up: 3, cancelled: -1 }[o.status];
    [...$('#steps').children].forEach((s, i) => s.classList.toggle('on', i < stepIdx));
    $('#msg').textContent = o.status === 'awaiting_payment' && o.paymentMethod === 'counter' ? t('payAtCounter') : o.status === 'paid' || o.status === 'ready' ? t('showThis') : '';
    $('#items').innerHTML = o.items.map(l => `<div class="line" style="border-color:#eee"><div class="t"><b>${l.qty}× ${nameOf(l.itemId)}</b><small style="color:#4a556e">${optText(l.itemId, l.options)}</small></div><div class="p">${I18N.money(l.lineCents)}</div></div>`).join('');
    $('#totals').textContent = `${t('total')}: ${I18N.money(o.totalCents)}`;

    const pay = $('#payBox'); pay.innerHTML = '';
    if (o.status === 'awaiting_payment' && o.paymentMethod === 'card') {
      if (params.get('cancelled')) { const p = document.createElement('p'); p.className = 'hint'; p.style.color = '#b31a1a'; p.textContent = t('paymentCancelled'); pay.appendChild(p); }
      if (CONFIG.demoPayments) {
        const b = document.createElement('button'); b.className = 'btn block'; b.id = 'demoPay'; b.textContent = t('demoPay');
        b.onclick = () => confirm('demo');
        pay.appendChild(b);
      }
    }
  }

  async function load() {
    const r = await fetch(`/api/orders/${code}`);
    if (!r.ok) { $('#err').textContent = (await r.json()).error || 'Not found'; return; }
    ORDER = await r.json();
    render();
    if (['awaiting_payment', 'paid', 'ready'].includes(ORDER.status)) { clearTimeout(timer); timer = setTimeout(load, 5000); }
  }

  async function confirm(sessionId) {
    $('#msg').textContent = t('confirming');
    const r = await fetch(`/api/orders/${code}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
    if (r.ok) { ORDER = await r.json(); render(); } else { $('#err').textContent = (await r.json()).error || 'Could not confirm'; }
    history.replaceState(null, '', location.pathname);
  }

  async function init() {
    [MENU, CONFIG] = await Promise.all([fetch('/api/menu').then(r => r.json()), fetch('/api/config').then(r => r.json())]);
    $('#langBtn').onclick = () => { I18N.set(I18N.lang === 'en' ? 'es' : 'en'); if (ORDER) render(); };
    await load();
    const sid = params.get('session_id');
    if (sid && ORDER && ORDER.status === 'awaiting_payment') await confirm(sid);
  }
  init().catch(e => { $('#err').textContent = e.message; });
})();
