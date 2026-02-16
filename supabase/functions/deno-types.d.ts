declare module 'https://deno.land/std@0.177.0/http/server.ts' {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void
}

declare module 'https://esm.sh/@supabase/supabase-js@2.39.0' {
  export type SupabaseClient = any
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: { global?: { headers?: Record<string, string> } }
  ): SupabaseClient
}

declare module 'https://deno.land/x/zod@v3.22.4/mod.ts' {
  export const z: any
}

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
}

