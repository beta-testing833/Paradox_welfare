# WelfareConnect — Database Schema (Supabase / PostgreSQL)

> **Contributor:** Anwar (anassanwar010@gmail.com)  
> **Component:** Database — tables, RLS policies, seed data, views, indexes  
> **Platform:** Supabase (PostgreSQL 15 + Row Level Security)

---

## Overview

This directory contains all Supabase migration files that define the complete
database schema for the **WelfareConnect** welfare-scheme eligibility and
application platform. All migrations live in `migrations/` and are applied
chronologically by Supabase CLI.

---

## Migration Files (Chronological Order)

| # | File | Description |
|---|------|-------------|
| 1 | `20260420074814_338b7127...sql` | **Initial schema** — profiles, schemes, ngos, scheme_ngo_map, applications, application_documents, notifications; storage bucket `application-docs`; seed data (7 schemes, 5 NGOs) |
| 2 | `20260420082024_2ed5b367...sql` | `eligibility_submissions` table + RLS |
| 3 | `20260420111340_defb92b4...sql` | `subscriptions` table + RLS |
| 4 | `20260420114200_2f194cf4...sql` | `scheme_packs` and `topup_purchases` tables + RLS |
| 5 | `20260420121029_750913ff...sql` | Scheme table extensions (FTS vector, tags, ministry, dates); 10 additional national schemes seeded |
| 6 | `20260420133640_5745ebf5...sql` | `agents` table, `interactions` table, RLS; `agent_bookings` view; `revenue_summary` view |
| 7 | `20260420133704_e601728e...sql` | Agent seed data |
| 8 | `20260420145031_1a9b003f...sql` | Application form extensions (consultation booking, status); eligibility_submissions extra fields; subscriptions tier table |
| 9 | `20260420145101_3144b80e...sql` | Scheme_packs RLS fix / additional pack seed |
| 10 | `20260422065257_eb09acc3...sql` | Scheme scalability extensions — state_specific, launch/expiry dates, ministry column; GIN FTS index |
| 11 | `20260422065429_6977dfd2...sql` | Additional seed schemes for scalability testing |

---

## Tables

