// Supabase is loaded globally via CDN script tag in index.html
const { createClient } = supabase;

const SUPABASE_URL = 'https://grlflyejqivjfkgerpvo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdybGZseWVqcWl2amZrZ2VycHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjgzNDAsImV4cCI6MjA5NzkwNDM0MH0.Ms1X079wMiCKUziBAbweDhEJwC3G8iz1UtAQq6KWFt4';
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ──
let notes       = [];
let activeId    = null;
let isNew       = false;
let activeCategory = 'all';

// ── Elements ──
const notesScroll    = document.getElementById('notes-scroll');
const noteCount      = document.getElementById('note-count');
const searchInput    = document.getElementById('search-input');
const listHeading    = document.getElementById('list-heading');
const editorPanel    = document.getElementById('editor-panel');
const editorBackdrop = document.getElementById('editor-backdrop');
const editorArea     = document.getElementById('editor-area');
const editorTitle    = document.getElementById('editor-title');
const editorContent  = document.getElementById('editor-content');
const editorDate     = document.getElementById('editor-date');
const editorCategory = document.getElementById('editor-category');
const saveBtn        = document.getElementById('save-btn');
const discardBtn     = document.getElementById('discard-btn');
const closeEditorBtn = document.getElementById('close-editor-btn');
const newNoteBtn     = document.getElementById('new-note-btn');

// ── Helpers ──
function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function() { el.classList.remove('show'); }, 2200);
}

function escHtml(v) {
  var d = document.createElement('div');
  d.textContent = v;
  return d.innerHTML;
}

function relativeTime(dateStr) {
  var diff = Date.now() - new Date(dateStr);
  var mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24)  return hrs + 'h ago';
  var days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7)  return days + 'd ago';
  return new Date(dateStr).toLocaleDateString();
}

function fullDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Sidebar nav ──
document.querySelectorAll('.nav-item').forEach(function(el) {
  el.addEventListener('click', function() {
    document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
    el.classList.add('active');
    activeCategory = el.dataset.cat;
    listHeading.textContent = activeCategory === 'all' ? 'All Notes' : capitalize(activeCategory);
    searchInput.value = '';
    // deselect current note if it doesn't belong to new category
    if (activeId) {
      var note = notes.find(function(n) { return n.id === activeId; });
      if (note && activeCategory !== 'all' && note.category !== activeCategory) {
        activeId = null;
        showWelcome();
      }
    }
    renderList('');
  });
});

// ── Render note list ──
function renderList(filter) {
  filter = filter || '';

  var filtered = notes.filter(function(n) {
    var matchCat = activeCategory === 'all' || n.category === activeCategory;
    var matchSearch = !filter ||
      n.title.toLowerCase().includes(filter.toLowerCase()) ||
      n.content.toLowerCase().includes(filter.toLowerCase());
    return matchCat && matchSearch;
  });

  noteCount.textContent = filtered.length;

  if (!filtered.length) {
    notesScroll.innerHTML =
      '<div class="empty-list">' +
      (filter ? 'No notes match your search.' : 'No notes in this category yet.') +
      '</div>';
    return;
  }

  notesScroll.innerHTML =
    '<div class="section-label">' + (activeCategory === 'all' ? 'All Notes' : capitalize(activeCategory)) + '</div>' +
    filtered.map(function(n, i) {
      return '<div class="note-item ' + (n.id === activeId ? 'active' : '') + '" data-id="' + n.id + '" data-index="' + i + '" tabindex="-1" style="animation-delay:' + (i * 0.04) + 's">' +
        '<button class="note-item-delete" data-id="' + n.id + '" title="Delete note">🗑</button>' +
        '<div class="note-item-title">' + escHtml(n.title || 'Untitled Note') + '</div>' +
        '<div class="note-item-preview">' + escHtml(n.content || 'No content') + '</div>' +
        '<div class="note-item-meta">' +
          '<span class="note-item-date">' + relativeTime(n.updated_at) + '</span>' +
          '<span class="note-item-tag">' + escHtml(n.category || 'notes') + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

  notesScroll.querySelectorAll('.note-item').forEach(function(el) {
    el.addEventListener('click', function() { openNote(el.dataset.id); });
  });

  notesScroll.querySelectorAll('.note-item-delete').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      requestDelete(btn.dataset.id);
    });
  });

  keyboardFocusIndex = -1;
  updateGradients();
}

