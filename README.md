# Worklo — Senior Full-Stack Assignment

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
