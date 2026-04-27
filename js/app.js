// =========================================================
//  MAIN APP — Supabase-backed family budget tracker
// =========================================================

let sb = null;
let currentUser  = null;
let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let expensesCache = [];
let glovoCache    = [];
let currentPage   = 'dashboard';
let realtimeChannel = null;

// =========================================================
//  BOOT — runs after ALL scripts (including unpkg) are loaded
// =========================================================

window.addEventListener('load', initApp);

function initApp() {
  // Validate config values
  if (!window.SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    showBanner('SUPABASE_URL is not set in js/config.js'); return;
  }
  if (!window.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    showBanner('SUPABASE_ANON_KEY is not set in js/config.js'); return;
  }

  // The unpkg UMD build registers as window.supabase = { createClient, ... }
  try {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('window.supabase.createClient not found — CDN may have failed to load');
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    showBanner('Supabase init failed: ' + e.message); return;
  }

  // Pre-fill today's date in forms
  var today = new Date().toISOString().split('T')[0];
  ['exp-date', 'g-date'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = today;
  });

  // Resume session if already logged in
  var saved = sessionStorage.getItem('fb_user');
  if (saved && APP_USERS[saved]) {
    currentUser = saved;
    showApp();
  }
}

function showBanner(msg) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#b83220;color:#fff;padding:14px 20px;font-size:14px;text-align:center;z-index:9999;font-family:monospace;';
  el.textContent = '⚠ Config error: ' + msg;
  document.body.appendChild(el);
  console.error('[FamilyBudget]', msg);
}

// =========================================================
//  AUTH
// =========================================================

var selectedUser = null;

function selectUser(name) {
  selectedUser = name;
  document.querySelectorAll('.user-btn').forEach(function(b) { b.classList.remove('selected'); });
  var btn = document.getElementById('btn-' + name);
  if (btn) btn.classList.add('selected');
  var passEl = document.getElementById('auth-pass');
  if (passEl) { passEl.value = ''; passEl.focus(); }
  var errEl = document.getElementById('auth-error');
  if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
}

function login() {
  var errEl  = document.getElementById('auth-error');
  var passEl = document.getElementById('auth-pass');

  function showErr(msg) {
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  }

  if (!selectedUser) { showErr('Please select Peyman or Wife first.'); return; }
  var pass = passEl ? passEl.value : '';
  if (!pass) { showErr('Please enter the password.'); return; }

  if (APP_USERS[selectedUser] === pass) {
    currentUser = selectedUser;
    sessionStorage.setItem('fb_user', currentUser);
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    showApp();
  } else {
    showErr('Wrong password. Try again.');
    if (passEl) { passEl.value = ''; passEl.focus(); }
  }
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  var name = currentUser.charAt(0).toUpperCase() + currentUser.slice(1);
  var avatar = document.getElementById('sidebar-avatar');
  var uname  = document.getElementById('sidebar-username');
  var mobile = document.getElementById('mobile-user-label');
  if (avatar) avatar.textContent = name[0];
  if (uname)  uname.textContent  = name;
  if (mobile) mobile.textContent = name;

  updateMonthDisplay();
  renderFood();
  renderRules();
  loadCurrentMonth().then(function() { subscribeRealtime(); });
}

function logout() {
  if (realtimeChannel && sb) { try { sb.removeChannel(realtimeChannel); } catch(e){} realtimeChannel = null; }
  sessionStorage.removeItem('fb_user');
  location.reload();
}

// =========================================================
//  MONTH NAVIGATION
// =========================================================

function updateMonthDisplay() {
  var label = monthLabel(currentYear, currentMonth);
  ['month-display', 'sidebar-month-label', 'dash-title'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = label;
  });
  var now = new Date();
  var btnNext = document.getElementById('btn-next-month');
  if (btnNext) {
    btnNext.disabled = (currentYear > now.getFullYear()) ||
      (currentYear === now.getFullYear() && currentMonth >= now.getMonth() + 1);
  }
}

function changeMonth(dir) {
  currentMonth += dir;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  if (currentMonth < 1)  { currentMonth = 12; currentYear--; }
  updateMonthDisplay();
  if (realtimeChannel && sb) { try { sb.removeChannel(realtimeChannel); } catch(e){} realtimeChannel = null; }
  loadCurrentMonth().then(function() { subscribeRealtime(); });
}

