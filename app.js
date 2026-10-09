(function () {
  'use strict';
  const HOME = 'https://cloud.uislab.com/ords/f?p=2900:101';
  const $ = (s) => document.querySelector(s);
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const COLORS = {
    'Зареєстрована': '#1E88E5', 'В роботі': '#43A047', 'Пріоритет': '#E53935', 'В черзі': '#FB8C00',
    'Прибув на локацію': '#8E24AA', 'Завершена': '#2E7D32', 'Відмінена': '#757575',
    'Дублювання заявки': '#757575', 'Тест клієнта': '#00897B', 'Сканер з ремонту': '#6D4C41', 'Сканер на ремонт': '#6D4C41'
  };
  const color = (s) => COLORS[s] || '#607D8B';
  const norm = (n) => String(n || '').replace(/\D/g, '').replace(/^0+/, '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- стан
  let dark = ls.get('dark', '1') === '1';
    let apiUrl = ls.get('api_url', '');
  let data = null;
  try { data = JSON.parse(ls.get('cache', 'null')); } catch (e) { data = null; }
  let stars = new Set();
  const F = { st: '', od: false, pr: '', ex: '', ob: '', sort: 0, star: 0, q: '' };

  // ---------------------------------------------------------------- вкладки
  function showTab(name) {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    ['tickets', 'stats', 'sla'].forEach((t) => { $('#page-' + t).hidden = t !== name; });
    ls.set('tab', name);
  }
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ---------------------------------------------------------------- тема
  function applyDark() {
    document.body.classList.toggle('dark', dark);
    $('#b-theme').textContent = dark ? '☀' : '🌙';
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#1A1A1A' : '#FFFFFF';
  }
  $('#b-theme').addEventListener('click', () => { dark = !dark; ls.set('dark', dark ? '1' : '0'); applyDark(); });
  $('#b-site').addEventListener('click', () => window.open(HOME, '_blank'));

  // ---------------------------------------------------------------- модальне вікно
  function modal(html, onMount) {
    $('#modal-box').innerHTML = html;
    $('#modal').hidden = false;
    if (onMount) onMount($('#modal-box'));
  }
  function closeModal() { $('#modal').hidden = true; }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  $('#b-api').addEventListener('click', askApi);
  document.addEventListener('click', (e) => { if (e.target && e.target.id === 'setup-api') askApi(); });
  function askApi() {
    modal('<h2>Посилання на дані</h2><div class="sub" style="margin-bottom:8px">Вставте посилання з Google Apps Script (разом з ?token=…)</div>' +
      '<input type="text" id="api-in" placeholder="https://script.google.com/macros/s/…/exec?token=…" value="' + esc(apiUrl) + '">' +
      '<div class="row"><button id="api-cancel">Скасувати</button><button id="api-ok" style="background:var(--red);color:#fff;border-color:var(--red)">Зберегти</button></div>',
      (box) => {
        box.querySelector('#api-cancel').onclick = closeModal;
        box.querySelector('#api-ok').onclick = () => {
          apiUrl = box.querySelector('#api-in').value.trim();
          ls.set('api_url', apiUrl); closeModal(); refresh();
        };
        box.querySelector('#api-in').focus();
      });
  }

  // ---------------------------------------------------------------- дані
  function parseTs(s) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s || '');
    if (!m) return 0;
    return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  }
  function ago(ts) {
    if (ts <= 0) return '';
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'щойно';
    if (m < 60) return m + ' хв тому';
    if (m < 1440) return Math.floor(m / 60) + ' год тому';
    return Math.floor(m / 1440) + ' дн. тому';
  }
  async function refresh() {
    if (!apiUrl) { renderAll(); return; }
    $('#upd').textContent = 'оновлення…';
    let r;
    try { const resp = await fetch(apiUrl, { cache: 'no-store' }); r = { ok: resp.ok, text: await resp.text() }; }
    catch (e) { r = { ok: false }; }
    if (r.ok) {
      try {
        const d = JSON.parse(r.text);
        if (d && d.tickets) { data = d; ls.set('cache', r.text); }
        else $('#upd').textContent = 'помилка даних';
      } catch (e) { $('#upd').textContent = 'помилка даних'; }
    } else $('#upd').textContent = 'немає зв\'язку';
    renderAll();
  }
  $('#b-refresh').addEventListener('click', refresh);

  // ---------------------------------------------------------------- заявки
  function setupBlock(title, text) {
    return '<div class="empty"><h2>' + esc(title) + '</h2>' + esc(text) +
      '<br><br><button id="setup-api">⚙ Вказати посилання на дані</button></div>';
  }
  function counts(key) {
    const m = {};
    (data.tickets || []).forEach((t) => { if (t[key]) m[t[key]] = (m[t[key]] || 0) + 1; });
    return m;
  }
  function renderTicketsToolbar() {
    const all = data.tickets || [];
    const chip = (txt, on, id) => '<span class="chip' + (on ? ' on' : '') + '" data-a="' + id + '">' + esc(txt) + '</span>';
    let h = chip('Усі (' + all.length + ')', !F.st && !F.od, 'st:');
    ['Зареєстрована', 'В роботі', 'Пріоритет', 'В черзі', 'Прибув на локацію'].forEach((s) => {
      const n = all.filter((t) => t.s === s).length;
      if (n || F.st === s) h += chip(s + ' ' + n, F.st === s, 'st:' + s);
    });
    h += chip('⏰ Зависли ' + all.filter((t) => t.od).length, F.od, 'od');
    $('#st-chips').innerHTML = h;

    $('#pr-chips').innerHTML = chip('Обидва проєкти', !F.pr, 'pr:') + chip('Основний (УП)', F.pr === 'main', 'pr:main') + chip('Пілотний', F.pr === 'pilot', 'pr:pilot');

    const sel = (id, label, key) => {
      const c = counts(key);
      return '<select id="' + id + '" class="chip" style="padding:5px 8px"><option value="">' + label + '</option>' +
        Object.keys(c).sort().map((k) => '<option value="' + esc(k) + '"' + (F[id === 'f-ex' ? 'ex' : 'ob'] === k ? ' selected' : '') + '>' + esc(k) + ' (' + c[k] + ')</option>').join('') + '</select>';
    };
    const sorts = ['↕ За зміною', '↕ Старіші зміни', '↕ Нові за створенням'];
    const stars = ['★ Позначки', '★ Переглянуті', '☆ Нові'];
    let e = sel('f-ex', '👤 Усі виконавці', 'e') + sel('f-ob', '📍 Усі області', 'o');
    e += chip(sorts[F.sort], F.sort !== 0, 'sort') + chip(stars[F.star], F.star !== 0, 'star');
    if (F.st || F.od || F.pr || F.ex || F.ob || F.sort || F.star || F.q) e += chip('✕ Скинути', false, 'reset');
    $('#ex-chips').innerHTML = e;
  }
  function filtered() {
    const all = data.tickets || [];
    const q = F.q.toLowerCase();
    let r = all.filter((t) => {
      const is = stars.has(norm(t.n));
      if (F.star === 1 && !is) return false;
      if (F.star === 2 && is) return false;
      if (F.st && F.st !== t.s) return false;
      if (F.od && !t.od) return false;
      if (F.pr && F.pr !== t.p) return false;
      if (F.ex && F.ex !== t.e) return false;
      if (F.ob && F.ob !== t.o) return false;
      if (q && (t.n + ' ' + t.o + ' ' + t.e + ' ' + t.c).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (F.sort === 1) r.sort((a, b) => parseTs(a.l) - parseTs(b.l));
    else if (F.sort === 2) r.sort((a, b) => parseTs(b.cr) - parseTs(a.cr));
    return r;
  }
  function renderTickets() {
    if (!data) { $('#list').innerHTML = setupBlock('Даних ще немає', 'Вкажіть посилання на дані (кнопка ⚙ вгорі), і тут з\'являться заявки.'); $('#count').textContent = ''; $('#st-chips').innerHTML = $('#pr-chips').innerHTML = $('#ex-chips').innerHTML = ''; return; }
    renderTicketsToolbar();
    const rows = filtered();
    $('#count').textContent = 'Показано ' + rows.length + ' з ' + (data.tickets || []).length;
    $('#list').innerHTML = rows.map((t) => {
      const on = stars.has(norm(t.n));
      const ts = parseTs(t.l);
      return '<div class="tk' + (on ? ' starred' : '') + '" data-n="' + esc(t.n) + '">' +
        '<div class="stripe" style="background:' + (t.od ? '#E63838' : color(t.s)) + '"></div>' +
        '<div class="body"><div class="n">№ ' + esc(t.n) + ' · ' + esc(t.o) + '</div>' +
        '<div class="st" style="color:' + color(t.s) + '">' + esc(t.s) + (t.od ? ' ⏰' : '') + '</div>' +
        '<div>👤 ' + (t.e ? esc(t.e) : '— без виконавця —') + '</div>' +
        (t.ix ? '<div>🏤 Відділення ' + esc(t.ix) + '</div>' : '') +
        (t.c ? '<div class="c">' + esc(t.c) + '</div>' : '') +
        '<div class="c">змінено: ' + esc(t.l) + (ts > 0 ? ' (' + ago(ts) + ')' : '') + '</div></div>' +
        '<div class="star" data-star="' + esc(norm(t.n)) + '">' + (on ? '★' : '☆') + '</div></div>';
    }).join('') || '<div class="empty">Нічого не знайдено</div>';
  }
  function openOnSite(num) {
    try { navigator.clipboard.writeText(num); } catch (e) {}
    window.open(HOME, '_blank');
  }
  function showTicket(n) {
    const t = (data.tickets || []).find((x) => x.n === n);
    if (!t) return;
    const kv = (k, v) => '<div class="kv"><span class="sub">' + k + '</span><b>' + esc(v || '—') + '</b></div>';
    modal('<h2>Заявка № ' + esc(t.n) + '</h2>' + kv('Статус', t.s) + kv('Область', t.o) + kv('Відділення', t.ix) + kv('Виконавець', t.e) +
      kv('Проєкт', t.p === 'main' ? 'Основний (УП)' : 'Пілотний') + kv('Створено', t.cr) + kv('Остання зміна', t.l) +
      (t.c ? '<p style="overflow-wrap:anywhere">' + esc(t.c) + '</p>' : '') +
      '<div class="row"><button id="m-copy">Копіювати №</button><button id="m-close">Закрити</button>' +
      '<button id="m-site" style="background:var(--red);color:#fff;border-color:var(--red)">Відкрити сайт</button></div>',
      (box) => {
        box.querySelector('#m-close').onclick = closeModal;
        box.querySelector('#m-copy').onclick = () => { navigator.clipboard.writeText(t.n).catch(() => {}); closeModal(); };
        box.querySelector('#m-site').onclick = () => { closeModal(); openOnSite(norm(t.n)); };
      });
  }
  $('#list').addEventListener('click', (e) => {
    const s = e.target.closest('.star');
    if (s) { const n = s.dataset.star; if (stars.has(n)) stars.delete(n); else stars.add(n); ls.set('stars', JSON.stringify([...stars])); renderTickets(); e.stopPropagation(); return; }
    const c = e.target.closest('.tk');
    if (c) showTicket(c.dataset.n);
  });
  $('#q').addEventListener('input', (e) => { F.q = e.target.value; renderTickets(); });
  document.querySelector('.toolbar').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c || !c.dataset.a) return;
    const a = c.dataset.a;
    if (a.startsWith('st:')) { F.st = a.slice(3); F.od = false; }
    else if (a === 'od') { F.od = !F.od; if (F.od) F.st = ''; }
    else if (a.startsWith('pr:')) F.pr = a.slice(3);
    else if (a === 'sort') F.sort = (F.sort + 1) % 3;
    else if (a === 'star') F.star = (F.star + 1) % 3;
    else if (a === 'reset') { Object.assign(F, { st: '', od: false, pr: '', ex: '', ob: '', sort: 0, star: 0, q: '' }); $('#q').value = ''; }
    renderTickets();
  });
  document.querySelector('.toolbar').addEventListener('change', (e) => {
    if (e.target.id === 'f-ex') F.ex = e.target.value;
    if (e.target.id === 'f-ob') F.ob = e.target.value;
    renderTickets();
  });

  // ---------------------------------------------------------------- статистика
  function renderStats() {
    const box = $('#stats');
    if (!data) { box.innerHTML = setupBlock('Даних ще немає', 'Вкажіть посилання на дані (кнопка ⚙ вгорі).'); return; }
    const kv = (k, v, c) => '<div class="kv"><span' + (c ? ' style="color:' + c + '"' : '') + '>' + esc(k) + '</span><b>' + esc(v) + '</b></div>';
    let h = '';
    try {
      const st = data.stats, order = st.order || [];
      [['main', 'Основний проєкт (УП)'], ['pilot', 'Пілотний проєкт']].forEach((p) => {
        let tot = 0, rows = '';
        order.forEach((s) => { const n = (st[p[0]] || {})[s] || 0; tot += n; rows += kv('● ' + s, n, color(s)); });
        h += '<div class="card"><h3>' + p[1] + '</h3>' + rows + kv('Всього', tot) + '</div>';
      });
      const w = data.week || {};
      h += '<div class="card"><h3>За тиждень (з ' + esc(w.start) + ')</h3>' + kv('Закрито', w.closed, '#2E7D32') + kv('Скасовано', w.cancelled, '#C62828') + kv('Зареєстровано', w.registered, '#1565C0') + '</div>';
      if ((data.eff || []).length) {
        h += '<div class="card"><h3>Ефективність виконавців</h3><div class="sub">середній час закриття · заявок за тиждень · SLA за 30 днів</div>' +
          data.eff.map((e) => kv(e.name, e.avg + '  ·  ' + e.week) + ((e.sla_ok != null || e.sla_bad != null) ? '<div class="sub" style="text-align:right;margin:-4px 0 6px">SLA: <span style="color:#2E7D32">✓ ' + (e.sla_ok || 0) + '</span> · <span style="color:#C62828">✗ ' + (e.sla_bad || 0) + '</span> · <b>' + (e.sla_pct != null ? e.sla_pct + '%' : '—') + '</b> (30 дн.)</div>' : '')).join('') + '</div>';
      }
    } catch (e) { h = '<div class="empty">Помилка відображення: ' + esc(e.message) + '</div>'; }
    box.innerHTML = h;
  }

  function renderAll() {
    renderTickets(); renderStats(); if (window.UisSLA) UisSLA.render(data);
    if (data && data.updated_at) $('#upd').textContent = 'дані: ' + data.updated_at;
    else if (!apiUrl) $('#upd').textContent = '';
  }

  // ---------------------------------------------------------------- старт
  if (window.UisSLA) {
    UisSLA.init({
      root: $('#page-sla'),
      call: async (payload) => {
        if (!apiUrl) return { error: 'no api url' };
        try {
          const r = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
          return await r.json();
        } catch (e) { return { error: 'network' }; }
      },
      onSaved: () => { try { ls.set('cache', JSON.stringify(data)); } catch (e) {} }
    });
  }
  try { stars = new Set(JSON.parse(ls.get('stars', '[]'))); } catch (e) { stars = new Set(); }
  applyDark();
  showTab(['stats', 'sla'].indexOf(ls.get('tab', 'tickets')) >= 0 ? ls.get('tab', 'tickets') : 'tickets');
  renderAll();
  if (!ls.get('asked_url', '') && !apiUrl) { ls.set('asked_url', '1'); askApi(); }
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
