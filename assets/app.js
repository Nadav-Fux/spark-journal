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
  deployment: '#22c55e', performance: '#f59e0b', features: '#a855f7',
  research: '#ec4899', 'future-plans': '#14b8a6', projects: '#f97316'
};

const SEV = {
  he: { critical:'קריטי', warning:'אזהרה', info:'מידע', success:'הצלחה' },
  en: { critical:'Critical', warning:'Warning', info:'Info', success:'Success' }
};

const L = {
  he: { all:'הכל', search:'חיפוש...', noResults:'לא נמצאו רשומות', noResultsSub:'נסה לשנות את החיפוש או הפילטר', related:'רשומות קשורות', filtering:'מסנן:', switchLang:'Switch to English' },
  en: { all:'All', search:'Search...', noResults:'No entries found', noResultsSub:'Try adjusting your search or filters', related:'Related Entries', filtering:'Filtering:', switchLang:'עבור לעברית' }
};

/* ── Helpers ── */
function loc(obj, field) {
  if (!obj) return '';
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
  try {
    return new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { year:'numeric', month:'short', day:'numeric' });
  } catch (e) {
    return iso;
  }
}

function catLabel(id) {
  const c = categories[id];
  if (!c) return id || '';
  return c[lang] || c.en || c.he || id;
}

function isHtml(s) { return /<[a-z][\s\S]*>/i.test(s); }

/* ── DOM refs ── */
const $ = (id) => document.getElementById(id);
const $cards   = $('cards');
const $empty   = $('empty');
const $count   = $('count');
const $cats    = $('cats');
const $tags    = $('tags');
const $search  = $('search');
const $langBtn = $('lang-btn');
const $drawer  = $('drawer');
const $dHead   = $('drawer-head');
const $dBody   = $('drawer-body');
const $dClose  = $('drawer-close');
const $dBack   = $('drawer-backdrop');
const $dPanel  = $('drawer-panel');
const $dScrollTop = $('drawer-scroll-top');
const $filters = $('filters');

/* ── Boot ── */
function init() {
  fetch('./data/entries.json')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      entries = data.entries || (Array.isArray(data) ? data : []);
      categories = data.categories || {};
      buildCats();
      buildTags();
      render();
      wireEvents();
      handleHash();
      window.addEventListener('hashchange', handleHash);
    })
    .catch(function(e) {
      if ($cards) $cards.innerHTML = '<p style="color:#ef4444;padding:40px;text-align:center">Failed to load data: ' + esc(e.message) + '</p>';
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* ── Render cards ── */
function render() {
  var list = entries.filter(function(e) {
    if (filterCat && e.category !== filterCat) return false;
    if (filterTag && !(e.tags || []).includes(filterTag)) return false;
    if (query) {
      var q = query.toLowerCase();
      var t = (loc(e,'title') || '').toLowerCase();
      var s = (loc(e,'summary') || '').toLowerCase();
      var tags = (e.tags || []).join(' ').toLowerCase();
      if (!t.includes(q) && !s.includes(q) && !tags.includes(q)) return false;
    }
    return true;
  });
  list.sort(function(a,b) { return new Date(b.date) - new Date(a.date); });

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

  // Attach click + keyboard events
  $cards.querySelectorAll('.card').forEach(function(el) {
    el.addEventListener('click', function() { openEntry(el.dataset.id); });
    el.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEntry(el.dataset.id); }
    });
  });
  $cards.querySelectorAll('.card-tag').forEach(function(el) {
    el.addEventListener('click', function(ev) { ev.stopPropagation(); setTag(el.dataset.tag); });
  });
}

