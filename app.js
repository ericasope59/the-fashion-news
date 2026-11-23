/* The Fashion News - app logic.
   Daily content comes from data/today.json (refreshed every morning by GitHub Actions).
   Inspire images are fetched live from Openverse, Wikimedia Commons and The Met pool. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('tfn-' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tfn-' + k, JSON.stringify(v)); } catch {} }
};
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MF = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const todayISO = () => new Date().toISOString().slice(0, 10);
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800); };
const fadeIn = img => { img.classList.add('fade'); const on = () => img.classList.add('in'); img.complete && img.naturalWidth ? on() : img.addEventListener('load', on, { once: true }); };
const ago = iso => {
  const d = new Date(iso); if (isNaN(d)) return '';
  const m = Math.round((Date.now() - d) / 60000);
  if (m < 60) return Math.max(m, 1) + ' min ago';
  if (m < 1440) return Math.round(m / 60) + ' h ago';
  if (m < 2880) return 'Yesterday';
  return d.getDate() + ' ' + MO[d.getMonth()];
};

let DATA = null;
let saved = store.get('saved', []);          // story objects
let mood = store.get('mood', []);            // image objects
const seenBefore = new Set(store.get('seen', []));

/* ------------------------------------------------------------ sheet */
const sheet = $('#sheet'), panel = $('#panel');
const closeBtn = '<button class="iconbtn" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
const open = html => { panel.innerHTML = html; panel.scrollTop = 0; sheet.classList.add('open'); };
const close = () => sheet.classList.remove('open');
sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

