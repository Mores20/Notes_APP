const { createClient } = supabase;

const SUPABASE_URL = 'https://grlflyejqivjfkgerpvo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdybGZseWVqcWl2amZrZ2VycHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjgzNDAsImV4cCI6MjA5NzkwNDM0MH0.Ms1X079wMiCKUziBAbweDhEJwC3G8iz1UtAQq6KWFt4';
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let notes       = [];
let activeId    = null;
let isNew       = false;
let activeCategory = 'all';

const notesScroll    = document.getElementById('notes-scroll');
const noteCount      = document.getElementById('note-count');
const searchInput    = document.getElementById('search-input');
const listHeading    = document.getElementById('list-heading');
const welcomeState   = document.getElementById('welcome-state');
const editorArea     = document.getElementById('editor-area');
const editorTitle    = document.getElementById('editor-title');
const editorContent  = document.getElementById('editor-content');
const editorDate     = document.getElementById('editor-date');
const editorCategory = document.getElementById('editor-category');
const saveBtn        = document.getElementById('save-btn');
const discardBtn     = document.getElementById('discard-btn');
const deleteBtn      = document.getElementById('delete-btn');
const newNoteBtn     = document.getElementById('new-note-btn');

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
    filtered.map(function(n) {
      return '<div class="note-item ' + (n.id === activeId ? 'active' : '') + '" data-id="' + n.id + '">' +
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
}

function showEditor() {
  welcomeState.classList.add('hidden');
  editorArea.style.display = 'flex';
}

function showWelcome() {
  welcomeState.classList.remove('hidden');
  editorArea.style.display = 'none';
}

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

function newNote() {
  isNew    = true;
  activeId = null;
  editorTitle.value      = '';
  editorContent.value    = '';
  editorCategory.value   = (activeCategory === 'all') ? 'notes' : activeCategory;
  editorDate.textContent = fullDate(new Date().toISOString());
  showEditor();
  editorTitle.focus();
  renderList(searchInput.value);
}

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

deleteBtn.addEventListener('click', async function() {
  if (!activeId) return;
  if (!confirm('Delete this note?')) return;
  var del = await db.from('notes').delete().eq('id', activeId);
  if (del.error) { toast('Delete failed: ' + del.error.message); return; }
  notes = notes.filter(function(n) { return n.id !== activeId; });
  activeId = null;
  showWelcome();
  renderList(searchInput.value);
  toast('Note deleted');
});

discardBtn.addEventListener('click', function() {
  if (isNew) { showWelcome(); isNew = false; activeId = null; }
  else if (activeId) openNote(activeId);
});

newNoteBtn.addEventListener('click', newNote);

searchInput.addEventListener('input', function() { renderList(searchInput.value); });

fetchNotes();