import { createClient } from '@supabase/supabase-js';

const url = "https://jlbcfovlqdqxawshfgld.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsYmNmb3ZscWRxeGF3c2hmZ2xkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MDMxNzIsImV4cCI6MjA4Njk3OTE3Mn0.2FQ6GKlbYAoZ0BUr4uAj6EABMk5LYlUJGWNDkkvKrxY";

const supabase = createClient(url, key);

async function run() {
  console.log('Testing connection...');
  try {
    const { data: roles, error: rolesEx } = await supabase.from('user_roles').select('*').limit(1);
    console.log('Roles:', roles, rolesEx);
    
    // Auth get session doesn't work without token, but let's query profiles
    const { data, error } = await supabase.from('profiles').select('*').limit(1);
    console.log('Profiles:', data, error);

    const { data: tasks, error: tasksError } = await supabase.from('tasks').select('*').limit(1);
    console.log('Tasks:', tasks, tasksError);
  } catch(e) {
    console.error('Crash:', e);
  }
}

run();
