/* Spark Log — app.js */
'use strict';

let entries = [];
let categories = {};
let lang = 'he';
let section = 'log'; // 'log', 'posts', 'ideas'
let filterCat = null;
let filterTag = null;
let query = '';
let sortAsc = false; // false = newest first (default), true = oldest first
let lastFocusedCard = null; // for focus restoration on drawer close

// Which categories belong to which section
const SECTION_CATS = {
  log: ['system','monitoring','security','deployment','performance','features','research','reports','future-plans','projects'],
  posts: ['posts'],
  ideas: ['ideas']
};

const CAT_COLORS = {
  system: '#06b6d4', monitoring: '#8b5cf6', security: '#ef4444',
  deployment: '#22c55e', performance: '#f59e0b', features: '#a855f7',
  research: '#ec4899', reports: '#10b981', 'future-plans': '#14b8a6', projects: '#f97316',
  posts: '#3b82f6', ideas: '#fbbf24'
};

const SEV = {
  he: { critical:'קריטי', warning:'אזהרה', info:'מידע', success:'הצלחה' },
  en: { critical:'Critical', warning:'Warning', info:'Info', success:'Success' }
};

const L = {
  he: { all:'הכל', search:'חיפוש...', noResults:'לא נמצאו רשומות', noResultsSub:'נסה לשנות את החיפוש או הפילטר', related:'רשומות קשורות', filtering:'מסנן:', switchLang:'Switch to English', newestFirst:'↓ חדש', oldestFirst:'↑ ישן' },
  en: { all:'All', search:'Search...', noResults:'No entries found', noResultsSub:'Try adjusting your search or filters', related:'Related Entries', filtering:'Filtering:', switchLang:'עבור לעברית', newestFirst:'↓ New', oldestFirst:'↑ Old' }
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
const $sortBtn = $('sort-btn');

/* ── Boot ── */
function init() {
  $cards.innerHTML = '<p style="color:#888;padding:40px;text-align:center">טוען... / Loading...</p>';
  fetch('./data/entries.json')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      entries = data.entries || (Array.isArray(data) ? data : []);
      window.__allEntries = entries;
      categories = data.categories || {};
      // Detect section from hash
      if (location.hash.startsWith('#section/')) {
        section = location.hash.slice(9) || 'log';
      }
      buildCats();
      buildTags();
      updateSortBtn();
      updateSectionTabs();
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

/* ── Section entries ── */
function sectionEntries() {
  var cats = SECTION_CATS[section] || [];
  return entries.filter(function(e) { return cats.indexOf(e.category) !== -1; });
}

/* ── Render cards ── */
function render() {
  var list = sectionEntries().filter(function(e) {
    if (filterCat && e.category !== filterCat) return false;
    if (filterTag && !(e.tags || []).includes(filterTag)) return false;
    if (query) {
      var q = query.toLowerCase();
      var t = (loc(e,'title') || '').toLowerCase();
      var s = (loc(e,'summary') || '').toLowerCase();
      var d = (loc(e,'details') || '').replace(/<[^>]+>/g, ' ').toLowerCase();
      var tags = (e.tags || []).join(' ').toLowerCase();
      if (!t.includes(q) && !s.includes(q) && !d.includes(q) && !tags.includes(q)) return false;
    }
    return true;
  });
  list.sort(function(a,b) { return sortAsc ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date); });

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
  var se = sectionEntries();
  var sectionCatIds = SECTION_CATS[section] || [];
  var counts = {};
  se.forEach(function(e) { counts[e.category] = (counts[e.category] || 0) + 1; });

  // Only show sub-category filter if section has more than one category
  if (sectionCatIds.length <= 1) {
    $cats.innerHTML = '';
    return;
  }

  var html = '<button class="cat-btn' + (!filterCat ? ' active' : '') + '" data-cat="" aria-pressed="' + (!filterCat) + '">' +
    '<span>' + esc(L[lang].all) + '</span><span class="cat-count">' + se.length + '</span></button>';

  sectionCatIds.forEach(function(id) {
    if (!categories[id]) return;
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
  sectionEntries().forEach(function(e) { (e.tags || []).forEach(function(t) { tc[t] = (tc[t] || 0) + 1; }); });
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
  // Save the currently focused element so we can restore focus on close
  if (document.activeElement && document.activeElement !== document.body) {
    lastFocusedCard = document.activeElement;
  }

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

  // Add copy button for posts category
  var copyBtn = '';
  if (e.category === 'posts') {
    copyBtn = '<div style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="copy-btn" data-target="details" style="padding:8px 16px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.9em">📋 ' + (lang === 'he' ? 'העתק הכל' : 'Copy All') + '</button>' +
      '</div>';
  }
  $dBody.innerHTML = copyBtn + detailsHtml + related;

  // Wire copy button for posts
  $dBody.querySelectorAll('.copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var text = $dBody.innerText || $dBody.textContent || '';
      // Remove the button text itself from the copy
      text = text.replace(/^.*Copy All.*\n?/m, '').replace(/^.*העתק הכל.*\n?/m, '').trim();
      navigator.clipboard.writeText(text).then(function() {
        btn.textContent = lang === 'he' ? '✓ הועתק!' : '✓ Copied!';
        btn.style.background = '#22c55e';
        setTimeout(function() {
          btn.innerHTML = '📋 ' + (lang === 'he' ? 'העתק הכל' : 'Copy All');
          btn.style.background = '#3b82f6';
        }, 2000);
      }).catch(function() {
        // Fallback for older browsers
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btn.textContent = lang === 'he' ? '✓ הועתק!' : '✓ Copied!';
        btn.style.background = '#22c55e';
        setTimeout(function() {
          btn.innerHTML = '📋 ' + (lang === 'he' ? 'העתק הכל' : 'Copy All');
          btn.style.background = '#3b82f6';
        }, 2000);
      });
    });
  });

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
  trapFocus($dPanel);
}

