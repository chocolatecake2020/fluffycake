# Supabase Setup (VetBridge MVP)

## 1) Environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Fill:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 2) SQL schema

Run this in Supabase SQL editor:

```sql
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  full_name text,
  institution text,
  role text check (role in ('clinic', 'reviewer', 'admin')),
  created_at timestamptz default now()
);

alter table user_profiles add column if not exists phone text;
alter table user_profiles add column if not exists full_name text;
alter table user_profiles add column if not exists institution text;
alter table user_profiles add column if not exists paypal_email text;

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  patient_name text,
  species text,
  breed text,
  age text,
  sex text,
  weight text,
  complaint text,
  clinical_history text,
  current_medication text,
  review_type text,
  priority text,
  status text,
  clinic_id text,
  reviewer_id text,
  reviewer_message text,
  report jsonb,
  submitted_at date default current_date,
  created_at timestamptz default now()
);

create table if not exists reviewers (
  id text primary key,
  name text not null,
  specialty text,
  institution text,
  languages text[],
  availability text,
  review_count int default 0,
  avg_turnaround text
);

create table if not exists clinics (
  id text primary key,
  name text not null,
  country text,
  active_cases int default 0
);

create table if not exists pilot_inquiries (
  id bigint generated always as identity primary key,
  name text,
  institution text,
  country text,
  email text,
  role text,
  interest text,
  message text,
  created_at timestamptz default now()
);

create table if not exists case_files (
  id bigint generated always as identity primary key,
  case_id uuid references cases(id) on delete cascade,
  file_name text not null,
  file_type text,
  file_size bigint,
  storage_path text not null,
  public_url text,
  created_at timestamptz default now()
);

create table if not exists submitted_reports (
  id bigint generated always as identity primary key,
  case_id uuid references cases(id) on delete cascade,
  reviewer_id uuid,
  reviewer_email text,
  report_snapshot jsonb not null,
  submitted_at timestamptz default now()
);

create table if not exists audit_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  case_id uuid,
  actor_id uuid,
  actor_email text,
  payload jsonb,
  created_at timestamptz default now()
);

create table if not exists reviewer_applications (
  id bigint generated always as identity primary key,
  name text,
  email text,
  phone text,
  institution text,
  specialty text,
  message text,
  actor_id uuid,
  actor_email text,
  created_at timestamptz default now()
);

create table if not exists payment_transactions (
  id bigint generated always as identity primary key,
  payment_id text unique not null,
  method text not null,
  provider text,
  status text not null,
  amount numeric(12,2) default 0,
  currency text default 'USD',
  case_id text,
  network text,
  deposit_address text,
  reference text,
  remitter_name text,
  redirect_url text,
  raw_payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- P2P (clinic <-> reviewer direct PayPal) extension columns.
alter table public.payment_transactions
  add column if not exists paypal_recipient_email text,
  add column if not exists transaction_reference text,
  add column if not exists proof_url text,
  add column if not exists rejection_reason text;

create table if not exists payouts (
  id bigint generated always as identity primary key,
  case_id uuid unique references cases(id) on delete cascade,
  reviewer_id uuid,
  reviewer_email text,
  paypal_email text,
  gross_amount numeric(12,2) default 0,
  platform_fee numeric(12,2) default 0,
  net_amount numeric(12,2) default 0,
  currency text default 'USD',
  status text not null default 'pending',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.set_payouts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_payouts_updated_at on public.payouts;
create trigger trg_payouts_updated_at
before update on public.payouts
for each row execute function public.set_payouts_updated_at();
```

## 3) Minimal RLS for pilot

For rapid pilot testing:

