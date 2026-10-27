import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Importações modernas e seguras para o Deno
import { cert, getApps, initializeApp } from "npm:firebase-admin/app";
import { getMessaging } from "npm:firebase-admin/messaging";

const serviceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
if (!serviceAccountStr) throw new Error('Chave do Firebase não encontrada!');

const serviceAccount = JSON.parse(serviceAccountStr);

// Nova forma de verificar e inicializar sem dar erro de "length"
if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

serve(async (req) => {
  try {
    const payload = await req.json();
    const comunicado = payload.record;

    if (!comunicado) throw new Error("Nenhum dado recebido do banco.");

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let query = supabase.from('perfis').select('fcm_token').not('fcm_token', 'is', null);

    if (comunicado.tipo === 'MANUTENÇÃO') {
      query = query.eq('notifica_manutencao', true);
    } else if (comunicado.tipo === 'SOCIAL') {
      query = query.eq('notifica_social', true);
    }

    const { data: perfis, error } = await query;
    if (error) throw error;

    const tokens = perfis.map((p: any) => p.fcm_token).filter(Boolean);

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ message: "Ninguém para notificar." }), { status: 200 });
    }

    const message = {
      notification: {
        title: `[${comunicado.tipo}] ${comunicado.titulo}`,
        body: comunicado.texto,
      },
      // --- Configuração para PWA/Web ---
      webpush: {
        notification: {
          // Ícone público no bucket de assets do próprio projeto Supabase.
          // Derivado de SUPABASE_URL (injetado pela Supabase na função),
          // sem URL fixa no código.
          icon: `${supabaseUrl}/storage/v1/object/public/assets/condoowl_1mb.jpg`,
        }
      },
      // ----------------------------------------------
      tokens: tokens,
    };

    // Nova forma de chamar o módulo de mensagens
    const response = await getMessaging().sendEachForMulticast(message);

    return new Response(JSON.stringify({ success: true, disparos: response.successCount }), {
      headers: { "Content-Type": "application/json" },
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
})