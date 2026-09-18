import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const exchangeGoogleCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((body: { code: string }) => body)
  .handler(async ({ data, context }) => {
    const code = data.code;
    if (!code) throw new Error("Missing code");

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT!,
        grant_type: "authorization_code",
      }),
    });

    const token = await tokenRes.json();
    if (!token || token.error) throw new Error(token.error_description || "Token exchange failed");

    // Expect refresh_token when using access_type=offline and prompt=consent
    const refreshToken = token.refresh_token as string | undefined;

    // Try to extract email from id_token if present
    let email: string | null = null;
    try {
      if (token.id_token) {
        const parts = token.id_token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          email = payload.email ?? null;
        }
      }
    } catch (e) {
      // ignore
    }

    // Store refresh token server-side using service role
    await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: context.userId,
          google_refresh_token: refreshToken ?? null,
          google_account_email: email,
          google_sync_enabled: !!refreshToken,
        },
        { onConflict: 'id' }
      );

    return { ok: true };
  });

export const refreshAccessToken = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => true)
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin.from('profiles').select('google_refresh_token').eq('id', context.userId).maybeSingle();
    const refreshToken = data?.google_refresh_token;
    if (!refreshToken) throw new Error('No refresh token stored');

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error_description || 'Failed to refresh token');
    return { ok: true, token: json };
  });
