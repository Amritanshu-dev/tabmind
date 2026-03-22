// ─── DATA ─────────────────────────────────────────────────
let tabs = [];
let activeFilter = 'all';

// ─── PICKER STATE ─────────────────────────────────────────
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
let selDay   = null;
let selHour  = 9;
let selMin   = 0;
let selAmPm  = 'AM';
let finalTimestamp = null;
let clockMode = 'hour';

function g(id) { return document.getElementById(id); }
function show(id) { g(id).classList.add('visible'); }
function hide(id) { g(id).classList.remove('visible'); }

// ─── SAVE using chrome.storage ────────────────────────────
function save() {
  chrome.storage.local.set({ tabmind_tabs: tabs });
  updateStats();
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}

// ─── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Load from chrome.storage
  chrome.storage.local.get('tabmind_tabs', (result) => {
    tabs = result.tabmind_tabs || [];
    renderTabs();
    updateStats();
  });

  // Auto-fill current tab URL
  chrome.tabs.query({ active: true, currentWindow: true }, (ct) => {
    if (ct && ct[0]) g('input-url').value = ct[0].url;
  });

  g('input-category').addEventListener('change', () => {
    const wrap = g('custom-category-wrap');
    if (g('input-category').value === 'other') {
      wrap.style.display = 'block';
      g('input-custom-category').focus();
    } else {
      wrap.style.display = 'none';
      g('input-custom-category').value = '';
    }
  });

  g('add-btn').addEventListener('click', addTab);
  g('clear-done-btn').addEventListener('click', clearDone);
  g('input-reason').addEventListener('keydown', e => { if (e.key === 'Enter') addTab(); });
  g('input-custom-category').addEventListener('keydown', e => { if (e.key === 'Enter') addTab(); });

  g('remind-trigger').addEventListener('click', openDatePicker);
  g('overlay').addEventListener('click', closeAll);
  g('cal-close').addEventListener('click', closeAll);
  g('clock-close').addEventListener('click', closeAll);
  g('clock-back').addEventListener('click', backToCal);
  g('clock-confirm-btn').addEventListener('click', confirmReminder);
  g('clock-canvas').addEventListener('click', onClockClick);

  g('cal-prev').addEventListener('click', () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } buildCalendar();
  });
  g('cal-next').addEventListener('click', () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } buildCalendar();
  });

  setupHold('hour-up',   () => adjustHour(1));
  setupHold('hour-down', () => adjustHour(-1));
  setupHold('min-up',    () => adjustMin(1));
  setupHold('min-down',  () => adjustMin(-1));
  g('ampm-up').addEventListener('click', toggleAmPm);
  g('ampm-down').addEventListener('click', toggleAmPm);

  g('clock-quickrow').querySelectorAll('.clock-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      selHour = parseInt(btn.dataset.h);
      selMin  = parseInt(btn.dataset.m);
      selAmPm = btn.dataset.ap;
      clockMode = 'hour';
      drawClock(); updateClockLabel();
    });
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTabs();
    });
  });
});

function setupHold(id, fn) {
  const btn = g(id);
  let iv = null, to = null;
  btn.addEventListener('click', fn);
  btn.addEventListener('mousedown', () => {
    to = setTimeout(() => { iv = setInterval(fn, 80); }, 400);
  });
  const stop = () => { clearTimeout(to); clearInterval(iv); };
  btn.addEventListener('mouseup', stop);
  btn.addEventListener('mouseleave', stop);
}

function openDatePicker() {
  calYear = new Date().getFullYear();
  calMonth = new Date().getMonth();
  selDay = null;
  buildCalendar();
  show('overlay'); show('cal-popup');
}
function backToCal() { hide('clock-popup'); show('cal-popup'); }
function closeAll()  { hide('cal-popup'); hide('clock-popup'); hide('overlay'); }

