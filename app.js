// ---------- constants ----------
const STORAGE_KEY = 'flashcards.v1';
const SYNC_KEY = 'flashcards.sync.v1';
const MIN_WEIGHT = 0.25;
const MAX_WEIGHT = 8;
const RIGHT_MULT = 0.5;
const WRONG_MULT = 2.0;

// ---------- data ----------
function uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function newCard(front, back) {
  return { id: uid('card'), front, back, weight: 1, stats: { right: 0, wrong: 0 } };
}

function normalizeCard(c) {
  // Accept either { front, back, ... } objects or ['front', 'back'] array shorthand (used by seed data).
  if (Array.isArray(c)) {
    return { id: uid('card'), front: String(c[0] ?? ''), back: String(c[1] ?? ''), weight: 1, stats: { right: 0, wrong: 0 } };
  }
  return {
    id: c.id || uid('card'),
    front: c.front || '',
    back: c.back || '',
    weight: typeof c.weight === 'number' ? c.weight : 1,
    stats: c.stats || { right: 0, wrong: 0 },
  };
}

function normalizeCategory(cat) {
  return {
    id: cat.id || uid('cat'),
    name: cat.name || 'Untitled',
    cards: (cat.cards || []).map(normalizeCard),
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return {
        version: 1,
        updatedAt: parsed.updatedAt || Date.now(),
        categories: (parsed.categories || []).map(normalizeCategory),
      };
    } catch (e) { console.warn('Corrupt state, reseeding', e); }
  }
  return {
    version: 1,
    updatedAt: Date.now(),
    categories: (typeof SEED_CATEGORIES !== 'undefined' ? SEED_CATEGORIES : []).map(normalizeCategory),
  };
}

function saveState() {
  state.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleSync();
}

function loadSync() {
  const raw = localStorage.getItem(SYNC_KEY);
  if (raw) { try { return JSON.parse(raw); } catch {} }
  return { pat: '', gistId: '', lastSyncedAt: 0, enabled: false };
}

function saveSync() {
  localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
}

let state = loadState();
let sync = loadSync();
let view = { name: 'home' };
let lastCardId = null;

// ---------- view routing ----------
function navigate(next) {
  view = next;
  render();
  window.scrollTo(0, 0);
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'onClick') node.addEventListener('click', v);
    else if (k === 'onInput') node.addEventListener('input', v);
    else if (k === 'onSubmit') node.addEventListener('submit', v);
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
  }
  return node;
}

function render() {
  const root = document.getElementById('app');
  root.innerHTML = '';
  let node;
  switch (view.name) {
    case 'home': node = renderHome(); break;
    case 'category': node = renderCategory(view.categoryId); break;
    case 'study': node = renderStudy(view.categoryId); break;
    case 'settings': node = renderSettings(); break;
    default: node = renderHome();
  }
  root.appendChild(node);
}

// ---------- home ----------
function renderHome() {
  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'header' }, [
    el('h1', {}, 'Flashcards'),
    el('div', { class: 'actions' }, [
      el('button', { class: 'ghost', title: 'Settings', onClick: () => navigate({ name: 'settings' }) }, 'Settings'),
    ]),
  ]));

  if (state.categories.length === 0) {
    wrap.appendChild(el('div', { class: 'empty' }, 'No categories yet. Add one below.'));
  } else {
    const list = el('div', { class: 'list' });
    for (const cat of state.categories) {
      const totalCards = cat.cards.length;
      const dueLabel = totalCards === 0 ? 'No cards yet' : `${totalCards} card${totalCards === 1 ? '' : 's'}`;
      const row = el('div', { class: 'card-row clickable', onClick: () => navigate({ name: 'category', categoryId: cat.id }) }, [
        el('div', {}, [
          el('div', { class: 'name' }, cat.name),
          el('div', { class: 'meta' }, dueLabel),
        ]),
        el('div', { class: 'row-actions' }, [
          totalCards > 0 && el('button', { class: 'primary', onClick: (e) => { e.stopPropagation(); navigate({ name: 'study', categoryId: cat.id }); } }, 'Study'),
        ]),
      ]);
      list.appendChild(row);
    }
    wrap.appendChild(list);
  }

  // add category
  const form = el('form', { class: 'add-form', onSubmit: (e) => {
    e.preventDefault();
    const input = form.querySelector('input');
    const name = input.value.trim();
    if (!name) return;
    state.categories.push({ id: uid('cat'), name, cards: [] });
    saveState();
    input.value = '';
    render();
  } }, [
    el('div', { class: 'row' }, [
      el('input', { placeholder: 'New category name', maxLength: 60 }),
      el('button', { class: 'primary', type: 'submit' }, 'Add'),
    ]),
  ]);
  wrap.appendChild(form);
  return wrap;
}

