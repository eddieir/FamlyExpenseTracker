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
//  BOOT
// =========================================================

window.addEventListener('load', initApp);

function initApp() {
  if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    showConfigError('SUPABASE_URL is not set in js/config.js');
    return;
  }
  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    showConfigError('SUPABASE_ANON_KEY is not set in js/config.js');
    return;
  }
  try {
    const { createClient } = window.supabase;
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    showConfigError('Supabase init failed: ' + e.message);
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  ['exp-date', 'g-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });

  const saved = sessionStorage.getItem('fb_user');
  if (saved && APP_USERS[saved]) {
    currentUser = saved;
    showApp();
  }
}

function showConfigError(msg) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#b83220;color:white;padding:12px 20px;border-radius:10px;font-size:13px;max-width:90%;text-align:center;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.4)';
  el.textContent = '⚠ ' + msg;
  document.body.appendChild(el);
}

// =========================================================
//  AUTH
// =========================================================

let selectedUser = null;

function selectUser(name) {
  selectedUser = name;
  document.querySelectorAll('.user-btn').forEach(b => b.classList.remove('selected'));
  const btn = document.getElementById('btn-' + name);
  if (btn) btn.classList.add('selected');
  const passEl = document.getElementById('auth-pass');
  if (passEl) { passEl.value = ''; passEl.focus(); }
  const errEl = document.getElementById('auth-error');
  if (errEl) errEl.style.display = 'none';
}

function login() {
  const errEl  = document.getElementById('auth-error');
  const passEl = document.getElementById('auth-pass');

  if (!selectedUser) {
    if (errEl) { errEl.textContent = 'Please select Peyman or Wife first.'; errEl.style.display = 'block'; }
    return;
  }
  const pass = passEl ? passEl.value : '';
  if (!pass) {
    if (errEl) { errEl.textContent = 'Please enter the password.'; errEl.style.display = 'block'; }
    return;
  }
  if (APP_USERS[selectedUser] === pass) {
    currentUser = selectedUser;
    sessionStorage.setItem('fb_user', currentUser);
    if (errEl) errEl.style.display = 'none';
    showApp();
  } else {
    if (errEl) { errEl.textContent = 'Wrong password. Try again.'; errEl.style.display = 'block'; }
    if (passEl) { passEl.value = ''; passEl.focus(); }
  }
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  const name = currentUser.charAt(0).toUpperCase() + currentUser.slice(1);
  ['sidebar-avatar'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = name[0]; });
  ['sidebar-username'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = name; });
  ['mobile-user-label'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = name; });

  updateMonthDisplay();
  renderFood();
  renderRules();
  loadCurrentMonth().then(() => subscribeRealtime());
}

function logout() {
  if (realtimeChannel && sb) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  sessionStorage.removeItem('fb_user');
  location.reload();
}

// =========================================================
//  MONTH NAVIGATION
// =========================================================

function updateMonthDisplay() {
  const label = monthLabel(currentYear, currentMonth);
  ['month-display','sidebar-month-label','dash-title'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
  const now = new Date();
  const btnNext = document.getElementById('btn-next-month');
  if (btnNext) {
    btnNext.disabled = currentYear > now.getFullYear() ||
      (currentYear === now.getFullYear() && currentMonth >= now.getMonth() + 1);
  }
}

function changeMonth(dir) {
  currentMonth += dir;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  if (currentMonth < 1)  { currentMonth = 12; currentYear--; }
  updateMonthDisplay();
  if (realtimeChannel && sb) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  loadCurrentMonth().then(() => subscribeRealtime());
}

async function loadCurrentMonth() {
  showLoading(true);
  const mk = monthKey(currentYear, currentMonth);
  try {
    const [expRes, glovoRes] = await Promise.all([
      sb.from('expenses').select('*').eq('month_key', mk).order('date', { ascending: false }),
      sb.from('glovo_entries').select('*').eq('month_key', mk).order('date', { ascending: true }),
    ]);
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
  const map = { dashboard: renderDashboard, expenses: renderExpenses, budget: renderBudget, glovo: renderGlovo, history: renderHistory };
  if (map[currentPage]) map[currentPage]();
}

// =========================================================
//  NAVIGATION
// =========================================================

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + name);
  const navEl  = document.querySelector('[data-page="' + name + '"]');
  if (pageEl) pageEl.classList.add('active');
  if (navEl)  navEl.classList.add('active');
  currentPage = name;
  document.getElementById('sidebar').classList.remove('open');
  refreshCurrentPage();
}

function toggleMobileMenu() {
  document.getElementById('sidebar').classList.toggle('open');
}

// =========================================================
//  UI HELPERS
// =========================================================

