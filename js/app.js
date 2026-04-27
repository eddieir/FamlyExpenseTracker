// =========================================================
//  MAIN APP — Supabase-backed family budget tracker
// =========================================================

let supabase = null;
let currentUser = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

// In-memory cache for current session
let expensesCache = [];   // { id, month_key, date, cat, amount, note, added_by }
let glovoCache = [];      // { id, month_key, date, lunch_cost, personal_topup, pantry_items, added_by }
let currentPage = 'dashboard';

// =========================================================
//  INIT
// =========================================================

window.addEventListener('DOMContentLoaded', () => {
  // Init Supabase
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    showToast('Supabase not configured — see js/config.js', true);
  }

  // Check for saved session
  const saved = sessionStorage.getItem('fb_user');
  if (saved && APP_USERS[saved]) {
    currentUser = saved;
    bootApp();
  }

  // Set today's date in forms
  const today = new Date().toISOString().split('T')[0];
  ['exp-date','g-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
});

// =========================================================
//  AUTH
// =========================================================

let selectedUser = null;

function selectUser(name) {
  selectedUser = name;
  document.querySelectorAll('.user-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('btn-' + name).classList.add('selected');
  document.getElementById('auth-pass').focus();
}

function login() {
  if (!selectedUser) { showAuthError('Please select who you are.'); return; }
  const pass = document.getElementById('auth-pass').value;
  if (APP_USERS[selectedUser] && APP_USERS[selectedUser] === pass) {
    currentUser = selectedUser;
    sessionStorage.setItem('fb_user', currentUser);
    document.getElementById('auth-error').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    bootApp();
  } else {
    showAuthError('Incorrect password. Try again.');
    document.getElementById('auth-pass').value = '';
    document.getElementById('auth-pass').focus();
  }
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function logout() {
  sessionStorage.removeItem('fb_user');
  location.reload();
}

// =========================================================
//  BOOT
// =========================================================

function bootApp() {
  // Update UI with user info
  const display = currentUser.charAt(0).toUpperCase() + currentUser.slice(1);
  document.getElementById('sidebar-username').textContent = display;
  document.getElementById('sidebar-avatar').textContent = currentUser.charAt(0).toUpperCase();
  document.getElementById('mobile-user-label').textContent = display;

  updateMonthDisplay();
  renderFood();
  renderRules();
  loadCurrentMonth();
}

// =========================================================
//  MONTH NAVIGATION
// =========================================================

function updateMonthDisplay() {
  const label = monthLabel(currentYear, currentMonth);
  document.getElementById('month-display').textContent = label;
  document.getElementById('sidebar-month-label').textContent = label;
  if (document.getElementById('dash-title')) {
    document.getElementById('dash-title').textContent = label;
  }
  // Disable "next month" if we're at the current real month
  const now = new Date();
  const btnNext = document.getElementById('btn-next-month');
  if (btnNext) {
    const isCurrentOrFuture = (currentYear > now.getFullYear()) ||
      (currentYear === now.getFullYear() && currentMonth >= now.getMonth() + 1);
    btnNext.disabled = isCurrentOrFuture;
  }
}

function changeMonth(dir) {
  currentMonth += dir;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  if (currentMonth < 1)  { currentMonth = 12; currentYear--; }
  updateMonthDisplay();
  loadCurrentMonth();
}

async function loadCurrentMonth() {
  showLoading(true);
  const mk = monthKey(currentYear, currentMonth);
  try {
    const [expRes, glovoRes] = await Promise.all([
      supabase.from('expenses').select('*').eq('month_key', mk).order('date', { ascending: false }),
      supabase.from('glovo_entries').select('*').eq('month_key', mk).order('date', { ascending: true }),
    ]);
    if (expRes.error) throw expRes.error;
    if (glovoRes.error) throw glovoRes.error;
    expensesCache = expRes.data || [];
    glovoCache = glovoRes.data || [];
  } catch (e) {
    showToast('Failed to load data: ' + e.message, true);
    expensesCache = [];
    glovoCache = [];
  }
  showLoading(false);
  refreshCurrentPage();
}

function refreshCurrentPage() {
  if (currentPage === 'dashboard') renderDashboard();
  if (currentPage === 'expenses')  renderExpenses();
  if (currentPage === 'budget')    renderBudget();
  if (currentPage === 'glovo')     renderGlovo();
  if (currentPage === 'history')   renderHistory();
}

// =========================================================
//  NAVIGATION
// =========================================================

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelector(`[data-page="${name}"]`).classList.add('active');
  currentPage = name;

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');

  if (name === 'dashboard') renderDashboard();
  if (name === 'expenses')  renderExpenses();
  if (name === 'budget')    renderBudget();
  if (name === 'glovo')     renderGlovo();
  if (name === 'history')   renderHistory();
}

function toggleMobileMenu() {
  document.getElementById('sidebar').classList.toggle('open');
}

// =========================================================
//  SUPABASE HELPERS
// =========================================================

function showLoading(on) {
  const el = document.getElementById('loading-overlay');
  if (on) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

function showToast(msg, isError = false) {
  const t = document.getElementById('toast') || createToast();
  t.textContent = msg;
  t.className = 'visible' + (isError ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('visible'), 3000);
}

function createToast() {
  const t = document.createElement('div');
  t.id = 'toast';
  document.body.appendChild(t);
  return t;
}

// =========================================================
//  ADD EXPENSE
// =========================================================

async function addExpense() {
  const date   = document.getElementById('exp-date').value;
  const cat    = document.getElementById('exp-cat').value;
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const note   = document.getElementById('exp-note').value.trim();

  if (!date || !cat || isNaN(amount) || amount <= 0) {
    showToast('Please fill in date, category and amount.', true); return;
  }

  const mk = monthKey(currentYear, currentMonth);
  const row = { month_key: mk, date, cat, amount: Math.round(amount * 100) / 100, note, added_by: currentUser };

  const btn = document.querySelector('.btn-add');
  if (btn) btn.disabled = true;

  try {
    const { data, error } = await supabase.from('expenses').insert([row]).select();
    if (error) throw error;
    expensesCache.unshift(data[0]);
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-note').value = '';
    showToast('Expense added!');
    renderExpenses();
    if (currentPage === 'dashboard') renderDashboard();
    if (currentPage === 'budget')    renderBudget();
  } catch (e) {
    showToast('Could not save: ' + e.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// =========================================================
//  DELETE EXPENSE
// =========================================================

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  try {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
    expensesCache = expensesCache.filter(e => e.id !== id);
    showToast('Deleted.');
    renderExpenses();
    if (currentPage === 'dashboard') renderDashboard();
    if (currentPage === 'budget')    renderBudget();
  } catch (e) {
    showToast('Could not delete: ' + e.message, true);
  }
}

// =========================================================
//  ADD GLOVO ENTRY
// =========================================================

async function addGlovo() {
  const date   = document.getElementById('g-date').value;
  const lunch  = parseFloat(document.getElementById('g-lunch').value) || 0;
  const topup  = parseFloat(document.getElementById('g-topup').value) || 0;
  const pantry = document.getElementById('g-pantry').value.trim();

  if (!date) { showToast('Please select a date.', true); return; }

  const mk = monthKey(currentYear, currentMonth);
  const row = { month_key: mk, date, lunch_cost: lunch, personal_topup: topup, pantry_items: pantry, added_by: currentUser };

  try {
    // Upsert by month_key + date
    const existing = glovoCache.find(g => g.date === date);
    let saved;
    if (existing) {
      const { data, error } = await supabase.from('glovo_entries').update(row).eq('id', existing.id).select();
      if (error) throw error;
      saved = data[0];
      glovoCache = glovoCache.map(g => g.id === existing.id ? saved : g);
    } else {
      const { data, error } = await supabase.from('glovo_entries').insert([row]).select();
      if (error) throw error;
      saved = data[0];
      glovoCache.push(saved);
    }
    document.getElementById('g-lunch').value = '';
    document.getElementById('g-topup').value = '0';
    document.getElementById('g-pantry').value = '';
    showToast('Glovo entry saved!');
    renderGlovo();
  } catch (e) {
    showToast('Could not save: ' + e.message, true);
  }
}

// =========================================================
//  RENDER: DASHBOARD
// =========================================================

function renderDashboard() {
  const expenses = expensesCache;
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const remaining  = MONTHLY_SALARY - totalSpent;
  const pct        = Math.round(totalSpent / MONTHLY_SALARY * 100);
  const totalPlan  = DEFAULT_BUDGET.reduce((s, b) => s + b.planned, 0);

  // Summary strip
  document.getElementById('dash-summary-strip').innerHTML = `
    <div class="ss-item"><div class="ss-label">Monthly salary</div><div class="ss-value">€${MONTHLY_SALARY.toLocaleString()}</div><div class="ss-note">Expected this month</div></div>
    <div class="ss-item"><div class="ss-label">Spent so far</div><div class="ss-value" style="color:${pct>80?'#f5c2b8':'#c8efd6'}">€${totalSpent.toFixed(0)}</div><div class="ss-note">${pct}% of salary</div></div>
    <div class="ss-item"><div class="ss-label">Remaining</div><div class="ss-value">€${remaining.toFixed(0)}</div><div class="ss-note">Planned expenses: €${totalPlan.toLocaleString()}</div></div>
    <div class="ss-item"><div class="ss-label">Current cash</div><div class="ss-value">€850</div><div class="ss-note">Reserve for rent first</div></div>
  `;

  // Category progress
  let progHtml = '';
  DEFAULT_BUDGET.forEach(b => {
    const spent = expenses.filter(e => e.cat === b.cat).reduce((s, e) => s + Number(e.amount), 0);
    const pctCat = Math.min(120, Math.round(spent / b.planned * 100));
    const cls = pctCat >= 100 ? 'over' : pctCat >= 75 ? 'warn' : 'safe';
    progHtml += `<div class="prog-item">
      <div class="prog-lbl"><span class="prog-lbl-name">${b.label}</span><span class="prog-lbl-val">€${spent.toFixed(0)} / €${b.planned}</span></div>
      <div class="prog-track"><div class="prog-fill ${cls}" style="width:${Math.min(100,pctCat)}%"></div></div>
    </div>`;
  });
  document.getElementById('cat-progress').innerHTML = progHtml;

  // Recent transactions
  const recent = [...expenses].slice(0, 8);
  if (!recent.length) {
    document.getElementById('recent-txns').innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No expenses logged yet.</div></div>';
  } else {
    document.getElementById('recent-txns').innerHTML = recent.map(e => `
      <div class="txn-item">
        <div class="txn-left">
          <span class="tag tag-${e.cat}">${CAT_LABELS[e.cat]}</span>
          <div><div class="txn-info">${e.note || formatDate(e.date)}</div><div class="txn-by">by ${e.added_by} · ${formatDate(e.date)}</div></div>
        </div>
        <span class="txn-amount">€${Number(e.amount).toFixed(2)}</span>
      </div>`).join('');
  }

  // Status grid
  const catMap = {};
  expenses.forEach(e => { catMap[e.cat] = (catMap[e.cat] || 0) + Number(e.amount); });
  document.getElementById('status-grid').innerHTML = DEFAULT_BUDGET.map(b => {
    const s = catMap[b.cat] || 0;
    const p = Math.round(s / b.planned * 100);
    const cls  = p >= 100 ? 'danger' : p >= 75 ? 'warn' : 'good';
    const bcls = p >= 100 ? 'badge-over' : p >= 75 ? 'badge-warn' : 'badge-ok';
    const lbl  = p >= 100 ? 'Over!' : p >= 75 ? 'Near limit' : 'On track';
    return `<div class="metric ${cls}">
      <div class="ml">${b.label}</div>
      <div class="mv">€${s.toFixed(0)}</div>
      <div style="margin-top:5px"><span class="badge ${bcls}">${lbl}</span></div>
    </div>`;
  }).join('');

  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// =========================================================
//  RENDER: EXPENSES
// =========================================================

function renderExpenses() {
  const filterCat = document.getElementById('filter-cat').value;
  let arr = filterCat ? expensesCache.filter(e => e.cat === filterCat) : [...expensesCache];
  arr.sort((a, b) => b.date.localeCompare(a.date));

  if (!arr.length) {
    document.getElementById('expenses-table').innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No expenses for this period.</div></div>';
    return;
  }

  document.getElementById('expenses-table').innerHTML = `
    <div class="table-wrap">
    <table class="data-table">
      <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>By</th><th style="text-align:right">Amount</th><th></th></tr></thead>
      <tbody>
        ${arr.map(e => `<tr>
          <td>${formatDate(e.date)}</td>
          <td><span class="tag tag-${e.cat}">${CAT_LABELS[e.cat]}</span></td>
          <td style="color:var(--text2)">${e.note || '—'}</td>
          <td style="color:var(--text3);font-size:11px">${e.added_by}</td>
          <td style="text-align:right;font-weight:600;color:var(--red)">€${Number(e.amount).toFixed(2)}</td>
          <td><button class="btn-del" onclick="deleteExpense(${e.id})">✕</button></td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="4"><strong>Total</strong></td><td style="text-align:right;color:var(--red)"><strong>€${arr.reduce((s,e)=>s+Number(e.amount),0).toFixed(2)}</strong></td><td></td></tr>
      </tfoot>
    </table>
    </div>`;
}

// =========================================================
//  RENDER: BUDGET
// =========================================================

function renderBudget() {
  let totalPlan = 0, totalSpent = 0;
  const rows = DEFAULT_BUDGET.map(b => {
    const spent = expensesCache.filter(e => e.cat === b.cat).reduce((s, e) => s + Number(e.amount), 0);
    const rem   = b.planned - spent;
    const saving = b.old - b.planned;
    const pct   = Math.round(spent / b.planned * 100);
    const bcls  = pct >= 100 ? 'badge-over' : pct >= 75 ? 'badge-warn' : 'badge-ok';
    const lbl   = pct >= 100 ? 'Over!' : pct >= 75 ? 'Near limit' : 'On track';
    totalPlan  += b.planned;
    totalSpent += spent;
    return `<tr>
      <td><span class="tag tag-${b.cat}">${b.label}</span></td>
      <td>€${b.planned}</td>
      <td style="font-weight:600;color:${pct>=100?'var(--red)':pct>=75?'var(--amber)':'var(--text)'}">€${spent.toFixed(0)}</td>
      <td style="color:${rem<0?'var(--red)':'var(--green)'}">€${rem.toFixed(0)}</td>
      <td style="color:var(--text3)">€${b.old}</td>
      <td style="color:var(--green);font-weight:600">€${saving}</td>
      <td><span class="badge ${bcls}">${lbl}</span></td>
    </tr>`;
  }).join('');

  document.getElementById('budget-tbody').innerHTML = rows;
  document.getElementById('bft-plan').textContent    = `€${totalPlan}`;
  document.getElementById('bft-spent').textContent   = `€${totalSpent.toFixed(0)}`;
  document.getElementById('bft-rem').textContent     = `€${(totalPlan - totalSpent).toFixed(0)}`;
  document.getElementById('bft-saving').textContent  = `€${3176 - totalPlan} vs old avg`;
}

// =========================================================
//  RENDER: FOOD
// =========================================================

function renderFood() {
  document.getElementById('meal-rows').innerHTML = MEALS.map(m => `
    <div class="meal-row">
      <div class="meal-day">${m.day}</div>
      <div>${m.b}</div>
      <div>${m.l}</div>
      <div>${m.d}</div>
      <div class="meal-cost">${m.cost}</div>
    </div>`).join('');
}

// =========================================================
//  RENDER: GLOVO
// =========================================================

function renderGlovo() {
  const workdays = getWorkdaysForMonth(currentYear, currentMonth);
  const logged   = glovoCache;
  document.getElementById('g-days-count').textContent = logged.length;

  const header = `<div class="glovo-row glovo-header">
    <div>Date</div><div>Lunch cost</div><div>Top-up</div><div>Pantry items</div><div>Status</div>
  </div>`;

  const rows = workdays.map(wd => {
    const entry = logged.find(g => g.date === wd);
    if (!entry) {
      return `<div class="glovo-row unlogged">
        <div>${formatDate(wd)}</div><div>—</div><div>—</div><div style="color:var(--text3)">Not logged</div><div></div>
      </div>`;
    }
    const ok    = Number(entry.lunch_cost) <= 10 && Number(entry.personal_topup) === 0;
    const bcls  = ok ? 'badge-ok' : 'badge-warn';
    const blbl  = ok ? '✓ Good' : '⚠ Check';
    return `<div class="glovo-row">
      <div style="font-weight:500">${formatDate(wd)}</div>
      <div style="color:${Number(entry.lunch_cost)>10?'var(--red)':'var(--text)'}">€${Number(entry.lunch_cost).toFixed(2)}</div>
      <div style="color:${Number(entry.personal_topup)>0?'var(--red)':'var(--green)'}">€${Number(entry.personal_topup).toFixed(2)}</div>
      <div style="color:var(--text2);font-size:12px">${entry.pantry_items || '—'} <span style="font-size:10px;color:var(--text3)">by ${entry.added_by}</span></div>
      <div><span class="badge ${bcls}" style="font-size:10px">${blbl}</span></div>
    </div>`;
  }).join('');

  document.getElementById('glovo-list').innerHTML = header + rows;
}

// =========================================================
//  RENDER: HISTORY
// =========================================================

async function renderHistory() {
  showLoading(true);
  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;

    if (!data || !data.length) {
      document.getElementById('history-content').innerHTML = '<div class="empty"><div class="empty-icon">◷</div><div class="empty-text">No historical data yet.</div></div>';
      showLoading(false);
      return;
    }

    // Group by month_key
    const byMonth = {};
    data.forEach(e => {
      if (!byMonth[e.month_key]) byMonth[e.month_key] = [];
      byMonth[e.month_key].push(e);
    });

    const sortedKeys = Object.keys(byMonth).sort().reverse();
    let html = '';
    sortedKeys.forEach(mk => {
      const [y, m] = mk.split('-').map(Number);
      const label  = monthLabel(y, m);
      const items  = byMonth[mk];
      const total  = items.reduce((s, e) => s + Number(e.amount), 0);
      const isCurrentView = (y === currentYear && m === currentMonth);

      // Category breakdown
      const catTotals = {};
      DEFAULT_BUDGET.forEach(b => { catTotals[b.cat] = 0; });
      items.forEach(e => { if (catTotals[e.cat] !== undefined) catTotals[e.cat] += Number(e.amount); });

      const catRows = DEFAULT_BUDGET.map(b => {
        const s   = catTotals[b.cat] || 0;
        const pct = Math.round(s / b.planned * 100);
        const cls = pct >= 100 ? 'over' : pct >= 75 ? 'warn' : 'safe';
        return s > 0 ? `<div class="prog-item">
          <div class="prog-lbl"><span class="prog-lbl-name">${b.label}</span><span class="prog-lbl-val">€${s.toFixed(0)} / €${b.planned}</span></div>
          <div class="prog-track"><div class="prog-fill ${cls}" style="width:${Math.min(100,pct)}%"></div></div>
        </div>` : '';
      }).join('');

      html += `<div class="history-month">
        <div class="history-month-head" onclick="toggleHistoryMonth('${mk}')">
          <span class="hm-title">${label}${isCurrentView ? ' (current)' : ''}</span>
          <span class="hm-total">€${total.toFixed(0)} spent</span>
        </div>
        <div class="history-month-body ${isCurrentView ? 'open' : ''}" id="hist-${mk}">
          <div class="two-col">
            <div class="card">
              <div class="card-head">Category breakdown</div>
              ${catRows || '<div class="empty"><div class="empty-text">No data</div></div>'}
            </div>
            <div class="card">
              <div class="card-head">All transactions (${items.length})</div>
              <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>By</th><th style="text-align:right">€</th></tr></thead>
                <tbody>
                  ${items.sort((a,b)=>b.date.localeCompare(a.date)).map(e => `<tr>
                    <td>${formatDate(e.date)}</td>
                    <td><span class="tag tag-${e.cat}">${CAT_LABELS[e.cat]}</span></td>
                    <td style="color:var(--text2)">${e.note||'—'}</td>
                    <td style="font-size:11px;color:var(--text3)">${e.added_by}</td>
                    <td style="text-align:right;font-weight:600;color:var(--red)">€${Number(e.amount).toFixed(2)}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    });
    document.getElementById('history-content').innerHTML = html;
  } catch (e) {
    showToast('Failed to load history: ' + e.message, true);
  }
  showLoading(false);
}

function toggleHistoryMonth(mk) {
  const body = document.getElementById('hist-' + mk);
  if (body) body.classList.toggle('open');
}

// =========================================================
//  RENDER: RULES
// =========================================================

function renderRules() {
  document.getElementById('rules-list').innerHTML = RULES_DATA.map(r => `
    <div class="rule-item">
      <div class="rule-dot"></div>
      <div>
        <div class="rule-text"><strong>${r.area}:</strong> ${r.rule}</div>
        <div class="rule-sub">📅 ${r.deadline} &nbsp;·&nbsp; 👤 ${r.owner}</div>
      </div>
    </div>`).join('');

  document.getElementById('decisions-list').innerHTML = DECISIONS_DATA.map(d => `
    <div class="rule-item">
      <div class="rule-dot" style="background:var(--blue)"></div>
      <div>
        <div class="rule-text"><strong>${d.name}</strong></div>
        <div class="rule-sub" style="color:var(--text)">${d.rule}</div>
      </div>
    </div>`).join('');
}

// =========================================================
//  EXPORT CSV
// =========================================================

function exportCSV() {
  const arr = expensesCache;
  if (!arr.length) { showToast('No expenses to export.', true); return; }
  let csv = 'Date,Category,Amount,Note,AddedBy\n';
  [...arr].sort((a,b) => a.date.localeCompare(b.date)).forEach(e => {
    csv += `${e.date},${CAT_LABELS[e.cat]},${Number(e.amount).toFixed(2)},"${(e.note||'').replace(/"/g,'""')}",${e.added_by}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `budget_${monthKey(currentYear, currentMonth)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// =========================================================
//  REAL-TIME SUBSCRIPTION (live updates from other user)
// =========================================================

function subscribeRealtime() {
  if (!supabase) return;
  const mk = monthKey(currentYear, currentMonth);

  supabase.channel('expenses-changes')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'expenses',
      filter: `month_key=eq.${mk}`
    }, payload => {
      if (payload.eventType === 'INSERT') {
        // Avoid duplicate if we added it ourselves
        if (!expensesCache.find(e => e.id === payload.new.id)) {
          expensesCache.unshift(payload.new);
          showToast(`${payload.new.added_by} added €${Number(payload.new.amount).toFixed(2)} (${CAT_LABELS[payload.new.cat]})`);
          refreshCurrentPage();
        }
      }
      if (payload.eventType === 'DELETE') {
        expensesCache = expensesCache.filter(e => e.id !== payload.old.id);
        refreshCurrentPage();
      }
    })
    .subscribe();

  supabase.channel('glovo-changes')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'glovo_entries',
      filter: `month_key=eq.${mk}`
    }, payload => {
      if (payload.eventType === 'INSERT' && !glovoCache.find(g => g.id === payload.new.id)) {
        glovoCache.push(payload.new);
        if (currentPage === 'glovo') renderGlovo();
      }
      if (payload.eventType === 'UPDATE') {
        glovoCache = glovoCache.map(g => g.id === payload.new.id ? payload.new : g);
        if (currentPage === 'glovo') renderGlovo();
      }
    })
    .subscribe();
}

// Start realtime after boot
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(subscribeRealtime, 1000);
});