// ---------- category detail ----------
function renderCategory(categoryId) {
  const cat = state.categories.find(c => c.id === categoryId);
  if (!cat) { navigate({ name: 'home' }); return el('div'); }

  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'header' }, [
    el('div', {}, [
      el('button', { class: 'ghost', onClick: () => navigate({ name: 'home' }) }, '‹ Back'),
    ]),
    el('h1', { style: { flex: '1', textAlign: 'center' } }, cat.name),
    el('div', { class: 'actions' }, [
      el('button', { class: 'primary', disabled: cat.cards.length === 0, onClick: () => navigate({ name: 'study', categoryId: cat.id }) }, 'Study'),
    ]),
  ]));

  wrap.appendChild(el('div', { class: 'subheader' }, [
    el('span', {}, `${cat.cards.length} card${cat.cards.length === 1 ? '' : 's'}`),
    el('span', { style: { marginLeft: 'auto' } }, [
      el('button', { class: 'danger', onClick: () => {
        if (confirm(`Delete category "${cat.name}" and its ${cat.cards.length} cards?`)) {
          state.categories = state.categories.filter(c => c.id !== cat.id);
          saveState();
          navigate({ name: 'home' });
        }
      } }, 'Delete category'),
    ]),
  ]));

  if (cat.cards.length === 0) {
    wrap.appendChild(el('div', { class: 'empty' }, 'No cards yet. Add one below.'));
  } else {
    const list = el('div', { class: 'list' });
    for (const card of cat.cards) {
      const row = el('div', { class: 'card-row' }, [
        el('div', { style: { flex: '1', minWidth: 0 } }, [
          el('div', { class: 'name', style: { whiteSpace: 'pre-wrap' } }, card.front),
          el('div', { class: 'meta', style: { whiteSpace: 'pre-wrap' } }, card.back),
          el('div', { class: 'meta', style: { marginTop: '4px' } }, [
            el('span', { class: 'pill' }, `weight ${card.weight.toFixed(2)}`),
            ' ',
            el('span', { class: 'pill' }, `✓ ${card.stats.right}`),
            ' ',
            el('span', { class: 'pill' }, `✗ ${card.stats.wrong}`),
          ]),
        ]),
        el('div', { class: 'row-actions' }, [
          el('button', { class: 'ghost', title: 'Edit', onClick: () => editCard(cat, card) }, 'Edit'),
          el('button', { class: 'danger', title: 'Delete', onClick: () => {
            if (confirm('Delete this card?')) {
              cat.cards = cat.cards.filter(c => c.id !== card.id);
              saveState();
              render();
            }
          } }, '✕'),
        ]),
      ]);
      list.appendChild(row);
    }
    wrap.appendChild(list);
  }

  // add card
  const form = el('form', { class: 'add-form', onSubmit: (e) => {
    e.preventDefault();
    const front = form.querySelector('[name=front]').value.trim();
    const back = form.querySelector('[name=back]').value.trim();
    if (!front || !back) return;
    cat.cards.push(newCard(front, back));
    saveState();
    form.reset();
    render();
    form.querySelector('[name=front]').focus();
  } }, [
    el('textarea', { name: 'front', placeholder: 'Front (prompt)' }),
    el('textarea', { name: 'back', placeholder: 'Back (answer)' }),
    el('div', { class: 'row' }, [
      el('button', { class: 'primary', type: 'submit' }, 'Add card'),
    ]),
  ]);
  wrap.appendChild(form);
  return wrap;
}

function editCard(cat, card) {
  const front = prompt('Front:', card.front);
  if (front == null) return;
  const back = prompt('Back:', card.back);
  if (back == null) return;
  card.front = front.trim();
  card.back = back.trim();
  saveState();
  render();
}

