// ── Supabase ──────────────────────────────────────────
const SB_URL = 'https://qmtsllpseoipbdzguauo.supabase.co/rest/v1';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtdHNsbHBzZW9pcGJkemd1YXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjU4ODksImV4cCI6MjA5MzY0MTg4OX0.0uFJujd1KwWKSmuHqYIRMknpoVNPnlhHcJWtfo4GT28';

const sbHeaders = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SB_URL}${path}`, { ...options, headers: { ...sbHeaders, ...options.headers } });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

async function dbLoad() {
  return sbFetch('/entries?select=*&order=date.desc');
}
async function dbInsert(entry) {
  return sbFetch('/entries', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(entry) });
}
async function dbUpdate(id, patch) {
  return sbFetch(`/entries?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
}
async function dbDelete(id) {
  return sbFetch(`/entries?id=eq.${id}`, { method: 'DELETE' });
}

// ── State ─────────────────────────────────────────────
let entries = [];
let currentEntryId = null;
let pendingImages = [];
let selectedCategory = null;
let activeFilter = '전체';
let ratioMode = 'month';

// ── Elements ──────────────────────────────────────────
const viewList   = document.getElementById('view-list');
const viewStats  = document.getElementById('view-stats');
const viewAdd    = document.getElementById('view-add');
const viewDetail = document.getElementById('view-detail');
const entryList  = document.getElementById('entry-list');
const emptyState = document.getElementById('empty-state');
const entryText  = document.getElementById('entry-text');
const photoInput = document.getElementById('photo-input');
const previewContainer = document.getElementById('preview-container');
const btnSave    = document.getElementById('btn-save');
const detailContent = document.getElementById('detail-content');
const fullscreen    = document.getElementById('fullscreen');
const fullscreenImg = document.getElementById('fullscreen-img');
const statsContent  = document.getElementById('stats-content');

// ── Constants ─────────────────────────────────────────
const CATS = ['기분향상', '새로배움', '튼튼한몸', '사람사랑'];
const CAT_COLORS = { '기분향상': '#FF9500', '새로배움': '#007AFF', '튼튼한몸': '#34C759', '사람사랑': '#FF2D55' };
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// ── Navigation ────────────────────────────────────────
function showView(to, from) {
  if (from) from.classList.add('slide-left');
  to.classList.add('active');
}
function hideView(to, from) {
  to.classList.remove('active');
  if (from) from.classList.remove('slide-left');
}

document.querySelectorAll('.tab-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === 'list') {
      viewStats.classList.remove('active');
      viewList.classList.add('active');
    } else {
      viewList.classList.remove('active');
      viewStats.classList.add('active');
      renderStats();
    }
  });
});

document.getElementById('btn-add').addEventListener('click', () => {
  resetAddView();
  showView(viewAdd, viewList);
});
document.getElementById('btn-cancel').addEventListener('click', () => hideView(viewAdd, viewList));
document.getElementById('btn-back').addEventListener('click', () => hideView(viewDetail, viewList));

// ── Filter ────────────────────────────────────────────
document.getElementById('filter-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.filter-tab');
  if (!btn) return;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = btn.dataset.cat;
  renderList();
});