async function loadCurrentMonth() {
  showLoading(true);
  var mk = monthKey(currentYear, currentMonth);
  try {
    var results = await Promise.all([
      sb.from('expenses').select('*').eq('month_key', mk).order('date', { ascending: false }),
      sb.from('glovo_entries').select('*').eq('month_key', mk).order('date', { ascending: true }),
    ]);
    var expRes   = results[0];
    var glovoRes = results[1];
    if (expRes.error)   throw new Error('expenses: ' + expRes.error.message);
    if (glovoRes.error) throw new Error('glovo: '    + glovoRes.error.message);
    expensesCache = expRes.data   || [];
    glovoCache    = glovoRes.data || [];
  } catch (e) {
    showToast('Load failed: ' + e.message, true);
    expensesCache = [];
    glovoCache    = [];
  }
  showLoading(false);
  refreshCurrentPage();
}

function refreshCurrentPage() {
  var map = {
    dashboard: renderDashboard,
    expenses:  renderExpenses,
    budget:    renderBudget,
    glovo:     renderGlovo,
    history:   renderHistory,
  };
  if (map[currentPage]) map[currentPage]();
}

// =========================================================
//  NAVIGATION
// =========================================================

function showPage(name) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  var pageEl = document.getElementById('page-' + name);
  var navEl  = document.querySelector('[data-page="' + name + '"]');
  if (pageEl) pageEl.classList.add('active');
  if (navEl)  navEl.classList.add('active');
  currentPage = name;
  var sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
  refreshCurrentPage();
}

function toggleMobileMenu() {
  var sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

// =========================================================
//  UI HELPERS
// =========================================================

function showLoading(on) {
  var el = document.getElementById('loading-overlay');
  if (!el) return;
  if (on) el.classList.remove('hidden'); else el.classList.add('hidden');
}

var toastTimer = null;
function showToast(msg, isError) {
  var t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'visible' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('visible'); }, 3500);
}

// =========================================================
//  EXPENSES
// =========================================================

