/* Spark Journal — app.js */
'use strict';

let entries = [];
let categories = {};
let lang = 'he';
let filterCat = null;
let filterTag = null;
let query = '';

const CAT_COLORS = {
  system: '#06b6d4', monitoring: '#8b5cf6', security: '#ef4444',
  deployment: '#22c55e', performance: '#f59e0b', features: '#a855f7'
};

const SEV = {
  he: { critical:'קריטי', warning:'אזהרה', info:'מידע', success:'הצלחה' },
  en: { critical:'Critical', warning:'Warning', info:'Info', success:'Success' }
};

const L = {
  he: { all:'הכל', search:'חיפוש...', noResults:'לא נמצאו רשומות', noResultsSub:'נסה לשנות את החיפוש או הפילטר', related:'רשומות קשורות', filtering:'מסנן:' },
  en: { all:'All', search:'Search...', noResults:'No entries found', noResultsSub:'Try adjusting your search or filters', related:'Related Entries', filtering:'Filtering:' }
};

/* ── Helpers ── */
function loc(obj, field) {
  if (!obj) return '';
  // Try field_lang first (e.g. title_en), then field as {he,en} object, then string
  const suffixed = obj[field + '_' + lang];
  if (suffixed !== undefined) return suffixed;
  const val = obj[field];
  if (!val) return '';
  if (typeof val === 'string') return val;
  return val[lang] || val.en || val.he || '';
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { year:'numeric', month:'short', day:'numeric' }); }
  catch { return iso; }
}

function catLabel(id) {
  const c = categories[id];
  if (!c) return id || '';
  return c[lang] || c.en || c.he || id;
}

function isHtml(s) { return /<[a-z][\s\S]*>/i.test(s); }

/* ── DOM refs ── */
const $cards   = document.getElementById('cards');
const $empty   = document.getElementById('empty');
const $count   = document.getElementById('count');
const $cats    = document.getElementById('cats');
const $tags    = document.getElementById('tags');
const $search  = document.getElementById('search');
const $langBtn = document.getElementById('lang-btn');
const $drawer  = document.getElementById('drawer');
const $dHead   = document.getElementById('drawer-head');
const $dBody   = document.getElementById('drawer-body');
const $dClose  = document.getElementById('drawer-close');
const $dBack   = document.getElementById('drawer-backdrop');
const $filters = document.getElementById('filters');

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('./data/entries.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    entries = data.entries || (Array.isArray(data) ? data : []);
    categories = data.categories || {};
  } catch (e) {
    $cards.innerHTML = '<p style="color:#ef4444;padding:40px;text-align:center">Failed to load data: ' + esc(e.message) + '</p>';
    return;
  }
  buildCats();
  buildTags();
  render();
  wireEvents();
  handleHash();
  window.addEventListener('hashchange', handleHash);
});

/* ── Render cards ── */
function render() {
  let list = entries.filter(e => {
    if (filterCat && e.category !== filterCat) return false;
    if (filterTag && !(e.tags || []).includes(filterTag)) return false;
    if (query) {
      const q = query.toLowerCase();
      const t = (loc(e,'title') || '').toLowerCase();
      const s = (loc(e,'summary') || '').toLowerCase();
      const tags = (e.tags || []).join(' ').toLowerCase();
      if (!t.includes(q) && !s.includes(q) && !tags.includes(q)) return false;
    }
    return true;
  });
  list.sort((a,b) => new Date(b.date) - new Date(a.date));

  $count.textContent = list.length;
  updateFilters();

  if (!list.length) {
    $cards.innerHTML = '';
    $empty.hidden = false;
    $empty.querySelector('.empty-title').textContent = L[lang].noResults;
    $empty.querySelector('.empty-sub').textContent = L[lang].noResultsSub;
    return;
  }
  $empty.hidden = true;
  $cards.innerHTML = list.map(cardHtml).join('');

  // Attach events
  $cards.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => openEntry(el.dataset.id));
  });
  $cards.querySelectorAll('.card-tag').forEach(el => {
    el.addEventListener('click', ev => { ev.stopPropagation(); setTag(el.dataset.tag); });
  });
}

