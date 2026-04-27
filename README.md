# 🌿 FamilyBudget Tracker

Shared family expense tracker — May 2026 and beyond. Built to deploy on Netlify with Supabase as the database so both users see the same data in real-time.

---

## ⚡ Quick Setup (15 minutes)

### Step 1 — Create a Supabase project (free)

1. Go to [https://supabase.com](https://supabase.com) and sign up (free tier is fine)
2. Click **New project**, give it a name like `family-budget`, choose a region close to you
3. Wait ~2 minutes for the project to be ready

### Step 2 — Create the database tables

In your Supabase dashboard, click **SQL Editor** → **New query**, paste this and click **Run**:

```sql
-- Expenses table
CREATE TABLE expenses (
  id           BIGSERIAL PRIMARY KEY,
  month_key    TEXT NOT NULL,        -- format: '2026-05'
  date         DATE NOT NULL,
  cat          TEXT NOT NULL,
  amount       NUMERIC(10,2) NOT NULL,
  note         TEXT DEFAULT '',
  added_by     TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Glovo entries table
CREATE TABLE glovo_entries (
  id              BIGSERIAL PRIMARY KEY,
  month_key       TEXT NOT NULL,
  date            DATE NOT NULL,
  lunch_cost      NUMERIC(10,2) DEFAULT 0,
  personal_topup  NUMERIC(10,2) DEFAULT 0,
  pantry_items    TEXT DEFAULT '',
  added_by        TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast monthly queries
CREATE INDEX idx_expenses_month    ON expenses (month_key);
CREATE INDEX idx_glovo_month       ON glovo_entries (month_key);
CREATE UNIQUE INDEX idx_glovo_date ON glovo_entries (month_key, date);

-- Enable Row Level Security (allow all reads/writes with anon key)
ALTER TABLE expenses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE glovo_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON expenses      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON glovo_entries FOR ALL USING (true) WITH CHECK (true);

-- Enable real-time for live sync between users
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE glovo_entries;
```

### Step 3 — Get your API credentials

In Supabase dashboard → **Project Settings** → **API**:
- Copy **Project URL** (looks like `https://xyzabcdef.supabase.co`)
- Copy **anon / public key** (the long string under "Project API keys")

### Step 4 — Configure the app

Open `js/config.js` and replace the placeholders:

```js
const SUPABASE_URL      = 'https://YOUR-PROJECT-ID.supabase.co';
const SUPABASE_ANON_KEY = 'your-long-anon-key-here';
```

You can also change the password here:
```js
const APP_USERS = {
  peyman: 'your-new-password',
  wife:   'your-new-password',
};
```

### Step 5 — Push to GitHub

```bash
git init
git add .
git commit -m "Family budget tracker"
git remote add origin https://github.com/YOUR_USERNAME/family-budget.git
git push -u origin main
```

### Step 6 — Deploy to Netlify

1. Go to [https://netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
2. Select your GitHub repo
3. Build settings: leave everything blank (it's a static site, no build needed)
4. Click **Deploy site**
5. Done! You get a URL like `https://your-site.netlify.app`

---

## 🔄 How months work

- The app defaults to the **current month**
- Use the **‹ Prev / Next ›** buttons at the top to navigate months
- The **History** page shows ALL months with full expense breakdowns
- When a new month starts, expenses are automatically tracked under the new month — nothing is lost

---

## 👥 Users

| Username | Password (default) |
|----------|-------------------|
| `peyman` | `family2026` |
| `wife`   | `family2026` |

⚠️ **Change the password in `js/config.js` before deploying!**

---

## 📁 File structure

```
familybudget/
├── index.html          Main HTML shell
├── netlify.toml        Netlify config + security headers
├── css/
│   └── style.css       All styles
└── js/
    ├── config.js       ← YOUR CREDENTIALS GO HERE
    ├── data.js         Static data (meals, rules, etc.)
    └── app.js          All app logic + Supabase calls
```

---

## 🔧 Customizing for future months

In `js/config.js`, update `DEFAULT_BUDGET` each month if caps change:

```js
const DEFAULT_BUDGET = [
  { cat: 'food', label: 'Food (personal cash)', planned: 362, old: 714 },
  // ...
];
```
