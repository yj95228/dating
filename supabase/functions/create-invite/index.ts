import { createClient } from 'npm:@supabase/supabase-js@2.98.0'
import { createInviteHandler } from './handler.ts'

Deno.serve(createInviteHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  appUrl: Deno.env.get('APP_URL') ?? '',
}, createClient))