function showLoading(on) {
  const el = document.getElementById('loading-overlay');
  if (!el) return;
  if (on) el.classList.remove('hidden'); else el.classList.add('hidden');
}

let toastTimer = null;
function showToast(msg, isError) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'visible' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 3500);
}

// =========================================================
//  ADD / DELETE EXPENSE
// =========================================================

async function addExpense() {
  const date   = document.getElementById('exp-date').value;
  const cat    = document.getElementById('exp-cat').value;
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const note   = document.getElementById('exp-note').value.trim();

  if (!date)                    { showToast('Select a date.',         true); return; }
  if (!cat)                     { showToast('Select a category.',     true); return; }
  if (isNaN(amount)||amount<=0) { showToast('Enter a valid amount.',  true); return; }

  const row = { month_key: monthKey(currentYear, currentMonth), date, cat, amount: Math.round(amount*100)/100, note, added_by: currentUser };
  const btn = document.querySelector('[onclick="addExpense()"]');
  if (btn) btn.disabled = true;
  try {
    const { data, error } = await sb.from('expenses').insert([row]).select();
    if (error) throw error;
    expensesCache.unshift(data[0]);
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-note').value   = '';
    showToast('Expense added!');
    renderExpenses(); renderDashboard(); renderBudget();
  } catch (e) { showToast('Save failed: ' + e.message, true); }
  finally { if (btn) btn.disabled = false; }
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  try {
    const { error } = await sb.from('expenses').delete().eq('id', id);
    if (error) throw error;
    expensesCache = expensesCache.filter(e => e.id !== id);
    showToast('Deleted.');
    renderExpenses(); renderDashboard(); renderBudget();
  } catch (e) { showToast('Delete failed: ' + e.message, true); }
}

// =========================================================
//  ADD GLOVO ENTRY
// =========================================================

async function addGlovo() {
  const date   = document.getElementById('g-date').value;
  const lunch  = parseFloat(document.getElementById('g-lunch').value)  || 0;
  const topup  = parseFloat(document.getElementById('g-topup').value)  || 0;
  const pantry = document.getElementById('g-pantry').value.trim();
  if (!date) { showToast('Select a date.', true); return; }

  const mk  = monthKey(currentYear, currentMonth);
  const row = { month_key: mk, date, lunch_cost: lunch, personal_topup: topup, pantry_items: pantry, added_by: currentUser };
  try {
    const existing = glovoCache.find(g => g.date === date);
    let saved;
    if (existing) {
      const { data, error } = await sb.from('glovo_entries').update(row).eq('id', existing.id).select();
      if (error) throw error;
      saved = data[0];
      glovoCache = glovoCache.map(g => g.id === existing.id ? saved : g);
    } else {
      const { data, error } = await sb.from('glovo_entries').insert([row]).select();
      if (error) throw error;
      saved = data[0];
      glovoCache.push(saved);
    }
    document.getElementById('g-lunch').value  = '';
    document.getElementById('g-topup').value  = '0';
    document.getElementById('g-pantry').value = '';
    showToast('Glovo entry saved!');
    renderGlovo();
  } catch (e) { showToast('Save failed: ' + e.message, true); }
}

// =========================================================
//  RENDER: DASHBOARD
// =========================================================

