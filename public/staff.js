(function () {
  const $ = (s) => document.querySelector(s);
  let MENU = null, ORDERS = [], filter = 'active', timer = null, stream = null;
  const params = new URLSearchParams(location.search);

  const LABEL = { awaiting_payment: 'Unpaid', paid: 'Paid', ready: 'Ready', picked_up: 'Picked up', cancelled: 'Cancelled' };
  const NEXT = {
    awaiting_payment: [['paid', 'Mark paid', 'btn'], ['cancelled', 'Cancel', 'btn ghost']],
    paid: [['ready', 'Ready', 'btn'], ['picked_up', 'Picked up', 'btn orange'], ['cancelled', 'Cancel', 'btn ghost']],
    ready: [['picked_up', 'Picked up', 'btn orange'], ['cancelled', 'Cancel', 'btn ghost']],
    picked_up: [], cancelled: [],
  };

  async function api(path, opts) {
    const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (r.status === 401 && !path.endsWith('/login')) { showLogin(); throw new Error('Signed out'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  }

  function showLogin() { $('#login').hidden = false; $('#board').hidden = true; $('#logout').hidden = true; clearTimeout(timer); }
  function showBoard() { $('#login').hidden = true; $('#board').hidden = false; $('#logout').hidden = false; }

  function nameOf(id) { const i = MENU.items.find(x => x.id === id); return i ? `${i.emoji} ${i.en}` : id; }
  function optText(itemId, options) {
    const item = MENU.items.find(x => x.id === itemId); if (!item) return '';
    const parts = [];
    for (const g of item.options) {
      const ids = g.multi ? (options[g.id] || []) : [options[g.id]];
      for (const id of ids) { const c = g.choices.find(x => x.id === id); if (c) parts.push(c.en.replace(/\s*\(.*\)$/, '')); }
    }
    return parts.length ? ` (${parts.join(', ')})` : '';
  }

  function orderCard(o, big) {
    const el = document.createElement('div'); el.className = 'card order-row';
    const when = new Date(o.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    el.innerHTML = `<div class="top"><span class="c"></span><span class="who"></span><span class="st ${o.status}">${LABEL[o.status]}</span></div>
      <div class="items"></div><div class="hint"></div><div class="acts"></div>`;
    el.querySelector('.c').textContent = o.code;
    el.querySelector('.who').textContent = `${o.name}${o.phone ? ' · ' + o.phone : ''} · ${when}`;
    el.querySelector('.items').innerHTML = o.items.map(l => `<div>${l.qty}× ${nameOf(l.itemId)}${optText(l.itemId, l.options)}</div>`).join('');
    el.querySelector('.hint').textContent = `${I18N.money(o.totalCents)} · ${o.paymentMethod === 'card' ? 'Card' : 'Pay at counter'} · ${o.location}`;
    const acts = el.querySelector('.acts');
    for (const [status, label, cls] of NEXT[o.status]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label;
      b.onclick = async () => {
        b.disabled = true;
        try { await api(`/api/staff/orders/${o.code}/status`, { method: 'POST', body: JSON.stringify({ status }) }); await refresh(); if (big) lookup(o.code); }
        catch (e) { $('#lookupErr').textContent = e.message; b.disabled = false; }
      };
      acts.appendChild(b);
    }
    if (big) el.style.borderColor = 'var(--lime)';
    return el;
  }

  function renderFilters() {
    const f = $('#filters'); f.innerHTML = '';
    for (const [id, label] of [['active', 'Active'], ['awaiting_payment', 'Unpaid'], ['paid', 'Paid'], ['ready', 'Ready'], ['done', 'Done']]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pill' + (filter === id ? ' active' : ''); b.textContent = label;
      b.onclick = () => { filter = id; renderFilters(); renderList(); };
      f.appendChild(b);
    }
  }
  function renderList() {
    const list = $('#list'); list.innerHTML = '';
    const rows = ORDERS.filter(o => filter === 'active' ? ['awaiting_payment', 'paid', 'ready'].includes(o.status) : filter === 'done' ? ['picked_up', 'cancelled'].includes(o.status) : o.status === filter);
    if (!rows.length) list.innerHTML = '<p class="hint">Nothing here.</p>';
    for (const o of rows) list.appendChild(orderCard(o, false));
  }

  async function refresh() {
    const data = await api('/api/staff/orders');
    ORDERS = data.orders; renderList();
    clearTimeout(timer); timer = setTimeout(() => refresh().catch(() => {}), 8000);
  }

  async function lookup(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    $('#lookupErr').textContent = ''; $('#found').innerHTML = '';
    if (code.length !== 6) { $('#lookupErr').textContent = 'Codes are 6 characters.'; return; }
    try { const o = await api(`/api/staff/orders/${code}`); $('#found').appendChild(orderCard(o, true)); $('#codeInput').value = code; }
    catch (e) { $('#lookupErr').textContent = e.message; }
  }

  async function startScan() {
    if (!('BarcodeDetector' in window)) { $('#lookupErr').textContent = 'This browser cannot scan QR codes. Type the code instead, or scan with the phone camera app.'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch { $('#lookupErr').textContent = 'Camera not available.'; return; }
    const video = $('#video'); video.srcObject = stream; await video.play(); $('#scanner').hidden = false;
    const det = new BarcodeDetector({ formats: ['qr_code'] });
    const tick = async () => {
      if (!stream) return;
      try {
        const codes = await det.detect(video);
        for (const c of codes) {
          const m = /[?&]code=([A-Z0-9]{6})/i.exec(c.rawValue) || /^([A-Z0-9]{6})$/i.exec(c.rawValue);
          if (m) { stopScan(); lookup(m[1]); return; }
        }
      } catch { /* keep scanning */ }
      requestAnimationFrame(tick);
    };
    tick();
  }
  function stopScan() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } $('#scanner').hidden = true; }

  async function init() {
    MENU = await fetch('/api/menu').then(r => r.json());
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault(); $('#loginErr').textContent = '';
      try { await api('/api/staff/login', { method: 'POST', body: JSON.stringify({ pin: $('#pin').value }) }); $('#pin').value = ''; showBoard(); renderFilters(); await refresh(); if (params.get('code')) lookup(params.get('code')); }
      catch (err) { $('#loginErr').textContent = err.message; }
    });
    $('#logout').onclick = async () => { await fetch('/api/staff/logout', { method: 'POST' }); showLogin(); };
    $('#lookupForm').addEventListener('submit', (e) => { e.preventDefault(); lookup($('#codeInput').value); });
    $('#scanBtn').onclick = startScan; $('#stopScan').onclick = stopScan;

    try { await api('/api/staff/me'); showBoard(); renderFilters(); await refresh(); if (params.get('code')) lookup(params.get('code')); }
    catch { showLogin(); }
  }
  init();
})();
