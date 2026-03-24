---
description: Add a new feature with proper component, hook, and Supabase wiring
---

# /feature — New Feature Workflow

## Steps

1. **Read memory and identify the feature scope**
   - Read `CLAUDIFY/memory/project.md`

2. **Create or update the Supabase table (if needed)**
   - Write migration SQL in `supabase/migrations/`
   - Apply via Supabase dashboard or CLI

3. **Regenerate types**
   ```bash
   npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts
   ```

4. **Extend `useSupabaseData` hook** (or create new hook in `src/hooks/`)

5. **Build UI components** in `src/components/`
   - Follow patterns in `CLAUDIFY/skills/react-typescript.md`

6. **Wire into page** (`src/pages/`)

7. **Write tests** in `src/test/`
   ```bash
   npm run test
   ```

8. **Update memory**
   - Document the new feature in `CLAUDIFY/memory/project.md`