// ---------- study mode ----------
function pickNext(cards) {
  const pool = cards.length > 1 ? cards.filter(c => c.id !== lastCardId) : cards;
  const total = pool.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) {
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    lastCardId = chosen.id;
    return chosen;
  }
  let r = Math.random() * total;
  for (const c of pool) {
    r -= c.weight;
    if (r <= 0) { lastCardId = c.id; return c; }
  }
  const fallback = pool[pool.length - 1];
  lastCardId = fallback.id;
  return fallback;
}

let studySession = null;

function newStudySession(catId, opts = {}) {
  return {
    categoryId: catId,
    seen: 0, right: 0, wrong: 0,
    current: null, showBack: false,
    reverse: opts.reverse || false,
    target: typeof opts.target === 'number' ? opts.target : 0,
    done: false,
  };
}

function renderStudy(categoryId) {
  const cat = state.categories.find(c => c.id === categoryId);
  if (!cat || cat.cards.length === 0) { navigate({ name: 'home' }); return el('div'); }

  if (!studySession || studySession.categoryId !== cat.id) {
    studySession = newStudySession(cat.id);
  }
  if (!studySession.current && !studySession.done) {
    studySession.current = pickNext(cat.cards);
    studySession.showBack = false;
  }

  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'header' }, [
    el('button', { class: 'ghost', onClick: () => { studySession = null; navigate({ name: 'category', categoryId: cat.id }); } }, '‹ End'),
    el('h1', { style: { flex: '1', textAlign: 'center', fontSize: '16px' } }, cat.name),
    el('div', { style: { width: '60px' } }),
  ]));

  // options: reverse toggle + session target
  const targetSelect = el('select', {
    onInput: (e) => { studySession.target = parseInt(e.target.value, 10); render(); },
  }, [
    el('option', { value: '0' }, '∞'),
    el('option', { value: '10' }, '10'),
    el('option', { value: '20' }, '20'),
    el('option', { value: '50' }, '50'),
    el('option', { value: '100' }, '100'),
  ]);
  targetSelect.value = String(studySession.target);

  wrap.appendChild(el('div', { class: 'options-row' }, [
    el('button', {
      class: 'chip',
      title: 'Swap which side shows first',
      onClick: () => { studySession.reverse = !studySession.reverse; studySession.showBack = false; render(); },
    }, studySession.reverse ? '⇄ Back → Front' : '⇄ Front → Back'),
    el('label', { class: 'chip' }, [
      el('span', { style: { color: 'var(--muted)' } }, 'Target'),
      targetSelect,
    ]),
    fullscreenAvailable() && el('button', {
      class: 'chip',
      title: 'Toggle fullscreen',
      onClick: toggleFullscreen,
    }, isFullscreen() ? '⛶ Exit' : '⛶ Fullscreen'),
  ]));

  if (studySession.done) {
    const accuracy = studySession.seen > 0 ? Math.round(100 * studySession.right / studySession.seen) : 0;
    wrap.appendChild(el('div', { class: 'study-wrap' }, [
      el('div', { class: 'study-card' }, `Session complete\n${studySession.seen} cards · ${accuracy}% correct`),
    ]));
    wrap.appendChild(el('div', { class: 'study-actions' }, [
      el('button', { onClick: () => { studySession = null; navigate({ name: 'category', categoryId: cat.id }); } }, 'Back to category'),
      el('button', { class: 'primary', onClick: () => {
        studySession = newStudySession(cat.id, { reverse: studySession.reverse, target: studySession.target });
        render();
      } }, 'Start another'),
    ]));
    return wrap;
  }

  const card = studySession.current;
  const promptText = studySession.reverse ? card.back : card.front;
  const answerText = studySession.reverse ? card.front : card.back;

  const studyWrap = el('div', { class: 'study-wrap' });
  const cardEl = el('div', {
    class: 'study-card' + (studySession.showBack ? ' back' : ''),
    onClick: () => { studySession.showBack = !studySession.showBack; render(); },
  }, studySession.showBack ? answerText : promptText);
  studyWrap.appendChild(cardEl);
  studyWrap.appendChild(el('div', { class: 'hint' }, studySession.showBack ? 'Tap card to hide answer' : 'Tap card to reveal answer'));
  wrap.appendChild(studyWrap);

  wrap.appendChild(el('div', { class: 'study-actions' }, [
    el('button', {
      class: 'bad',
      disabled: !studySession.showBack,
      onClick: () => grade(cat, card, false),
    }, 'Wrong'),
    el('button', {
      class: 'good',
      disabled: !studySession.showBack,
      onClick: () => grade(cat, card, true),
    }, 'Right'),
  ]));

  const targetSuffix = studySession.target > 0 ? ` / ${studySession.target}` : '';
  wrap.appendChild(el('div', { class: 'study-stats' }, [
    el('span', {}, `Seen: ${studySession.seen}${targetSuffix}`),
    el('span', {}, `✓ ${studySession.right}   ✗ ${studySession.wrong}`),
    el('span', {}, `weight ${card.weight.toFixed(2)}`),
  ]));

  return wrap;
}