function buildCalendar() {
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  g('cal-month-label').textContent = `${months[calMonth]} ${calYear}`;
  const today = new Date(); today.setHours(0,0,0,0);
  let html = ['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => `<div class="cal-day-hdr">${d}</div>`).join('');
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day cal-empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(calYear, calMonth, d); date.setHours(0,0,0,0);
    const isPast = date < today, isToday = date.getTime() === today.getTime(), isSel = selDay === d && !isPast;
    let cls = 'cal-day';
    if (isPast)  cls += ' cal-past';
    if (isToday) cls += ' cal-today';
    if (isSel)   cls += ' cal-selected';
    html += `<div class="${cls}" data-day="${isPast ? '' : d}">${d}</div>`;
  }
  g('cal-grid').innerHTML = html;
  g('cal-grid').querySelectorAll('.cal-day:not(.cal-past):not(.cal-empty)').forEach(cell => {
    cell.addEventListener('click', () => {
      const d = parseInt(cell.dataset.day); if (!d) return;
      selDay = d; buildCalendar();
      setTimeout(() => { hide('cal-popup'); clockMode = 'hour'; drawClock(); updateClockLabel(); show('clock-popup'); }, 150);
    });
  });
}

function drawClock() {
  const canvas = g('clock-canvas'), ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, cx = W/2, cy = H/2, R = W/2 - 4;
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fillStyle = '#1e1e24'; ctx.fill();
  ctx.strokeStyle = '#2a2a33'; ctx.lineWidth = 1.5; ctx.stroke();
  if (clockMode === 'hour') {
    ['12','1','2','3','4','5','6','7','8','9','10','11'].forEach((lbl, i) => {
      const angle = (i/12)*Math.PI*2 - Math.PI/2;
      const x = cx+(R-20)*Math.cos(angle), y = cy+(R-20)*Math.sin(angle);
      const val = i === 0 ? 12 : i, isSel = val === selHour;
      if (isSel) { ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI*2); ctx.fillStyle = '#c8f05a'; ctx.fill(); }
      ctx.fillStyle = isSel ? '#0d0d0f' : '#f0ede8';
      ctx.font = `${isSel?'700':'400'} 11px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lbl, x, y);
    });
    drawHand(ctx, cx, cy, (selHour/12)*Math.PI*2 - Math.PI/2, R-38);
  } else {
    for (let i = 0; i < 60; i++) {
      const angle = (i/60)*Math.PI*2 - Math.PI/2, isSel = i === selMin;
      if (i % 5 === 0) {
        const x = cx+(R-20)*Math.cos(angle), y = cy+(R-20)*Math.sin(angle);
        if (isSel) { ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI*2); ctx.fillStyle = '#c8f05a'; ctx.fill(); }
        ctx.fillStyle = isSel ? '#0d0d0f' : '#f0ede8';
        ctx.font = `${isSel?'700':'400'} 11px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i).padStart(2,'0'), x, y);
      } else {
        const tx = cx+(R-10)*Math.cos(angle), ty = cy+(R-10)*Math.sin(angle);
        ctx.beginPath(); ctx.arc(tx, ty, isSel?5:2, 0, Math.PI*2);
        ctx.fillStyle = isSel ? '#c8f05a' : '#3a3a45'; ctx.fill();
      }
    }
    drawHand(ctx, cx, cy, (selMin/60)*Math.PI*2 - Math.PI/2, R-38);
  }
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2); ctx.fillStyle = '#c8f05a'; ctx.fill();
  g('clock-hour').textContent = String(selHour).padStart(2,'0');
  g('clock-min').textContent  = String(selMin).padStart(2,'0');
  g('clock-ampm').textContent = selAmPm;
}

function drawHand(ctx, cx, cy, angle, len) {
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + len*Math.cos(angle), cy + len*Math.sin(angle));
  ctx.strokeStyle = '#c8f05a'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
}

function onClockClick(e) {
  const canvas = g('clock-canvas'), rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width/rect.width);
  const my = (e.clientY - rect.top)  * (canvas.height/rect.height);
  const cx = canvas.width/2, cy = canvas.height/2;
  let angle = Math.atan2(my-cy, mx-cx) + Math.PI/2;
  if (angle < 0) angle += Math.PI*2;
  if (clockMode === 'hour') {
    let h = Math.round(angle/(Math.PI*2)*12); if (h===0) h=12; if (h>12) h=12;
    selHour = h; clockMode = 'min';
  } else {
    let m = Math.round(angle/(Math.PI*2)*60); if (m>=60) m=0; selMin = m;
  }
  drawClock(); updateClockLabel();
}