function cardHtml(e) {
  const title = esc(loc(e,'title'));
  const summary = esc(loc(e,'summary'));
  const sev = e.severity || 'info';
  const sevText = esc((SEV[lang] || SEV.en)[sev] || sev);
  const cat = esc(catLabel(e.category));
  const date = esc(fmtDate(e.date));
  const tags = (e.tags || []).map(t =>
    '<span class="card-tag" data-tag="' + esc(t) + '">' + esc(t) + '</span>'
  ).join('');

  return '<article class="card" data-id="' + esc(e.id) + '" data-cat="' + esc(e.category) + '" tabindex="0">' +
    '<div class="card-top">' +
      '<span class="badge badge-' + esc(sev) + '">' + sevText + '</span>' +
      '<span class="cat-label">' + cat + '</span>' +
      '<span class="card-date">' + date + '</span>' +
      '<svg class="card-arrow" width="16" height="16" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>' +
    '</div>' +
    '<h2 class="card-title">' + title + '</h2>' +
    '<p class="card-summary">' + summary + '</p>' +
    (tags ? '<div class="card-tags">' + tags + '</div>' : '') +
  '</article>';
}

/* ── Categories ── */
function buildCats() {
  const counts = {};
  entries.forEach(e => { counts[e.category] = (counts[e.category] || 0) + 1; });

  let html = '<button class="cat-btn' + (!filterCat ? ' active' : '') + '" data-cat="">' +
    '<span>' + esc(L[lang].all) + '</span><span class="cat-count">' + entries.length + '</span></button>';

  Object.keys(categories).forEach(id => {
    const active = filterCat === id ? ' active' : '';
    const color = CAT_COLORS[id] || '#888';
    html += '<button class="cat-btn' + active + '" data-cat="' + esc(id) + '">' +
      '<span><span class="cat-dot" style="background:' + color + '"></span>' + esc(catLabel(id)) + '</span>' +
      '<span class="cat-count">' + (counts[id] || 0) + '</span></button>';
  });
  $cats.innerHTML = html;
  $cats.querySelectorAll('.cat-btn').forEach(b => {
    b.addEventListener('click', () => setCat(b.dataset.cat || null));
  });
}

/* ── Tags ── */
function buildTags() {
  const tc = {};
  entries.forEach(e => (e.tags || []).forEach(t => { tc[t] = (tc[t] || 0) + 1; }));
  const sorted = Object.entries(tc).sort((a,b) => b[1] - a[1]).slice(0, 15);
  if (!sorted.length) { $tags.innerHTML = ''; return; }

  $tags.innerHTML = sorted.map(([t]) => {
    const active = filterTag === t ? ' active' : '';
    return '<button class="tag' + active + '" data-tag="' + esc(t) + '">' + esc(t) + '</button>';
  }).join('');
  $tags.querySelectorAll('.tag').forEach(b => {
    b.addEventListener('click', () => setTag(b.dataset.tag));
  });
}

/* ── Filters bar ── */
function updateFilters() {
  const parts = [];
  if (filterCat) parts.push('<span class="filter-chip">' + esc(catLabel(filterCat)) + ' <span class="filter-x" data-action="clear-cat">&times;</span></span>');
  if (filterTag) parts.push('<span class="filter-chip">#' + esc(filterTag) + ' <span class="filter-x" data-action="clear-tag">&times;</span></span>');
  if (query) parts.push('<span class="filter-chip">"' + esc(query) + '" <span class="filter-x" data-action="clear-search">&times;</span></span>');

  if (!parts.length) { $filters.hidden = true; return; }
  $filters.hidden = false;
  $filters.innerHTML = '<span>' + L[lang].filtering + '</span> ' + parts.join(' ');
  $filters.querySelectorAll('.filter-x').forEach(x => {
    x.addEventListener('click', () => {
      const a = x.dataset.action;
      if (a === 'clear-cat') setCat(null);
      else if (a === 'clear-tag') setTag(null);
      else if (a === 'clear-search') { query = ''; $search.value = ''; render(); buildCats(); buildTags(); }
    });
  });
}

/* ── Filter actions ── */
function setCat(cat) {
  filterCat = cat; filterTag = null; query = ''; $search.value = '';
  render(); buildCats(); buildTags();
}
function setTag(tag) {
  filterTag = filterTag === tag ? null : tag;
  filterCat = null; query = ''; $search.value = '';
  render(); buildCats(); buildTags();
}

