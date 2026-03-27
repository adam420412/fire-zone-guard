import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const anonKeyMatch = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY="(.*?)"/);
const urlMatch = env.match(/VITE_SUPABASE_URL="(.*?)"/);

const anonKey = anonKeyMatch ? anonKeyMatch[1] : null;
const url = urlMatch ? urlMatch[1] : null;

if (!anonKey || !url) {
  console.log("Could not find keys in .env");
  process.exit(1);
}

const fetchUrl = url + '/rest/v1/buildings?select=*';
console.log("Starting fetch to Supabase...");

async function test() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    console.log("TIMEOUT REACHED: Postgres is hung.");
  }, 10000); // 10s timeout
  
  try {
    const start = Date.now();
    const res = await fetch(fetchUrl, {
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey
      },
      signal: controller.signal
    });
    console.log(`Status: ${res.status} (took ${Date.now() - start}ms)`);
    const text = await res.text();
    console.log("Response preview: " + text.substring(0, 100));
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log("FETCH HUNG: Supabase is locked (RLS infinite loop is active).");
    } else {
      console.log("Fetch failed: " + e.message);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
test();
