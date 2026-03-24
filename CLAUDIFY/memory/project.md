# Project Memory — Fire Zone Guard

_Last updated: 2026-03-24_

## What This App Does
Fire Zone Guard is a firefighting zone management dashboard. It allows operators to manage tasks across fire zones, track assignments, and monitor real-time updates via Supabase.

## Database (Supabase)
- Backend hosted on Supabase (PostgreSQL)
- Types auto-generated in `src/integrations/supabase/types.ts`
- Real-time subscriptions used via `useSupabaseData` hook
- Connection tested via `test-db.mjs`
- `database_update.sql` contains pending/applied schema migrations

## Key Files
| File | Purpose |
|------|---------|
| `src/hooks/useSupabaseData.ts` | Central data fetching hook |
| `src/integrations/supabase/types.ts` | Auto-generated Supabase types |
| `src/components/TaskCard.tsx` | Individual task display component |
| `src/components/TaskDetailDialog.tsx` | Task detail modal |
| `src/components/CreateTaskDialog.tsx` | New task creation modal |
| `src/pages/Dashboard.tsx` | Main dashboard page |
| `database_update.sql` | SQL migrations to apply |

## Environment
- `.env` file present (Supabase URL + anon key)
- Dev server: `npm run dev` (Vite, port 5173)
- Tests: `npm run test` (Vitest)

## Known Issues / Open TODOs
- [ ] Review `database_update.sql` — may have unapplied migrations
- [ ] Confirm Supabase RLS policies are correctly configured
- [ ] Check if `test-db.mjs` tests pass after DB updates

## Recent Changes
- 2026-03-24: Claudify installed and initialized for this project