// ── Helpers ───────────────────────────────────────────
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatDateFull(iso) {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── Render List ───────────────────────────────────────
function makeCardEl(entry, pinned) {
  const li = document.createElement('li');
  li.className = 'entry-card' + (pinned ? ' pinned' : '');
  li.dataset.id = entry.id;
  li.draggable = true;

  const thumb = entry.images && entry.images.length > 0
    ? `<img class="entry-thumb" src="${entry.images[0]}" alt="썸네일" />`
    : '';

  const inner = `
    <div class="entry-row">
      <div class="entry-info">
        <div class="entry-meta">
          ${entry.category ? `<span class="cat-chip cat-${entry.category}">${esc(entry.category)}</span>` : ''}
          <span class="entry-date">${formatDate(entry.date)}</span>
        </div>
        ${entry.text ? `<div class="entry-text-preview">${esc(entry.text)}</div>` : ''}
      </div>
      ${thumb}
    </div>`;

  li.innerHTML = pinned ? `<div class="entry-inner">${inner}</div>` : inner;
  li.addEventListener('click', () => openDetail(entry.id));

  // Desktop drag
  li.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', entry.id); li.style.opacity = '.5'; });
  li.addEventListener('dragend', () => { li.style.opacity = ''; });

  // Touch drag
  let touchDragging = false, touchClone = null;
  li.addEventListener('touchstart', () => { touchDragging = false; }, { passive: true });
  li.addEventListener('touchmove', e => {
    if (!touchDragging) {
      touchDragging = true;
      li.style.opacity = '.5';
      touchClone = li.cloneNode(true);
      touchClone.style.cssText = `position:fixed;pointer-events:none;opacity:.8;z-index:999;width:${li.offsetWidth}px;`;
      document.body.appendChild(touchClone);
    }
    const t = e.touches[0];
    if (touchClone) { touchClone.style.left = (t.clientX - li.offsetWidth/2) + 'px'; touchClone.style.top = (t.clientY - 30) + 'px'; }
    const zone = document.getElementById('pin-zone');
    const r = zone.getBoundingClientRect();
    zone.classList.toggle('drag-over', t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom);
  }, { passive: true });
  li.addEventListener('touchend', e => {
    li.style.opacity = '';
    if (touchClone) { touchClone.remove(); touchClone = null; }
    const zone = document.getElementById('pin-zone');
    zone.classList.remove('drag-over');
    if (!touchDragging) return;
    const t = e.changedTouches[0];
    const r = zone.getBoundingClientRect();
    const dropped = t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom;
    if (dropped && !entry.pinned) togglePin(entry.id, true);
    else if (!dropped && entry.pinned) togglePin(entry.id, false);
  });

  return li;
}

async function togglePin(id, pin) {
  await dbUpdate(id, { pinned: pin });
  entries = await dbLoad();
  renderList();
}

function renderList() {
  const pinnedList = document.getElementById('pinned-list');
  const dropHint   = document.getElementById('pin-drop-hint');
  pinnedList.innerHTML = '';
  entryList.innerHTML  = '';

  const pinned   = entries.filter(e => e.pinned);
  const unpinned = entries.filter(e => !e.pinned);

  const zone = document.getElementById('pin-zone');
  zone.classList.toggle('has-pins', pinned.length > 0);
  dropHint.style.display = pinned.length ? 'none' : 'block';
  pinned.forEach(e => pinnedList.appendChild(makeCardEl(e, true)));

  const filtered = activeFilter !== '전체' ? unpinned.filter(e => e.category === activeFilter) : unpinned;
  emptyState.classList.toggle('hidden', filtered.length > 0);
  filtered.forEach(e => entryList.appendChild(makeCardEl(e, false)));
}

// ── Drop zone ─────────────────────────────────────────
function setupDropZone() {
  const zone = document.getElementById('pin-zone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    togglePin(e.dataTransfer.getData('text/plain'), true);
  });
  document.getElementById('entry-list').addEventListener('dragover', e => e.preventDefault());
  document.getElementById('entry-list').addEventListener('drop', e => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const entry = entries.find(x => x.id === id);
    if (entry && entry.pinned) togglePin(id, false);
  });
}

// ── Detail ────────────────────────────────────────────
function openDetail(id) {
  currentEntryId = id;
  const e = entries.find(x => x.id === id);
  if (!e) return;

  const pinBtn = document.getElementById('btn-pin');
  pinBtn.textContent = e.pinned ? '📌' : '📍';
  pinBtn.style.opacity = e.pinned ? '1' : '0.4';

  detailContent.innerHTML = `
    <div class="detail-meta" style="padding:16px 0 8px">
      ${e.category ? `<span class="cat-chip cat-${e.category}">${esc(e.category)}</span>` : ''}
      <span class="detail-date">${formatDateFull(e.date)}</span>
    </div>
    ${e.text ? `<div class="divider"></div><p class="detail-text">${esc(e.text)}</p>` : ''}
    ${e.images && e.images.length ? `
      <div class="divider"></div>
      <div class="photo-grid">
        ${e.images.map(src => `<img src="${src}" alt="사진" />`).join('')}
      </div>` : ''}
  `;

  detailContent.querySelectorAll('.photo-grid img').forEach(img => {
    img.addEventListener('click', () => { fullscreenImg.src = img.src; fullscreen.classList.remove('hidden'); });
  });

  showView(viewDetail, viewList);
}