function adjustHour(d) { selHour+=d; if(selHour>12)selHour=1; if(selHour<1)selHour=12; clockMode='hour'; drawClock(); updateClockLabel(); }
function adjustMin(d)  { selMin+=d;  if(selMin>=60)selMin=0;  if(selMin<0)selMin=59;   clockMode='min';  drawClock(); updateClockLabel(); }
function toggleAmPm()  { selAmPm = selAmPm==='AM'?'PM':'AM'; drawClock(); updateClockLabel(); }

function updateClockLabel() {
  if (!selDay) { g('clock-selected-label').textContent = '—'; return; }
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  g('clock-selected-label').textContent =
    `${months[calMonth]} ${selDay}, ${calYear}  ·  ${String(selHour).padStart(2,'0')}:${String(selMin).padStart(2,'0')} ${selAmPm}`;
  g('clock-selected-label').style.color = '';
}

function confirmReminder() {
  let h24 = selHour % 12; if (selAmPm==='PM') h24+=12;
  const dt = new Date(calYear, calMonth, selDay, h24, selMin, 0, 0);
  if (dt <= new Date()) { g('clock-selected-label').textContent='⚠ This time is in the past!'; g('clock-selected-label').style.color='#f05a5a'; return; }
  finalTimestamp = dt.getTime();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  g('remind-display-text').textContent = `⏰ ${months[calMonth]} ${selDay} · ${String(selHour).padStart(2,'0')}:${String(selMin).padStart(2,'0')} ${selAmPm}`;
  g('remind-trigger').classList.add('active');
  closeAll();
}

function addTab() {
  const url = g('input-url').value.trim();
  const reason = g('input-reason').value.trim();
  const priority = g('input-priority').value;
  const catSelect = g('input-category').value;
  if (!url)    { flash('input-url');    return; }
  if (!reason) { flash('input-reason'); return; }
  let category = catSelect, customLabel = '';
  if (catSelect === 'other') {
    const typed = g('input-custom-category').value.trim();
    if (!typed) { flash('input-custom-category'); return; }
    customLabel = typed;
  }
  const remindAt = finalTimestamp || null;
  const tab = { id: genId(), url, reason, category, customLabel, priority, remindAt, createdAt: Date.now(), done: false };
  tabs.unshift(tab);
  save();
  if (remindAt) chrome.runtime.sendMessage({ type: 'SET_ALARM', id: tab.id, remindAt, reason, url });
  g('input-reason').value = '';
  g('input-category').value = 'research';
  g('input-custom-category').value = '';
  g('custom-category-wrap').style.display = 'none';
  finalTimestamp = null; selDay = null;
  g('remind-display-text').textContent = '📅 Set reminder...';
  g('remind-trigger').classList.remove('active');
  renderTabs();
}

function flash(id) { const e=g(id); if(!e)return; e.style.borderColor='#f05a5a'; e.focus(); setTimeout(()=>{e.style.borderColor='';},1200); }