function renderDashboard() {
  const expenses   = expensesCache;
  const totalSpent = expenses.reduce((s,e) => s+Number(e.amount), 0);
  const remaining  = MONTHLY_SALARY - totalSpent;
  const pct        = Math.round(totalSpent/MONTHLY_SALARY*100);
  const totalPlan  = DEFAULT_BUDGET.reduce((s,b) => s+b.planned, 0);

  const strip = document.getElementById('dash-summary-strip');
  if (strip) strip.innerHTML = `
    <div class="ss-item"><div class="ss-label">Monthly salary</div><div class="ss-value">€${MONTHLY_SALARY.toLocaleString()}</div><div class="ss-note">Expected this month</div></div>
    <div class="ss-item"><div class="ss-label">Spent so far</div><div class="ss-value" style="color:${pct>80?'#f5c2b8':'#c8efd6'}">€${totalSpent.toFixed(0)}</div><div class="ss-note">${pct}% of salary</div></div>
    <div class="ss-item"><div class="ss-label">Remaining</div><div class="ss-value">€${remaining.toFixed(0)}</div><div class="ss-note">Plan: €${totalPlan.toLocaleString()}</div></div>
    <div class="ss-item"><div class="ss-label">Current cash</div><div class="ss-value">€850</div><div class="ss-note">Reserve for rent first</div></div>`;

  const catProg = document.getElementById('cat-progress');
  if (catProg) catProg.innerHTML = DEFAULT_BUDGET.map(b => {
    const spent = expenses.filter(e=>e.cat===b.cat).reduce((s,e)=>s+Number(e.amount),0);
    const p     = Math.round(spent/b.planned*100);
    const cls   = p>=100?'over':p>=75?'warn':'safe';
    return `<div class="prog-item">
      <div class="prog-lbl"><span class="prog-lbl-name">${b.label}</span><span class="prog-lbl-val">€${spent.toFixed(0)} / €${b.planned}</span></div>
      <div class="prog-track"><div class="prog-fill ${cls}" style="width:${Math.min(100,p)}%"></div></div>
    </div>`;
  }).join('');

  const recent = document.getElementById('recent-txns');
  if (recent) {
    const list = [...expenses].slice(0,8);
    recent.innerHTML = list.length ? list.map(e=>`
      <div class="txn-item">
        <div class="txn-left">
          <span class="tag tag-${e.cat}">${CAT_LABELS[e.cat]}</span>
          <div><div class="txn-info">${e.note||formatDate(e.date)}</div><div class="txn-by">by ${e.added_by} · ${formatDate(e.date)}</div></div>
        </div>
        <span class="txn-amount">€${Number(e.amount).toFixed(2)}</span>
      </div>`).join('')
    : '<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No expenses logged yet.</div></div>';
  }

  const catMap = {};
  expenses.forEach(e=>{ catMap[e.cat]=(catMap[e.cat]||0)+Number(e.amount); });
  const grid = document.getElementById('status-grid');
  if (grid) grid.innerHTML = DEFAULT_BUDGET.map(b=>{
    const s=catMap[b.cat]||0, p=Math.round(s/b.planned*100);
    const cls=p>=100?'danger':p>=75?'warn':'good';
    const bcls=p>=100?'badge-over':p>=75?'badge-warn':'badge-ok';
    return `<div class="metric ${cls}"><div class="ml">${b.label}</div><div class="mv">€${s.toFixed(0)}</div><div style="margin-top:5px"><span class="badge ${bcls}">${p>=100?'Over!':p>=75?'Near limit':'On track'}</span></div></div>`;
  }).join('');

  const dateHint = document.getElementById('dash-date');
  if (dateHint) dateHint.textContent = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}

// =========================================================
//  RENDER: EXPENSES
// =========================================================