document.getElementById('btn-pin').addEventListener('click', async () => {
  const entry = entries.find(x => x.id === currentEntryId);
  if (!entry) return;
  await togglePin(entry.id, !entry.pinned);
  const pinBtn = document.getElementById('btn-pin');
  pinBtn.textContent = entry.pinned ? '📌' : '📍';
  pinBtn.style.opacity = entry.pinned ? '1' : '0.4';
});

document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!confirm('이 성취를 삭제할까요?')) return;
  await dbDelete(currentEntryId);
  entries = await dbLoad();
  renderList();
  hideView(viewDetail, viewList);
});

// ── Add Entry ─────────────────────────────────────────
function resetAddView() {
  entryText.value = '';
  pendingImages = [];
  selectedCategory = null;
  previewContainer.innerHTML = '';
  photoInput.value = '';
  btnSave.disabled = true;
  document.querySelectorAll('#category-chips .chip').forEach(c => c.classList.remove('selected'));
}

function updateSaveButton() {
  btnSave.disabled = !(selectedCategory && (entryText.value.trim() || pendingImages.length > 0));
}

entryText.addEventListener('input', updateSaveButton);

document.getElementById('category-chips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('#category-chips .chip').forEach(c => c.classList.remove('selected'));
  chip.classList.add('selected');
  selectedCategory = chip.dataset.value;
  updateSaveButton();
});

photoInput.addEventListener('change', () => {
  const files = Array.from(photoInput.files).slice(0, 10 - pendingImages.length);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => { pendingImages.push(ev.target.result); renderPreviews(); updateSaveButton(); };
    reader.readAsDataURL(file);
  });
  photoInput.value = '';
});

function renderPreviews() {
  previewContainer.innerHTML = '';
  pendingImages.forEach((url, i) => {
    const div = document.createElement('div');
    div.className = 'preview-item';
    div.innerHTML = `<img src="${url}" alt="미리보기" /><button class="preview-remove">✕</button>`;
    div.querySelector('.preview-remove').addEventListener('click', () => { pendingImages.splice(i, 1); renderPreviews(); updateSaveButton(); });
    previewContainer.appendChild(div);
  });
}

btnSave.addEventListener('click', async () => {
  btnSave.disabled = true;
  btnSave.textContent = '저장 중...';
  const entry = {
    date: new Date().toISOString(),
    category: selectedCategory,
    text: entryText.value.trim(),
    images: [...pendingImages],
    pinned: false,
  };
  await dbInsert(entry);
  entries = await dbLoad();
  renderList();
  hideView(viewAdd, viewList);
  btnSave.textContent = '저장';
  launchConfetti();
  enableTouchConfetti();
});

// ── Fullscreen ────────────────────────────────────────
document.getElementById('btn-fullscreen-close').addEventListener('click', () => { fullscreen.classList.add('hidden'); fullscreenImg.src = ''; });
fullscreen.addEventListener('click', e => { if (e.target === fullscreen) { fullscreen.classList.add('hidden'); fullscreenImg.src = ''; } });

// ── Confetti ──────────────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';

  const colors = ['#FF9500','#007AFF','#34C759','#FF2D55','#AF52DE','#FFD60A'];
  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width, y: -10 - Math.random() * 100,
    r: 4 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - .5) * 4, vy: 2 + Math.random() * 4,
    rot: Math.random() * 360, rotV: (Math.random() - .5) * 8,
    shape: Math.random() > .5 ? 'rect' : 'circle',
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.rotV; p.vy += .05;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, 1 - frame / 90);
      if (p.shape === 'rect') ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      else { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    });
    frame++;
    if (frame < 100) requestAnimationFrame(draw);
    else { canvas.style.display = 'none'; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }
  requestAnimationFrame(draw);
}

function enableTouchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  canvas._touchParticles = []; canvas._touchParticleList = []; canvas._touchLooping = false;

  function launchConfettiAt(x, y) {
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    canvas.style.display = 'block';
    const colors = ['#FF9500','#007AFF','#34C759','#FF2D55','#AF52DE','#FFD60A'];
    const particles = Array.from({ length: 60 }, () => {
      const angle = Math.random() * Math.PI * 2, speed = 3 + Math.random() * 6;
      return { x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed-3, r: 3+Math.random()*5,
        color: colors[Math.floor(Math.random()*colors.length)], rot: Math.random()*360,
        rotV: (Math.random()-.5)*10, life: 1, shape: Math.random()>.5?'rect':'circle' };
    });
    function drawBurst() {
      particles.forEach(p => {
        p.x+=p.vx; p.y+=p.vy; p.vy+=.15; p.rot+=p.rotV; p.life-=.025;
        if(p.life<=0) return;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180);
        ctx.fillStyle=p.color; ctx.globalAlpha=p.life;
        if(p.shape==='rect') ctx.fillRect(-p.r,-p.r/2,p.r*2,p.r);
        else{ctx.beginPath();ctx.arc(0,0,p.r,0,Math.PI*2);ctx.fill();}
        ctx.restore();
      });
    }
    canvas._touchParticles.push(drawBurst);
    canvas._touchParticleList.push(particles);
    if (!canvas._touchLooping) {
      canvas._touchLooping = true;
      (function loop() {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        canvas._touchParticles.forEach(d=>d());
        canvas._touchParticles = canvas._touchParticles.filter((_,i)=>canvas._touchParticleList[i].some(p=>p.life>0));
        canvas._touchParticleList = canvas._touchParticleList.filter(pl=>pl.some(p=>p.life>0));
        if(canvas._touchParticles.length>0) requestAnimationFrame(loop);
        else{canvas._touchLooping=false;canvas.style.display='none';ctx.clearRect(0,0,canvas.width,canvas.height);}
      })();
    }
  }

  function onTouch(e) { const t=e.touches?e.touches[0]:e; launchConfettiAt(t.clientX,t.clientY); }
  document.addEventListener('touchstart', onTouch, { passive: true });
  document.addEventListener('click', onTouch);
  setTimeout(() => { document.removeEventListener('touchstart', onTouch); document.removeEventListener('click', onTouch); }, 5000);
}

