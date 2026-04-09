import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2/cors';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
  if (!TELEGRAM_API_KEY) {
    return new Response(JSON.stringify({ error: 'TELEGRAM_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let totalProcessed = 0;
  let linkedAccounts = 0;

  // Read initial offset
  const { data: state, error: stateErr } = await supabase
    .from('telegram_bot_state')
    .select('update_offset')
    .eq('id', 1)
    .single();

  if (stateErr) {
    return new Response(JSON.stringify({ error: stateErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let currentOffset = state.update_offset;

  // Helper: send message via gateway
  async function sendMessage(chatId: number, text: string) {
    await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TELEGRAM_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  }

  // Poll loop
  while (true) {
    const elapsed = Date.now() - startTime;
    const remainingMs = MAX_RUNTIME_MS - elapsed;
    if (remainingMs < MIN_REMAINING_MS) break;

    const timeout = Math.min(50, Math.floor(remainingMs / 1000) - 5);
    if (timeout < 1) break;

    const response = await fetch(`${GATEWAY_URL}/getUpdates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TELEGRAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        offset: currentOffset,
        timeout,
        allowed_updates: ['message'],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const updates = data.result ?? [];
    if (updates.length === 0) continue;

    for (const update of updates) {
      const msg = update.message;
      if (!msg?.text) continue;

      const chatId = msg.chat.id;
      const text = msg.text.trim();
      totalProcessed++;

      // Handle /start with link code
      if (text.startsWith('/start')) {
        const parts = text.split(/\s+/);
        const linkCode = parts[1];

        if (!linkCode) {
          await sendMessage(chatId,
            '👋 <b>Witaj w Fire Zone Guard!</b>\n\n' +
            'Aby połączyć konto, wygeneruj kod w aplikacji:\n' +
            '📱 Ustawienia → Mój profil → <b>Połącz Telegram</b>\n\n' +
            'Następnie wyślij tutaj:\n<code>/start TWÓJ_KOD</code>'
          );
          continue;
        }

        // Validate token
        const { data: tokenRow, error: tokenErr } = await supabase
          .from('telegram_link_tokens')
          .select('*')
          .eq('token', linkCode)
          .eq('used', false)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (tokenErr || !tokenRow) {
          await sendMessage(chatId,
            '❌ <b>Nieprawidłowy lub wygasły kod.</b>\n\n' +
            'Wygeneruj nowy kod w aplikacji:\n📱 Ustawienia → Mój profil → Połącz Telegram'
          );
          continue;
        }

        // Link account: update profile with chat_id
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ telegram_chat_id: String(chatId) })
          .eq('user_id', tokenRow.user_id);

        if (updateErr) {
          await sendMessage(chatId, '⚠️ Wystąpił błąd podczas łączenia konta. Spróbuj ponownie.');
          console.error('Profile update error:', updateErr);
          continue;
        }

        // Mark token as used
        await supabase
          .from('telegram_link_tokens')
          .update({ used: true })
          .eq('id', tokenRow.id);

        linkedAccounts++;

        await sendMessage(chatId,
          '✅ <b>Konto zostało pomyślnie połączone!</b>\n\n' +
          '🔔 Od teraz będziesz otrzymywać powiadomienia o:\n' +
          '• Zmianach statusu zadań\n' +
          '• Nowych przypisaniach\n' +
          '• Zbliżających się terminach\n\n' +
          '🔥 Fire Zone Guard'
        );
        continue;
      }

      // Handle other messages
      await sendMessage(chatId,
        'ℹ️ Ten bot służy do powiadomień z systemu <b>Fire Zone Guard</b>.\n\n' +
        'Dostępne komendy:\n' +
        '/start KOD — Połącz konto z aplikacją'
      );
    }

    // Advance offset
    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    await supabase
      .from('telegram_bot_state')
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq('id', 1);

    currentOffset = newOffset;
  }

  return new Response(JSON.stringify({
    ok: true,
    processed: totalProcessed,
    linked: linkedAccounts,
    finalOffset: currentOffset,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