/* ── Drawer ── */
function openEntry(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;

  const sev = e.severity || 'info';
  const sevText = esc((SEV[lang] || SEV.en)[sev] || sev);
  const cat = esc(catLabel(e.category));
  const date = esc(fmtDate(e.date));
  const title = esc(loc(e,'title'));
  const details = loc(e,'details') || '';
  const detailsHtml = isHtml(details) ? details : details.split('\n\n').map(p => '<p>' + esc(p.trim()) + '</p>').join('');

  const tags = (e.tags || []).map(t =>
    '<span class="card-tag" data-tag="' + esc(t) + '">' + esc(t) + '</span>'
  ).join('');

  $dHead.innerHTML =
    '<h1 class="drawer-title">' + title + '</h1>' +
    '<div class="drawer-meta">' +
      '<span class="badge badge-' + esc(sev) + '">' + sevText + '</span>' +
      '<span class="cat-label">' + cat + '</span>' +
      '<span class="card-date">' + date + '</span>' +
    '</div>' +
    (tags ? '<div class="drawer-tags">' + tags + '</div>' : '');

  let related = '';
  if (Array.isArray(e.related) && e.related.length) {
    const links = e.related.map(rid => {
      const r = entries.find(x => x.id === rid);
      const rTitle = r ? esc(loc(r,'title')) : esc(rid);
      return '<a href="#entry/' + esc(rid) + '" class="related-link">' + rTitle + '</a>';
    }).join('');
    related = '<div class="drawer-related"><h3>' + L[lang].related + '</h3>' + links + '</div>';
  }

  $dBody.innerHTML = detailsHtml + related;

  // Wire tag clicks in drawer
  $dHead.querySelectorAll('.card-tag').forEach(el => {
    el.addEventListener('click', () => { closeDrawer(); setTag(el.dataset.tag); });
  });
  // Wire related links
  $dBody.querySelectorAll('.related-link').forEach(a => {
    a.addEventListener('click', ev => { ev.preventDefault(); openEntry(a.getAttribute('href').replace('#entry/','')); });
  });

  $drawer.hidden = false;
  document.body.classList.add('drawer-open');
  if (location.hash !== '#entry/' + id) history.pushState(null, '', '#entry/' + id);
  $dClose.focus();
}

function closeDrawer() {
  $drawer.hidden = true;
  document.body.classList.remove('drawer-open');
  if (location.hash.startsWith('#entry/')) history.pushState(null, '', location.pathname);
}

/* ── Hash nav ── */
function handleHash() {
  const h = location.hash;
  if (h.startsWith('#entry/')) {
    openEntry(decodeURIComponent(h.slice(7)));
  } else if (!$drawer.hidden) {
    $drawer.hidden = true;
    document.body.classList.remove('drawer-open');
  }
}

/* ── Language toggle ── */
function toggleLang() {
  lang = lang === 'he' ? 'en' : 'he';
  document.documentElement.lang = lang === 'he' ? 'he' : 'en';
  document.documentElement.dir  = lang === 'he' ? 'rtl' : 'ltr';
  $langBtn.textContent = lang === 'he' ? 'EN' : 'עב';
  $search.placeholder = L[lang].search;
  // Show/hide logo text
  document.querySelector('.logo-he').style.display = lang === 'he' ? '' : 'none';
  document.querySelector('.logo-en').style.display = lang === 'en' ? '' : 'none';
  buildCats();
  buildTags();
  render();
  // Re-render drawer if open
  if (!$drawer.hidden) {
    const h = location.hash;
    if (h.startsWith('#entry/')) openEntry(decodeURIComponent(h.slice(7)));
  }
}

/* ── Events ── */
function wireEvents() {
  $langBtn.addEventListener('click', toggleLang);
  $dClose.addEventListener('click', closeDrawer);
  $dBack.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$drawer.hidden) closeDrawer(); });

  let timer;
  $search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = $search.value.trim();
      filterCat = null; filterTag = null;
      render(); buildCats(); buildTags();
    }, 200);
  });
}
