fetch('/api/config').then(r => r.json()).then(c => {
  const g = document.getElementById('grid');
  for (const l of c.locations) {
    const d = document.createElement('div'); d.className = 'print-card';
    d.innerHTML = `<div style="font-size:28px;font-weight:900">💪 GYM BRUHS</div><div style="letter-spacing:3px;font-size:12px">HEALTHY STUFF</div>
      <img alt="QR for ${l.name}" src="/api/locations/${encodeURIComponent(l.slug)}/qr.svg"><h2></h2>
      <p style="margin:6px 0 0">Scan · Pick · Pay on your phone · Grab it here</p>`;
    d.querySelector('h2').textContent = l.name;
    g.appendChild(d);
  }
});