function cardHtml(e) {
  var title = esc(loc(e,'title'));
  var summary = esc(loc(e,'summary'));
  var sev = e.severity || 'info';
  var sevText = esc((SEV[lang] || SEV.en)[sev] || sev);
  var cat = esc(catLabel(e.category));
  var date = esc(fmtDate(e.date));
  var tags = (e.tags || []).map(function(t) {
    return '<span class="card-tag" data-tag="' + esc(t) + '" role="button" tabindex="0">' + esc(t) + '</span>';
  }).join('');

  return '<article class="card" data-id="' + esc(e.id) + '" data-cat="' + esc(e.category) + '" tabindex="0" role="button" aria-label="' + title + '">' +
    '<div class="card-top">' +
      '<span class="badge badge-' + esc(sev) + '">' + sevText + '</span>' +
      '<span class="cat-label">' + cat + '</span>' +
      '<span class="card-date">' + date + '</span>' +
      '<svg class="card-arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>' +
    '</div>' +
    '<h2 class="card-title">' + title + '</h2>' +
    '<p class="card-summary">' + summary + '</p>' +
    (tags ? '<div class="card-tags">' + tags + '</div>' : '') +
  '</article>';
}

/* ── Categories ── */
function buildCats() {
  var counts = {};
  entries.forEach(function(e) { counts[e.category] = (counts[e.category] || 0) + 1; });

  var html = '<button class="cat-btn' + (!filterCat ? ' active' : '') + '" data-cat="" aria-pressed="' + (!filterCat) + '">' +
    '<span>' + esc(L[lang].all) + '</span><span class="cat-count">' + entries.length + '</span></button>';

  Object.keys(categories).forEach(function(id) {
    var active = filterCat === id;
    var color = CAT_COLORS[id] || '#888';
    html += '<button class="cat-btn' + (active ? ' active' : '') + '" data-cat="' + esc(id) + '" aria-pressed="' + active + '">' +
      '<span><span class="cat-dot" style="background:' + color + '" aria-hidden="true"></span>' + esc(catLabel(id)) + '</span>' +
      '<span class="cat-count">' + (counts[id] || 0) + '</span></button>';
  });
  $cats.innerHTML = html;
  $cats.querySelectorAll('.cat-btn').forEach(function(b) {
    b.addEventListener('click', function() { setCat(b.dataset.cat || null); });
  });
}

/* ── Tags ── */
function buildTags() {
  var tc = {};
  entries.forEach(function(e) { (e.tags || []).forEach(function(t) { tc[t] = (tc[t] || 0) + 1; }); });
  var sorted = Object.entries(tc).sort(function(a,b) { return b[1] - a[1]; }).slice(0, 15);
  if (!sorted.length) { $tags.innerHTML = ''; return; }

  $tags.innerHTML = sorted.map(function(pair) {
    var t = pair[0];
    var active = filterTag === t;
    return '<button class="tag' + (active ? ' active' : '') + '" data-tag="' + esc(t) + '" role="listitem" aria-pressed="' + active + '">' + esc(t) + '</button>';
  }).join('');
  $tags.querySelectorAll('.tag').forEach(function(b) {
    b.addEventListener('click', function() { setTag(b.dataset.tag); });
  });
}