function closeDrawer() {
  $drawer.hidden = true;
  document.body.classList.remove('drawer-open');
  if (location.hash.startsWith('#entry/')) history.pushState(null, '', location.pathname);
  // Restore focus to the card that triggered the drawer
  if (lastFocusedCard) {
    lastFocusedCard.focus();
    lastFocusedCard = null;
  }
}

/* ── Focus trap ── */
var _trapHandler = null;
function trapFocus(panel) {
  // Remove any previous trap handler
  if (_trapHandler) panel.removeEventListener('keydown', _trapHandler);
  _trapHandler = function(ev) {
    if (ev.key !== 'Tab') return;
    var focusable = Array.prototype.slice.call(panel.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (ev.shiftKey) {
      if (document.activeElement === first) { ev.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  };
  panel.addEventListener('keydown', _trapHandler);
}

/* ── Hash nav ── */
function handleHash() {
  var h = location.hash;
  if (h.startsWith('#section/')) {
    var s = h.slice(9);
    if (s !== section) setSection(s);
    return;
  }
  if (h.startsWith('#entry/')) {
    var entryId = decodeURIComponent(h.slice(7));
    // Auto-switch section if entry belongs to a different one
    var entry = entries.find(function(x) { return x.id === entryId; });
    if (entry) {
      for (var s in SECTION_CATS) {
        if (SECTION_CATS[s].indexOf(entry.category) !== -1 && s !== section) {
          section = s;
          updateSectionTabs();
          buildCats();
          buildTags();
          render();
          break;
        }
      }
    }
    openEntry(entryId);
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

  updateSortBtn();
  updateSectionTabs();
  buildCats();
  buildTags();
  render();
  // Re-render drawer if open
  if (!$drawer.hidden) {
    var h = location.hash;
    if (h.startsWith('#entry/')) openEntry(decodeURIComponent(h.slice(7)));
  }
}

/* ── Sort toggle ── */
function toggleSort() {
  sortAsc = !sortAsc;
  updateSortBtn();
  render();
}
function updateSortBtn() {
  if (!$sortBtn) return;
  $sortBtn.textContent = sortAsc ? L[lang].oldestFirst : L[lang].newestFirst;
  $sortBtn.setAttribute('aria-label', sortAsc ? L[lang].oldestFirst : L[lang].newestFirst);
}

/* ── Section switching ── */
function setSection(s) {
  section = s;
  filterCat = null;
  filterTag = null;
  query = '';
  $search.value = '';
  updateSectionTabs();
  buildCats();
  buildTags();
  render();
}

function updateSectionTabs() {
  document.querySelectorAll('.section-tab').forEach(function(tab) {
    var isActive = tab.dataset.section === section;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-pressed', isActive);
  });
}

/* ── Events ── */
function wireEvents() {
  // Section tabs
  document.querySelectorAll('.section-tab').forEach(function(tab) {
    tab.addEventListener('click', function() { setSection(tab.dataset.section); });
  });

  $langBtn.addEventListener('click', toggleLang);
  if ($sortBtn) $sortBtn.addEventListener('click', toggleSort);
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

/* ── Search Overlay ── */
(function() {
  var $overlay    = document.getElementById('search-overlay');
  var $backdrop   = document.getElementById('search-overlay-backdrop');
  var $input      = document.getElementById('overlay-search');
  var $results    = document.getElementById('overlay-results');
  var $searchBtn  = document.getElementById('search-btn');
  var focusIdx    = -1;

  function openOverlay() {
    $overlay.hidden = false;
    document.body.classList.add('search-open');
    $input.value = '';
    $results.innerHTML = renderHint();
    focusIdx = -1;
    setTimeout(function() { $input.focus(); }, 50);
  }

  function closeOverlay() {
    $overlay.hidden = true;
    document.body.classList.remove('search-open');
    focusIdx = -1;
  }

  function renderHint() {
    return '<div class="overlay-hint"><span><kbd>↑</kbd><kbd>↓</kbd> ניווט</span><span><kbd>Enter</kbd> פתח</span><span><kbd>ESC</kbd> סגור</span></div>';
  }

  function searchEntries(q) {
    if (!q) { $results.innerHTML = renderHint(); focusIdx = -1; return; }
    var ql = q.toLowerCase();
    var hits = [];
    (window.__allEntries || []).forEach(function(e) {
      var title   = (loc(e,'title')   || '').toLowerCase();
      var summary = (loc(e,'summary') || '').toLowerCase();
      var details = (loc(e,'details') || '').replace(/<[^>]+>/g,' ').toLowerCase();
      var tags    = (e.tags || []).join(' ').toLowerCase();
      if (title.includes(ql) || summary.includes(ql) || details.includes(ql) || tags.includes(ql)) {
        hits.push(e);
      }
    });

    if (!hits.length) {
      $results.innerHTML = '<div class="overlay-empty">לא נמצאו תוצאות עבור &ldquo;' + esc(q) + '&rdquo;</div>' + renderHint();
      focusIdx = -1;
      return;
    }

    var html = hits.slice(0,20).map(function(e, i) {
      var date = e.date ? e.date.slice(0,10) : '';
      return '<div class="overlay-result-item" data-id="' + esc(e.id) + '" tabindex="-1">' +
        '<div class="overlay-result-title">' + esc(loc(e,'title') || e.id) + '</div>' +
        '<div class="overlay-result-summary">' + esc((loc(e,'summary') || '').slice(0,120)) + '</div>' +
        '<div class="overlay-result-meta"><span class="overlay-result-cat">' + esc(e.category||'') + '</span><span>' + date + '</span></div>' +
        '</div>';
    }).join('');
    if (hits.length > 20) html += '<div class="overlay-empty" style="padding:8px 12px;font-size:11px">+ ' + (hits.length - 20) + ' תוצאות נוספות — צמצם את החיפוש</div>';
    html += renderHint();
    $results.innerHTML = html;
    focusIdx = -1;

    $results.querySelectorAll('.overlay-result-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var id = el.dataset.id;
        closeOverlay();
        setTimeout(function() { openEntry(id); }, 80);
      });
    });
  }

  function moveFocus(dir) {
    var items = Array.prototype.slice.call($results.querySelectorAll('.overlay-result-item'));
    if (!items.length) return;
    items.forEach(function(el) { el.classList.remove('focused'); });
    focusIdx = Math.max(0, Math.min(items.length - 1, focusIdx + dir));
    items[focusIdx].classList.add('focused');
    items[focusIdx].scrollIntoView({ block: 'nearest' });
  }

  if ($searchBtn) $searchBtn.addEventListener('click', openOverlay);
  if ($backdrop)  $backdrop.addEventListener('click', closeOverlay);

  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openOverlay(); return; }
    if (e.key === '/' && !e.target.matches('input,textarea,[contenteditable]') && $overlay.hidden) { e.preventDefault(); openOverlay(); return; }
    if (!$overlay.hidden) {
      if (e.key === 'Escape') { closeOverlay(); return; }
      if (e.key === 'ArrowDown')  { e.preventDefault(); moveFocus(1); return; }
      if (e.key === 'ArrowUp')    { e.preventDefault(); moveFocus(-1); return; }
      if (e.key === 'Enter') {
        var focused = $results.querySelector('.overlay-result-item.focused');
        if (focused) focused.click();
        return;
      }
    }
  });

  $input.addEventListener('input', function() { searchEntries($input.value.trim()); });
  document.getElementById('overlay-esc-hint').addEventListener('click', closeOverlay);

  // Expose entries for search after load
  var _origInit = window.__onEntriesLoaded;
  document.addEventListener('entriesLoaded', function(e) {
    window.__allEntries = e.detail || [];
  });
})();
