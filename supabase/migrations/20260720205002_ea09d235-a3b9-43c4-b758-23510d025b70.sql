-- App user connections table (stores encrypted Google OAuth keys per user)
CREATE TABLE public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  account_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role touches this table.

CREATE TRIGGER app_user_connections_set_updated_at
  BEFORE UPDATE ON public.app_user_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Google sync fields on events (match rows to Google)
ALTER TABLE public.events
  ADD COLUMN google_event_id text,
  ADD COLUMN google_calendar_id text,
  ADD COLUMN google_etag text,
  ADD COLUMN google_updated_at timestamptz;

CREATE UNIQUE INDEX events_google_event_unique
  ON public.events (user_id, google_calendar_id, google_event_id)
  WHERE google_event_id IS NOT NULL;

-- Google sync preferences on profiles
ALTER TABLE public.profiles
  ADD COLUMN google_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN google_sync_calendar_id text DEFAULT 'primary',
  ADD COLUMN google_sync_token text,
  ADD COLUMN google_last_synced_at timestamptz;
