/* ────────────────────────────────────────────
   FitTrack – PWA Fitness Tracker
   ──────────────────────────────────────────── */

// ── Config ──
const ACTIVITY_META = {
  gym:       { icon: '\u{1F3CB}\u{FE0F}', label: 'Gym',       color: '#4361ee' },
  cycling:   { icon: '\u{1F6B4}',         label: 'Cycling',   color: '#06d6a0' },
  badminton: { icon: '\u{1F3F8}',         label: 'Badminton', color: '#ffd166' },
  running:   { icon: '\u{1F3C3}',         label: 'Running',   color: '#ef476f' },
  swimming:  { icon: '\u{1F3CA}',         label: 'Swimming',  color: '#4cc9f0' },
  yoga:      { icon: '\u{1F9D8}',         label: 'Yoga',      color: '#7209b7' },
  hiking:    { icon: '\u{1F97E}',         label: 'Hiking',    color: '#ff6b35' },
};

const DEFAULT_SETTINGS = {
  gymSplits: ['Chest / Triceps', 'Back / Biceps', 'Shoulders / Legs'],
  activities: ['cycling', 'badminton', 'running', 'swimming', 'yoga', 'hiking'],
  customActivities: [],
};

// ── Storage ──
const Storage = {
  _get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
  },
  getWorkouts()      { return this._get('ft_workouts', []); },
  saveWorkouts(data) { localStorage.setItem('ft_workouts', JSON.stringify(data)); },
  getSettings()      { return { ...DEFAULT_SETTINGS, ...this._get('ft_settings', {}) }; },
  saveSettings(data) { localStorage.setItem('ft_settings', JSON.stringify(data)); },
};

// ── State ──
let workouts = Storage.getWorkouts();
let settings = Storage.getSettings();
let currentView = 'dashboard';
let logState = { type: null, split: null };
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

const $ = (sel) => document.querySelector(sel);
const $main = () => $('#main');

// ── Helpers ──
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function toDateStr(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

function friendlyDate(str) {
  const d = new Date(str + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function friendlyDateLong(str) {
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  dt.setDate(diff);
  dt.setHours(0,0,0,0);
  return dt;
}

function activityMeta(type) {
  return ACTIVITY_META[type] || {
    icon: '\u{1F4AA}',
    label: type.charAt(0).toUpperCase() + type.slice(1),
    color: '#8888a0'
  };
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 1800);
  setTimeout(() => el.remove(), 2200);
}

// ── Stats ──
function calcStreak() {
  if (!workouts.length) return 0;
  const dates = [...new Set(workouts.map(w => w.date))].sort().reverse();
  const today = new Date(); today.setHours(0,0,0,0);
  const newest = new Date(dates[0] + 'T00:00:00');
  const gap = Math.floor((today - newest) / 86400000);
  if (gap > 1) return 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const cur = new Date(dates[i] + 'T00:00:00');
    const prev = new Date(dates[i - 1] + 'T00:00:00');
    if (Math.floor((prev - cur) / 86400000) === 1) streak++;
    else break;
  }
  return streak;
}

function countInRange(start, end) {
  const s = toDateStr(start), e = toDateStr(end);
  return new Set(workouts.filter(w => w.date >= s && w.date <= e).map(w => w.date)).size;
}

function thisWeekCount() {
  const monday = getMonday(new Date());
  return countInRange(monday, new Date());
}

function thisMonthCount() {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  return countInRange(start, d);
}

// ── Calendar Builder ──
function buildCalendarDays(year, month) {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = toDateStr(today);

  const dateWorkouts = {};
  workouts.forEach(w => {
    if (!dateWorkouts[w.date]) dateWorkouts[w.date] = [];
    dateWorkouts[w.date].push(w);
  });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const days = [];
  for (let i = 0; i < startOffset; i++) days.push({ empty: true });

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const ds = toDateStr(date);
    const dayWorkouts = dateWorkouts[ds] || [];
    const types = [...new Set(dayWorkouts.map(w => w.type))];
    days.push({
      num: d,
      date: ds,
      isToday: ds === todayStr,
      isFuture: ds > todayStr,
      hasActivity: dayWorkouts.length > 0,
      types,
    });
  }
  return days;
}