// ── Stats ─────────────────────────────────────────────
function renderStats() {
  const now = new Date();
  const thisMonth = now.getMonth(), thisYear = now.getFullYear();
  const monthEntries = entries.filter(e => { const d=new Date(e.date); return d.getMonth()===thisMonth && d.getFullYear()===thisYear; });
  const yearEntries  = entries.filter(e => new Date(e.date).getFullYear()===thisYear);

  const catCount = {};
  entries.forEach(e => { if(e.category) catCount[e.category]=(catCount[e.category]||0)+1; });
  const topCat = Object.entries(catCount).sort((a,b)=>b[1]-a[1])[0]?.[0]||'-';

  const months = [];
  for(let i=5;i>=0;i--){ const d=new Date(thisYear,thisMonth-i,1); months.push({year:d.getFullYear(),month:d.getMonth(),label:`${d.getMonth()+1}월`}); }
  const monthTotals = months.map(m=>entries.filter(e=>{const d=new Date(e.date);return d.getFullYear()===m.year&&d.getMonth()===m.month;}).length);
  const maxMonthTotal = Math.max(1,...monthTotals);
  const monthBars = months.map((m,idx)=>{
    const mes=entries.filter(e=>{const d=new Date(e.date);return d.getFullYear()===m.year&&d.getMonth()===m.month;});
    const segs=CATS.map(cat=>({cat,count:mes.filter(e=>e.category===cat).length})).filter(s=>s.count>0);
    return {label:m.label,segs,pct:monthTotals[idx]/maxMonthTotal*100};
  });

  const dayCounts=Array(7).fill(0);
  entries.forEach(e=>dayCounts[new Date(e.date).getDay()]++);
  const maxDay=Math.max(1,...dayCounts);
  const peakDay=DAYS[dayCounts.indexOf(Math.max(...dayCounts))];

  const timeBuckets=[0,0,0,0];
  entries.forEach(e=>{const h=new Date(e.date).getHours();if(h<12)timeBuckets[0]++;else if(h<17)timeBuckets[1]++;else if(h<21)timeBuckets[2]++;else timeBuckets[3]++;});
  const timeLabels=[['오전','06~12시'],['오후','12~17시'],['저녁','17~21시'],['밤','21~06시']];
  const timeIcons=['🌅','☀️','🌆','🌙'];
  const peakTimeIdx=timeBuckets.indexOf(Math.max(...timeBuckets));

  function ratioHTML(pool){
    const total=pool.length||1;
    return CATS.map(cat=>{const cnt=pool.filter(e=>e.category===cat).length;const pct=Math.round(cnt/total*100);
      return `<div class="ratio-row"><div class="ratio-row-label"><span class="ratio-row-name">${cat}</span><span class="ratio-row-pct">${pct}%</span></div><div class="ratio-track"><div class="ratio-fill" style="width:${pct}%;background:${CAT_COLORS[cat]}"></div></div></div>`;
    }).join('');
  }

  statsContent.innerHTML = `
    <div class="stats-card">
      <div class="stats-card-title">누적 통계</div>
      <div class="summary-grid">
        <div class="summary-item"><div class="summary-value">${entries.length}</div><div class="summary-label">총 성취</div></div>
        <div class="summary-item"><div class="summary-value">${monthEntries.length}</div><div class="summary-label">이번달</div></div>
        <div class="summary-item"><div class="summary-value" style="font-size:16px;padding-top:4px">${topCat}</div><div class="summary-label">최다 카테고리</div></div>
      </div>
    </div>
    <div class="stats-card">
      <div class="stats-card-title">월별 성취 추이</div>
      <div class="monthly-chart">
        ${monthBars.map(m=>`<div class="month-col"><div class="month-bar-wrap"><div class="month-bar" style="height:${m.pct}%">${m.segs.map(s=>`<div class="bar-seg" style="flex:${s.count};background:${CAT_COLORS[s.cat]}"></div>`).join('')}</div></div><div class="month-label">${m.label}</div></div>`).join('')}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
        ${CATS.map(c=>`<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text2)"><div style="width:10px;height:10px;border-radius:2px;background:${CAT_COLORS[c]}"></div>${c}</div>`).join('')}
      </div>
    </div>
    <div class="stats-card">
      <div class="stats-card-title">카테고리 비율</div>
      <div class="ratio-toggle">
        <button class="ratio-btn ${ratioMode==='month'?'active':''}" data-mode="month">이번달</button>
        <button class="ratio-btn ${ratioMode==='year'?'active':''}" data-mode="year">올해</button>
      </div>
      <div class="ratio-bars" id="ratio-bars">${ratioHTML(ratioMode==='month'?monthEntries:yearEntries)}</div>
    </div>
    <div class="stats-card">
      <div class="stats-card-title">나만의 패턴</div>
      <div class="day-grid">
        ${DAYS.map((d,i)=>`<div class="day-item"><div class="day-bar-wrap"><div class="day-bar" style="height:${Math.round(dayCounts[i]/maxDay*100)}%"></div></div><div class="day-label">${d}</div></div>`).join('')}
      </div>
      <div class="time-grid">
        ${timeBuckets.map((cnt,i)=>`<div class="time-item"><div class="time-icon">${timeIcons[i]}</div><div class="time-count">${cnt}</div><div class="time-label">${timeLabels[i][0]}<br>${timeLabels[i][1]}</div></div>`).join('')}
      </div>
      ${entries.length>0?`<p class="highlight-text">나는 주로 <span class="highlight-em">${peakDay}요일 ${timeLabels[peakTimeIdx][0]}</span>에 성취감을 느끼는 사람이에요.</p>`:''}
    </div>
  `;

  statsContent.querySelectorAll('.ratio-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      ratioMode=btn.dataset.mode;
      statsContent.querySelectorAll('.ratio-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===ratioMode));
      document.getElementById('ratio-bars').innerHTML=ratioHTML(ratioMode==='month'?monthEntries:yearEntries);
    });
  });
}

// ── App Title ─────────────────────────────────────────
const APP_TITLE_KEY = 'halloffame_title';
function loadTitle() { return localStorage.getItem(APP_TITLE_KEY) || '명예의 전당'; }
function applyTitle(title) { document.getElementById('app-title').textContent = title; document.title = title; }
document.getElementById('app-title').addEventListener('click', () => {
  const next = prompt('앱 이름을 변경하세요', loadTitle());
  if (next && next.trim()) { localStorage.setItem(APP_TITLE_KEY, next.trim()); applyTitle(next.trim()); }
});

// ── Init ──────────────────────────────────────────────
applyTitle(loadTitle());
setupDropZone();

dbLoad().then(data => {
  entries = data;
  renderList();
}).catch(() => {
  document.getElementById('empty-state').classList.remove('hidden');
  document.getElementById('empty-state').querySelector('.empty-title').textContent = 'DB 연결 실패';
  document.getElementById('empty-state').querySelector('.empty-sub').textContent = 'Supabase 테이블을 확인해 주세요.';
});
