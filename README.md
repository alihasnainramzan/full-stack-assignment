# Kontrora — Senior Full-Stack Assignment

PSA platform (Next.js App Router + Supabase). Build one feature end-to-end in **2–3 hours**. Quality over completeness.

## Setup

Node.js **20.9+**, free [Supabase](https://supabase.com) project.

```bash
npm install
cp .env.local.template .env.local   # fill Supabase URL + keys
# Run supabase/schema.sql in the Supabase SQL Editor
npm run dev                        # http://localhost:3000
```

## Task

Implement **Users** at `/admin/users`:      

1. Table: name, email, avatar, roles     
2. Server-side search (not client-side filtering)
3. Soft-remove via `user_roles.removed_at` (do not delete profiles)
4. Confirm dialog + optimistic remove with rollback on failure

Use `Permission.MANAGE_USERS` and existing guards (`lib/server-guards.ts`). Extend `app/api/users/route.js` and `app/admin/users/page.tsx`. Match patterns in `app/admin/roles/page.tsx`.
   
## Evaluation         

Backend correctness · Frontend quality · Code judgment · Fork README (decisions / trade-offs)      

## Submit    

Share your **fork URL** (no PR). Include a short README on how to run it and what you’d do with more time.         


---

## Staff Engineer Assignment Submission — Revenue & Billing (Estimates)

### Architecture Decisions
- **Minor Units for Financial Calculations**: All monetary values across `estimates` and `estimate_line_items` (`unit_price_cents`, `subtotal_cents`, `tax_cents`, `total_cents`) are strictly modeled as integer minor units (`BIGINT` in cents). Storing integer minor units eliminates IEEE-754 floating-point rounding errors during currency summation, tax percentage computation, and financial reporting.
- **Strict Lifecycle State Machine**: The lifecycle transitions through four defined states: `draft` → `sent` → `accepted` | `rejected`. State changes trigger corresponding timestamp audits (`sent_at`, `accepted_at`, `rejected_at`) with reason capture on rejection.
- **Idempotency Safeguard**: The `POST /api/accounts/[accountId]/estimates` endpoint requires a unique `Idempotency-Key` header. This key is enforced at the database layer via a scoped composite unique index on `(account_id, idempotency_key)` for active records. Retried network calls or duplicate form submissions safely replay the existing record with an `Idempotent-Replayed: true` header without creating duplicate billing charges.
- **Non-Destructive Soft Deletes**: Soft deletions are enforced via `deleted_at TIMESTAMPTZ`. Both database RLS policies and application service layers prevent destructive `DELETE` operations, preserving immutable audit trails for compliance.

### Security & Tenancy Review
- **Row Level Security (RLS) Anchored to Tenancy**: Strict RLS policies are enabled on both `estimates` and `estimate_line_items`. Read and write operations are strictly restricted to members of the parent account (`account_members` where `removed_at IS NULL`), account managers (`accounts.account_manager_id`), or platform superadmins.
- **Defensive API Guarding (Anti-IDOR)**: Route handlers utilize server-side guards (`requireAuthAndPermission`) to verify `Permission.MANAGE_ESTIMATES` and `Permission.VIEW_ESTIMATES`. The `accountId` is strictly parsed from the validated route parameter and verified against the authenticated session context; any client-supplied `account_id` in the JSON request body is completely ignored and discarded to prevent Insecure Direct Object Reference (IDOR) attacks.

### How to Run / Test
1. **Apply Database Migration**: Run `supabase/estimates.sql` (or re-run `supabase/schema.sql`) in your Supabase SQL Editor to provision the tables, triggers, unique indexes, and RLS policies.
2. **Seed Financial Permissions**: Run `supabase/seed-roles.sql` to equip seed roles (Account Manager & Executive Director) with estimate management permissions.
3. **Start Dev Server & Test UI**: Launch the development server with `npm run dev` and navigate to `/accounts/[accountId]/estimates` (or click **"Estimates & Billing"** in the Account Overview header) to test the dynamic line-item editor, draft creation, and lifecycle state changes.

### What I'd Ship Next
- **Stripe Invoicing & Payment Webhooks**: Automatically convert estimates in the `accepted` state into draft Stripe Invoices via Stripe Connect, synchronizing payment status and charge IDs back to the PSA platform through signed webhook events.
- **Double-Entry Ledger Reconciliation**: Implement a balanced journal entry table (`ledger_entries`) recording debit/credit movements (Accounts Receivable vs. Revenue) to support rigorous GAAP/IFRS accounting compliance.
- **PDF Generation & Client Portal Sign-Off**: Add automated PDF generation using `@react-pdf/renderer` or serverless Puppeteer to allow downloadable estimate receipts, accompanied by digital signature capture directly inside the client portal.
