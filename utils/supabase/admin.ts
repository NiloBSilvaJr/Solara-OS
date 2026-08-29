import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente com chave secreta (service role). Use SOMENTE em rotas de API no servidor.
// Nunca importe este arquivo em componentes de cliente.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

export const createAdminClient = () =>
  createSupabaseClient(supabaseUrl!, supabaseSecretKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