function renderExpenses() {
  const filterCat = (document.getElementById('filter-cat')||{}).value || '';
  let arr = filterCat ? expensesCache.filter(e=>e.cat===filterCat) : [...expensesCache];
  arr.sort((a,b)=>b.date.localeCompare(a.date));
  const cont = document.getElementById('expenses-table');
  if (!cont) return;
  if (!arr.length) { cont.innerHTML='<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No expenses for this period.</div></div>'; return; }
  cont.innerHTML = `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>By</th><th style="text-align:right">Amount</th><th></th></tr></thead>
    <tbody>${arr.map(e=>`<tr>
      <td>${formatDate(e.date)}</td>
      <td><span class="tag tag-${e.cat}">${CAT_LABELS[e.cat]}</span></td>
      <td style="color:var(--text2)">${e.note||'—'}</td>
      <td style="color:var(--text3);font-size:11px">${e.added_by}</td>
      <td style="text-align:right;font-weight:600;color:var(--red)">€${Number(e.amount).toFixed(2)}</td>
      <td><button class="btn-del" onclick="deleteExpense(${e.id})">✕</button></td>
    </tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="4"><strong>Total</strong></td><td style="text-align:right;color:var(--red)"><strong>€${arr.reduce((s,e)=>s+Number(e.amount),0).toFixed(2)}</strong></td><td></td></tr></tfoot>
  </table></div>`;
}

// =========================================================
//  RENDER: BUDGET
// =========================================================

function renderBudget() {
  let totalPlan=0, totalSpent=0;
  const tbody = document.getElementById('budget-tbody');
  if (!tbody) return;
  tbody.innerHTML = DEFAULT_BUDGET.map(b=>{
    const spent=expensesCache.filter(e=>e.cat===b.cat).reduce((s,e)=>s+Number(e.amount),0);
    const rem=b.planned-spent, saving=b.old-b.planned, pct=Math.round(spent/b.planned*100);
    const bcls=pct>=100?'badge-over':pct>=75?'badge-warn':'badge-ok';
    totalPlan+=b.planned; totalSpent+=spent;
    return `<tr>
      <td><span class="tag tag-${b.cat}">${b.label}</span></td>
      <td>€${b.planned}</td>
      <td style="font-weight:600;color:${pct>=100?'var(--red)':pct>=75?'var(--amber)':'var(--text)'}">€${spent.toFixed(0)}</td>
      <td style="color:${rem<0?'var(--red)':'var(--green)'}">€${rem.toFixed(0)}</td>
      <td style="color:var(--text3)">€${b.old}</td>
      <td style="color:var(--green);font-weight:600">€${saving}</td>
      <td><span class="badge ${bcls}">${pct>=100?'Over!':pct>=75?'Near limit':'On track'}</span></td>
    </tr>`;
  }).join('');
  const fp=document.getElementById('bft-plan'), fs=document.getElementById('bft-spent'), fr=document.getElementById('bft-rem'), fg=document.getElementById('bft-saving');
  if(fp)fp.textContent=`€${totalPlan}`; if(fs)fs.textContent=`€${totalSpent.toFixed(0)}`; if(fr)fr.textContent=`€${(totalPlan-totalSpent).toFixed(0)}`; if(fg)fg.textContent=`€${3176-totalPlan} saved vs old avg`;
}

// =========================================================
//  RENDER: FOOD
// =========================================================

function renderFood() {
  const el = document.getElementById('meal-rows');
  if (!el) return;
  el.innerHTML = MEALS.map(m=>`
    <div class="meal-row">
      <div class="meal-day">${m.day}</div>
      <div>${m.b}</div><div>${m.l}</div><div>${m.d}</div>
      <div class="meal-cost">${m.cost}</div>
    </div>`).join('');
}

// =========================================================
//  RENDER: GLOVO
// =========================================================

function renderGlovo() {
  const container = document.getElementById('glovo-list');
  if (!container) return;
  const countEl = document.getElementById('g-days-count');
  if (countEl) countEl.textContent = glovoCache.length;
  const workdays = getWorkdaysForMonth(currentYear, currentMonth);
  const header = `<div class="glovo-row glovo-header"><div>Date</div><div>Lunch cost</div><div>Top-up</div><div>Pantry items</div><div>Status</div></div>`;
  container.innerHTML = header + workdays.map(wd=>{
    const e=glovoCache.find(g=>g.date===wd);
    if(!e) return `<div class="glovo-row unlogged"><div>${formatDate(wd)}</div><div>—</div><div>—</div><div style="color:var(--text3)">Not logged</div><div></div></div>`;
    const ok=Number(e.lunch_cost)<=10&&Number(e.personal_topup)===0;
    return `<div class="glovo-row">
      <div style="font-weight:500">${formatDate(wd)}</div>
      <div style="color:${Number(e.lunch_cost)>10?'var(--red)':'var(--text)'}">€${Number(e.lunch_cost).toFixed(2)}</div>
      <div style="color:${Number(e.personal_topup)>0?'var(--red)':'var(--green)'}">€${Number(e.personal_topup).toFixed(2)}</div>
      <div style="font-size:12px;color:var(--text2)">${e.pantry_items||'—'} <span style="font-size:10px;color:var(--text3)">by ${e.added_by}</span></div>
      <div><span class="badge ${ok?'badge-ok':'badge-warn'}" style="font-size:10px">${ok?'✓ Good':'⚠ Check'}</span></div>
    </div>`;
  }).join('');
}

// =========================================================
//  RENDER: HISTORY
// =========================================================

async function renderHistory() {
  const cont = document.getElementById('history-content');
  if (!cont) return;
  cont.innerHTML = '<div class="empty"><div class="spinner" style="margin:0 auto"></div><div class="empty-text" style="margin-top:12px">Loading…</div></div>';
  try {
    const { data, error } = await sb.from('expenses').select('*').order('date',{ascending:false});
    if (error) throw error;
    if (!data||!data.length) { cont.innerHTML='<div class="empty"><div class="empty-icon">◷</div><div class="empty-text">No historical data yet.</div></div>'; return; }
    const byMonth={};
    data.forEach(e=>{ if(!byMonth[e.month_key]) byMonth[e.month_key]=[]; byMonth[e.month_key].push(e); });
    cont.innerHTML = Object.keys(byMonth).sort().reverse().map(mk=>{
      const [y,m]=mk.split('-').map(Number), label=monthLabel(y,m), items=byMonth[mk];
      const total=items.reduce((s,e)=>s+Number(e.amount),0);
      const isCurrent=(y===currentYear&&m===currentMonth);
      const catTotals={}; DEFAULT_BUDGET.forEach(b=>{catTotals[b.cat]=0;}); items.forEach(e=>{if(catTotals[e.cat]!==undefined)catTotals[e.cat]+=Number(e.amount);});
      const catRows=DEFAULT_BUDGET.map(b=>{const s=catTotals[b.cat]||0;if(!s)return'';const pct=Math.round(s/b.planned*100),cls=pct>=100?'over':pct>=75?'warn':'safe';return`<div class="prog-item"><div class="prog-lbl"><span class="prog-lbl-name">${b.label}</span><span class="prog-lbl-val">€${s.toFixed(0)}/€${b.planned}</span></div><div class="prog-track"><div class="prog-fill ${cls}" style="width:${Math.min(100,pct)}%"></div></div></div>`;}).join('');
      return `<div class="history-month">
        <div class="history-month-head" onclick="toggleHistoryMonth('${mk}')">
          <span class="hm-title">${label}${isCurrent?' (current)':''}</span>
          <span class="hm-total">€${total.toFixed(0)} spent ▾</span>
        </div>
        <div class="history-month-body${isCurrent?' open':''}" id="hist-${mk}">
          <div class="two-col">
            <div class="card"><div class="card-head">Category breakdown</div>${catRows||'<div class="empty"><div class="empty-text">No data</div></div>'}</div>
            <div class="card"><div class="card-head">Transactions (${items.length})</div>
              <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>By</th><th style="text-align:right">€</th></tr></thead>
                <tbody>${items.sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`<tr><td>${formatDate(e.date)}</td><td><span class="tag tag-${e.cat}">${CAT_LABELS[e.cat]}</span></td><td style="color:var(--text2)">${e.note||'—'}</td><td style="font-size:11px;color:var(--text3)">${e.added_by}</td><td style="text-align:right;font-weight:600;color:var(--red)">€${Number(e.amount).toFixed(2)}</td></tr>`).join('')}</tbody>
              </table></div>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch(e) { cont.innerHTML=`<div class="empty"><div class="empty-icon">⚠</div><div class="empty-text">Failed: ${e.message}</div></div>`; }
}

