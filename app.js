// Storage
const DB_KEY = 'mydiary_entries';

function loadEntries() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || []; }
  catch { return []; }
}

function saveEntries(entries) {
  localStorage.setItem(DB_KEY, JSON.stringify(entries));
}

// State
let entries = loadEntries();
let currentEntryId = null;
let pendingImages = []; // { dataUrl }

// Elements
const viewList = document.getElementById('view-list');
const viewAdd = document.getElementById('view-add');
const viewDetail = document.getElementById('view-detail');
const entryList = document.getElementById('entry-list');
const emptyState = document.getElementById('empty-state');
const entryText = document.getElementById('entry-text');
const photoInput = document.getElementById('photo-input');
const previewContainer = document.getElementById('preview-container');
const btnSave = document.getElementById('btn-save');
const detailContent = document.getElementById('detail-content');
const fullscreen = document.getElementById('fullscreen');
const fullscreenImg = document.getElementById('fullscreen-img');

// Navigation
function showView(toView, fromView) {
  if (fromView) fromView.classList.add('slide-left');
  toView.classList.add('active');
}

function hideView(toView, fromView) {
  toView.classList.remove('active');
  if (fromView) fromView.classList.remove('slide-left');
}

document.getElementById('btn-add').addEventListener('click', () => {
  resetAddView();
  showView(viewAdd, viewList);
});

document.getElementById('btn-cancel').addEventListener('click', () => {
  hideView(viewAdd, viewList);
});

document.getElementById('btn-back').addEventListener('click', () => {
  hideView(viewDetail, viewList);
});

// Render list
function formatDate(iso) {
  const d = new Date(iso);
  const opts = { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  return d.toLocaleDateString('ko-KR', opts);
}

function formatDateFull(iso) {
  const d = new Date(iso);
  const opts = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' };
  return d.toLocaleDateString('ko-KR', opts);
}

function renderList() {
  entryList.innerHTML = '';
  const sorted = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (sorted.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  sorted.forEach(entry => {
    const li = document.createElement('li');
    li.className = 'entry-item';

    const thumbHtml = entry.images && entry.images.length > 0
      ? `<div class="entry-thumb"><img src="${entry.images[0]}" alt="썸네일" /></div>`
      : `<div class="entry-thumb">📝</div>`;

    const photoCountHtml = entry.images && entry.images.length > 1
      ? `<p class="entry-photo-count">📷 사진 ${entry.images.length}장</p>` : '';

    li.innerHTML = `
      <div class="entry-row" data-id="${entry.id}">
        ${thumbHtml}
        <div class="entry-info">
          <p class="entry-date">${formatDate(entry.date)}</p>
          ${entry.text ? `<p class="entry-preview">${escapeHtml(entry.text)}</p>` : ''}
          ${photoCountHtml}
        </div>
      </div>`;

    li.querySelector('.entry-row').addEventListener('click', () => openDetail(entry.id));
    entryList.appendChild(li);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Detail
function openDetail(id) {
  currentEntryId = id;
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  detailContent.innerHTML = `
    <p class="detail-date">${formatDateFull(entry.date)}</p>
    ${entry.text ? `<p class="detail-text">${escapeHtml(entry.text)}</p>` : ''}
    ${entry.images && entry.images.length > 0 ? `
      <div class="photo-grid">
        ${entry.images.map(src => `<img src="${src}" alt="사진" />`).join('')}
      </div>` : ''}
  `;

  detailContent.querySelectorAll('.photo-grid img').forEach(img => {
    img.addEventListener('click', () => openFullscreen(img.src));
  });

  showView(viewDetail, viewList);
}

// Delete
document.getElementById('btn-delete').addEventListener('click', () => {
  if (!confirm('이 기록을 삭제할까요?')) return;
  entries = entries.filter(e => e.id !== currentEntryId);
  saveEntries(entries);
  renderList();
  hideView(viewDetail, viewList);
});

// Add Entry
function resetAddView() {
  entryText.value = '';
  pendingImages = [];
  previewContainer.innerHTML = '';
  photoInput.value = '';
  btnSave.disabled = true;
}

function updateSaveButton() {
  btnSave.disabled = entryText.value.trim() === '' && pendingImages.length === 0;
}

entryText.addEventListener('input', updateSaveButton);

photoInput.addEventListener('change', () => {
  const files = Array.from(photoInput.files);
  const remaining = 10 - pendingImages.length;
  files.slice(0, remaining).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      pendingImages.push(e.target.result);
      addPreview(e.target.result, pendingImages.length - 1);
      updateSaveButton();
    };
    reader.readAsDataURL(file);
  });
  photoInput.value = '';
});

function addPreview(dataUrl, index) {
  const div = document.createElement('div');
  div.className = 'preview-item';
  div.dataset.index = index;
  div.innerHTML = `<img src="${dataUrl}" alt="미리보기" /><button class="preview-remove" aria-label="삭제">✕</button>`;
  div.querySelector('.preview-remove').addEventListener('click', () => {
    pendingImages.splice(index, 1);
    renderPreviews();
    updateSaveButton();
  });
  previewContainer.appendChild(div);
}

function renderPreviews() {
  previewContainer.innerHTML = '';
  pendingImages.forEach((url, i) => addPreview(url, i));
}

btnSave.addEventListener('click', () => {
  const entry = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    text: entryText.value.trim(),
    images: [...pendingImages],
  };
  entries.push(entry);
  saveEntries(entries);
  renderList();
  hideView(viewAdd, viewList);
});

// Fullscreen
function openFullscreen(src) {
  fullscreenImg.src = src;
  fullscreen.classList.remove('hidden');
}

document.getElementById('btn-fullscreen-close').addEventListener('click', () => {
  fullscreen.classList.add('hidden');
  fullscreenImg.src = '';
});

fullscreen.addEventListener('click', e => {
  if (e.target === fullscreen) {
    fullscreen.classList.add('hidden');
    fullscreenImg.src = '';
  }
});

// Init
renderList();
