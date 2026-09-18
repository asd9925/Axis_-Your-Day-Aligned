import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/google-calendar-callback")({
  component: GoogleCalendarCallback,
});

function GoogleCalendarCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) {
      navigate({ to: '/' });
      return;
    }

    // Get current session access token to authenticate the server exchange
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      fetch('/_/fn/exchangeGoogleCode', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ code }),
      })
        .then((r) => r.json())
        .then(() => {
          if (window.opener) {
            window.opener.postMessage({ type: 'google-calendar-connected', ok: true }, window.location.origin);
            window.close();
          } else {
            navigate({ to: '/_authenticated/settings' });
          }
        })
        .catch(() => {
          if (window.opener) {
            window.opener.postMessage({ type: 'google-calendar-connected', ok: false }, window.location.origin);
            window.close();
          } else {
            navigate({ to: '/_authenticated/settings' });
          }
        });
    });
  }, [navigate]);

  return <div className="p-8">Connecting Google Calendar…</div>;
}