function renderTabs() {
  const list = g('tabs-list'), now = Date.now();
  const filtered = tabs.filter(t => {
    if (activeFilter==='open')    return !t.done;
    if (activeFilter==='done')    return t.done;
    if (activeFilter==='overdue') return !t.done && t.remindAt && t.remindAt < now;
    if (activeFilter==='today') {
      const s=new Date(); s.setHours(0,0,0,0); const e=new Date(); e.setHours(23,59,59,999);
      return !t.done && t.remindAt && t.remindAt>=s.getTime() && t.remindAt<=e.getTime();
    }
    return true;
  });
  g('visible-count').textContent = filtered.length;
  g('clear-done-btn').style.display = tabs.some(t=>t.done) ? 'inline' : 'none';
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🗂️</div><div class="empty-title">${activeFilter==='all'?'No tabs saved yet':'Nothing here'}</div><div class="empty-sub">${activeFilter==='all'?'Open any tab, click the extension, write why.':'Try a different filter.'}</div></div>`;
    return;
  }
  list.innerHTML = filtered.map(t => cardHTML(t, now)).join('');
  list.querySelectorAll('.done-btn').forEach(b => b.addEventListener('click', () => toggleDone(b.dataset.id)));
  list.querySelectorAll('.del-btn').forEach(b  => b.addEventListener('click', () => deleteTab(b.dataset.id)));
  list.querySelectorAll('.open-btn').forEach(b => b.addEventListener('click', () => {
    const t = tabs.find(x => x.id === b.dataset.id);
    if (t) chrome.tabs.create({ url: t.url });
  }));
}

function cardHTML(t, now) {
  const bl={research:'Research',work:'Work',buy:'Buy',read:'Read',watch:'Watch'};
  const bi={research:'🔬',work:'💼',buy:'🛒',read:'📖',watch:'🎬'};
  let catIcon=bi[t.category]||'📎', catLabel=bl[t.category]||(t.customLabel||'Other');
  if(t.category==='other'&&t.customLabel){catIcon='📎';catLabel=t.customLabel;}
  const du=t.url.replace(/^https?:\/\//,'').replace(/^www\./,'');
  return `<div class="tab-card ${t.done?'done':''}" data-priority="${t.priority}">
    <div class="tab-main">
      <div class="tab-top"><span class="tab-category cat-${t.category==='other'?'other':t.category}">${catIcon} ${esc(catLabel)}</span><span class="priority-dot dot-${t.priority}"></span></div>
      <span class="tab-url" title="${esc(t.url)}">${esc(du)}</span>
      <div class="tab-reason">${esc(t.reason)}</div>
      <div class="tab-meta"><span class="meta-item">🕓 ${age(t.createdAt,now)}</span>${remindBadge(t.remindAt,now)}</div>
    </div>
    <div class="tab-actions">
      <button class="icon-btn done-btn ${t.done?'checked':''}" data-id="${t.id}">${t.done?'✓':'○'}</button>
      <button class="icon-btn open-btn" data-id="${t.id}">↗</button>
      <button class="icon-btn del-btn"  data-id="${t.id}">✕</button>
    </div>
  </div>`;
}

function remindBadge(r,now) {
  if(!r)return'';
  const diff=r-now;
  let cls,lbl;
  if(diff<0){cls='overdue';lbl='⚠ Overdue';}
  else if(diff<10800000){cls='soon';lbl='⏰ In '+dur(diff);}
  else{cls='later';const d=new Date(r);lbl='⏰ '+d.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});}
  return `<span class="remind-badge ${cls}">${lbl}</span>`;
}

function toggleDone(id){const t=tabs.find(t=>t.id===id);if(!t)return;t.done=!t.done;save();renderTabs();}
function deleteTab(id){tabs=tabs.filter(t=>t.id!==id);save();renderTabs();}
function clearDone(){tabs=tabs.filter(t=>!t.done);save();renderTabs();}

function updateStats(){
  const now=Date.now(),s=new Date(),e=new Date();
  s.setHours(0,0,0,0);e.setHours(23,59,59,999);
  g('stat-open').textContent=tabs.filter(t=>!t.done).length;
  g('stat-done').textContent=tabs.filter(t=>t.done).length;
  g('stat-due').textContent=tabs.filter(t=>!t.done&&t.remindAt&&((t.remindAt>=s.getTime()&&t.remindAt<=e.getTime())||t.remindAt<now)).length;
}

function age(ts,now){const d=now-ts;if(d<60000)return'just now';if(d<3600000)return Math.floor(d/60000)+'m ago';if(d<86400000)return Math.floor(d/3600000)+'h ago';return Math.floor(d/86400000)+'d ago';}
function dur(ms){return ms<3600000?Math.round(ms/60000)+' min':Math.round(ms/3600000*10)/10+'h';}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
