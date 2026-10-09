/* MyUIS -- вкладка SLA (спільний модуль для ПК і iPhone).
 * Підключення:  UisSLA.init({ root: element, post: async (obj) => true/false });
 *               UisSLA.render(data);   // data = JSON знімка з Apps Script
 * Початок відліку SLA -- час реєстрації заявки (data.tickets[].cr),
 * кінець -- статус "Прибув на локацію" (data.arr[].ar, веде монітор).
 * Час рахується у робочих годинах: пн-пт, 10:00-19:00 (як у моніторі). */
(function () {
  'use strict';
  var WS = 10, WE = 19, ARR = 'Прибув на локацію', DONE_DAYS = 30;
  var OK = '#43A047', WARN = '#FB8C00', BAD = '#E53935';
  var root = null, opts = {}, data = null, view = 'open', gsel = '', pw = '';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function cn(s) { return String(s || '').toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/g, ' ').trim(); }
  function nn(s) { return String(s || '').replace(/\D/g, '').replace(/^0+/, ''); }
  function parseTs(s) {
    var m = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s || '');
    return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : null;
  }
  // робочі години між двома датами
  function bh(a, b) {
    if (!a || !b || a >= b) return 0;
    var t = 0, d = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    var end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    while (d <= end) {
      var wd = d.getDay();
      if (wd >= 1 && wd <= 5) {
        var ds = new Date(d); ds.setHours(WS, 0, 0, 0);
        var de = new Date(d); de.setHours(WE, 0, 0, 0);
        var s = Math.max(ds, a), e = Math.min(de, b);
        if (s < e) t += (e - s) / 36e5;
      }
      d.setDate(d.getDate() + 1);
    }
    return t;
  }
  function fh(h) {
    var a = Math.abs(h);
    if (a < 1) return Math.round(a * 60) + ' хв';
    var d = Math.floor(a / (WE - WS));
    var r = a - d * (WE - WS);
    return (d ? d + ' дн. ' : '') + (Math.round(r * 10) / 10) + ' год';
  }
  function groups() { return (data && data.sla && data.sla.groups) || []; }
  function gmap() {
    var m = {};
    groups().forEach(function (g) { (g.cities || []).forEach(function (c) { m[cn(c)] = g; }); });
    return m;
  }

  // ------------------------------------------------------------ розрахунок
  function compute() {
    var m = gmap(), now = new Date();
    var arrMap = {};
    ((data && data.arr) || []).forEach(function (a) { arrMap[nn(a.n)] = a; });
    var open = [], done = [], nog = 0;
    ((data && data.tickets) || []).forEach(function (t) {
      var n = nn(t.n);
      if (t.s === ARR || arrMap[n]) {
        if (!arrMap[n]) arrMap[n] = { n: t.n, ci: t.ci, cr: t.cr, ar: t.l };
        return;
      }
      var g = m[cn(t.ci)];
      if (!g) { nog++; return; }
      var el = bh(parseTs(t.cr), now);
      open.push({ t: t, g: g, el: el, rem: g.hours - el });
    });
    var limit = new Date(now.getTime() - DONE_DAYS * 864e5);
    Object.keys(arrMap).forEach(function (k) {
      var a = arrMap[k], g = m[cn(a.ci)], ar = parseTs(a.ar);
      if (!g || !ar || ar < limit) return;
      var el = bh(parseTs(a.cr), ar);
      done.push({ a: a, g: g, el: el, ar: ar, ok: el <= g.hours, over: el - g.hours });
    });
    open.sort(function (x, y) { return x.rem - y.rem; });
    done.sort(function (x, y) { return y.ar - x.ar; });
    return { open: open, done: done, nog: nog };
  }
  function level(o) {
    if (o.rem < 0) return 2;
    if (o.rem < Math.max(1, o.g.hours * 0.25)) return 1;
    return 0;
  }
  var COL = [OK, WARN, BAD];

  // ------------------------------------------------------------ відображення
  function css() {
    if (document.getElementById('sla-css')) return;
    var s = document.createElement('style'); s.id = 'sla-css';
    s.textContent =
      '.sla-seg{display:flex;gap:6px;margin:0 0 8px;flex-wrap:wrap}' +
      '.sla-chips{display:flex;gap:6px;margin:8px 0;overflow-x:auto;white-space:nowrap;scrollbar-width:none}.sla-chips::-webkit-scrollbar{display:none}' +
      '.sla-b{flex:0 0 auto;background:var(--in);border:1px solid var(--bd);border-radius:16px;padding:6px 12px;cursor:pointer;user-select:none;font-size:14px;color:var(--tx)}' +
      '.sla-b.on{background:var(--red);border-color:var(--red);color:#fff}' +
      '.sla-sum{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin:6px 0 10px}' +
      '.sla-sum .card{padding:10px 12px}.sla-sum h3{font-size:15px;margin:0 0 4px}' +
      '.sla-kv{display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:1px 0}' +
      '.sla-bar{height:6px;border-radius:3px;background:var(--bd);overflow:hidden;margin-top:6px}.sla-bar i{display:block;height:100%}' +
      '.sla-note{color:var(--sub);font-size:12px;margin:6px 0}' +
      '.sla-warn{background:rgba(251,140,0,.15);border:1px solid #FB8C00;border-radius:10px;padding:10px 12px;margin:8px 0;font-size:13px}' +
      '.sla-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:90;padding:12px}' +
      '.sla-ov[hidden]{display:none}' +
      '.sla-box{background:var(--card);color:var(--tx);border:1px solid var(--bd);border-radius:14px;padding:16px 18px;width:min(520px,100%);max-height:88vh;overflow:auto}' +
      '.sla-box h2{margin:0 0 10px;color:var(--red);font-size:18px}' +
      '.sla-box label{display:block;font-size:12px;color:var(--sub);margin:10px 0 3px}' +
      '.sla-box input[type=text],.sla-box input[type=number],.sla-box input[type=search],.sla-box input[type=password]{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--bd);background:var(--in);color:var(--tx);font-size:16px}' +
      '.sla-list{max-height:34vh;overflow:auto;border:1px solid var(--bd);border-radius:10px;margin-top:6px}' +
      '.sla-list label{display:flex;gap:8px;align-items:center;margin:0;padding:8px 10px;font-size:14px;color:var(--tx);border-bottom:1px solid var(--bd)}' +
      '.sla-list label:last-child{border:0}.sla-list small{color:var(--sub);margin-left:auto}' +
      '.sla-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}' +
      '.sla-row button{font:inherit;color:var(--tx);background:var(--in);border:1px solid var(--bd);border-radius:10px;padding:8px 14px;cursor:pointer}' +
      '.sla-row .pri{background:var(--red);border-color:var(--red);color:#fff}' +
      '.sla-row .del{color:#E53935;margin-right:auto}' +
      '.sla-err{color:#E53935;font-size:13px;min-height:18px;margin-top:8px}';
    document.head.appendChild(s);
  }
  function ov() {
    var o = document.getElementById('sla-ov');
    if (!o) {
      o = document.createElement('div'); o.id = 'sla-ov'; o.className = 'sla-ov'; o.hidden = true;
      o.innerHTML = '<div class="sla-box"></div>';
      o.addEventListener('click', function (e) { if (e.target === o) o.hidden = true; });
      document.body.appendChild(o);
    }
    return o;
  }
  function openModal(html) { var o = ov(); o.firstChild.innerHTML = html; o.hidden = false; return o.firstChild; }
  function closeModal() { ov().hidden = true; }

  function knownCities() {
    var c = {};
    function add(x) { if (x) { var k = cn(x); if (!c[k]) c[k] = { name: x, n: 0 }; c[k].n++; } }
    ((data && data.tickets) || []).forEach(function (t) { add(t.ci); });
    ((data && data.arr) || []).forEach(function (a) { add(a.ci); });
    ((data && data.known) || []).forEach(function (x) { var k = cn(x); if (!c[k]) c[k] = { name: x, n: 0 }; });
    groups().forEach(function (g) { (g.cities || []).forEach(function (x) { var k = cn(x); if (!c[k]) c[k] = { name: x, n: 0 }; }); });
    return Object.keys(c).map(function (k) { return c[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'uk'); });
  }

  function render(d) {
    if (d) data = d;
    if (!root) return;
    css();
    if (!data) { root.innerHTML = '<div class="empty">Даних ще немає. Вкажіть посилання на дані (⚙ вгорі).</div>'; return; }
    var noCity = (data.tickets || []).length && !(data.tickets || []).some(function (t) { return t.ci; });
    var c = compute();
    var h = '';
    if (noCity) h += '<div class="sla-warn">Міста ще не передаються в додаток. Оновіть <b>monitor_zayavky.py</b> на комп\'ютері і дочекайтеся наступного запуску (до 10 хв).</div>';
    h += '<div class="sla-seg">' +
      '<span class="sla-b' + (view === 'open' ? ' on' : '') + '" data-v="open">⏱ Відкриті (' + c.open.length + ')</span>' +
      '<span class="sla-b' + (view === 'done' ? ' on' : '') + '" data-v="done">✓ Прибули (' + c.done.length + ')</span>' +
      '<span class="sla-b' + (view === 'groups' ? ' on' : '') + '" data-v="groups">⚙ Групи (' + groups().length + ')</span></div>';
    if (!groups().length && view !== 'groups') {
      h += '<div class="empty">Груп SLA ще немає.<br><br><span class="sla-b on" data-v="groups">⚙ Створити першу групу</span></div>';
    } else if (view === 'open') h += viewOpen(c);
    else if (view === 'done') h += viewDone(c);
    else h += viewGroups(c);
    root.innerHTML = h;
  }

  function summary(c) {
    var h = '<div class="sla-sum">';
    groups().forEach(function (g) {
      var op = c.open.filter(function (o) { return o.g === g; });
      var over = op.filter(function (o) { return o.rem < 0; }).length;
      var warn = op.filter(function (o) { return level(o) === 1; }).length;
      var dn = c.done.filter(function (o) { return o.g === g; });
      var ok = dn.filter(function (o) { return o.ok; }).length;
      var pct = dn.length ? Math.round(ok * 100 / dn.length) : null;
      h += '<div class="card"><h3>' + esc(g.name) + '</h3>' +
        '<div class="sla-kv"><span>Ліміт</span><b>' + fh(g.hours) + ' роб.</b></div>' +
        '<div class="sla-kv"><span>Відкрито</span><b>' + op.length + '</b></div>' +
        '<div class="sla-kv"><span style="color:' + BAD + '">Прострочено</span><b>' + over + '</b></div>' +
        '<div class="sla-kv"><span style="color:' + WARN + '">Скоро ліміт</span><b>' + warn + '</b></div>' +
        '<div class="sla-kv"><span>Вчасно за ' + DONE_DAYS + ' дн.</span><b>' + (pct === null ? '—' : pct + '% (' + ok + '/' + dn.length + ')') + '</b></div>' +
        (pct === null ? '' : '<div class="sla-bar"><i style="width:' + pct + '%;background:' + (pct >= 90 ? OK : pct >= 70 ? WARN : BAD) + '"></i></div>') + '</div>';
    });
    return h + '</div>';
  }
  function gchips() {
    var h = '<div class="sla-chips"><span class="sla-b' + (!gsel ? ' on' : '') + '" data-g="">Усі групи</span>';
    groups().forEach(function (g) { h += '<span class="sla-b' + (gsel === g.id ? ' on' : '') + '" data-g="' + esc(g.id) + '">' + esc(g.name) + '</span>'; });
    return h + '</div>';
  }
  function viewOpen(c) {
    var h = summary(c) + gchips();
    var rows = c.open.filter(function (o) { return !gsel || o.g.id === gsel; });
    h += '<div class="grid">' + (rows.map(function (o) {
      var lv = level(o), t = o.t, pct = Math.max(0, Math.min(100, o.el * 100 / o.g.hours));
      return '<div class="tk"><div class="stripe" style="background:' + COL[lv] + '"></div><div class="body">' +
        '<div class="n">№ ' + esc(t.n) + ' · ' + esc(t.ci || t.o) + '</div>' +
        '<div class="st" style="color:' + COL[lv] + '">' + (o.rem < 0 ? 'Прострочено на ' + fh(o.rem) : 'Залишилось ' + fh(o.rem)) + '</div>' +
        '<div class="c">' + esc(o.g.name) + ' · ліміт ' + fh(o.g.hours) + ' · пройшло ' + fh(o.el) + '</div>' +
        '<div class="c">' + esc(t.s) + (t.e ? ' · ' + esc(t.e) : ' · без виконавця') + ' · створено ' + esc(t.cr) + '</div>' +
        '<div class="sla-bar"><i style="width:' + pct + '%;background:' + COL[lv] + '"></i></div></div></div>';
    }).join('') || '<div class="empty">Немає відкритих заявок у цій групі</div>') + '</div>';
    if (c.nog) h += '<div class="sla-note">Без групи SLA: ' + c.nog + ' відкритих заявок (міста без групи — у вкладці «Групи»).</div>';
    h += '<div class="sla-note">Відлік — від реєстрації заявки, у робочих годинах (пн–пт, ' + WS + ':00–' + WE + ':00). Завершення — статус «Прибув на локацію».</div>';
    return h;
  }
  function viewDone(c) {
    var h = gchips();
    var rows = c.done.filter(function (o) { return !gsel || o.g.id === gsel; });
    h += '<div class="grid">' + (rows.map(function (o) {
      return '<div class="tk"><div class="stripe" style="background:' + (o.ok ? OK : BAD) + '"></div><div class="body">' +
        '<div class="n">№ ' + esc(o.a.n) + ' · ' + esc(o.a.ci) + '</div>' +
        '<div class="st" style="color:' + (o.ok ? OK : BAD) + '">' + (o.ok ? 'Вчасно' : 'Порушено на ' + fh(o.over)) + ' · ' + fh(o.el) + ' з ' + fh(o.g.hours) + '</div>' +
        '<div class="c">' + esc(o.g.name) + ' · створено ' + esc(o.a.cr) + ' · прибув ' + esc(o.a.ar) + '</div></div></div>';
    }).join('') || '<div class="empty">За ' + DONE_DAYS + ' днів прибуттів у цій групі ще немає</div>') + '</div>';
    h += '<div class="sla-note">Час прибуття фіксує монітор (раз на 10 хв, 10:30–19:00), тому точність — до ~10 хвилин.</div>';
    return h;
  }
  function viewGroups(c) {
    var h = '<div class="sla-chips"><span class="sla-b on" data-add="1">＋ Нова група</span></div><div class="grid">';
    groups().forEach(function (g) {
      h += '<div class="card"><h3>' + esc(g.name) + '</h3>' +
        '<div class="sla-kv"><span>Ліміт</span><b>' + fh(g.hours) + ' роб.</b></div>' +
        '<div class="sla-kv"><span>Міст</span><b>' + (g.cities || []).length + '</b></div>' +
        '<div class="c" style="color:var(--sub);font-size:12px;margin:4px 0;overflow-wrap:anywhere">' + esc((g.cities || []).join(', ') || '— немає міст —') + '</div>' +
        '<div class="sla-row"><button data-edit="' + esc(g.id) + '">Редагувати</button></div></div>';
    });
    h += '</div>';
    var m = gmap(), free = knownCities().filter(function (x) { return !m[cn(x.name)]; });
    h += '<h3 style="margin:14px 0 4px;font-size:15px">Міста без групи (' + free.length + ')</h3>' +
      '<div class="sla-note">Натисніть місто, щоб додати його в групу.</div><div style="display:flex;flex-wrap:wrap;gap:6px">' +
      free.map(function (x) { return '<span class="sla-b" data-city="' + esc(x.name) + '">' + esc(x.name) + (x.n ? ' ' + x.n : '') + '</span>'; }).join('') + '</div>';
    return h;
  }

  // ------------------------------------------------------------ редагування
  function newId() { return 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1000); }
  function editGroup(id, presetCity) {
    var g = groups().filter(function (x) { return x.id === id; })[0];
    var isNew = !g;
    var sel = {};
    (g ? g.cities || [] : []).forEach(function (x) { sel[cn(x)] = true; });
    if (presetCity) sel[cn(presetCity)] = true;
    var owner = {};
    groups().forEach(function (x) { if (!g || x.id !== g.id) (x.cities || []).forEach(function (cc) { owner[cn(cc)] = x.name; }); });
    var all = knownCities();
    var box = openModal('<h2>' + (isNew ? 'Нова група SLA' : 'Група SLA') + '</h2>' +
      '<label>Назва групи</label><input type="text" id="sg-name" value="' + esc(g ? g.name : '') + '" placeholder="напр. Київ і область">' +
      '<label>Ліміт на прибуття, робочих годин (від реєстрації заявки)</label><input type="number" id="sg-h" min="0.5" step="0.5" value="' + (g ? g.hours : 8) + '" inputmode="decimal">' +
      '<label>Міста групи</label><input type="search" id="sg-q" placeholder="🔍 знайти місто"><div class="sla-list" id="sg-list"></div>' +
      '<label>Немає міста в списку? Додайте вручну (так, як воно пишеться в темі заявки)</label>' +
      '<div style="display:flex;gap:6px"><input type="text" id="sg-new" placeholder="напр. Ужгород"><button id="sg-add" style="font:inherit;color:var(--tx);background:var(--in);border:1px solid var(--bd);border-radius:10px;padding:0 14px;cursor:pointer">＋</button></div>' +
      '<div class="sla-err" id="sla-err"></div>' +
      '<div class="sla-row">' + (isNew ? '' : '<button class="del" id="sg-del">Видалити</button>') + '<button id="sg-x">Скасувати</button><button class="pri" id="sg-ok">Зберегти</button></div>');
    function paintList() {
      var q = cn(box.querySelector('#sg-q').value);
      box.querySelector('#sg-list').innerHTML = all.filter(function (x) { return !q || cn(x.name).indexOf(q) >= 0; }).map(function (x) {
        var k = cn(x.name);
        return '<label><input type="checkbox" data-k="' + esc(k) + '"' + (sel[k] ? ' checked' : '') + '> ' + esc(x.name) +
          '<small>' + (owner[k] ? 'зараз у: ' + esc(owner[k]) : (x.n ? x.n + ' заявок' : '')) + '</small></label>';
      }).join('') || '<div class="empty" style="padding:12px">Нічого не знайдено</div>';
    }
    paintList();
    box.querySelector('#sg-q').addEventListener('input', paintList);
    box.querySelector('#sg-list').addEventListener('change', function (e) { var k = e.target.dataset && e.target.dataset.k; if (k) sel[k] = e.target.checked; });
    box.querySelector('#sg-add').onclick = function () {
      var inp = box.querySelector('#sg-new'), v = inp.value.trim().replace(/\s+/g, ' ');
      if (!v) return;
      var k = cn(v);
      if (!all.some(function (x) { return cn(x.name) === k; })) {
        all.push({ name: v, n: 0 });
        all.sort(function (a, b) { return a.name.localeCompare(b.name, 'uk'); });
      }
      sel[k] = true; inp.value = ''; box.querySelector('#sg-q').value = ''; paintList();
    };
    box.querySelector('#sg-x').onclick = closeModal;
    if (!isNew) box.querySelector('#sg-del').onclick = function () {
      var b = this;
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Точно видалити?'; return; }
      save(groups().filter(function (x) { return x !== g; }));
    };
    box.querySelector('#sg-ok').onclick = function () {
      var name = box.querySelector('#sg-name').value.trim();
      var hrs = parseFloat(String(box.querySelector('#sg-h').value).replace(',', '.'));
      if (!name) { err('Вкажіть назву групи'); return; }
      if (!(hrs > 0)) { err('Вкажіть ліміт у годинах (більше 0)'); return; }
      var cities = all.filter(function (x) { return sel[cn(x.name)]; }).map(function (x) { return x.name; });
      var ng = { id: g ? g.id : newId(), name: name, hours: hrs, cities: cities };
      var chosen = {}; cities.forEach(function (x) { chosen[cn(x)] = true; });
      var list = groups().map(function (x) {
        if (g && x.id === g.id) return ng;
        return { id: x.id, name: x.name, hours: x.hours, cities: (x.cities || []).filter(function (cc) { return !chosen[cn(cc)]; }) };
      });
      if (isNew) list.push(ng);
      save(list);
    };
  }
  function pickGroupForCity(city) {
    var box = openModal('<h2>Додати «' + esc(city) + '» в групу</h2>' +
      groups().map(function (g) { return '<div class="sla-row" style="justify-content:stretch;margin-top:8px"><button style="flex:1;text-align:left" data-pg="' + esc(g.id) + '">' + esc(g.name) + ' · ' + fh(g.hours) + '</button></div>'; }).join('') +
      '<div class="sla-row"><button id="pg-x">Скасувати</button><button class="pri" id="pg-new">＋ Нова група</button></div>');
    box.querySelector('#pg-x').onclick = closeModal;
    box.querySelector('#pg-new').onclick = function () { editGroup(null, city); };
    box.onclick = function (e) {
      var id = e.target.dataset && e.target.dataset.pg; if (!id) return;
      save(groups().map(function (g) {
        return { id: g.id, name: g.name, hours: g.hours, cities: g.id === id ? (g.cities || []).concat([city]) : g.cities };
      }));
    };
  }
  function err(msg) { var e = document.getElementById('sla-err'); if (e) e.textContent = msg || ''; }
  function ok(r) { return r === true || !!(r && r.ok); }
  function save(list) {
    var obj = { v: 1, groups: list, upd: new Date().toISOString() };
    var box = ov().firstChild;
    var btn = box.querySelector('#sg-ok'); if (btn) { btn.disabled = true; btn.textContent = 'Збереження…'; }
    function fail(msg) { if (document.getElementById('sla-err')) err(msg); else toast(msg); if (btn) { btn.disabled = false; btn.textContent = 'Зберегти'; } }
    Promise.resolve(opts.call ? opts.call({ pw: pw, sla: obj }) : { error: 'no api' }).then(function (r) {
      if (ok(r)) { data.sla = obj; if (opts.onSaved) opts.onSaved(obj); closeModal(); render(); }
      else if (r && r.error === 'password') { pw = ''; if (opts.savePw) opts.savePw(''); closeModal(); toast('Пароль невірний або змінився. Спробуйте ще раз.'); }
      else fail('Не вдалось зберегти. Перевірте посилання на дані і чи оновлено Google Apps Script.');
    }).catch(function () { fail('Не вдалось зберегти (немає зв\'язку).'); });
  }
  function toast(msg) {
    var box = openModal('<h2>MyUIS</h2><div>' + esc(msg) + '</div><div class="sla-row"><button class="pri" id="t-ok">OK</button></div>');
    box.querySelector('#t-ok').onclick = closeModal;
  }
  // Редагування захищене паролем (перевіряється на сервері, у Google-скрипті).
  // Перегляд SLA доступний усім.
  function guard(next) {
    if (pw) { next(); return; }
    // збережений пароль (якщо додаток це підтримує): перевіряємо тихо, інакше питаємо
    if (opts.loadPw) {
      Promise.resolve().then(function () { return opts.loadPw(); }).then(function (saved) {
        if (!saved) { prompt(next); return; }
        Promise.resolve(opts.call ? opts.call({ pw: saved, check: 1 }) : { error: 'no api' }).then(function (r) {
          if (ok(r)) { pw = saved; next(); return; }
          if (r && r.error === 'password' && opts.savePw) opts.savePw('');
          prompt(next);
        }).catch(function () { prompt(next); });
      }).catch(function () { prompt(next); });
      return;
    }
    prompt(next);
  }

  function prompt(next) {
    var box = openModal('<h2>🔒 Редагування SLA</h2>' +
      '<div class="sla-note" style="margin-top:0">Перегляд доступний усім. Щоб змінювати групи і строки, введіть пароль.</div>' +
      '<label>Пароль</label><input type="password" id="pw-in" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
      (opts.savePw ? '<label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="pw-rem" checked style="width:auto"> Запамʼятати пароль на цьому пристрої</label>' : '') +
      '<div class="sla-err" id="sla-err"></div>' +
      '<div class="sla-row"><button id="pw-x">Скасувати</button><button class="pri" id="pw-ok">Увійти</button></div>');
    var inp = box.querySelector('#pw-in');
    box.querySelector('#pw-x').onclick = closeModal;
    function go() {
      var v = inp.value.trim(); if (!v) return;
      var b = box.querySelector('#pw-ok'); b.disabled = true; b.textContent = 'Перевірка…';
      Promise.resolve(opts.call ? opts.call({ pw: v, check: 1 }) : { error: 'no api' }).then(function (r) {
        if (ok(r)) {
          pw = v;
          var rem = box.querySelector('#pw-rem');
          if (opts.savePw && rem && rem.checked) opts.savePw(v);
          closeModal(); next();
        }
        else { err(r && r.error === 'password' ? 'Невірний пароль' : 'Не вдалось перевірити пароль. Оновіть Google Apps Script і перевірте посилання на дані.'); b.disabled = false; b.textContent = 'Увійти'; }
      }).catch(function () { err('Немає зв\'язку'); b.disabled = false; b.textContent = 'Увійти'; });
    }
    box.querySelector('#pw-ok').onclick = go;
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
  }

  function init(o) {
    opts = o || {}; root = opts.root;
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-v],[data-g],[data-edit],[data-add],[data-city]');
      if (!t) return;
      if (t.dataset.v) { view = t.dataset.v; render(); }
      else if (t.dataset.g !== undefined && t.hasAttribute('data-g')) { gsel = t.dataset.g; render(); }
      else if (t.dataset.edit) guard(function () { editGroup(t.dataset.edit); });
      else if (t.dataset.add) guard(function () { editGroup(null); });
      else if (t.dataset.city) guard(function () { if (groups().length) pickGroupForCity(t.dataset.city); else editGroup(null, t.dataset.city); });
    });
  }
  window.UisSLA = { init: init, render: render, _bh: bh };
})();