async function addExpense() {
  var dateEl   = document.getElementById('exp-date');
  var catEl    = document.getElementById('exp-cat');
  var amountEl = document.getElementById('exp-amount');
  var noteEl   = document.getElementById('exp-note');
  var btnEl    = document.getElementById('btn-add-expense');

  var date   = dateEl   ? dateEl.value   : '';
  var cat    = catEl    ? catEl.value    : '';
  var amount = amountEl ? parseFloat(amountEl.value) : NaN;
  var note   = noteEl   ? noteEl.value.trim() : '';

  if (!date)                     { showToast('Please select a date.',        true); return; }
  if (!cat)                      { showToast('Please select a category.',    true); return; }
  if (isNaN(amount)||amount<=0)  { showToast('Please enter a valid amount.', true); return; }

  var row = {
    month_key: monthKey(currentYear, currentMonth),
    date: date, cat: cat,
    amount: Math.round(amount * 100) / 100,
    note: note, added_by: currentUser
  };

  if (btnEl) btnEl.disabled = true;
  try {
    var res = await sb.from('expenses').insert([row]).select();
    if (res.error) throw res.error;
    expensesCache.unshift(res.data[0]);
    if (amountEl) amountEl.value = '';
    if (noteEl)   noteEl.value   = '';
    showToast('Expense added!');
    renderExpenses(); renderDashboard(); renderBudget();
  } catch (e) {
    showToast('Save failed: ' + e.message, true);
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  try {
    var res = await sb.from('expenses').delete().eq('id', id);
    if (res.error) throw res.error;
    expensesCache = expensesCache.filter(function(e) { return e.id !== id; });
    showToast('Deleted.');
    renderExpenses(); renderDashboard(); renderBudget();
  } catch (e) {
    showToast('Delete failed: ' + e.message, true);
  }
}

// =========================================================
//  GLOVO
// =========================================================

async function addGlovo() {
  var date   = document.getElementById('g-date').value;
  var lunch  = parseFloat(document.getElementById('g-lunch').value)  || 0;
  var topup  = parseFloat(document.getElementById('g-topup').value)  || 0;
  var pantry = document.getElementById('g-pantry').value.trim();

  if (!date) { showToast('Please select a date.', true); return; }

  var mk  = monthKey(currentYear, currentMonth);
  var row = { month_key: mk, date: date, lunch_cost: lunch, personal_topup: topup, pantry_items: pantry, added_by: currentUser };

  try {
    var existing = glovoCache.find(function(g) { return g.date === date; });
    var saved;
    if (existing) {
      var upd = await sb.from('glovo_entries').update(row).eq('id', existing.id).select();
      if (upd.error) throw upd.error;
      saved = upd.data[0];
      glovoCache = glovoCache.map(function(g) { return g.id === existing.id ? saved : g; });
    } else {
      var ins = await sb.from('glovo_entries').insert([row]).select();
      if (ins.error) throw ins.error;
      saved = ins.data[0];
      glovoCache.push(saved);
    }
    document.getElementById('g-lunch').value  = '';
    document.getElementById('g-topup').value  = '0';
    document.getElementById('g-pantry').value = '';
    showToast('Glovo entry saved!');
    renderGlovo();
  } catch (e) {
    showToast('Save failed: ' + e.message, true);
  }
}

// =========================================================
//  RENDER: DASHBOARD
// =========================================================

function renderDashboard() {
  var expenses   = expensesCache;
  var totalSpent = expenses.reduce(function(s,e){ return s+Number(e.amount); }, 0);
  var remaining  = MONTHLY_SALARY - totalSpent;
  var pct        = Math.round(totalSpent / MONTHLY_SALARY * 100);
  var totalPlan  = DEFAULT_BUDGET.reduce(function(s,b){ return s+b.planned; }, 0);

  var strip = document.getElementById('dash-summary-strip');
  if (strip) strip.innerHTML =
    '<div class="ss-item"><div class="ss-label">Monthly salary</div><div class="ss-value">€' + MONTHLY_SALARY.toLocaleString() + '</div><div class="ss-note">Expected this month</div></div>' +
    '<div class="ss-item"><div class="ss-label">Spent so far</div><div class="ss-value" style="color:' + (pct>80?'#f5c2b8':'#c8efd6') + '">€' + totalSpent.toFixed(0) + '</div><div class="ss-note">' + pct + '% of salary</div></div>' +
    '<div class="ss-item"><div class="ss-label">Remaining</div><div class="ss-value">€' + remaining.toFixed(0) + '</div><div class="ss-note">Plan: €' + totalPlan.toLocaleString() + '</div></div>' +
    '<div class="ss-item"><div class="ss-label">Current cash</div><div class="ss-value">€850</div><div class="ss-note">Reserve for rent first</div></div>';

  var catProg = document.getElementById('cat-progress');
  if (catProg) catProg.innerHTML = DEFAULT_BUDGET.map(function(b) {
    var spent = expenses.filter(function(e){ return e.cat===b.cat; }).reduce(function(s,e){ return s+Number(e.amount); },0);
    var p = Math.round(spent/b.planned*100);
    var cls = p>=100?'over':p>=75?'warn':'safe';
    return '<div class="prog-item"><div class="prog-lbl"><span class="prog-lbl-name">'+b.label+'</span><span class="prog-lbl-val">€'+spent.toFixed(0)+' / €'+b.planned+'</span></div><div class="prog-track"><div class="prog-fill '+cls+'" style="width:'+Math.min(100,p)+'%"></div></div></div>';
  }).join('');

  var recentEl = document.getElementById('recent-txns');
  if (recentEl) {
    var list = expenses.slice(0,8);
    recentEl.innerHTML = list.length ? list.map(function(e){
      return '<div class="txn-item"><div class="txn-left"><span class="tag tag-'+e.cat+'">'+CAT_LABELS[e.cat]+'</span><div><div class="txn-info">'+(e.note||formatDate(e.date))+'</div><div class="txn-by">by '+e.added_by+' · '+formatDate(e.date)+'</div></div></div><span class="txn-amount">€'+Number(e.amount).toFixed(2)+'</span></div>';
    }).join('') : '<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No expenses logged yet.</div></div>';
  }

  var catMap = {};
  expenses.forEach(function(e){ catMap[e.cat]=(catMap[e.cat]||0)+Number(e.amount); });
  var grid = document.getElementById('status-grid');
  if (grid) grid.innerHTML = DEFAULT_BUDGET.map(function(b){
    var s=catMap[b.cat]||0, p=Math.round(s/b.planned*100);
    var cls=p>=100?'danger':p>=75?'warn':'good';
    var bcls=p>=100?'badge-over':p>=75?'badge-warn':'badge-ok';
    return '<div class="metric '+cls+'"><div class="ml">'+b.label+'</div><div class="mv">€'+s.toFixed(0)+'</div><div style="margin-top:5px"><span class="badge '+bcls+'">'+(p>=100?'Over!':p>=75?'Near limit':'On track')+'</span></div></div>';
  }).join('');

  var dateEl = document.getElementById('dash-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}

// =========================================================
//  RENDER: EXPENSES
// =========================================================

function renderExpenses() {
  var filterEl  = document.getElementById('filter-cat');
  var filterCat = filterEl ? filterEl.value : '';
  var arr = filterCat ? expensesCache.filter(function(e){ return e.cat===filterCat; }) : expensesCache.slice();
  arr.sort(function(a,b){ return b.date.localeCompare(a.date); });
  var cont = document.getElementById('expenses-table');
  if (!cont) return;
  if (!arr.length) {
    cont.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No expenses for this period.</div></div>';
    return;
  }
  var total = arr.reduce(function(s,e){ return s+Number(e.amount); }, 0);
  cont.innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Category</th><th>Note</th><th>By</th><th style="text-align:right">Amount</th><th></th></tr></thead><tbody>' +
    arr.map(function(e){
      return '<tr><td>'+formatDate(e.date)+'</td><td><span class="tag tag-'+e.cat+'">'+CAT_LABELS[e.cat]+'</span></td><td style="color:var(--text2)">'+(e.note||'—')+'</td><td style="color:var(--text3);font-size:11px">'+e.added_by+'</td><td style="text-align:right;font-weight:600;color:var(--red)">€'+Number(e.amount).toFixed(2)+'</td><td><button class="btn-del" onclick="deleteExpense('+e.id+')">✕</button></td></tr>';
    }).join('') +
    '</tbody><tfoot><tr><td colspan="4"><strong>Total</strong></td><td style="text-align:right;color:var(--red)"><strong>€'+total.toFixed(2)+'</strong></td><td></td></tr></tfoot></table></div>';
}

// =========================================================
//  RENDER: BUDGET
// =========================================================

function renderBudget() {
  var totalPlan=0, totalSpent=0;
  var tbody = document.getElementById('budget-tbody');
  if (!tbody) return;
  tbody.innerHTML = DEFAULT_BUDGET.map(function(b){
    var spent=expensesCache.filter(function(e){ return e.cat===b.cat; }).reduce(function(s,e){ return s+Number(e.amount); },0);
    var rem=b.planned-spent, saving=b.old-b.planned, pct=Math.round(spent/b.planned*100);
    var bcls=pct>=100?'badge-over':pct>=75?'badge-warn':'badge-ok';
    totalPlan+=b.planned; totalSpent+=spent;
    return '<tr><td><span class="tag tag-'+b.cat+'">'+b.label+'</span></td><td>€'+b.planned+'</td><td style="font-weight:600;color:'+(pct>=100?'var(--red)':pct>=75?'var(--amber)':'var(--text)')+'">€'+spent.toFixed(0)+'</td><td style="color:'+(rem<0?'var(--red)':'var(--green)')+'">€'+rem.toFixed(0)+'</td><td style="color:var(--text3)">€'+b.old+'</td><td style="color:var(--green);font-weight:600">€'+saving+'</td><td><span class="badge '+bcls+'">'+(pct>=100?'Over!':pct>=75?'Near limit':'On track')+'</span></td></tr>';
  }).join('');
  var fp=document.getElementById('bft-plan'),fs=document.getElementById('bft-spent'),fr=document.getElementById('bft-rem'),fg=document.getElementById('bft-saving');
  if(fp)fp.textContent='€'+totalPlan; if(fs)fs.textContent='€'+totalSpent.toFixed(0); if(fr)fr.textContent='€'+(totalPlan-totalSpent).toFixed(0); if(fg)fg.textContent='€'+(3176-totalPlan)+' saved vs old avg';
}

// =========================================================
//  RENDER: FOOD
// =========================================================

function renderFood() {
  var el = document.getElementById('meal-rows');
  if (!el) return;
  el.innerHTML = MEALS.map(function(m){
    return '<div class="meal-row"><div class="meal-day">'+m.day+'</div><div>'+m.b+'</div><div>'+m.l+'</div><div>'+m.d+'</div><div class="meal-cost">'+m.cost+'</div></div>';
  }).join('');
}

// =========================================================
//  RENDER: GLOVO
// =========================================================

function renderGlovo() {
  var container = document.getElementById('glovo-list');
  if (!container) return;
  var countEl = document.getElementById('g-days-count');
  if (countEl) countEl.textContent = glovoCache.length;
  var workdays = getWorkdaysForMonth(currentYear, currentMonth);
  var header = '<div class="glovo-row glovo-header"><div>Date</div><div>Lunch cost</div><div>Top-up</div><div>Pantry items</div><div>Status</div></div>';
  container.innerHTML = header + workdays.map(function(wd){
    var e = glovoCache.find(function(g){ return g.date===wd; });
    if (!e) return '<div class="glovo-row unlogged"><div>'+formatDate(wd)+'</div><div>—</div><div>—</div><div style="color:var(--text3)">Not logged</div><div></div></div>';
    var ok = Number(e.lunch_cost)<=10 && Number(e.personal_topup)===0;
    return '<div class="glovo-row"><div style="font-weight:500">'+formatDate(wd)+'</div><div style="color:'+(Number(e.lunch_cost)>10?'var(--red)':'var(--text)')+'">€'+Number(e.lunch_cost).toFixed(2)+'</div><div style="color:'+(Number(e.personal_topup)>0?'var(--red)':'var(--green)')+'">€'+Number(e.personal_topup).toFixed(2)+'</div><div style="font-size:12px;color:var(--text2)">'+(e.pantry_items||'—')+' <span style="font-size:10px;color:var(--text3)">by '+e.added_by+'</span></div><div><span class="badge '+(ok?'badge-ok':'badge-warn')+'" style="font-size:10px">'+(ok?'✓ Good':'⚠ Check')+'</span></div></div>';
  }).join('');
}

// =========================================================
//  RENDER: HISTORY
// =========================================================

async function renderHistory() {
  var cont = document.getElementById('history-content');
  if (!cont) return;
  cont.innerHTML = '<div class="empty"><div class="spinner" style="margin:0 auto"></div><div class="empty-text" style="margin-top:12px">Loading…</div></div>';
  try {
    var res = await sb.from('expenses').select('*').order('date', { ascending: false });
    if (res.error) throw res.error;
    var data = res.data;
    if (!data || !data.length) {
      cont.innerHTML = '<div class="empty"><div class="empty-icon">◷</div><div class="empty-text">No historical data yet.</div></div>';
      return;
    }
    var byMonth = {};
    data.forEach(function(e){ if(!byMonth[e.month_key]) byMonth[e.month_key]=[]; byMonth[e.month_key].push(e); });
    cont.innerHTML = Object.keys(byMonth).sort().reverse().map(function(mk){
      var parts = mk.split('-'), y=parseInt(parts[0]), m=parseInt(parts[1]);
      var label = monthLabel(y, m);
      var items = byMonth[mk];
      var total = items.reduce(function(s,e){ return s+Number(e.amount); }, 0);
      var isCurrent = (y===currentYear && m===currentMonth);
      var catTotals = {};
      DEFAULT_BUDGET.forEach(function(b){ catTotals[b.cat]=0; });
      items.forEach(function(e){ if(catTotals[e.cat]!==undefined) catTotals[e.cat]+=Number(e.amount); });
      var catRows = DEFAULT_BUDGET.map(function(b){
        var s=catTotals[b.cat]||0; if(!s) return '';
        var pct=Math.round(s/b.planned*100), cls=pct>=100?'over':pct>=75?'warn':'safe';
        return '<div class="prog-item"><div class="prog-lbl"><span class="prog-lbl-name">'+b.label+'</span><span class="prog-lbl-val">€'+s.toFixed(0)+'/€'+b.planned+'</span></div><div class="prog-track"><div class="prog-fill '+cls+'" style="width:'+Math.min(100,pct)+'%"></div></div></div>';
      }).join('');
      var txRows = items.slice().sort(function(a,b){ return b.date.localeCompare(a.date); }).map(function(e){
        return '<tr><td>'+formatDate(e.date)+'</td><td><span class="tag tag-'+e.cat+'">'+CAT_LABELS[e.cat]+'</span></td><td style="color:var(--text2)">'+(e.note||'—')+'</td><td style="font-size:11px;color:var(--text3)">'+e.added_by+'</td><td style="text-align:right;font-weight:600;color:var(--red)">€'+Number(e.amount).toFixed(2)+'</td></tr>';
      }).join('');
      return '<div class="history-month"><div class="history-month-head" onclick="toggleHistoryMonth(\''+mk+'\')"><span class="hm-title">'+label+(isCurrent?' (current)':'')+'</span><span class="hm-total">€'+total.toFixed(0)+' spent ▾</span></div><div class="history-month-body'+(isCurrent?' open':'')+'" id="hist-'+mk+'"><div class="two-col"><div class="card"><div class="card-head">Category breakdown</div>'+(catRows||'<div class="empty"><div class="empty-text">No data</div></div>')+'</div><div class="card"><div class="card-head">Transactions ('+items.length+')</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Category</th><th>Note</th><th>By</th><th style="text-align:right">€</th></tr></thead><tbody>'+txRows+'</tbody></table></div></div></div></div></div>';
    }).join('');
  } catch(e) {
    cont.innerHTML = '<div class="empty"><div class="empty-icon">⚠</div><div class="empty-text">Failed to load: '+e.message+'</div></div>';
  }
}

function toggleHistoryMonth(mk) {
  var el = document.getElementById('hist-' + mk);
  if (el) el.classList.toggle('open');
}

// =========================================================
//  RENDER: RULES
// =========================================================

function renderRules() {
  var rl = document.getElementById('rules-list');
  var dl = document.getElementById('decisions-list');
  if (rl) rl.innerHTML = RULES_DATA.map(function(r){
    return '<div class="rule-item"><div class="rule-dot"></div><div><div class="rule-text"><strong>'+r.area+':</strong> '+r.rule+'</div><div class="rule-sub">📅 '+r.deadline+' · 👤 '+r.owner+'</div></div></div>';
  }).join('');
  if (dl) dl.innerHTML = DECISIONS_DATA.map(function(d){
    return '<div class="rule-item"><div class="rule-dot" style="background:var(--blue)"></div><div><div class="rule-text"><strong>'+d.name+'</strong></div><div class="rule-sub" style="color:var(--text)">'+d.rule+'</div></div></div>';
  }).join('');
}

// =========================================================
//  EXPORT CSV
// =========================================================

function exportCSV() {
  if (!expensesCache.length) { showToast('No expenses to export.', true); return; }
  var csv = 'Date,Category,Amount,Note,AddedBy\n';
  expensesCache.slice().sort(function(a,b){ return a.date.localeCompare(b.date); }).forEach(function(e){
    csv += e.date+','+CAT_LABELS[e.cat]+','+Number(e.amount).toFixed(2)+',"'+(e.note||'').replace(/"/g,'""')+'",'+e.added_by+'\n';
  });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'budget_' + monthKey(currentYear, currentMonth) + '.csv';
  a.click();
}

// =========================================================
//  REAL-TIME SYNC
// =========================================================

function subscribeRealtime() {
  if (!sb) return;
  var mk = monthKey(currentYear, currentMonth);
  realtimeChannel = sb.channel('budget-' + mk)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'expenses', filter: 'month_key=eq.' + mk }, function(payload) {
      if (!expensesCache.find(function(e){ return e.id===payload.new.id; })) {
        expensesCache.unshift(payload.new);
        showToast(payload.new.added_by + ' added €' + Number(payload.new.amount).toFixed(2) + ' — ' + CAT_LABELS[payload.new.cat]);
        refreshCurrentPage();
      }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'expenses' }, function(payload) {
      expensesCache = expensesCache.filter(function(e){ return e.id !== payload.old.id; });
      refreshCurrentPage();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'glovo_entries', filter: 'month_key=eq.' + mk }, function(payload) {
      if (payload.eventType === 'INSERT' && !glovoCache.find(function(g){ return g.id===payload.new.id; })) {
        glovoCache.push(payload.new);
      } else if (payload.eventType === 'UPDATE') {
        glovoCache = glovoCache.map(function(g){ return g.id===payload.new.id ? payload.new : g; });
      }
      if (currentPage === 'glovo') renderGlovo();
    })
    .subscribe();
}