function toggleHistoryMonth(mk) {
  const el=document.getElementById('hist-'+mk);
  if(el) el.classList.toggle('open');
}

// =========================================================
//  RENDER: RULES
// =========================================================

function renderRules() {
  const rl=document.getElementById('rules-list'), dl=document.getElementById('decisions-list');
  if(rl) rl.innerHTML=RULES_DATA.map(r=>`<div class="rule-item"><div class="rule-dot"></div><div><div class="rule-text"><strong>${r.area}:</strong> ${r.rule}</div><div class="rule-sub">📅 ${r.deadline} · 👤 ${r.owner}</div></div></div>`).join('');
  if(dl) dl.innerHTML=DECISIONS_DATA.map(d=>`<div class="rule-item"><div class="rule-dot" style="background:var(--blue)"></div><div><div class="rule-text"><strong>${d.name}</strong></div><div class="rule-sub" style="color:var(--text)">${d.rule}</div></div></div>`).join('');
}

// =========================================================
//  EXPORT CSV
// =========================================================

function exportCSV() {
  if(!expensesCache.length){showToast('No expenses to export.',true);return;}
  let csv='Date,Category,Amount,Note,AddedBy\n';
  [...expensesCache].sort((a,b)=>a.date.localeCompare(b.date)).forEach(e=>{csv+=`${e.date},${CAT_LABELS[e.cat]},${Number(e.amount).toFixed(2)},"${(e.note||'').replace(/"/g,'""')}",${e.added_by}\n`;});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=`budget_${monthKey(currentYear,currentMonth)}.csv`;
  a.click();
}

// =========================================================
//  REAL-TIME SYNC
// =========================================================

function subscribeRealtime() {
  if (!sb) return;
  const mk = monthKey(currentYear, currentMonth);
  realtimeChannel = sb.channel('budget-' + mk)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'expenses',filter:`month_key=eq.${mk}`},payload=>{
      if(!expensesCache.find(e=>e.id===payload.new.id)){
        expensesCache.unshift(payload.new);
        showToast(`${payload.new.added_by} added €${Number(payload.new.amount).toFixed(2)} — ${CAT_LABELS[payload.new.cat]}`);
        refreshCurrentPage();
      }
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'expenses'},payload=>{
      expensesCache=expensesCache.filter(e=>e.id!==payload.old.id);
      refreshCurrentPage();
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'glovo_entries',filter:`month_key=eq.${mk}`},payload=>{
      if(payload.eventType==='INSERT'&&!glovoCache.find(g=>g.id===payload.new.id)) glovoCache.push(payload.new);
      else if(payload.eventType==='UPDATE') glovoCache=glovoCache.map(g=>g.id===payload.new.id?payload.new:g);
      if(currentPage==='glovo') renderGlovo();
    })
    .subscribe();
}