// ── Scroll gradients ──
const topGradient = document.getElementById('top-gradient');
const bottomGradient = document.getElementById('bottom-gradient');

function updateGradients() {
  const scrollTop = notesScroll.scrollTop;
  const scrollHeight = notesScroll.scrollHeight;
  const clientHeight = notesScroll.clientHeight;
  topGradient.style.opacity = Math.min(scrollTop / 40, 1);
  const bottomDistance = scrollHeight - (scrollTop + clientHeight);
  bottomGradient.style.opacity = scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 40, 1);
}
notesScroll.addEventListener('scroll', updateGradients);

// ── Keyboard navigation through note list ──
let keyboardFocusIndex = -1;

document.addEventListener('keydown', function(e) {
  // Don't hijack arrow keys while typing in the editor or search box
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  const items = Array.from(notesScroll.querySelectorAll('.note-item'));
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    keyboardFocusIndex = Math.min(keyboardFocusIndex + 1, items.length - 1);
    focusItem(items, keyboardFocusIndex);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    keyboardFocusIndex = Math.max(keyboardFocusIndex - 1, 0);
    focusItem(items, keyboardFocusIndex);
  } else if (e.key === 'Enter' && keyboardFocusIndex >= 0) {
    e.preventDefault();
    openNote(items[keyboardFocusIndex].dataset.id);
  }
});

function focusItem(items, index) {
  items.forEach(function(el) { el.classList.remove('keyboard-focus'); });
  const el = items[index];
  el.classList.add('keyboard-focus');
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ── Open / close floating editor dock ──
function showEditor() {
  editorPanel.classList.add('open');
  editorBackdrop.classList.add('open');
}

function showWelcome() {
  editorPanel.classList.remove('open');
  editorBackdrop.classList.remove('open');
}

// ── Open note ──
function openNote(id) {
  isNew    = false;
  activeId = id;
  var note = notes.find(function(n) { return n.id === id; });
  if (!note) return;
  editorTitle.value        = note.title;
  editorContent.value      = note.content;
  editorCategory.value     = note.category || 'notes';
  editorDate.textContent   = fullDate(note.updated_at);
  showEditor();
  renderList(searchInput.value);
}

// ── New note ──
function newNote() {
  isNew    = true;
  activeId = null;
  editorTitle.value      = '';
  editorContent.value    = '';
  // pre-select category based on active sidebar
  editorCategory.value   = (activeCategory === 'all') ? 'notes' : activeCategory;
  editorDate.textContent = fullDate(new Date().toISOString());
  showEditor();
  editorTitle.focus();
  renderList(searchInput.value);
}

// ── Fetch from Supabase ──
async function fetchNotes() {
  notesScroll.innerHTML = '<div class="empty-list">Loading notes…</div>';
  var result = await db.from('notes').select('*').order('updated_at', { ascending: false });
  if (result.error) {
    notesScroll.innerHTML = '<div class="empty-list">Error: ' + result.error.message + '</div>';
    return;
  }
  notes = result.data || [];
  renderList(searchInput.value);
}

// ── Save ──
saveBtn.addEventListener('click', async function() {
  var title    = editorTitle.value.trim() || 'Untitled Note';
  var content  = editorContent.value.trim();
  var category = editorCategory.value;

  if (isNew) {
    var ins = await db.from('notes').insert({ title: title, content: content, category: category }).select().single();
    if (ins.error) { toast('Save failed: ' + ins.error.message); return; }
    notes.unshift(ins.data);
    activeId = ins.data.id;
    isNew    = false;
    toast('Note saved');
  } else {
    var upd = await db.from('notes').update({ title: title, content: content, category: category }).eq('id', activeId);
    if (upd.error) { toast('Update failed: ' + upd.error.message); return; }
    var idx = notes.findIndex(function(n) { return n.id === activeId; });
    if (idx !== -1) notes[idx] = Object.assign({}, notes[idx], {
      title: title, content: content, category: category,
      updated_at: new Date().toISOString()
    });
    toast('Note updated');
  }

  renderList(searchInput.value);
});

// ── Delete (custom confirm modal) ──
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmMessage = document.getElementById('confirm-message');
const confirmCancel  = document.getElementById('confirm-cancel');
const confirmOk      = document.getElementById('confirm-ok');
let pendingDeleteId  = null;

function requestDelete(id) {
  var note = notes.find(function(n) { return n.id === id; });
  pendingDeleteId = id;
  confirmMessage.textContent = 'Delete "' + (note ? (note.title || 'Untitled Note') : 'this note') + '"? This cannot be undone.';
  confirmOverlay.classList.remove('hidden');
}

function closeConfirm() {
  confirmOverlay.classList.add('hidden');
  pendingDeleteId = null;
}

confirmCancel.addEventListener('click', closeConfirm);
confirmOverlay.addEventListener('click', function(e) {
  if (e.target === confirmOverlay) closeConfirm();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && !confirmOverlay.classList.contains('hidden')) closeConfirm();
});

