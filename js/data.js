// =========================================================
//  STATIC CONTENT DATA — meal plan, rules, decisions
// =========================================================

const MEALS = [
  { day: 'Monday',    b: 'Oats + banana + yogurt',         l: 'Leftover rice + veg',        d: 'Chicken/rice soup or tuna rice bowl',    cost: '€6' },
  { day: 'Tuesday',   b: 'Eggs + bread',                   l: 'Omelette with zucchini',     d: 'Pasta with 250g minced meat sauce',      cost: '€8' },
  { day: 'Wednesday', b: 'Yogurt + fruit if tolerated',    l: 'Pasta leftovers',            d: 'Potato-egg tortilla + cucumber',         cost: '€6' },
  { day: 'Thursday',  b: 'Oats + banana',                  l: 'Rice + tuna + cooked carrots', d: 'Lentil stew (small portion) + rice',   cost: '€5' },
  { day: 'Friday',    b: 'Eggs + bread',                   l: 'Leftover lentil/rice',       d: 'Minced meat + rice + zucchini/carrot',   cost: '€8' },
  { day: 'Saturday',  b: 'Oats / yogurt',                  l: 'Simple egg sandwich at home', d: 'Potato/carrot/zucchini stew + tuna',   cost: '€6' },
  { day: 'Sunday',    b: 'Eggs + fruit',                   l: 'Leftover stew or rice',      d: 'Light pasta or rice soup',               cost: '€5' },
];

const RULES_DATA = [
  { area: 'Cash',           rule: 'Reserve rent (€830) from current €850 immediately. Do not use rent cash for food or shopping.', deadline: 'Today',    owner: 'Peyman' },
  { area: 'Food',           rule: 'Keep personal food ≤ €400/month. Use Food Budget tab each week to track.', deadline: 'Weekly',   owner: 'Both' },
  { area: "IN's",           rule: 'One main visit + one €10 top-up per week only. No shopping without a list.', deadline: 'Weekly',   owner: 'Both' },
  { area: 'Porta Palazzo',  rule: '€30 max per visit, fruit/veg only. Avoid overbuying soft fruit.', deadline: 'Weekly',   owner: 'Both' },
  { area: 'Sigma',          rule: '0.5 kg minced meat once/week max. Split into two 250g meals. Stretch with rice/veg.', deadline: 'Weekly',   owner: 'Both' },
  { area: 'Glovo',          rule: '€10 lunch + €10 pantry only. No personal top-up ever. Track every workday.', deadline: 'Workdays', owner: 'Peyman' },
  { area: 'Debt',           rule: 'Call Agos/Unicredit to ask for restructuring down to €400–500/month.', deadline: 'This week', owner: 'Peyman' },
  { area: 'Transport',      rule: 'No taxis unless emergency. Public transport only all month.', deadline: 'All month', owner: 'Both' },
  { area: 'Beauty/Apparel', rule: 'Freeze all beauty and apparel spending for 60 days. Only absolute essentials.', deadline: 'All month', owner: 'Both' },
  { area: 'Weekly Review',  rule: 'Sunday 20-minute budget review together — update actual numbers and plan next week.', deadline: 'Every Sunday', owner: 'Both' },
];

const DECISIONS_DATA = [
  { name: 'Cash priority',    rule: "Keep the €850 reserved for rent unless salary has already arrived." },
  { name: 'Food strategy',    rule: "€30 Porta Palazzo + €40–45 IN's + €8 Sigma minced meat + €10 top-up per week." },
  { name: 'Work lunch',       rule: "Use company Glovo €10/day only. Do not add personal money." },
  { name: 'Glovo pantry',     rule: "Use Glovo pantry only for spices/oil/pantry items that replace supermarket cost." },
  { name: 'Gut constraint',   rule: "Favor rice, potatoes, carrots, zucchini, eggs, yogurt; limit beans/cabbage/onion." },
  { name: 'Emergency rule',   rule: "No personal restaurant/delivery, no random supermarket trips, no extra snacks." },
  { name: 'Meal prep',        rule: "Dinner always creates wife lunch or next-day backup. Cook once, eat twice." },
];

const CAT_LABELS = {
  food: 'Food', transport: 'Transport', beauty: 'Beauty/Apparel',
  health: 'Health', other: 'Other/Subscriptions', rent: 'Rent',
  debt: 'Debt/Loans', utilities: 'Utilities',
};

// May 2026 workdays (Mon–Fri, no holidays)
const MAY_2026_WORKDAYS = [
  '2026-05-04','2026-05-05','2026-05-06','2026-05-07','2026-05-08',
  '2026-05-11','2026-05-12','2026-05-13','2026-05-14','2026-05-15',
  '2026-05-18','2026-05-19','2026-05-20','2026-05-21','2026-05-22',
  '2026-05-25','2026-05-26','2026-05-27','2026-05-28','2026-05-29',
];

function getWorkdaysForMonth(year, month) {
  // month is 1-indexed
  if (year === 2026 && month === 5) return MAY_2026_WORKDAYS;
  // Generic: return all Mon-Fri of the given month
  const days = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) days.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2,'0')}`;
}

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
