/* Wetterradar für Motorradfahrer – App-Logik
   Datenquellen (frei, ohne Schlüssel):
   - Open-Meteo Geocoding, Forecast (16 Tage), Ensemble (ECMWF IFS 0.25 + GFS)
   - DWD GeoServer WMS: RV-Produkt (Radar-Analyse + 2 h Nowcast), Deutschland
   - OpenStreetMap Kacheln, Nominatim (Standortname) */
'use strict';

const API = {
  geo: 'https://geocoding-api.open-meteo.com/v1/search',
  fc: 'https://api.open-meteo.com/v1/forecast',
  ens: 'https://ensemble-api.open-meteo.com/v1/ensemble',
  rev: 'https://nominatim.openstreetmap.org/reverse',
  dwdWms: 'https://maps.dwd.de/geoserver/dwd/wms',
};
const RADAR_LAYER = 'dwd:Radar_rv_product_1x1km_ger';
const SURE_DAYS = 7;

/* ---------- Hilfsfunktionen ---------- */
const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* voll/gesperrt */ } },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r0 = (x) => (x == null || Number.isNaN(x) ? '–' : Math.round(x));
const placeId = (p) => `${(+p.lat).toFixed(3)},${(+p.lon).toFixed(3)}`;
const placeSub = (p) => [p.admin1, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

async function getJSON(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* WMO-Wettercodes */
const WMO = {
  0: ['☀️', 'Klar', '🌙'], 1: ['🌤️', 'Überwiegend klar', '🌙'], 2: ['⛅', 'Teils bewölkt', '☁️'], 3: ['☁️', 'Bedeckt'],
  45: ['🌫️', 'Nebel'], 48: ['🌫️', 'Reifnebel'],
  51: ['🌦️', 'Leichter Niesel'], 53: ['🌦️', 'Niesel'], 55: ['🌧️', 'Starker Niesel'],
  56: ['🌧️', 'Gefrierender Niesel'], 57: ['🌧️', 'Gefrierender Niesel'],
  61: ['🌦️', 'Leichter Regen'], 63: ['🌧️', 'Regen'], 65: ['🌧️', 'Starker Regen'],
  66: ['🌧️', 'Gefrierender Regen'], 67: ['🌧️', 'Gefrierender Regen'],
  71: ['🌨️', 'Leichter Schnee'], 73: ['🌨️', 'Schnee'], 75: ['❄️', 'Starker Schnee'], 77: ['🌨️', 'Schneegriesel'],
  80: ['🌦️', 'Regenschauer'], 81: ['🌧️', 'Kräftige Schauer'], 82: ['⛈️', 'Heftige Schauer'],
  85: ['🌨️', 'Schneeschauer'], 86: ['❄️', 'Starke Schneeschauer'],
  95: ['⛈️', 'Gewitter'], 96: ['⛈️', 'Gewitter mit Hagel'], 99: ['⛈️', 'Schweres Gewitter mit Hagel'],
};
const wIcon = (c, day = true) => { const w = WMO[c] || ['❔']; return !day && w[2] ? w[2] : w[0]; };
const wText = (c) => (WMO[c] || [null, 'Unbekannt'])[1];

/* Motorrad-Ampel: 0..100 */
function rideScore({ code, temp, tmin, prob, mm, gust, night }) {
  let s = 100;
  if (prob != null) s -= prob * 0.55;
  if (mm != null) s -= Math.min(45, mm * 12);
  if (gust != null && gust > 40) s -= (gust - 40) * 1.3;
  const t = temp;
  if (t != null) {
    if (t < 12) s -= (12 - t) * 2.2;
    if (t < 5) s -= (5 - t) * 4;
    if (t > 32) s -= (t - 32) * 4;
  }
  if (tmin != null && tmin <= 2) s -= 15; // Glättegefahr am Morgen
  if (code >= 95) s -= 60;
  else if ([56, 57, 66, 67, 71, 73, 75, 77, 85, 86].includes(code)) s -= 60;
  else if (code === 45 || code === 48) s -= 20;
  if (night) s -= 10;
  return Math.max(0, Math.min(100, Math.round(s)));
}
const rideClass = (s) => (s >= 70 ? 'good' : s >= 40 ? 'mid' : 'bad');
const rideText = (s) => (s >= 70 ? 'Gutes Motorradwetter' : s >= 40 ? 'Geht so – Kombi einpacken' : 'Lieber stehen lassen');

/* ---------- Zustand ---------- */
let current = store.get('wr.current', null);
let favs = store.get('wr.favs', []);
let lastData = null;

/* ---------- Navigation ---------- */
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  store.set('wr.view', name);
  if (name === 'radar') Radar.show();
  else Radar.pause();
  if (name === 'favs') renderFavs(true);
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

/* ---------- Toast ---------- */
let toastTimer;
function toast(text, actionLabel, action) {
  $('#toastText').textContent = text;
  const b = $('#toastAction');
  b.textContent = actionLabel || '';
  b.hidden = !actionLabel;
  b.onclick = () => { $('#toast').hidden = true; action && action(); };
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, actionLabel ? 6000 : 3000);
}

/* ---------- Suche ---------- */
const Search = (() => {
  const sheet = $('#searchSheet'), input = $('#searchInput'), list = $('#suggestions');
  let ctrl, timer, results = [], sel = -1;

  function open() {
    sheet.hidden = false; input.value = ''; list.innerHTML = '';
    input.focus(); // synchron im Klick, damit Android die Tastatur öffnet
    renderRecent();
    history.pushState({ search: 1 }, '');
  }
  function close(fromPop) {
    if (sheet.hidden) return;
    sheet.hidden = true; input.blur();
    if (!fromPop && history.state && history.state.search) history.back();
  }
  function renderRecent() {
    const rec = store.get('wr.recent', []);
    results = rec; sel = -1;
    list.innerHTML = rec.length ? `<li class="msg">Zuletzt gesucht</li>` + rec.map((p, i) => item(p, i, '')).join('') : '';
  }
  function hl(name, q) {
    const i = name.toLowerCase().indexOf(q.toLowerCase());
    if (!q || i < 0) return esc(name);
    return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + q.length)) + '</mark>' + esc(name.slice(i + q.length));
  }
  function item(p, i, q) {
    return `<li role="option" data-i="${i}" aria-selected="${i === sel}"><span class="n">${hl(p.name, q)}</span><span class="s">${esc(placeSub(p))}</span></li>`;
  }
  async function query(q) {
    if (ctrl) ctrl.abort();
    if (q.length < 2) { renderRecent(); return; }
    ctrl = new AbortController();
    try {
      const j = await getJSON(`${API.geo}?name=${encodeURIComponent(q)}&count=10&language=de&format=json`, ctrl.signal);
      results = (j.results || []).map((r) => ({ name: r.name, admin1: r.admin1, country: r.country, cc: r.country_code, lat: r.latitude, lon: r.longitude }));
      sel = -1;
      list.innerHTML = results.length ? results.map((p, i) => item(p, i, q)).join('') : `<li class="msg">Nichts gefunden für „${esc(q)}“</li>`;
    } catch (e) {
      if (e.name !== 'AbortError') list.innerHTML = `<li class="msg">Suche gerade nicht erreichbar. Netz prüfen.</li>`;
    }
  }
  function choose(i) {
    const p = results[i]; if (!p) return;
    const rec = store.get('wr.recent', []).filter((r) => placeId(r) !== placeId(p));
    rec.unshift(p); store.set('wr.recent', rec.slice(0, 6));
    close(); setPlace(p); showView('weather');
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => query(input.value.trim()), 220); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(0, Math.min(results.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
      list.querySelectorAll('li[data-i]').forEach((li) => li.setAttribute('aria-selected', +li.dataset.i === sel));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sel >= 0) choose(sel);
      else if (results.length) choose(0);
      else { clearTimeout(timer); query(input.value.trim()).then(() => results.length && choose(0)); }
    } else if (e.key === 'Escape') close();
  });
  list.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) choose(+li.dataset.i); });
  $('#searchClose').addEventListener('click', () => close());
  window.addEventListener('popstate', () => close(true));
  $('#locateBtn').addEventListener('click', () => { close(); locate(); });
  return { open, close };
})();
$('#searchOpen').addEventListener('click', Search.open);
$('#emptySearch').addEventListener('click', Search.open);
$('#emptyLocate').addEventListener('click', () => locate());