/* ------------------------------------------------------------ chips */
function chips(el, list, cb, start) {
  let cur = start || list[0];
  el.innerHTML = list.map(x => `<button class="chip" aria-pressed="${x === cur}">${esc(x)}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('.chip'); if (!b) return; cur = b.textContent; el.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === b)); cb(cur); };
  cb(cur);
}

/* ------------------------------------------------------------ data */
async function loadData(force) {
  try {
    const r = await fetch('today.json?t=' + (force ? Date.now() : todayISO()), { cache: force ? 'no-store' : 'default' });
    if (!r.ok) throw new Error(r.status);
    DATA = await r.json();
    store.set('lastData', DATA);
  } catch {
    DATA = DATA || store.get('lastData', null);
    if (!DATA) { $('#stories').innerHTML = '<p class="empty">Could not load today\'s content. Pull down to try again.</p>'; return; }
    toast('Offline: showing last saved edition');
  }
  renderAll();
}

function renderAll() {
  const g = new Date(DATA.generated);
  $('#dateline').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#updated').textContent = isNaN(g) ? '' : 'Updated ' + (g.toDateString() === new Date().toDateString() ? 'today ' + g.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ago(DATA.generated));
  renderHero(); renderStoriesChips(); renderLearn(); renderEvents();
  store.set('seen', [...new Set([...seenBefore, ...DATA.news.map(n => n.id)])].slice(-400));
}

/* ------------------------------------------------------------ today */
function renderHero() {
  const h = DATA.hero; if (!h) return;
  const el = $('#hero');
  const caption = h.kind === 'met'
    ? `<b>Look of the day.</b> ${esc(h.title)}${h.artist ? ', ' + esc(h.artist) : ''}${h.date ? ', ' + esc(h.date) : ''}. The Met, Costume Institute · Public domain`
    : `<b>Picture of the day.</b> ${esc(h.title)} · ${esc(h.credit || '')}`;
  el.innerHTML = `<figure><img src="${esc(h.thumb || h.img)}" alt="${esc(h.title)}" referrerpolicy="no-referrer"></figure><p class="cap">${caption}</p>`;
  const img = el.querySelector('img'); fadeIn(img);
  if (h.thumb && h.img !== h.thumb) { const hi = new Image(); hi.referrerPolicy = 'no-referrer'; hi.onload = () => { img.src = h.img; }; hi.src = h.img; } // sharpen once the full-size file arrives
  el.onclick = () => open(`<div class="bar"><span class="cap">${h.kind === 'met' ? 'The Metropolitan Museum of Art' : 'Wikimedia Commons'}</span>${closeBtn}</div>
    <img src="${esc(h.img)}" alt="${esc(h.title)}" referrerpolicy="no-referrer"><h2 style="margin-top:14px">${esc(h.title)}</h2>
    <p>${[h.artist, h.culture, h.date, h.medium].filter(Boolean).map(esc).join(' · ')}</p>
    ${h.credit ? `<p class="note">${esc(h.credit)}</p>` : ''}
    <a class="btn dark" href="${esc(h.url)}" target="_blank" rel="noopener">View at the source</a>`);
}

let storyFilter = 'All';
function renderStoriesChips() {
  const tags = ['All', ...new Set(DATA.news.flatMap(n => n.tags))];
  chips($('#filters'), tags, t => { storyFilter = t; renderStories(); }, tags.includes(storyFilter) ? storyFilter : 'All');
}
const storyRow = n => `<button class="story" data-id="${n.id}"><div class="meta"><span class="tag">${esc(n.tags[0])}</span><span>${esc(n.source)}</span><span>${ago(n.date)}</span>${!seenBefore.has(n.id) && seenBefore.size ? '<span class="new">New</span>' : ''}${saved.some(s => s.id === n.id) ? '<span>Saved</span>' : ''}</div><h3>${esc(n.title)}</h3>${n.excerpt ? `<p>${esc(n.excerpt)}</p>` : ''}</button>`;
function renderStories() {
  const list = DATA.news.filter(n => storyFilter === 'All' || n.tags.includes(storyFilter));
  $('#stories').innerHTML = list.map(storyRow).join('') || '<p class="empty">No stories in this category today.</p>';
}
function openStory(n) {
  const isSaved = saved.some(s => s.id === n.id);
  open(`<div class="bar"><span class="cap">${esc(n.tags.join(' · '))} · ${ago(n.date)}</span>${closeBtn}</div>
    <h2>${esc(n.title)}</h2>${n.excerpt ? `<p>${esc(n.excerpt)}</p>` : ''}
    <p class="note">Source: ${esc(n.source)}. Headline${n.excerpt ? ' and excerpt' : ''} in the publisher's own words.</p>
    <a class="btn dark" href="${esc(n.url)}" target="_blank" rel="noopener">Read at ${esc(n.source)}</a><button class="btn" id="saveStory">${isSaved ? 'Remove from saved' : 'Save'}</button>`);
  $('#saveStory').onclick = () => {
    saved = isSaved ? saved.filter(s => s.id !== n.id) : [n, ...saved];
    store.set('saved', saved); toast(isSaved ? 'Removed' : 'Saved'); renderStories(); openStory(n);
  };
}
document.addEventListener('click', e => {
  const b = e.target.closest('.story[data-id]'); if (!b) return;
  const n = (DATA?.news || []).find(x => x.id === b.dataset.id) || saved.find(x => x.id === b.dataset.id);
  if (n) openStory(n);
});

/* ------------------------------------------------------------ learn */
const wikiBlock = (w, big) => !w ? '<p class="empty">Not available today.</p>' : `
  ${w.image ? `<figure${big ? '' : ' style="aspect-ratio:16/10;overflow:hidden;margin:0 0 10px"'}><img src="${esc(w.image.src)}" alt="${esc(w.title)}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover"></figure>
  <p class="cap">Photo: ${esc(w.image.author)} · <a href="${esc(w.image.page)}" target="_blank" rel="noopener">${esc(w.image.license || 'licence')}</a></p>` : ''}
  <h2 style="margin-top:14px">${esc(w.title)}</h2><p style="margin-top:10px">${esc(w.text)}</p>
  <p class="note">${esc(w.textLicense)}. <a href="${esc(w.url)}" target="_blank" rel="noopener">Read the full article</a></p>`;

function renderLearn() {
  $('#fabric').innerHTML = wikiBlock(DATA.fabric, true);
  $('#fabric').querySelectorAll('img').forEach(fadeIn);
  $('#fabricDate').textContent = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const t = DATA.term;
  $('#term').innerHTML = t ? `<h3>${esc(t.title)}</h3><p style="margin-top:8px">${esc(t.text)}</p><p class="note">${esc(t.textLicense)}. <a href="${esc(t.url)}" target="_blank" rel="noopener">Read more</a></p>` : '<p class="empty">Not available today.</p>';
  const cult = DATA.news.filter(n => n.tags.some(x => ['Trade', 'Africa', 'Sustainability'].includes(x))).slice(0, 8);
  $('#culture').innerHTML = cult.map(storyRow).join('') || '<p class="empty">No culture or policy stories in today\'s edition.</p>';
}

let LIB = null;
async function loadLibrary() {
  try { LIB = await fetch('library.json').then(r => r.json()); } catch { return; }
  const mk = (el, list) => { el.innerHTML = list.map(x => `<button class="chip" data-w="${esc(x)}">${esc(x.replace(/\s*\(.*\)/, ''))}</button>`).join(''); };
  mk($('#library'), LIB.fabrics); mk($('#terms'), LIB.terms);
}
async function openWiki(title) {
  open(`<div class="bar"><span class="cap">Library</span>${closeBtn}</div><p class="empty">Loading…</p>`);
  try {
    const q = new URLSearchParams({ action: 'query', format: 'json', origin: '*', redirects: 1, titles: title, prop: 'extracts|pageimages|info', inprop: 'url', exintro: 1, explaintext: 1, exsentences: 5, piprop: 'thumbnail', pithumbsize: 900, pilicense: 'free' });
    const j = await fetch('https://en.wikipedia.org/w/api.php?' + q).then(r => r.json());
    const p = Object.values(j.query.pages)[0];
    open(`<div class="bar"><span class="cap">Library</span>${closeBtn}</div>
      ${p.thumbnail ? `<img src="${esc(p.thumbnail.source)}" alt="${esc(p.title)}" referrerpolicy="no-referrer">` : ''}
      <h2 style="margin-top:14px">${esc(p.title)}</h2><p>${esc(p.extract)}</p>
      <p class="note">Text from Wikipedia, CC BY-SA 4.0. Image licences are listed on the article.</p>
      <a class="btn dark" href="${esc(p.fullurl)}" target="_blank" rel="noopener">Read the full article</a>`);
  } catch { open(`<div class="bar"><span class="cap">Library</span>${closeBtn}</div><p class="empty">Could not reach Wikipedia. Check your connection.</p>`); }
}
document.addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b) openWiki(b.dataset.w); });

/* ------------------------------------------------------------ events */
let evRegion = 'All', evType = 'All types';
const EV_TYPES = { 'All types': null, 'Fashion weeks': ['Fashion week'], 'Runway shows': ['Runway show'],
  'Trade fairs & conferences': ['Trade fair', 'Conference'], 'Exhibitions & networking': ['Exhibition', 'Awards', 'Gala'] };
const evId = ev => ev.s + '|' + ev.n;
const seenEvBefore = new Set(store.get('seenEv', []));
// New = not seen on this device before. On a device's first visit, only events added in the last 2 days count as new.
const evIsNew = ev => !seenEvBefore.has(evId(ev)) && (seenEvBefore.size ? true : !!ev.added && (Date.now() - new Date(ev.added + 'T00:00:00')) / 864e5 <= 2);
const pd = s => { const [y, m, d] = s.split('-').map(Number); return { y, m: m - 1, d }; };
const range = ev => { const a = pd(ev.s), b = pd(ev.e); return a.d === b.d && a.m === b.m ? `${a.d} ${MO[a.m]}` : a.m === b.m ? `${a.d}–${b.d} ${MO[a.m]}` : `${a.d} ${MO[a.m]} – ${b.d} ${MO[b.m]}`; };
const evRow = (ev, past) => { const a = pd(ev.s), b = pd(ev.e);
  const big = a.m === b.m ? (a.d === b.d ? a.d : `${a.d}–${b.d}`) : a.d;
  const yrs = a.y === b.y ? `${range(ev)} ${a.y}` : `${a.d} ${MO[a.m]} ${a.y} – ${b.d} ${MO[b.m]} ${b.y}`;
  const small = a.y !== b.y ? MO[a.m] + ' ' + a.y : a.m === b.m ? MO[a.m] + ' ' + a.y : MO[a.m] + ' – ' + b.d + ' ' + MO[b.m];
  return `<div class="ev"><div class="d"><b>${big}</b><small>${small}</small></div><div>
  <p class="evt">${esc(ev.t || 'Event')}${!past && evIsNew(ev) ? '<span class="new">New</span>' : ''}</p>
  <h3>${esc(ev.n)}${ev.prov ? '<span class="flag">Provisional</span>' : ''}</h3><p>${esc(ev.w)} · ${yrs}</p>
  ${ev.note ? `<p>${esc(ev.note)}</p>` : ''}
  <p>Source: <a href="${esc(ev.u)}" target="_blank" rel="noopener">${esc(ev.src)}</a></p>
  ${past ? '<p>Next dates not yet announced.</p>' : `<div class="act"><button data-ics='${esc(JSON.stringify(ev))}'>Add to calendar</button></div>`}</div></div>`; };
function renderEvents() {
  const iso = todayISO(), all = [...DATA.events.upcoming, ...DATA.events.recent];
  const up = all.filter(e => e.e >= iso).sort((a, b) => a.s.localeCompare(b.s));
  const past = all.filter(e => e.e < iso).sort((a, b) => b.s.localeCompare(a.s)).slice(0, 8);
  const ok = e => (evRegion === 'All' || e.r === evRegion) && (!EV_TYPES[evType] || EV_TYPES[evType].includes(e.t));
  const draw = () => {
    let m = '', h = '';
    const list = up.filter(ok), now = list.filter(e => e.s <= iso), next = list.filter(e => e.s > iso);
    if (now.length) h += '<div class="month">Happening now</div>' + now.map(e => evRow(e)).join('');
    next.forEach(e => { const a = pd(e.s), k = MF[a.m] + ' ' + a.y; if (k !== m) { h += `<div class="month">${k}</div>`; m = k; } h += evRow(e); });
    $('#evlist').innerHTML = h || '<p class="empty">No upcoming events for this filter yet.</p>';
    $('#past').innerHTML = past.filter(ok).map(e => evRow(e, true)).join('') || '<p class="empty">None for this filter.</p>';
  };
  chips($('#efilters'), ['All', 'Africa', 'Europe', 'Americas', 'Asia'], r => { evRegion = r; draw(); }, evRegion);
  chips($('#etypes'), Object.keys(EV_TYPES), t => { evType = t; draw(); }, evType);
  const fresh = up.filter(evIsNew).length;
  document.querySelector('nav [data-v="events"]').classList.toggle('dot', fresh > 0 && location.hash.slice(1) !== 'events');
  $('#evnew').textContent = fresh ? `${fresh} new event${fresh > 1 ? 's' : ''} added since your last visit.` : '';
  store.set('seenEv', [...new Set([...seenEvBefore, ...all.map(evId)])].slice(-600));
  $('#evfoot').textContent = `Checked every morning. An event is listed only when the organiser confirms it or two credible outlets report the same dates; single-source events are marked Provisional.${DATA.events.checked ? ' Last checked ' + DATA.events.checked + '.' : ''} Always confirm with the organiser before booking travel.`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ics]'); if (!b) return;
  const ev = JSON.parse(b.dataset.ics), d = s => s.replace(/-/g, '');
  const end = new Date(ev.e + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 1);
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//The Fashion News//EN','BEGIN:VEVENT','UID:' + d(ev.s) + ev.n.replace(/\W/g, '') + '@tfn',
    'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z','DTSTART;VALUE=DATE:' + d(ev.s),'DTEND;VALUE=DATE:' + end.toISOString().slice(0, 10).replace(/-/g, ''),
    'SUMMARY:' + ev.n,'LOCATION:' + ev.w,'DESCRIPTION:Source: ' + ev.u,'END:VEVENT','END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = ev.n.replace(/[^\w]+/g, '-') + '.ics'; document.body.appendChild(a); a.click(); a.remove(); toast('Calendar file created');
});

/* ------------------------------------------------------------ inspire */
const TOPICS = {
  Botanical: ['orchid', 'fern frond', 'peony', 'protea flower', 'lotus flower', 'magnolia', 'succulent plant', 'moss', 'leaf veins', 'tropical leaves', 'wildflower meadow', 'cherry blossom', 'dahlia', 'botanical illustration', 'hibiscus', 'bird of paradise flower'],
  Runway: ['fashion show runway', 'catwalk model', 'fashion week', 'haute couture', 'street style fashion', 'fashion editorial', 'evening gown', 'tailoring suit'],
  Cultures: ['traditional dress', 'kente', 'kimono', 'sari', 'headwrap', 'carnival costume', 'masquerade festival', 'beadwork', 'festival costume', 'maasai', 'hanbok', 'durbar festival', 'aso oke', 'flamenco dress'],
  Landscapes: ['sand dunes', 'salt flat', 'rice terraces', 'glacier', 'canyon', 'savanna', 'sea cliffs', 'volcanic landscape', 'lavender field', 'desert oasis', 'misty mountains', 'waterfall'],
  Architecture: ['mosaic tiles', 'stained glass', 'spiral staircase', 'mosque ceiling', 'art deco facade', 'brutalist architecture', 'colonnade arches', 'zellige', 'dome interior', 'mud brick architecture', 'palace interior', 'modern architecture'],
  Art: ['oil painting', 'watercolor painting', 'sculpture', 'ukiyo-e', 'abstract painting', 'textile art', 'ceramic glaze', 'illuminated manuscript', 'fresco', 'african mask', 'impressionism'],
  Nature: ['feathers', 'butterfly wing', 'coral reef', 'crystals minerals', 'seashells', 'peacock', 'flamingo', 'jellyfish', 'autumn leaves', 'hummingbird', 'tiger', 'snowflake'],
  Heritage: ['embroidery', 'lace', 'weaving loom', 'batik', 'indigo dye', 'tapestry', 'jewelry', 'calligraphy', 'pottery', 'goldsmith', 'basket weaving', 'adire'],
  Textiles: ['fabric texture', 'silk fabric', 'woven textile', 'textile pattern', 'tartan', 'denim', 'velvet', 'knitting yarn', 'wax print fabric', 'brocade']
};
const CATS = ['All', ...Object.keys(TOPICS), 'The Met'];
const BLOCK = /\b(nude|nudes|naked|nudity|erotic|erotica|sex|sexy|topless|porn|lingerie|underwear|bikini|breast|corpse|dead|gore|blood|weapon|gun|execution)\b/i;
let cat = 'All', seen = new Set(), loading = false, colH = [0, 0], ovOff = false, metPool = [], metIdx = 0, gen = 0;
const countKey = 'count-' + todayISO();
let shown = store.get(countKey, 0);
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

async function openverse(q) {
  if (ovOff) return [];
  const p = new URLSearchParams({ q, page_size: 20, page: 1 + Math.floor(Math.random() * 5), mature: 'false' });
  try {
    const r = await fetch('https://api.openverse.org/v1/images/?' + p);
    if (r.status === 429) { ovOff = true; return []; }
    const j = await r.json();
    return (j.results || []).filter(x => x.width && x.height && x.width >= 400).map(x => ({
      id: 'ov' + x.id, thumb: x.thumbnail || x.url, full: x.url, w: x.width, h: x.height, title: x.title || 'Untitled',
      author: x.creator || 'Unknown', license: x.license === 'pdm' ? 'Public domain' : x.license === 'cc0' ? 'CC0' : 'CC ' + (x.license || '').toUpperCase() + (x.license_version ? ' ' + x.license_version : ''),
      page: x.foreign_landing_url, via: 'Openverse · ' + (x.source || x.provider || ''), tags: (x.tags || []).map(t => t.name).join(' ')
    }));
  } catch { return []; }
}
async function commons(q) {
  const p = new URLSearchParams({ action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: q + ' filetype:bitmap', gsrnamespace: 6,
    gsrlimit: 20, gsroffset: Math.floor(Math.random() * 120), prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: 640, iiextmetadatafilter: 'Artist|LicenseShortName' });
  try {
    const j = await fetch('https://commons.wikimedia.org/w/api.php?' + p).then(r => r.json());
    return Object.values(j.query?.pages || {}).map(pg => { const ii = pg.imageinfo?.[0]; if (!ii || !/jpeg|png|webp/.test(ii.mime) || ii.width < 400) return null; const m = ii.extmetadata || {};
      return { id: 'wc' + pg.pageid, thumb: ii.thumburl, full: ii.thumburl.replace(/\/\d+px-/, '/1280px-'), w: ii.thumbwidth, h: ii.thumbheight,
        title: pg.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' '), author: (m.Artist?.value || 'Unknown').replace(/<[^>]+>/g, '').trim().slice(0, 80),
        license: m.LicenseShortName?.value || '', page: ii.descriptionurl, via: 'Wikimedia Commons', tags: '' }; }).filter(Boolean);
  } catch { return []; }
}
function metBatch(n) {
  const out = [];
  for (let i = 0; i < n && metPool.length; i++) { const m = metPool[metIdx++ % metPool.length];
    out.push({ id: 'met' + m.id, thumb: m.thumb, full: m.img, w: 3, h: 4, title: m.title + (m.date ? ', ' + m.date : ''), author: m.artist || m.culture || 'Unknown maker',
      license: 'Public domain', page: m.url, via: 'The Metropolitan Museum of Art', tags: '' }); }
  return out;
}
function place(item, myGen) {
  if (myGen !== gen || seen.has(item.id) || BLOCK.test(item.title + ' ' + item.tags)) return;
  seen.add(item.id);
  const c = colH[0] <= colH[1] ? 0 : 1, ratio = item.h / item.w;
  colH[c] += ratio;
  const b = document.createElement('button');
  b.className = 'tile'; b.dataset.id = item.id;
  b.innerHTML = `<img src="${esc(item.thumb)}" alt="${esc(item.title)}" loading="lazy" referrerpolicy="no-referrer" width="${item.w}" height="${item.h}">`;
  const img = b.querySelector('img'); fadeIn(img);
  img.onerror = () => { b.remove(); colH[c] -= ratio; };
  b._item = item;
  $('#c' + c).appendChild(b);
  shown++;
}
async function loadBatch() {
  if (loading) return; loading = true;
  const myGen = gen;
  $('#sentinel').textContent = 'Loading…';
  const cats = cat === 'All' ? Object.keys(TOPICS) : cat === 'The Met' ? [] : [cat];
  const qs = cats.length ? [pick(TOPICS[pick(cats)]), pick(TOPICS[pick(cats)])] : [];
  const res = await Promise.all([...qs.map(openverse), ...qs.map(commons)]);
  let items = shuffle(res.flat());
  if (cat === 'All' || cat === 'The Met') items = shuffle([...items, ...metBatch(cat === 'The Met' ? 24 : 4)]);
  items.forEach(it => place(it, myGen));
  store.set(countKey, shown); $('#count').textContent = shown.toLocaleString('en-GB');
  $('#sentinel').textContent = items.length ? '' : 'Image sources are not responding. Pull down to try again.';
  loading = false;
  if (myGen === gen && items.length && $('#sentinel').getBoundingClientRect().top < innerHeight + 600 && $('#inspire-v').classList.contains('on')) loadBatch();
}
function resetGrid() { gen++; loading = false; seen = new Set(); colH = [0, 0]; $('#c0').innerHTML = ''; $('#c1').innerHTML = ''; shuffle(metPool); }
new IntersectionObserver(es => { if (es[0].isIntersecting && $('#inspire-v').classList.contains('on')) loadBatch(); }, { rootMargin: '900px' }).observe($('#sentinel'));
document.addEventListener('click', e => {
  const t = e.target.closest('.tile, .strip button, .mini button'); if (!t) return;
  const it = t._item || mood.find(m => m.id === t.dataset.id); if (it) openImage(it);
});
function openImage(it) {
  const isSaved = mood.some(m => m.id === it.id);
  open(`<div class="bar"><span class="cap">${esc(it.via)}</span>${closeBtn}</div>
    <img src="${esc(it.full || it.thumb)}" alt="${esc(it.title)}" referrerpolicy="no-referrer" onerror="this.src='${esc(it.thumb)}'">
    <h2 style="font-size:22px;margin-top:14px">${esc(it.title)}</h2>
    <p class="cap">${esc(it.author)} · ${esc(it.license)}</p>
    <a class="btn dark" href="${esc(it.page)}" target="_blank" rel="noopener">Source and licence</a><button class="btn" id="saveImg">${isSaved ? 'Remove from moodboard' : 'Save to moodboard'}</button>`);
  $('#saveImg').onclick = () => { mood = isSaved ? mood.filter(m => m.id !== it.id) : [it, ...mood].slice(0, 500); store.set('mood', mood); toast(isSaved ? 'Removed' : 'Saved to moodboard'); openImage(it); };
}
async function loadStrip() {
  const q = pick(TOPICS[pick(Object.keys(TOPICS))]);
  const items = shuffle([...(await openverse(q)), ...(await commons(q))]).filter(i => !BLOCK.test(i.title + ' ' + i.tags)).slice(0, 10);
  const el = $('#strip'); el.innerHTML = '';
  items.forEach(it => { const b = document.createElement('button'); b.innerHTML = `<img src="${esc(it.thumb)}" alt="${esc(it.title)}" loading="lazy" referrerpolicy="no-referrer">`; b._item = it; fadeIn(b.querySelector('img')); b.querySelector('img').onerror = () => b.remove(); el.appendChild(b); });
}

/* ------------------------------------------------------------ saved */
$('#savedBtn').onclick = () => showSaved('Stories');
function showSaved(tab) {
  open(`<div class="bar"><h2 style="margin:0">Saved</h2>${closeBtn}</div>
    <div class="tabs"><button class="chip" data-t="Stories" aria-pressed="${tab === 'Stories'}">Stories (${saved.length})</button><button class="chip" data-t="Moodboard" aria-pressed="${tab === 'Moodboard'}">Moodboard (${mood.length})</button></div>
    ${tab === 'Stories' ? (saved.map(storyRow).join('') || '<p class="empty">Open a story and tap Save.</p>')
      : (mood.length ? `<div class="mini">${mood.map(m => `<button data-id="${esc(m.id)}"><img src="${esc(m.thumb)}" alt="${esc(m.title)}" referrerpolicy="no-referrer"></button>`).join('')}</div>` : '<p class="empty">Tap any image in Inspire and save it here.</p>')}
    <p class="note">Saved on this device only.</p>`);
  panel.querySelectorAll('[data-t]').forEach(b => b.onclick = () => showSaved(b.dataset.t));
}

/* ------------------------------------------------------------ refresh */
let busy = false;
async function refresh() {
  if (busy) return; busy = true; $('#refreshBtn').classList.add('spin');
  const v = current();
  if (v === 'inspire') { resetGrid(); await loadBatch(); toast('New images'); }
  else { await loadData(true); if (v === 'today') loadStrip(); toast('Up to date'); }
  $('#refreshBtn').classList.remove('spin'); busy = false;
}
$('#refreshBtn').onclick = refresh;
// Pull to refresh: drag down from the top of the page.
(() => {
  const ptr = $('#ptr'); let y0 = null, dy = 0;
  addEventListener('touchstart', e => { y0 = scrollY <= 0 && !sheet.classList.contains('open') ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  addEventListener('touchmove', e => { if (y0 === null) return; dy = e.touches[0].clientY - y0; if (dy > 0) { ptr.classList.add('pulling'); ptr.style.height = Math.min(dy * 0.5, 70) + 'px'; ptr.textContent = dy > 130 ? 'Release to refresh' : 'Pull to refresh'; } }, { passive: true });
  addEventListener('touchend', async () => { if (y0 === null) return; ptr.classList.remove('pulling'); y0 = null;
    if (dy > 130) { ptr.style.height = '44px'; ptr.textContent = 'Refreshing…'; await refresh(); }
    ptr.style.height = '0'; });
})();

/* ------------------------------------------------------------ navigation */
const VIEWS = ['today', 'learn', 'inspire', 'events'];
const current = () => VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today';
function show() {
  const v = current();
  VIEWS.forEach(x => $('#' + x + '-v').classList.toggle('on', x === v));
  document.querySelectorAll('nav button').forEach(b => b.dataset.v === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  scrollTo(0, 0);
  if (v === 'inspire' && !$('#c0').children.length) loadBatch();
  if (v === 'events') document.querySelector('nav [data-v="events"]').classList.remove('dot');
}
document.querySelector('nav').onclick = e => { const b = e.target.closest('button'); if (b) location.hash = b.dataset.v; };
$('#toInspire').onclick = () => { location.hash = 'inspire'; };
addEventListener('hashchange', show);
chips($('#ifilters'), CATS, c => { if (c === cat && $('#c0').children.length) return; cat = c; resetGrid(); if (current() === 'inspire') loadBatch(); });
$('#count').textContent = shown.toLocaleString('en-GB');

/* ------------------------------------------------------------ start */
fetch('met_pool.json').then(r => r.json()).then(p => { metPool = shuffle(p); }).catch(() => {});
show(); loadData(false); loadLibrary(); loadStrip();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && DATA && DATA.date !== todayISO()) loadData(true); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