function renderCalendar() {
  const monthName = new Date(calYear, calMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const days = buildCalendarDays(calYear, calMonth);

  const usedTypes = new Set();
  days.forEach(d => { if (d.types) d.types.forEach(t => usedTypes.add(t)); });

  let gridHtml = '';
  days.forEach(d => {
    if (d.empty) {
      gridHtml += '<div class="calendar-day empty"></div>';
      return;
    }
    const cls = [
      'calendar-day',
      d.hasActivity ? 'has-activity' : '',
      d.isToday ? 'is-today' : '',
      d.isFuture ? 'future' : '',
    ].filter(Boolean).join(' ');

    let dotsHtml = '';
    if (d.types.length) {
      dotsHtml = '<div class="day-dots">';
      d.types.slice(0, 3).forEach(t => {
        const c = activityMeta(t).color;
        dotsHtml += `<span class="day-dot" style="background:${c}"></span>`;
      });
      dotsHtml += '</div>';
    }

    gridHtml += `<div class="${cls}"><span class="day-num">${d.num}</span>${dotsHtml}</div>`;
  });

  let legendHtml = '';
  if (usedTypes.size) {
    legendHtml = '<div class="calendar-legend">';
    usedTypes.forEach(t => {
      const m = activityMeta(t);
      legendHtml += `<span class="legend-item"><span class="legend-dot" style="background:${m.color}"></span>${m.label}</span>`;
    });
    legendHtml += '</div>';
  }

  return `
    <div class="calendar">
      <div class="calendar-header">
        <button class="calendar-nav" id="cal-prev">\u{2039}</button>
        <div class="calendar-title">${monthName}</div>
        <button class="calendar-nav" id="cal-next">\u{203A}</button>
      </div>
      <div class="calendar-weekdays">
        <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
      </div>
      <div class="calendar-grid">${gridHtml}</div>
      ${legendHtml}
    </div>`;
}

function renderBreakdown() {
  if (!workouts.length) return '';
  const counts = {};
  workouts.forEach(w => { counts[w.type] = (counts[w.type] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = sorted[0][1];

  let html = '<div class="breakdown-card">';
  sorted.forEach(([type, count]) => {
    const m = activityMeta(type);
    const pct = Math.round((count / max) * 100);
    html += `
      <div class="breakdown-row">
        <span class="breakdown-label">${m.icon} ${m.label}</span>
        <div class="breakdown-bar-track">
          <div class="breakdown-bar-fill" style="width:${pct}%;background:${m.color}"></div>
        </div>
        <span class="breakdown-count">${count}</span>
      </div>`;
  });
  html += '</div>';
  return html;
}

// ── Rendering ──
function render() {
  const titles = { dashboard: 'FitTrack', log: 'Log Activity', history: 'History', settings: 'Settings' };
  $('#header-title').textContent = titles[currentView] || 'FitTrack';

  switch (currentView) {
    case 'dashboard': return renderDashboard();
    case 'log':       return renderLog();
    case 'history':   return renderHistory();
    case 'settings':  return renderSettings();
  }
}

function renderDashboard() {
  const streak = calcStreak();
  const weekCount = thisWeekCount();
  const monthCount = thisMonthCount();
  const totalDays = new Set(workouts.map(w => w.date)).size;

  // Week strip
  const now = new Date();
  const mon = getMonday(now);
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayStr = toDateStr(now);
  const activeDates = new Set(workouts.map(w => w.date));

  let weekStripHtml = '<div class="week-strip">';
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(d.getDate() + i);
    const ds = toDateStr(d);
    const isToday = ds === todayStr;
    const isActive = activeDates.has(ds);
    const isFuture = ds > todayStr;
    weekStripHtml += `
      <div class="week-day ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}" ${isFuture ? 'style="opacity:0.35"' : ''}>
        <span class="week-day-name">${weekDays[i]}</span>
        <span class="week-day-num">${d.getDate()}</span>
        <span class="week-day-dot"></span>
      </div>`;
  }
  weekStripHtml += '</div>';

  // Recent
  const recent = [...workouts].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 5);
  let recentHtml = '';
  if (recent.length) {
    recentHtml = '<div class="activity-list">';
    recent.forEach(w => {
      const m = activityMeta(w.type);
      const sub = w.split ? w.split : m.label;
      recentHtml += `
        <div class="activity-item" data-id="${w.id}">
          <div class="activity-icon" style="background:${m.color}22;color:${m.color}">${m.icon}</div>
          <div class="activity-info">
            <div class="activity-name">${sub}</div>
            <div class="activity-meta">${friendlyDate(w.date)}${w.duration ? ' \u{00B7} ' + w.duration + ' min' : ''}</div>
          </div>
        </div>`;
    });
    recentHtml += '</div>';
  } else {
    recentHtml = `
      <div class="empty-state">
        <div class="empty-state-icon">\u{1F3CB}\u{FE0F}</div>
        <div class="empty-state-text">No workouts yet</div>
        <div class="empty-state-sub">Tap Log to record your first session</div>
      </div>`;
  }

  const showInstall = !window.navigator.standalone && !window.matchMedia('(display-mode: standalone)').matches
    && /iPhone|iPad/.test(navigator.userAgent) && !localStorage.getItem('ft_install_dismissed');

  let installHtml = '';
  if (showInstall) {
    installHtml = `
      <div class="install-banner">
        <span>\u{1F4F2}</span>
        <span><strong>Install FitTrack:</strong> Tap Share \u{2192} Add to Home Screen</span>
        <button class="install-banner-close" onclick="localStorage.setItem('ft_install_dismissed','1');this.parentElement.remove()">\u{2715}</button>
      </div>`;
  }

  const breakdownHtml = renderBreakdown();

  $main().innerHTML = `
    <div class="fade-in">
      ${installHtml}
      <div class="stats-grid">
        <div class="stat-card g-streak"><div class="stat-icon">\u{1F525}</div><div class="stat-value">${streak}</div><div class="stat-label">Day Streak</div></div>
        <div class="stat-card g-week"><div class="stat-icon">\u{1F4C5}</div><div class="stat-value">${weekCount}/7</div><div class="stat-label">This Week</div></div>
        <div class="stat-card g-month"><div class="stat-icon">\u{1F4C8}</div><div class="stat-value">${monthCount}</div><div class="stat-label">This Month</div></div>
        <div class="stat-card g-total"><div class="stat-icon">\u{1F3AF}</div><div class="stat-value">${totalDays}</div><div class="stat-label">Total Days</div></div>
      </div>
      <div class="section">
        <div class="section-title">This Week</div>
        ${weekStripHtml}
      </div>
      <div class="section">
        <div class="section-title">Consistency</div>
        ${renderCalendar()}
      </div>
      ${breakdownHtml ? `<div class="section"><div class="section-title">Activity Breakdown</div>${breakdownHtml}</div>` : ''}
      <div class="section">
        <div class="section-title">Recent Activity</div>
        ${recentHtml}
      </div>
    </div>`;
}

function renderLog() {
  const allActivities = ['gym', ...settings.activities, ...settings.customActivities];

  let typesHtml = '<div class="activity-type-grid">';
  allActivities.forEach(a => {
    const m = activityMeta(a);
    typesHtml += `
      <button class="activity-type-btn ${logState.type === a ? 'selected' : ''}" data-type="${a}">
        <span class="emoji">${m.icon}</span>
        ${m.label}
      </button>`;
  });
  typesHtml += '</div>';

  let splitsHtml = '';
  if (logState.type === 'gym') {
    splitsHtml = `
      <div class="log-section mt-16">
        <div class="log-section-label">Workout Split</div>
        <div class="split-chips">
          ${settings.gymSplits.map(s =>
            `<button class="split-chip ${logState.split === s ? 'selected' : ''}" data-split="${s}">${s}</button>`
          ).join('')}
        </div>
      </div>`;
  }

  $main().innerHTML = `
    <div class="fade-in">
      <div class="log-section">
        <div class="log-section-label">Activity Type</div>
        ${typesHtml}
      </div>
      ${splitsHtml}
      <div class="log-section mt-16">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" class="form-input" id="log-date" value="${toDateStr(new Date())}">
          </div>
          <div class="form-group">
            <label class="form-label">Duration (min)</label>
            <input type="number" class="form-input" id="log-duration" value="60" min="1" max="600" inputmode="numeric">
          </div>
        </div>
      </div>
      <div class="log-section">
        <div class="form-group">
          <label class="form-label">Notes (optional)</label>
          <textarea class="form-input" id="log-notes" rows="2" placeholder="How was the session?"></textarea>
        </div>
      </div>
      <button class="btn btn-primary mt-12" id="log-submit" ${!logState.type ? 'disabled' : ''}>
        Log Workout
      </button>
    </div>`;
}

function renderHistory() {
  const timeFilter = $main().dataset?.timeFilter || 'all';
  const typeFilter = $main().dataset?.typeFilter || 'all';

  const now = new Date(); now.setHours(0,0,0,0);
  let filtered = [...workouts];

  if (timeFilter === 'week') {
    const mon = getMonday(now);
    const monStr = toDateStr(mon);
    filtered = filtered.filter(w => w.date >= monStr);
  } else if (timeFilter === 'month') {
    const start = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
    filtered = filtered.filter(w => w.date >= start);
  }

  if (typeFilter !== 'all') {
    filtered = filtered.filter(w => w.type === typeFilter);
  }

  filtered.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const grouped = {};
  filtered.forEach(w => {
    const label = friendlyDateLong(w.date);
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(w);
  });

  const allTypes = ['all', 'gym', ...settings.activities, ...settings.customActivities];

  let html = `
    <div class="fade-in">
      <div class="filter-bar" id="time-filters">
        ${['all', 'week', 'month'].map(f =>
          `<button class="filter-btn ${timeFilter === f ? 'active' : ''}" data-time="${f}">${f === 'all' ? 'All Time' : f === 'week' ? 'This Week' : 'This Month'}</button>`
        ).join('')}
      </div>
      <div class="filter-bar mb-12" id="type-filters">
        ${allTypes.map(f => {
          const label = f === 'all' ? 'All' : activityMeta(f).label;
          return `<button class="filter-btn ${typeFilter === f ? 'active' : ''}" data-type-filter="${f}">${label}</button>`;
        }).join('')}
      </div>`;

  if (filtered.length === 0) {
    html += `
      <div class="empty-state">
        <div class="empty-state-icon">\u{1F4CB}</div>
        <div class="empty-state-text">No workouts found</div>
        <div class="empty-state-sub">Try changing the filters or log a workout</div>
      </div>`;
  } else {
    const totalSessions = filtered.length;
    const uniqueDays = new Set(filtered.map(w => w.date)).size;
    html += `<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;padding-left:4px">${totalSessions} session${totalSessions !== 1 ? 's' : ''} over ${uniqueDays} day${uniqueDays !== 1 ? 's' : ''}</div>`;

    Object.entries(grouped).forEach(([label, items]) => {
      html += `<div class="history-group"><div class="history-group-title">${label}</div><div class="activity-list">`;
      items.forEach(w => {
        const m = activityMeta(w.type);
        const name = w.split || m.label;
        html += `
          <div class="activity-item" data-id="${w.id}">
            <div class="activity-icon" style="background:${m.color}22;color:${m.color}">${m.icon}</div>
            <div class="activity-info">
              <div class="activity-name">${name}</div>
              <div class="activity-meta">${m.label}${w.duration ? ' · ' + w.duration + ' min' : ''}${w.notes ? ' · ' + w.notes : ''}</div>
            </div>
            <button class="activity-delete" data-delete="${w.id}">\u{2715}</button>
          </div>`;
      });
      html += '</div></div>';
    });
  }

  html += '</div>';

  const savedTimeFilter = timeFilter;
  const savedTypeFilter = typeFilter;
  $main().innerHTML = html;
  $main().dataset.timeFilter = savedTimeFilter;
  $main().dataset.typeFilter = savedTypeFilter;
}

function renderSettings() {
  let splitsHtml = '<div class="settings-list">';
  settings.gymSplits.forEach((s, i) => {
    splitsHtml += `
      <div class="settings-item">
        <div class="settings-item-icon">\u{1F4AA}</div>
        <div class="settings-item-text">${s}</div>
        <button class="settings-btn delete" data-del-split="${i}" title="Remove">\u{2715}</button>
      </div>`;
  });
  splitsHtml += '</div>';

  let activitiesHtml = '<div class="settings-list">';
  settings.activities.forEach((a, i) => {
    const m = activityMeta(a);
    activitiesHtml += `
      <div class="settings-item">
        <div class="settings-item-icon">${m.icon}</div>
        <div class="settings-item-text">${m.label}</div>
      </div>`;
  });
  settings.customActivities.forEach((a, i) => {
    const m = activityMeta(a);
    activitiesHtml += `
      <div class="settings-item">
        <div class="settings-item-icon">${m.icon}</div>
        <div class="settings-item-text">${m.label}</div>
        <button class="settings-btn delete" data-del-custom="${i}" title="Remove">\u{2715}</button>
      </div>`;
  });
  activitiesHtml += '</div>';

  $main().innerHTML = `
    <div class="fade-in">
      <div class="settings-group">
        <div class="settings-group-title">Gym Splits</div>
        ${splitsHtml}
        <button class="add-btn mt-12" id="add-split">+ Add Split</button>
      </div>
      <div class="settings-group">
        <div class="settings-group-title">Activities</div>
        ${activitiesHtml}
        <button class="add-btn mt-12" id="add-activity">+ Add Custom Activity</button>
      </div>
      <div class="settings-group">
        <div class="settings-group-title">Data</div>
        <button class="btn btn-ghost mb-12" id="export-data">Export Data</button>
        <button class="btn btn-ghost mb-12" id="import-data">Import Data</button>
        <button class="btn btn-danger" id="clear-data">Clear All Data</button>
        <input type="file" id="import-file" accept=".json" style="display:none">
      </div>
    </div>`;
}

// ── Modals ──
function showModal(title, bodyHtml, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${title}</div>
      ${bodyHtml}
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-save">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#modal-save').addEventListener('click', () => {
    if (onSave(overlay)) overlay.remove();
  });

  const firstInput = overlay.querySelector('input, textarea');
  if (firstInput) setTimeout(() => firstInput.focus(), 100);
}