function locate() {
  if (!navigator.geolocation) { toast('Standort wird nicht unterstützt'); return; }
  toast('Suche Standort…');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const p = { name: 'Mein Standort', lat: pos.coords.latitude, lon: pos.coords.longitude, gps: true };
    try {
      const j = await getJSON(`${API.rev}?format=jsonv2&zoom=10&accept-language=de&lat=${p.lat}&lon=${p.lon}`);
      const a = j.address || {};
      p.name = a.city || a.town || a.village || a.municipality || a.county || p.name;
      p.admin1 = a.state; p.country = a.country;
    } catch { /* Name bleibt "Mein Standort" */ }
    setPlace(p); showView('weather');
  }, (err) => toast(err.code === 1 ? 'Standortfreigabe verweigert' : 'Standort nicht gefunden'), { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
}

/* ---------- Wetter laden ---------- */
function setPlace(p) {
  current = { name: p.name, admin1: p.admin1, country: p.country, lat: +p.lat, lon: +p.lon };
  store.set('wr.current', current);
  Radar.recenter();
  loadWeather();
}

async function loadWeather() {
  if (!current) { $('#weatherEmpty').hidden = false; $('#weatherContent').hidden = true; updateHeader(); return; }
  updateHeader();
  const key = 'wr.cache.' + placeId(current);
  const cached = store.get(key, null);
  if (cached) render(cached, true);
  $('#refreshBtn').classList.add('spin');
  const { lat, lon } = current;
  const fcUrl = `${API.fc}?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=16&wind_speed_unit=kmh`
    + `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,is_day,relative_humidity_2m`
    + `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m,is_day`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset`;
  const ensUrl = (m) => `${API.ens}?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=16&models=${m}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum`;
  try {
    const [fc, e1, e2] = await Promise.all([
      getJSON(fcUrl),
      getJSON(ensUrl('ecmwf_ifs025')).catch(() => null),
      getJSON(ensUrl('gfs_seamless')).catch(() => null),
    ]);
    const data = { fc, ens: summarizeEnsemble([e1, e2], fc.daily.time), at: Date.now(), place: current };
    store.set(key, data);
    if (placeId(data.place) === placeId(current)) render(data, false);
  } catch (e) {
    if (!cached) {
      $('#weatherEmpty').hidden = true; $('#weatherContent').hidden = false;
      $('#daysSure').innerHTML = `<div class="err">Wetterdaten konnten nicht geladen werden (${esc(e.message)}). Netz prüfen und ⟳ tippen.</div>`;
    } else toast('Offline – zeige gespeicherte Daten');
  } finally {
    $('#refreshBtn').classList.remove('spin');
  }
}

/* Ensemble: pro Tag Perzentile aller Mitglieder beider Modelle */
function summarizeEnsemble(list, times) {
  const out = times.map(() => ({ max: [], min: [], pr: [] }));
  let members = 0;
  for (const e of list) {
    if (!e || !e.daily) continue;
    const d = e.daily;
    const idx = new Map(d.time.map((t, i) => [t, i]));
    const keysMax = Object.keys(d).filter((k) => k.startsWith('temperature_2m_max'));
    members += keysMax.length;
    times.forEach((t, di) => {
      const i = idx.get(t); if (i == null) return;
      for (const k of Object.keys(d)) {
        const v = d[k][i]; if (v == null) continue;
        if (k.startsWith('temperature_2m_max')) out[di].max.push(v);
        else if (k.startsWith('temperature_2m_min')) out[di].min.push(v);
        else if (k.startsWith('precipitation_sum')) out[di].pr.push(v);
      }
    });
  }
  const pct = (arr, p) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); const i = (a.length - 1) * p; const lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };
  return {
    members,
    days: out.map((o) => o.max.length < 5 ? null : ({
      n: o.max.length,
      maxP10: pct(o.max, .1), maxP50: pct(o.max, .5), maxP90: pct(o.max, .9),
      minP10: pct(o.min, .1), minP50: pct(o.min, .5), minP90: pct(o.min, .9),
      rainProb: o.pr.length ? Math.round(100 * o.pr.filter((x) => x >= 1).length / o.pr.length) : null,
      rainP50: pct(o.pr, .5),
    })),
  };
}

function updateHeader() {
  $('#placeName').textContent = current ? current.name : 'Ort wählen…';
  const isFav = current && favs.some((f) => placeId(f) === placeId(current));
  const b = $('#favToggle');
  b.textContent = isFav ? '★' : '☆';
  b.classList.toggle('on', !!isFav);
  b.setAttribute('aria-label', isFav ? 'Aus Favoriten entfernen' : 'Als Favorit speichern');
  b.disabled = !current;
}

function fmtTime(iso) { return iso ? iso.slice(11, 16) : '–'; }
function dayName(iso, i) {
  if (i === 0) return 'Heute';
  if (i === 1) return 'Morgen';
  const d = new Date(iso + 'T12:00:00');
  return WD[d.getDay()];
}
function dateShort(iso) { const [, m, d] = iso.split('-'); return `${+d}.${+m}.`; }

function render(data, fromCache) {
  lastData = data;
  const { fc, ens } = data;
  $('#weatherEmpty').hidden = true; $('#weatherContent').hidden = false;
  const c = fc.current;
  const isDay = c.is_day === 1;
  $('#nowTemp').textContent = r0(c.temperature_2m) + '°';
  $('#nowDesc').textContent = `${wIcon(c.weather_code, isDay)} ${wText(c.weather_code)}`;
  $('#nowMeta').innerHTML = `<div>Gefühlt ${r0(c.apparent_temperature)}°</div>`
    + `<div>💨 ${r0(c.wind_speed_10m)} km/h, Böen ${r0(c.wind_gusts_10m)}</div>`
    + `<div>🌅 ${fmtTime(fc.daily.sunrise[0])} · 🌇 ${fmtTime(fc.daily.sunset[0])}</div>`;

  // Fahrer
  const scene = Rider.pickScene(c.weather_code, c.temperature_2m, c.wind_gusts_10m, isDay);
  const r = Rider.renderRider(scene);
  $('#riderSvg').innerHTML = r.svg;
  $('#riderLine').textContent = '„' + r.line + '“';

  // Stündlich
  const h = fc.hourly;
  let start = h.time.findIndex((t) => t >= c.time.slice(0, 13));
  if (start < 0) start = 0;
  const hrs = [];
  const todayScores = [];
  for (let i = start; i < Math.min(h.time.length, start + 24); i++) {
    const night = h.is_day[i] === 0;
    const sc = rideScore({ code: h.weather_code[i], temp: h.temperature_2m[i], prob: h.precipitation_probability[i], mm: h.precipitation[i], gust: h.wind_gusts_10m[i], night });
    if (!night) todayScores.push(sc);
    hrs.push(`<div class="hour" title="Motorrad-Ampel ${sc}/100">
      <div class="t">${i === start ? 'Jetzt' : h.time[i].slice(11, 13) + ' Uhr'}</div>
      <div class="i">${wIcon(h.weather_code[i], !night)}</div>
      <div class="v">${r0(h.temperature_2m[i])}°</div>
      <div class="p">${h.precipitation_probability[i] >= 10 ? h.precipitation_probability[i] + ' %' : ''}</div>
      <div class="g">${h.wind_gusts_10m[i] >= 40 ? '💨' + r0(h.wind_gusts_10m[i]) : ''}</div>
      <div class="ridebar ${rideClass(sc)}"></div></div>`);
  }
  $('#hourly').innerHTML = hrs.join('');

  // Tage
  const d = fc.daily;
  const n = d.time.length;
  let gMin = Infinity, gMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const e = ens.days[i];
    gMin = Math.min(gMin, d.temperature_2m_min[i] ?? Infinity, e?.minP10 ?? Infinity);
    gMax = Math.max(gMax, d.temperature_2m_max[i] ?? -Infinity, e?.maxP90 ?? -Infinity);
  }
  const span = Math.max(1, gMax - gMin);
  const pos = (v) => ((v - gMin) / span) * 100;

  const dayRow = (i) => {
    const tmin = d.temperature_2m_min[i], tmax = d.temperature_2m_max[i];
    const e = ens.days[i];
    const trend = i >= SURE_DAYS;
    const sc = rideScore({ code: d.weather_code[i], temp: tmax, tmin, prob: trend && e ? e.rainProb : d.precipitation_probability_max[i], mm: (d.precipitation_sum[i] || 0) / 3, gust: d.wind_gusts_10m_max[i] });
    let conf = '';
    let spread = '';
    let rainTxt = d.precipitation_probability_max[i] != null ? d.precipitation_probability_max[i] + ' %' : '';
    let rainSub = d.precipitation_sum[i] >= 0.1 ? (Math.round(d.precipitation_sum[i] * 10) / 10) + ' mm' : '';
    if (trend) {
      if (e) {
        const w = e.maxP90 - e.maxP10;
        const cl = w <= 3 ? ['hi', 'Sicherheit: mittel'] : w <= 6 ? ['md', 'Sicherheit: gering'] : ['lo', 'Sicherheit: sehr gering'];
        conf = `<span class="conf ${cl[0]}">${cl[1]}</span><span>Höchstwert ${r0(e.maxP10)}…${r0(e.maxP90)}°, Tiefstwert ${r0(e.minP10)}…${r0(e.minP90)}°</span>`;
        spread = `<div class="spread" style="left:${pos(e.minP10)}%;width:${Math.max(2, pos(e.maxP90) - pos(e.minP10))}%"></div>`;
        if (e.rainProb != null) { rainTxt = e.rainProb + ' %'; rainSub = '≥1 mm'; }
      } else {
        conf = `<span class="conf lo">Keine Ensemble-Daten – Werte nur grob</span>`;
      }
    }
    const isoD = d.time[i];
    const lp = pos(tmin), rp = pos(tmax);
    return `<button class="day" aria-expanded="false">
      <div><div class="dname">${dayName(isoD, i)}</div><div class="ddate">${dateShort(isoD)}</div></div>
      <div class="icon">${wIcon(d.weather_code[i])}</div>
      <div class="range">${spread}
        <div class="bar" style="left:${lp}%;width:${Math.max(2, rp - lp)}%"></div>
        <span class="tmin" style="right:${100 - lp + 2}%">${r0(tmin)}°</span>
        <span class="tmax" style="left:${Math.min(88, rp + 2)}%">${r0(tmax)}°</span>
      </div>
      <div class="rain">${rainTxt}<small>${rainSub}</small></div>
      <div class="extra"><span class="dot ${rideClass(sc)}"></span><span>${rideText(sc)}</span>
        <span>💨 Böen bis ${r0(d.wind_gusts_10m_max[i])} km/h</span>
        ${conf}
        <span class="more" hidden>${wText(d.weather_code[i])} · 🌅 ${fmtTime(d.sunrise[i])} · 🌇 ${fmtTime(d.sunset[i])} · Wind ${r0(d.wind_speed_10m_max[i])} km/h</span>
      </div></button>`;
  };
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(dayRow(i));
  $('#daysSure').innerHTML = rows.slice(0, SURE_DAYS).join('');
  $('#daysTrend').innerHTML = rows.slice(SURE_DAYS).join('');
  $('#uncertainHead').hidden = n <= SURE_DAYS;
  if (ens.members) {
    $('#uncertainHead span').textContent = `Ab hier laufen die Wettermodelle auseinander. Der gestrichelte Bereich zeigt, was 80 % von ${ens.members} Modellläufen (ECMWF- und GFS-Ensemble) erwarten. Je breiter, desto unsicherer. Symbol und Linie sind nur die wahrscheinlichste Variante.`;
  }
  document.querySelectorAll('.day').forEach((b) => b.addEventListener('click', () => {
    const m = b.querySelector('.more'); m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden));
  }));

  // Ampel heute (Tagstunden der nächsten 24 h)
  const best = todayScores.length ? Math.max(...todayScores) : rideScore({ code: c.weather_code, temp: c.temperature_2m, gust: c.wind_gusts_10m, night: !isDay });
  const now = rideScore({ code: c.weather_code, temp: c.temperature_2m, mm: c.precipitation, gust: c.wind_gusts_10m, night: !isDay, prob: h.precipitation_probability[start] });
  $('#rideToday').innerHTML = `<span class="dot ${rideClass(now)}"></span>${rideText(now)}`;
  $('#rideToday').title = `Motorrad-Ampel jetzt ${now}/100, bestes Zeitfenster in den nächsten 24 h ${best}/100`;

  const t = new Date(data.at);
  $('#updated').innerHTML = `${fromCache ? 'Gespeichert' : 'Aktualisiert'} ${t.toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · Daten: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0), Radar: <a href="https://www.dwd.de/" target="_blank" rel="noopener">DWD</a>`;
  updateHeader();
}

$('#refreshBtn').addEventListener('click', () => { loadWeather(); if ($('#view-radar').classList.contains('active')) Radar.reload(); if ($('#view-favs').classList.contains('active')) renderFavs(true); });

/* ---------- Favoriten ---------- */
function saveFavs() { store.set('wr.favs', favs); updateHeader(); }
$('#favToggle').addEventListener('click', () => {
  if (!current) return;
  const id = placeId(current);
  const i = favs.findIndex((f) => placeId(f) === id);
  if (i >= 0) {
    const removed = favs.splice(i, 1)[0]; saveFavs();
    toast(`${removed.name} entfernt`, 'Rückgängig', () => { favs.splice(i, 0, removed); saveFavs(); renderFavs(); });
  } else {
    favs.push({ ...current }); saveFavs(); toast(`${current.name} gespeichert`);
  }
  renderFavs();
});

let favWx = {};
async function loadFavWeather() {
  if (!favs.length) return;
  const lat = favs.map((f) => f.lat.toFixed(4)).join(','), lon = favs.map((f) => f.lon.toFixed(4)).join(',');
  try {
    let j = await getJSON(`${API.fc}?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`);
    if (!Array.isArray(j)) j = [j];
    j.forEach((r, i) => { if (favs[i]) favWx[placeId(favs[i])] = r.current; });
    renderFavs();
  } catch { /* still */ }
}

function renderFavs(refresh) {
  const ul = $('#favList');
  $('#favHint').textContent = favs.length
    ? 'Tippen zum Öffnen. Zum Sortieren am Griff ≡ ziehen oder ▲▼ nutzen.'
    : 'Noch keine Favoriten. Ort suchen und oben auf ☆ tippen.';
  ul.innerHTML = favs.map((f, i) => {
    const w = favWx[placeId(f)];
    return `<li class="fav" data-i="${i}">
      <span class="handle" aria-label="Ziehen zum Sortieren">≡</span>
      <button class="main" data-act="open"><div class="name">${esc(f.name)}</div><div class="sub">${esc(placeSub(f))}</div></button>
      <span class="wx">${w ? wIcon(w.weather_code, w.is_day === 1) + ' ' + r0(w.temperature_2m) + '°' : ''}</span>
      <button class="mini" data-act="up" aria-label="Nach oben" ${i === 0 ? 'disabled' : ''}>▲</button>
      <button class="mini" data-act="down" aria-label="Nach unten" ${i === favs.length - 1 ? 'disabled' : ''}>▼</button>
      <button class="mini del" data-act="del" aria-label="Löschen">✕</button></li>`;
  }).join('');
  if (refresh) loadFavWeather();
}

$('#favList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const i = +btn.closest('.fav').dataset.i;
  const act = btn.dataset.act;
  if (act === 'open') { setPlace(favs[i]); showView('weather'); }
  else if (act === 'up' && i > 0) { [favs[i - 1], favs[i]] = [favs[i], favs[i - 1]]; saveFavs(); renderFavs(); }
  else if (act === 'down' && i < favs.length - 1) { [favs[i + 1], favs[i]] = [favs[i], favs[i + 1]]; saveFavs(); renderFavs(); }
  else if (act === 'del') {
    const removed = favs.splice(i, 1)[0]; saveFavs(); renderFavs();
    toast(`${removed.name} gelöscht`, 'Rückgängig', () => { favs.splice(i, 0, removed); saveFavs(); renderFavs(); });
  }
});

/* Ziehen zum Sortieren (Touch + Maus) */
(() => {
  const ul = $('#favList');
  let drag = null;
  ul.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.handle'); if (!h) return;
    const li = h.closest('.fav');
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    drag = { li, startY: e.clientY, from: +li.dataset.i, h };
    li.classList.add('dragging');
  });
  ul.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    drag.li.style.transform = `translateY(${dy}px) scale(1.02)`;
    const items = [...ul.children];
    const hgt = drag.li.offsetHeight + 8;
    const to = Math.max(0, Math.min(items.length - 1, drag.from + Math.round(dy / hgt)));
    items.forEach((it, idx) => {
      if (it === drag.li) return;
      let shift = 0;
      if (drag.from < to && idx > drag.from && idx <= to) shift = -hgt;
      if (drag.from > to && idx < drag.from && idx >= to) shift = hgt;
      it.style.transform = shift ? `translateY(${shift}px)` : '';
    });
    drag.to = to;
  });
  const end = () => {
    if (!drag) return;
    const { from, to } = drag;
    drag = null;
    if (to != null && to !== from) { const [m] = favs.splice(from, 1); favs.splice(to, 0, m); saveFavs(); }
    renderFavs();
  };
  ul.addEventListener('pointerup', end);
  ul.addEventListener('pointercancel', end);
})();

/* ---------- Regenradar (DWD RV-Produkt: Analyse + 2 h Nowcast) ---------- */
const Radar = (() => {
  let map, marker, layers = [], frames = [], idx = 0, timer = null, loadedAt = 0, nowIdx = 0, base;
  const slider = $('#radarSlider'), label = $('#radarTime'), playBtn = $('#radarPlay');
  const inGermany = (p) => p && p.lat > 46.8 && p.lat < 55.4 && p.lon > 5.4 && p.lon < 15.6;

  function init() {
    if (map) return;
    const c = current || { lat: 51.1, lon: 10.4 };
    map = L.map('map', { zoomControl: false, attributionControl: true }).setView([c.lat, c.lon], current ? 8 : 6);
    L.control.zoom({ position: 'topright' }).addTo(map);
    base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12, minZoom: 4, attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · Radar © <a href="https://www.dwd.de">DWD</a>',
    }).addTo(map);
    if (current) marker = L.circleMarker([c.lat, c.lon], { radius: 7, color: '#1c2230', weight: 3, fillColor: '#f0a830', fillOpacity: 1 }).addTo(map);
    slider.addEventListener('input', () => { stop(); setFrame(+slider.value); });
    playBtn.addEventListener('click', () => (timer ? stop() : play()));
  }

  async function getFrames() {
    // Zeitachse aus GetCapabilities lesen; Fallback: aus der Uhr ableiten
    let end;
    try {
      const txt = await fetch('https://maps.dwd.de/geoserver/dwd/Radar_rv_product_1x1km_ger/wms?service=WMS&version=1.3.0&request=GetCapabilities').then((r) => r.text());
      const all = [...txt.matchAll(/<Dimension name="time"[^>]*>([^<]+)<\/Dimension>/g)];
      if (all.length) end = new Date(all[all.length - 1][1].trim().split('/')[1]);
    } catch { /* Fallback */ }
    if (!end || Number.isNaN(+end)) {
      const t = Date.now() - 10 * 60000;
      end = new Date(Math.floor(t / 300000) * 300000 + 120 * 60000);
    }
    const analysis = new Date(+end - 120 * 60000);
    const out = [];
    for (let m = -90; m <= 120; m += 10) out.push({ t: new Date(+analysis + m * 60000), fut: m > 0 });
    nowIdx = 9;
    return out;
  }

  async function build() {
    layers.forEach((l) => map.removeLayer(l));
    layers = [];
    const msg = document.querySelector('.radar-msg'); if (msg) msg.remove();
    frames = await getFrames();
    frames.forEach((f, i) => {
      const l = L.tileLayer.wms(API.dwdWms, {
        layers: RADAR_LAYER, format: 'image/png', transparent: true, version: '1.3.0', time: f.t.toISOString().replace('.000', ''),
        opacity: 0, tileSize: 512, zIndex: 10 + i, attribution: '',
      });
      l.addTo(map);
      layers.push(l);
    });
    slider.max = frames.length - 1;
    loadedAt = Date.now();
    // Erst abspielen, wenn die Bilder geladen sind (max. 6 s warten)
    label.textContent = 'Radar lädt…';
    await new Promise((res) => {
      let left = layers.length;
      const done = () => { if (--left <= 0) res(); };
      layers.forEach((l) => { l.once('load', done); });
      setTimeout(res, 6000);
    });
    $('#radarSrc').textContent = 'DWD RV-Produkt · 10-Min-Schritte';
    if (!inGermany(current)) {
      const div = document.createElement('div');
      div.className = 'radar-msg';
      div.textContent = 'Hinweis: Das freie DWD-Radar deckt nur Deutschland und die Grenzregionen ab. Für andere Länder gibt es derzeit keine frei nutzbare Radar-Vorhersage.';
      $('#view-radar').appendChild(div);
    }
    setFrame(nowIdx);
  }

  function setFrame(i) {
    if (!layers.length) return;
    idx = (i + layers.length) % layers.length;
    layers.forEach((l, k) => l.setOpacity(k === idx ? 0.65 : 0));
    slider.value = idx;
    const f = frames[idx];
    const hm = f.t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const diff = Math.round((f.t - frames[nowIdx].t) / 60000);
    label.textContent = diff === 0 ? `${hm} · jetzt` : diff > 0 ? `${hm} · +${diff} min` : `${hm} · ${diff} min`;
    label.classList.toggle('fut', f.fut);
  }
  function play() {
    playBtn.textContent = '❚❚'; playBtn.setAttribute('aria-label', 'Pause');
    const step = () => { setFrame(idx + 1); timer = setTimeout(step, idx === layers.length - 1 ? 1800 : 550); };
    timer = setTimeout(step, 400);
  }
  function stop() { clearTimeout(timer); timer = null; playBtn.textContent = '▶'; playBtn.setAttribute('aria-label', 'Abspielen'); }

  async function show() {
    init();
    setTimeout(() => map.invalidateSize(), 50);
    if (!layers.length || Date.now() - loadedAt > 5 * 60000) await build();
    if (!timer) play();
  }
  function recenter() {
    if (!map || !current) return;
    map.setView([current.lat, current.lon], 8);
    if (marker) marker.setLatLng([current.lat, current.lon]);
    else marker = L.circleMarker([current.lat, current.lon], { radius: 7, color: '#1c2230', weight: 3, fillColor: '#f0a830', fillOpacity: 1 }).addTo(map);
    loadedAt = 0;
  }
  return { show, pause: stop, recenter, reload: () => { loadedAt = 0; show(); } };
})();

/* ---------- Start ---------- */
updateHeader();
renderFavs(false);
loadWeather();
const startView = store.get('wr.view', 'weather');
showView(['weather', 'favs', 'radar'].includes(startView) ? startView : 'weather');
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && lastData && Date.now() - lastData.at > 15 * 60000) loadWeather();
});
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