```sql
alter table user_profiles enable row level security;
alter table cases enable row level security;
alter table reviewers enable row level security;
alter table clinics enable row level security;
alter table pilot_inquiries enable row level security;
alter table case_files enable row level security;
alter table submitted_reports enable row level security;
alter table audit_events enable row level security;
alter table reviewer_applications enable row level security;
alter table payment_transactions enable row level security;
alter table payouts enable row level security;

create policy "authenticated read profiles" on user_profiles
for select to authenticated using (true);
create policy "upsert own profile" on user_profiles
for insert to authenticated with check (auth.uid() = id);
create policy "update own profile" on user_profiles
for update to authenticated using (auth.uid() = id);

create policy "authenticated full cases" on cases
for all to authenticated using (true) with check (true);
create policy "authenticated read reviewers" on reviewers
for select to authenticated using (true);
create policy "authenticated read clinics" on clinics
for select to authenticated using (true);
create policy "authenticated pilot inquiry write" on pilot_inquiries
for insert to authenticated with check (true);
create policy "authenticated case files full" on case_files
for all to authenticated using (true) with check (true);
create policy "authenticated submitted reports full" on submitted_reports
for all to authenticated using (true) with check (true);
create policy "authenticated audit read/write" on audit_events
for all to authenticated using (true) with check (true);
create policy "authenticated reviewer application write" on reviewer_applications
for insert to authenticated with check (true);
create policy "authenticated reviewer application read" on reviewer_applications
for select to authenticated using (true);
create policy "authenticated payment transactions full" on payment_transactions
for all to authenticated using (true) with check (true);

-- Payouts: reviewer can read own rows, admins read/write all,
-- the app inserts/updates via authenticated session (pilot-friendly).
create policy "payouts_select_own_or_admin"
on public.payouts
for select
to authenticated
using (
  reviewer_id = auth.uid()
  or exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
);

create policy "payouts_insert_authenticated"
on public.payouts
for insert
to authenticated
with check (true);

create policy "payouts_update_admin_or_owner"
on public.payouts
for update
to authenticated
using (
  reviewer_id = auth.uid()
  or exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  )
)
with check (true);
```

Tighten these policies before production.

## 4) Storage bucket for uploads

Create bucket `case-files` in Supabase Storage (Public bucket for pilot).

Optional SQL (if you prefer SQL migration style):

```sql
insert into storage.buckets (id, name, public)
values ('case-files', 'case-files', true)
on conflict (id) do nothing;

create policy "authenticated upload case-files" on storage.objects
for insert to authenticated with check (bucket_id = 'case-files');
create policy "authenticated read case-files" on storage.objects
for select to authenticated using (bucket_id = 'case-files');
```

App now writes uploads into:

`<clinic_id>/<case_id>/<timestamp>-<filename>`

so clinic and case boundaries are explicit in storage paths.

## 5) What is live now

- Email/password sign in + sign up
- Role selection persisted in `user_profiles`
- Role-protected routes for clinic/reviewer/admin
- Cases API supports Supabase table (`cases`) and falls back to mock if env is missing
- New case file upload to Supabase Storage (`case-files`) + `case_files` table linkage
- Report submit snapshot table (`submitted_reports`) + audit trail (`audit_events`)
- Reviewer interest registration (`reviewer_applications`) with email draft trigger
- Payment records persisted in `payment_transactions` (gateway-ready)

## 6) Payment activation (real operation)

`src/api/paymentsApi.js` now supports two live modes:

1. **Gateway mode (recommended for production)**  
   Set `VITE_PAYMENTS_API_BASE_URL` and implement these endpoints on your server:
   - `GET /methods`
   - `POST /checkout-session` (Stripe/PayPal session creation)
   - `POST /usdt-charge`
   - `POST /bank-transfer`
   - `GET /status/:paymentId`

   This repository already includes Vercel serverless handlers:
   - `api/payments/methods.js`
   - `api/payments/checkout-session.js`
   - `api/payments/usdt-charge.js`
   - `api/payments/bank-transfer.js`
   - `api/payments/status/[paymentId].js`

   Frontend env:
   - `VITE_PAYMENTS_API_BASE_URL=/api/payments`

   Vercel server env:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_SUCCESS_URL`
   - `STRIPE_CANCEL_URL`
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_API_BASE` (`https://api-m.sandbox.paypal.com` for sandbox)
   - `PAYPAL_RETURN_URL`
   - `PAYPAL_CANCEL_URL`
   - `USDT_DEPOSIT_ADDRESS` (optional)

2. **Payment-link mode (pilot)**  
   Without backend, set:
   - `VITE_STRIPE_PAYMENT_LINK`
   - `VITE_PAYPAL_PAYMENT_LINK`

   Then the UI creates a payment record and gives an `Open Checkout` button that opens each provider payment link.