/* ── Filters bar ── */
function updateFilters() {
  var parts = [];
  if (filterCat) parts.push('<span class="filter-chip">' + esc(catLabel(filterCat)) + ' <span class="filter-x" data-action="clear-cat" role="button" tabindex="0" aria-label="Remove category filter">&times;</span></span>');
  if (filterTag) parts.push('<span class="filter-chip">#' + esc(filterTag) + ' <span class="filter-x" data-action="clear-tag" role="button" tabindex="0" aria-label="Remove tag filter">&times;</span></span>');
  if (query) parts.push('<span class="filter-chip">&ldquo;' + esc(query) + '&rdquo; <span class="filter-x" data-action="clear-search" role="button" tabindex="0" aria-label="Clear search">&times;</span></span>');

  if (!parts.length) { $filters.hidden = true; return; }
  $filters.hidden = false;
  $filters.innerHTML = '<span>' + L[lang].filtering + '</span> ' + parts.join(' ');
  $filters.querySelectorAll('.filter-x').forEach(function(x) {
    function handleClear() {
      var a = x.dataset.action;
      if (a === 'clear-cat') setCat(null);
      else if (a === 'clear-tag') setTag(null);
      else if (a === 'clear-search') { query = ''; $search.value = ''; render(); buildCats(); buildTags(); }
    }
    x.addEventListener('click', handleClear);
    x.addEventListener('keydown', function(ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); handleClear(); } });
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
  var e = entries.find(function(x) { return x.id === id; });
  if (!e) return;

  var sev = e.severity || 'info';
  var sevText = esc((SEV[lang] || SEV.en)[sev] || sev);
  var cat = esc(catLabel(e.category));
  var date = esc(fmtDate(e.date));
  var title = esc(loc(e,'title'));
  var details = loc(e,'details') || '';
  var detailsHtml = isHtml(details) ? details : details.split('\n\n').map(function(p) { return '<p>' + esc(p.trim()) + '</p>'; }).join('');

  var tags = (e.tags || []).map(function(t) {
    return '<span class="card-tag" data-tag="' + esc(t) + '" role="button" tabindex="0">' + esc(t) + '</span>';
  }).join('');

  $dHead.innerHTML =
    '<h1 class="drawer-title" id="drawer-title">' + title + '</h1>' +
    '<div class="drawer-meta">' +
      '<span class="badge badge-' + esc(sev) + '">' + sevText + '</span>' +
      '<span class="cat-label">' + cat + '</span>' +
      '<span class="card-date">' + date + '</span>' +
    '</div>' +
    (tags ? '<div class="drawer-tags">' + tags + '</div>' : '');

  var related = '';
  if (Array.isArray(e.related) && e.related.length) {
    var links = e.related.map(function(rid) {
      var r = entries.find(function(x) { return x.id === rid; });
      var rTitle = r ? esc(loc(r,'title')) : esc(rid);
      return '<a href="#entry/' + esc(rid) + '" class="related-link">' + rTitle + '</a>';
    }).join('');
    related = '<div class="drawer-related"><h3>' + L[lang].related + '</h3>' + links + '</div>';
  }

  $dBody.innerHTML = detailsHtml + related;

  // Wire tag clicks in drawer
  $dHead.querySelectorAll('.card-tag').forEach(function(el) {
    function handleTagClick() { closeDrawer(); setTag(el.dataset.tag); }
    el.addEventListener('click', handleTagClick);
    el.addEventListener('keydown', function(ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); handleTagClick(); } });
  });
  // Wire related links
  $dBody.querySelectorAll('.related-link').forEach(function(a) {
    a.addEventListener('click', function(ev) { ev.preventDefault(); openEntry(a.getAttribute('href').replace('#entry/','')); });
  });

  $drawer.hidden = false;
  document.body.classList.add('drawer-open');
  $dPanel.scrollTop = 0;
  if ($dScrollTop) $dScrollTop.classList.remove('visible');
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
  var h = location.hash;
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
  $langBtn.setAttribute('aria-label', L[lang].switchLang);
  $search.placeholder = L[lang].search;
  // Update search label
  var searchLabel = document.querySelector('label[for="search"]');
  if (searchLabel) searchLabel.textContent = lang === 'he' ? 'חיפוש רשומות' : 'Search entries';

  buildCats();
  buildTags();
  render();
  // Re-render drawer if open
  if (!$drawer.hidden) {
    var h = location.hash;
    if (h.startsWith('#entry/')) openEntry(decodeURIComponent(h.slice(7)));
  }
}

/* ── Events ── */
function wireEvents() {
  $langBtn.addEventListener('click', toggleLang);
  $dClose.addEventListener('click', closeDrawer);
  $dBack.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !$drawer.hidden) closeDrawer();
  });

  var timer;
  $search.addEventListener('input', function() {
    clearTimeout(timer);
    timer = setTimeout(function() {
      query = $search.value.trim();
      filterCat = null; filterTag = null;
      render(); buildCats(); buildTags();
    }, 200);
  });

  // Drawer scroll-to-top button
  if ($dPanel && $dScrollTop) {
    $dPanel.addEventListener('scroll', function() {
      if ($dPanel.scrollTop > 300) {
        $dScrollTop.classList.add('visible');
      } else {
        $dScrollTop.classList.remove('visible');
      }
    });
    $dScrollTop.addEventListener('click', function() {
      $dPanel.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}