function grade(cat, card, isRight) {
  if (isRight) {
    card.stats.right += 1;
    card.weight = Math.max(MIN_WEIGHT, card.weight * RIGHT_MULT);
    studySession.right += 1;
  } else {
    card.stats.wrong += 1;
    card.weight = Math.min(MAX_WEIGHT, card.weight * WRONG_MULT);
    studySession.wrong += 1;
  }
  studySession.seen += 1;
  saveState();
  if (studySession.target > 0 && studySession.seen >= studySession.target) {
    studySession.done = true;
    studySession.current = null;
  } else {
    studySession.current = pickNext(cat.cards);
    studySession.showBack = false;
  }
  render();
}

// ---------- settings + sync ----------
function renderSettings() {
  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'header' }, [
    el('button', { class: 'ghost', onClick: () => navigate({ name: 'home' }) }, '‹ Back'),
    el('h1', { style: { flex: '1', textAlign: 'center' } }, 'Settings'),
    el('div', { style: { width: '60px' } }),
  ]));

  // sync
  const syncSection = el('div', { class: 'settings-section' });
  syncSection.appendChild(el('h3', {}, 'GitHub Gist sync'));
  syncSection.appendChild(el('p', {}, 'Optional. Syncs your data to a private Gist so it survives clearing browser data and can be shared across devices. Create a PAT with the "gist" scope at github.com/settings/tokens.'));

  const patField = el('div', { class: 'field' }, [
    el('label', {}, 'Personal access token (gist scope)'),
    el('input', { type: 'password', value: sync.pat, placeholder: 'ghp_...', autocomplete: 'off', onInput: (e) => { sync.pat = e.target.value.trim(); } }),
  ]);
  syncSection.appendChild(patField);

  const gistField = el('div', { class: 'field' }, [
    el('label', {}, 'Gist ID (leave blank to create on first push)'),
    el('input', { value: sync.gistId, placeholder: 'e.g. 3a5b8c9d…', autocomplete: 'off', onInput: (e) => { sync.gistId = e.target.value.trim(); } }),
  ]);
  syncSection.appendChild(gistField);

  const enableField = el('div', { class: 'field' }, [
    el('label', {}, [
      (() => {
        const cb = el('input', { type: 'checkbox', checked: sync.enabled, onInput: (e) => { sync.enabled = e.target.checked; saveSync(); } });
        cb.style.marginRight = '6px';
        return cb;
      })(),
      'Auto-push after every change',
    ]),
  ]);
  syncSection.appendChild(enableField);

  syncSection.appendChild(el('div', { class: 'actions' }, [
    el('button', { class: 'primary', onClick: async () => {
      saveSync();
      try { await pushSync(); toast('Pushed to Gist'); render(); }
      catch (e) { toast('Push failed: ' + e.message); }
    } }, 'Push now'),
    el('button', { onClick: async () => {
      saveSync();
      try {
        const remote = await pullSync();
        if (!remote) { toast('No remote data'); return; }
        if (confirm(`Overwrite local (${new Date(state.updatedAt).toLocaleString()}) with remote (${new Date(remote.updatedAt).toLocaleString()})?`)) {
          state = remote;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          toast('Pulled from Gist');
          render();
        }
      } catch (e) { toast('Pull failed: ' + e.message); }
    } }, 'Pull now'),
  ]));

  if (sync.lastSyncedAt) {
    syncSection.appendChild(el('p', { style: { marginTop: '10px' } }, `Last synced: ${new Date(sync.lastSyncedAt).toLocaleString()}`));
  }
  wrap.appendChild(syncSection);

  // export / import
  const backupSection = el('div', { class: 'settings-section' });
  backupSection.appendChild(el('h3', {}, 'Backup'));
  backupSection.appendChild(el('p', {}, 'Download your data as JSON, or restore from a previously exported file.'));
  backupSection.appendChild(el('div', { class: 'actions' }, [
    el('button', { onClick: exportData }, 'Export JSON'),
    el('button', { onClick: importData }, 'Import JSON'),
  ]));
  wrap.appendChild(backupSection);

  // reset
  const resetSection = el('div', { class: 'settings-section' });
  resetSection.appendChild(el('h3', {}, 'Danger zone'));
  resetSection.appendChild(el('p', {}, 'Wipe all local data and reload seed categories.'));
  resetSection.appendChild(el('div', { class: 'actions' }, [
    el('button', { class: 'danger', onClick: () => {
      if (confirm('Wipe ALL local data and restore the built-in seed categories?')) {
        localStorage.removeItem(STORAGE_KEY);
        state = loadState();
        saveState();
        navigate({ name: 'home' });
      }
    } }, 'Reset to seed data'),
  ]));
  wrap.appendChild(resetSection);

  return wrap;
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flashcards-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.categories)) throw new Error('Missing categories');
      if (!confirm(`Replace all local data with ${parsed.categories.length} categories from file?`)) return;
      state = {
        version: 1,
        updatedAt: parsed.updatedAt || Date.now(),
        categories: parsed.categories.map(normalizeCategory),
      };
      saveState();
      toast('Imported');
      render();
    } catch (e) { toast('Import failed: ' + e.message); }
  };
  input.click();
}