confirmOk.addEventListener('click', async function() {
  if (!pendingDeleteId) return;
  var id = pendingDeleteId;
  var del = await db.from('notes').delete().eq('id', id);
  if (del.error) { toast('Delete failed: ' + del.error.message); closeConfirm(); return; }

  notes = notes.filter(function(n) { return n.id !== id; });
  if (activeId === id) {
    activeId = null;
    showWelcome();
  }
  closeConfirm();
  renderList(searchInput.value);
  toast('Note deleted');
});

// ── Discard / Delete (same button) ──
discardBtn.addEventListener('click', function() {
  if (isNew) {
    // unsaved note — nothing in the DB yet, just close
    showWelcome();
    isNew = false;
    activeId = null;
  } else if (activeId) {
    // existing note — discard now means delete it
    requestDelete(activeId);
  }
});

// ── Close button (✕) — just dismisses the floating editor, no delete ──
closeEditorBtn.addEventListener('click', function() {
  showWelcome();
  isNew = false;
  activeId = null;
  renderList(searchInput.value);
});

editorBackdrop.addEventListener('click', function() {
  showWelcome();
  isNew = false;
  activeId = null;
  renderList(searchInput.value);
});

// ── New note button ──
newNoteBtn.addEventListener('click', newNote);

// ── Search ──
searchInput.addEventListener('input', function() { renderList(searchInput.value); });

// ── Pixel snow color picker ──
const swatches = document.querySelectorAll('.snow-swatch');
const customColorInput = document.getElementById('snow-color-custom');

function applySnowColor(hex) {
  if (window.pixelSnow) window.pixelSnow.setColor(hex);
  localStorage.setItem('pixelSnowColor', hex);
  swatches.forEach(function(s) { s.classList.toggle('active', s.dataset.color === hex); });
}

swatches.forEach(function(btn) {
  btn.addEventListener('click', function() {
    applySnowColor(btn.dataset.color);
    customColorInput.value = btn.dataset.color;
  });
});

customColorInput.addEventListener('input', function() {
  applySnowColor(customColorInput.value);
});

// Restore saved color selection on load (mark matching swatch active)
(function restoreSnowColor() {
  var saved = localStorage.getItem('pixelSnowColor');
  if (saved) {
    customColorInput.value = saved;
    swatches.forEach(function(s) { s.classList.toggle('active', s.dataset.color === saved); });
  } else {
    swatches[0].classList.add('active'); // default teal
  }
})();

// ── Init ──
fetchNotes();