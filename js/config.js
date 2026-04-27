// ============================================================
//  CONFIGURATION — fill in your Supabase credentials below
//  You get these from: https://supabase.com → Project Settings → API
// ============================================================

const SUPABASE_URL = 'https://yrllnxjzdqkumlphuhlq.supabase.co';       // e.g. https://xyzabcdef.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybGxueGp6ZHFrdW1scGh1aGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzcyNzcsImV4cCI6MjA5Mjg1MzI3N30.zKklGzgNxPaAp46NdixSio99isO_LS1ZV8FZ1qbnoJ8'; // the long anon/public key

// ============================================================
//  APP USERS — username → password (shared password for family)
//  Change the password to something personal before deploying!
// ============================================================

const APP_USERS = {
  peyman: 'family2026',
  mozhgan:   'family2026',
};

// ============================================================
//  MONTHLY BUDGET CAPS (from your Excel plan)
//  Update these when you start a new month
// ============================================================

const DEFAULT_BUDGET = [
  { cat: 'food',      label: 'Food (personal cash)', planned: 362,  old: 714 },
  { cat: 'transport', label: 'Transport',             planned: 120,  old: 425 },
  { cat: 'beauty',    label: 'Beauty / Apparel',      planned: 30,   old: 320 },
  { cat: 'health',    label: 'Health',                planned: 120,  old: 404 },
  { cat: 'other',     label: 'Other / Subscriptions', planned: 250,  old: 613 },
  { cat: 'rent',      label: 'Rent',                  planned: 830,  old: 830 },
  { cat: 'debt',      label: 'Debt / Loans',          planned: 650,  old: 650 },
  { cat: 'utilities', label: 'Utilities / Phone',     planned: 220,  old: 220 },
];

const MONTHLY_SALARY = 3000;