// ---------- sync backend (GitHub Gist) ----------
async function pushSync() {
  if (!sync.pat) throw new Error('No PAT set');
  const body = {
    description: 'Flashcards app data',
    files: { 'flashcards.json': { content: JSON.stringify(state, null, 2) } },
  };
  let url, method;
  if (sync.gistId) {
    url = `https://api.github.com/gists/${sync.gistId}`;
    method = 'PATCH';
  } else {
    url = 'https://api.github.com/gists';
    method = 'POST';
    body.public = false;
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${sync.pat}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!sync.gistId) sync.gistId = json.id;
  sync.lastSyncedAt = Date.now();
  saveSync();
}

async function pullSync() {
  if (!sync.pat) throw new Error('No PAT set');
  if (!sync.gistId) throw new Error('No Gist ID set');
  const res = await fetch(`https://api.github.com/gists/${sync.gistId}`, {
    headers: {
      'Authorization': `Bearer ${sync.pat}`,
      'Accept': 'application/vnd.github+json',
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const json = await res.json();
  const file = json.files && json.files['flashcards.json'];
  if (!file) return null;
  const parsed = JSON.parse(file.content);
  sync.lastSyncedAt = Date.now();
  saveSync();
  return {
    version: 1,
    updatedAt: parsed.updatedAt || Date.now(),
    categories: (parsed.categories || []).map(normalizeCategory),
  };
}

let syncTimer = null;
function scheduleSync() {
  if (!sync.enabled || !sync.pat) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    pushSync().catch(e => console.warn('Auto-sync failed', e));
  }, 3000);
}

// ---------- fullscreen (iPad / Android / desktop; not available on iPhone Safari) ----------
function fullscreenAvailable() {
  return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
}
function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else {
      const root = document.documentElement;
      if (root.requestFullscreen) await root.requestFullscreen();
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
    }
  } catch (e) { console.warn('Fullscreen toggle failed', e); }
}
document.addEventListener('fullscreenchange', render);
document.addEventListener('webkitfullscreenchange', render);

// ---------- toast ----------
let toastEl = null;
let toastTimer = null;
function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ---------- boot ----------
async function autoPullOnBoot() {
  if (!sync.enabled || !sync.pat || !sync.gistId) return;
  try {
    const remote = await pullSync();
    if (!remote) return;
    if (remote.updatedAt > state.updatedAt) {
      state = remote;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      // Preserve view but drop any in-flight study session tied to old data.
      studySession = null;
      render();
      toast('Synced from Gist');
    }
  } catch (e) {
    console.warn('Auto-pull failed', e);
  }
}

render();
autoPullOnBoot();
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') autoPullOnBoot();
});
