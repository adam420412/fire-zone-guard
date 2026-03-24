# Skill: Supabase

## Purpose
Patterns and best practices for working with Supabase in this project.

## Client Initialization
The Supabase client is initialized in `src/integrations/supabase/client.ts`.
Always import from there — never create a new client.

## Types
- Auto-generated types live in `src/integrations/supabase/types.ts`
- After schema changes, regenerate types:
  ```bash
  npx supabase gen types typescript --project-id <project-id> > src/integrations/supabase/types.ts
  ```

## Data Fetching Pattern
Use the `useSupabaseData` hook for data fetching. For new data needs, extend this hook.

```typescript
const { data, loading, error, refetch } = useSupabaseData();
```

## Realtime Subscriptions
```typescript
const channel = supabase
  .channel('table-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, handler)
  .subscribe();

// Cleanup in useEffect return
return () => { supabase.removeChannel(channel); };
```

## RLS Policies
- Always enable RLS on new tables
- Check policies in Supabase dashboard → Authentication → Policies

## Common Queries
```typescript
// Fetch all tasks
const { data } = await supabase.from('tasks').select('*');

// Insert
const { data, error } = await supabase.from('tasks').insert({ ... }).select();

// Update
const { error } = await supabase.from('tasks').update({ status: 'done' }).eq('id', id);

// Delete
const { error } = await supabase.from('tasks').delete().eq('id', id);
```