function showConfirm(title, message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${title}</div>
      <p style="color:var(--text-secondary);font-size:14px;line-height:1.5">${message}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
        <button class="btn btn-danger" id="modal-confirm">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#modal-confirm').addEventListener('click', () => {
    onConfirm();
    overlay.remove();
  });
}

// ── Navigation ──
function navigate(view) {
  currentView = view;
  if (view === 'log') logState = { type: null, split: null };
  if (view === 'dashboard') { calYear = new Date().getFullYear(); calMonth = new Date().getMonth(); }
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === view);
  });
  render();
  $main().scrollTop = 0;
}

// ── Event Delegation ──
document.getElementById('tab-bar').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) navigate(tab.dataset.view);
});

document.getElementById('main').addEventListener('click', (e) => {
  const target = e.target;

  // Dashboard: calendar navigation
  if (target.id === 'cal-prev' || target.closest('#cal-prev')) {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    const calEl = document.querySelector('.calendar');
    if (calEl) {
      calEl.outerHTML = renderCalendar();
    }
    return;
  }
  if (target.id === 'cal-next' || target.closest('#cal-next')) {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    const calEl = document.querySelector('.calendar');
    if (calEl) {
      calEl.outerHTML = renderCalendar();
    }
    return;
  }

  // Log view: activity type selection
  const typeBtn = target.closest('.activity-type-btn');
  if (typeBtn && currentView === 'log') {
    logState.type = typeBtn.dataset.type;
    logState.split = null;
    renderLog();
    return;
  }

  // Log view: split selection
  const splitChip = target.closest('.split-chip');
  if (splitChip && currentView === 'log') {
    logState.split = splitChip.dataset.split;
    document.querySelectorAll('.split-chip').forEach(c => c.classList.remove('selected'));
    splitChip.classList.add('selected');
    const btn = document.getElementById('log-submit');
    if (btn) btn.disabled = false;
    return;
  }

  // Log view: submit
  if (target.id === 'log-submit' || target.closest('#log-submit')) {
    handleLogSubmit();
    return;
  }

  // History view: time filter
  const timeBtn = target.closest('[data-time]');
  if (timeBtn && currentView === 'history') {
    $main().dataset.timeFilter = timeBtn.dataset.time;
    renderHistory();
    return;
  }

  // History view: type filter
  const typeFilterBtn = target.closest('[data-type-filter]');
  if (typeFilterBtn && currentView === 'history') {
    $main().dataset.typeFilter = typeFilterBtn.dataset.typeFilter;
    renderHistory();
    return;
  }

  // Delete workout
  const delBtn = target.closest('[data-delete]');
  if (delBtn) {
    const id = delBtn.dataset.delete;
    showConfirm('Delete Workout', 'Are you sure you want to remove this entry?', () => {
      workouts = workouts.filter(w => w.id !== id);
      Storage.saveWorkouts(workouts);
      render();
      showToast('Workout deleted');
    });
    return;
  }

  // Show delete button on mobile (toggle)
  const actItem = target.closest('.activity-item');
  if (actItem && currentView === 'history') {
    const delBtnInner = actItem.querySelector('.activity-delete');
    if (delBtnInner) {
      document.querySelectorAll('.activity-delete.show').forEach(b => b.classList.remove('show'));
      delBtnInner.classList.toggle('show');
    }
    return;
  }

  // Settings: delete split
  const delSplit = target.closest('[data-del-split]');
  if (delSplit) {
    const idx = parseInt(delSplit.dataset.delSplit);
    settings.gymSplits.splice(idx, 1);
    Storage.saveSettings(settings);
    renderSettings();
    return;
  }

  // Settings: delete custom activity
  const delCustom = target.closest('[data-del-custom]');
  if (delCustom) {
    const idx = parseInt(delCustom.dataset.delCustom);
    settings.customActivities.splice(idx, 1);
    Storage.saveSettings(settings);
    renderSettings();
    return;
  }

  // Settings: add split
  if (target.id === 'add-split' || target.closest('#add-split')) {
    showModal('Add Gym Split', `
      <div class="form-group">
        <label class="form-label">Split Name</label>
        <input type="text" class="form-input" id="modal-input" placeholder="e.g. Arms / Abs">
      </div>`, (overlay) => {
      const val = overlay.querySelector('#modal-input').value.trim();
      if (!val) return false;
      settings.gymSplits.push(val);
      Storage.saveSettings(settings);
      renderSettings();
      showToast('Split added');
      return true;
    });
    return;
  }

  // Settings: add activity
  if (target.id === 'add-activity' || target.closest('#add-activity')) {
    showModal('Add Custom Activity', `
      <div class="form-group">
        <label class="form-label">Activity Name</label>
        <input type="text" class="form-input" id="modal-input" placeholder="e.g. Tennis">
      </div>`, (overlay) => {
      const val = overlay.querySelector('#modal-input').value.trim().toLowerCase();
      if (!val) return false;
      if (settings.activities.includes(val) || settings.customActivities.includes(val)) {
        showToast('Activity already exists');
        return false;
      }
      settings.customActivities.push(val);
      Storage.saveSettings(settings);
      renderSettings();
      showToast('Activity added');
      return true;
    });
    return;
  }

  // Settings: export
  if (target.id === 'export-data' || target.closest('#export-data')) {
    const data = JSON.stringify({ workouts, settings }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fittrack-backup-${toDateStr(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported');
    return;
  }

  // Settings: import
  if (target.id === 'import-data' || target.closest('#import-data')) {
    document.getElementById('import-file').click();
    return;
  }

  // Settings: clear
  if (target.id === 'clear-data' || target.closest('#clear-data')) {
    showConfirm('Clear All Data', 'This will permanently delete all workouts and reset settings. This cannot be undone.', () => {
      workouts = [];
      settings = { ...DEFAULT_SETTINGS };
      Storage.saveWorkouts(workouts);
      Storage.saveSettings(settings);
      render();
      showToast('All data cleared');
    });
    return;
  }
});

// File import handler
document.addEventListener('change', (e) => {
  if (e.target.id === 'import-file') {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.workouts) { workouts = data.workouts; Storage.saveWorkouts(workouts); }
        if (data.settings) { settings = { ...DEFAULT_SETTINGS, ...data.settings }; Storage.saveSettings(settings); }
        render();
        showToast('Data imported successfully');
      } catch {
        showToast('Invalid backup file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }
});

function handleLogSubmit() {
  if (!logState.type) return;

  if (logState.type === 'gym' && !logState.split) {
    showToast('Select a workout split');
    return;
  }

  const date = document.getElementById('log-date')?.value || toDateStr(new Date());
  const duration = parseInt(document.getElementById('log-duration')?.value) || null;
  const notes = document.getElementById('log-notes')?.value?.trim() || '';

  const workout = {
    id: uid(),
    date,
    type: logState.type,
    split: logState.type === 'gym' ? logState.split : null,
    duration,
    notes,
    createdAt: new Date().toISOString(),
  };

  workouts.push(workout);
  Storage.saveWorkouts(workouts);

  logState = { type: null, split: null };
  navigate('dashboard');
  showToast('Workout logged!');
}

// ── Init ──
function init() {
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Handle iOS visual viewport for keyboard
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      document.body.style.height = window.visualViewport.height + 'px';
    });
  }
}

init();
