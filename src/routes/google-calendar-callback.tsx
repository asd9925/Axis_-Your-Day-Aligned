import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export default function GoogleCalendarCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) {
      navigate({ to: '/' });
      return;
    }

    // Post code to server endpoint (createServerFn will expose a route)
    fetch('/_/fn/exchangeGoogleCode', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
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
  }, [navigate]);

  return <div className="p-8">Connecting Google Calendar…</div>;
}