### `public.profiles`
Stores extended profile data for authenticated users (linked to `auth.users`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | References `auth.users(id)` |
| `full_name` | TEXT | Auto-populated from signup metadata |
| `phone` | TEXT | |
| `dob` | DATE | Date of birth |
| `aadhar` | TEXT | Masked Aadhar number |
| `created_at` / `updated_at` | TIMESTAMPTZ | Auto-managed |

**RLS:** Users can SELECT / INSERT / UPDATE their own row only.  
**Trigger:** `on_auth_user_created` auto-inserts a profile row on new signup.

---

### `public.schemes`
Master catalogue of government welfare schemes.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | TEXT | Scheme name |
| `category` | TEXT | Health / Education / Agriculture / … |
| `description` | TEXT | |
| `benefit_amount` | TEXT | Human-readable benefit string |
| `eligibility_criteria` | JSONB | `{min_age, max_age, max_income, categories[], occupations[], disability_required, gender_required?}` |
| `required_documents` | TEXT[] | |
| `is_verified` | BOOLEAN | |
| `official_portal_url` | TEXT | |
| `state_specific` | TEXT[] | States where scheme applies (empty = national) |
| `launch_date` / `expiry_date` | DATE | |
| `ministry` | TEXT | Responsible ministry |
| `tags` | TEXT[] | Searchable tags |
| `fts_vector` | tsvector | Generated column for full-text search |

**RLS:** SELECT open to everyone (public catalogue).  
**Indexes:** `schemes_fts_idx` (GIN), `schemes_category_idx`.

---

### `public.ngos`
Registered NGO partners that help users with applications.

| Column | Type |
|--------|------|
| `id` | UUID PK |
| `name` | TEXT |
| `location` | TEXT |
| `focus_area` | TEXT |
| `rating` | NUMERIC(2,1) |
| `km_from_user` | NUMERIC(4,1) |
| `testimonial` / `testimonial_author` | TEXT |

**RLS:** SELECT open to everyone.

---

### `public.scheme_ngo_map`
Many-to-many mapping between schemes and NGOs.

| Column | Type |
|--------|------|
| `scheme_id` | UUID FK → schemes |
| `ngo_id` | UUID FK → ngos |

**RLS:** SELECT open to everyone.

---

### `public.applications`
Tracks a citizen's application for a scheme (optionally via an NGO).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK | References `auth.users` |
| `scheme_id` | UUID FK | Nullable |
| `ngo_id` | UUID FK | Nullable |
| `status` | TEXT | `Draft \| Submitted \| Under Review \| Approved \| Rejected` |
| `aadhar` | TEXT | |
| `message` | TEXT | Applicant's note |
| `consultation_date` | DATE | Booked consultation date |
| `consultation_time_slot` | TEXT | |
| `consultation_status` | TEXT | `Pending \| Confirmed \| Completed \| Cancelled` |
| `applied_at` | TIMESTAMPTZ | |

**RLS:** Full CRUD restricted to the owning `user_id`.

---

### `public.application_documents`
Files uploaded as supporting evidence for an application (stored in Supabase Storage).

| Column | Type |
|--------|------|
| `id` | UUID PK |
| `application_id` | UUID FK → applications |
| `file_path` | TEXT |
| `file_name` | TEXT |
| `file_size_bytes` | INT |
| `uploaded_at` | TIMESTAMPTZ |

**RLS:** SELECT / INSERT / DELETE scoped to the document owner (via applications join).

---

### `public.notifications`
In-app notifications for a user.

| Column | Type |
|--------|------|
| `id` | UUID PK |
| `user_id` | UUID FK |
| `title` | TEXT |
| `body` | TEXT |
| `is_read` | BOOLEAN |
| `created_at` | TIMESTAMPTZ |

**RLS:** Full CRUD restricted to the owning `user_id`.

---

### `public.eligibility_submissions`
Records a user's eligibility check form data and computed score.

Key fields: `user_id`, `age`, `income`, `category`, `occupation`,
`disability`, `gender`, `state`, `marital_status`, `is_gov_employee`,
`is_minority`, `is_dbt_eligible`, `preferred_benefit_type`, `score`,
`matched_scheme_ids[]`.

**RLS:** Users can SELECT / INSERT / UPDATE their own rows only.

---

### `public.subscriptions`
Premium subscription tiers for citizens (e.g., Basic / Pro / Elite).

Key fields: `user_id`, `plan`, `starts_at`, `ends_at`, `razorpay_order_id`,
`razorpay_payment_id`, `status`.

**RLS:** Users can SELECT / INSERT / UPDATE their own rows only.

---

### `public.scheme_packs`
Curated scheme bundles available for purchase.

Key fields: `id`, `name`, `description`, `price_inr`, `scheme_ids[]`,
`is_active`.

**RLS:** SELECT open to everyone; INSERT / UPDATE restricted to service role.

---

### `public.topup_purchases`
Records one-time pack purchases by users.

Key fields: `id`, `user_id`, `pack_id`, `amount_paid`, `razorpay_*`,
`purchased_at`.

**RLS:** Users can only see their own purchases.

---

### `public.agents`
Field agent accounts managed by admin.

| Column | Type |
|--------|------|
| `id` | UUID PK |
| `user_id` | UUID FK |
| `name` | TEXT |
| `email` | TEXT |
| `phone` | TEXT |
| `district` | TEXT |
| `state` | TEXT |
| `is_active` | BOOLEAN |
| `commission_rate` | NUMERIC |

**RLS:** Agents can only see / update their own row.

---

### `public.interactions`
Records every agent–citizen interaction (consultation, call, visit).

Key fields: `id`, `agent_id`, `citizen_user_id`, `type`, `notes`,
`outcome`, `occurred_at`.

**RLS:** Agent can SELECT / INSERT / UPDATE their own interactions.

---

## Views

### `agent_bookings`
Joins `applications` + `agents` to show all consultation bookings assigned
to each agent, with citizen details.

### `revenue_summary`
Aggregates `subscriptions` + `topup_purchases` by month and plan tier for
admin revenue reporting.

---

## Storage

| Bucket | Public | Purpose |
|--------|--------|---------|
| `application-docs` | ❌ private | Uploaded supporting documents |

**Storage RLS:** Files are scoped per-user via folder name = `auth.uid()`.

---

## Row Level Security Summary

| Table | Owner-only CRUD | Public SELECT |
|-------|----------------|---------------|
| profiles | ✅ | ❌ |
| schemes | ❌ | ✅ |
| ngos | ❌ | ✅ |
| scheme_ngo_map | ❌ | ✅ |
| applications | ✅ | ❌ |
| application_documents | ✅ | ❌ |
| notifications | ✅ | ❌ |
| eligibility_submissions | ✅ | ❌ |
| subscriptions | ✅ | ❌ |
| topup_purchases | ✅ | ❌ |
| agents | ✅ (own row) | ❌ |
| interactions | ✅ (own rows) | ❌ |

---

## Seed Data

The initial migration seeds:

- **7 core welfare schemes** — Swasthya Raksha Yojana, Vidyarthi Vikas
  Scholarship, Kisan Sahay, Bengal Women Empowerment, Aparajita Disability
  Support, Skill India Yuva, Annapurna Food Security
- **5 Kolkata NGOs** — Kolkata Care Foundation, Bengal Women Empowerment
  Trust, Kisan Sahay Kolkata, Aparajita Disability Network, Vidya Jyoti
  Education Trust
- **scheme_ngo_map rows** linking each scheme to 1–2 relevant NGOs
- **10 additional national schemes** in migration #5 — PM Awas Yojana
  (Urban & Gramin), NSAP, Janani Suraksha, PMKVY, Atal Pension, Sukanya
  Samriddhi, PM Mudra, DDUGJY, Stand Up India
- **Sample agent rows** in migration #7

---

## How to Apply Migrations

```bash
# Using Supabase CLI (local dev)
supabase db push

# Or apply individually in chronological order
supabase migration up
```

Set your Supabase project URL and anon/service key in `.env` before running.
