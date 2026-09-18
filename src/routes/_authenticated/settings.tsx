import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfile, useSessionUser } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { connectAppUser } from "@/integrations/lovable/appUserConnectorClient";
import {
  startGoogleCalendarConnect,
  saveGoogleConnection,
  disconnectGoogleCalendar,
  getGoogleStatus,
  syncGoogleCalendar,
  setGoogleSyncEnabled,
  repairGoogleRecurrences,
} from "@/lib/google-calendar.functions";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const PRESETS = [
  { name: "Terracotta", today: "#C67B5C", later: "#7A9E8E", habits: "#E8C07D", recurring: "#7C6AA8" },
  { name: "Dusk",       today: "#7C6AA8", later: "#6E9AC7", habits: "#D9A7C1", recurring: "#5B8266" },
  { name: "Forest",     today: "#5B8266", later: "#A3B18A", habits: "#DDB892", recurring: "#6E9AC7" },
  { name: "Ocean",      today: "#3C6E91", later: "#7FB2C5", habits: "#F0C987", recurring: "#8E7CC3" },
  { name: "Sunset",     today: "#D8737F", later: "#F4A261", habits: "#E9C46A", recurring: "#6E9AC7" },
];

function SettingsPage() {
  const { user } = useSessionUser();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    display_name: "",
    color_today: "#C67B5C",
    color_later: "#7A9E8E",
    color_habits: "#E8C07D",
    color_recurring: "#7C6AA8",
    nudge_interval_min: 75,
    quiet_start: "22:00",
    quiet_end: "07:00",
    auto_complete_parent: true,
    parked_cutoff_days: 14,
  });

  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.display_name ?? "",
        color_today: profile.color_today,
        color_later: profile.color_later,
        color_habits: profile.color_habits,
        color_recurring: profile.color_recurring ?? "#7C6AA8",
        nudge_interval_min: profile.nudge_interval_min,
        quiet_start: profile.quiet_start,
        quiet_end: profile.quiet_end,
        auto_complete_parent: profile.auto_complete_parent,
        parked_cutoff_days: profile.parked_cutoff_days ?? 14,
      });
    }
  }, [profile]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("profiles").update(form).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Saved.");
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  const applyPreset = (p: typeof PRESETS[number]) => {
    setForm((f) => ({ ...f, color_today: p.today, color_later: p.later, color_habits: p.habits, color_recurring: p.recurring }));
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-10 md:py-10">
      <header className="mb-6">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Settings</p>
        <h1 className="mt-1 font-display text-3xl md:text-4xl">Make it yours.</h1>
      </header>

      <form onSubmit={save} className="space-y-8">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 font-display text-lg">Profile</h2>
          <Label>Display name</Label>
          <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="mt-1" />
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-1 font-display text-lg">Your colors</h2>
          <p className="mb-4 text-sm text-muted-foreground">Tint each bucket. Pick a preset or set your own.</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-secondary"
              >
                <span className="flex gap-0.5">
                  <span className="h-3 w-3 rounded-full" style={{ background: p.today }} />
                  <span className="h-3 w-3 rounded-full" style={{ background: p.later }} />
                  <span className="h-3 w-3 rounded-full" style={{ background: p.habits }} />
                  <span className="h-3 w-3 rounded-full" style={{ background: p.recurring }} />
                </span>
                {p.name}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <ColorField label="Must do today" value={form.color_today} onChange={(v) => setForm({ ...form, color_today: v })} />
            <ColorField label="Can wait" value={form.color_later} onChange={(v) => setForm({ ...form, color_later: v })} />
            <ColorField label="Habits" value={form.color_habits} onChange={(v) => setForm({ ...form, color_habits: v })} />
            <ColorField label="Recurring events" value={form.color_recurring} onChange={(v) => setForm({ ...form, color_recurring: v })} />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-1 font-display text-lg">Break nudges</h2>
          <p className="mb-4 text-sm text-muted-foreground">A gentle prompt to breathe instead of scroll.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Every (minutes)</Label>
              <Input type="number" min={15} max={240} value={form.nudge_interval_min}
                onChange={(e) => setForm({ ...form, nudge_interval_min: parseInt(e.target.value || "75") })} className="mt-1" />
            </div>
            <div>
              <Label>Quiet from</Label>
              <Input type="time" value={form.quiet_start} onChange={(e) => setForm({ ...form, quiet_start: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Quiet until</Label>
              <Input type="time" value={form.quiet_end} onChange={(e) => setForm({ ...form, quiet_end: e.target.value })} className="mt-1" />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-1 font-display text-lg">Parked-task nudge</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            After this many days, tasks in "Can wait" get a gentle "ready to promote?" chip. No rush — you can always snooze.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Cutoff (days)</Label>
              <Input type="number" min={7} max={60} value={form.parked_cutoff_days}
                onChange={(e) => setForm({ ...form, parked_cutoff_days: Math.max(7, Math.min(60, parseInt(e.target.value || "14"))) })} className="mt-1" />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.auto_complete_parent}
              onChange={(e) => setForm({ ...form, auto_complete_parent: e.target.checked })}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">Auto-complete parent tasks</span>
              <span className="block text-sm text-muted-foreground">When all subtasks are checked, the main task is marked done.</span>
            </span>
          </label>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-1 font-display text-lg">Your rhythm</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Optional preferences that help "Plan my day" pick times that fit how you actually work.
          </p>
          <Link to="/rhythm" className="text-sm font-medium underline underline-offset-4">
            Edit rhythm →
          </Link>
        </section>

        <GoogleCalendarSection />

        <div className="flex justify-end">
          <Button type="submit">Save changes</Button>
        </div>
      </form>
    </div>
  );
}

function GoogleCalendarSection() {
  const qc = useQueryClient();
  const getStatus = useServerFn(getGoogleStatus);
  const startFn = useServerFn(startGoogleCalendarConnect);
  const saveFn = useServerFn(saveGoogleConnection);
  const disconnectFn = useServerFn(disconnectGoogleCalendar);
  const syncFn = useServerFn(syncGoogleCalendar);
  const setEnabledFn = useServerFn(setGoogleSyncEnabled);
  const repairFn = useServerFn(repairGoogleRecurrences);

  const { data: status, refetch } = useQuery({
    queryKey: ["google-status"],
    queryFn: () => getStatus(),
  });
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const redirectUri = import.meta.env.VITE_GOOGLE_OAUTH_REDIRECT;
      if (!clientId || !redirectUri) {
        toast.error('Missing Google OAuth client config');
        return;
      }

      const scope = encodeURIComponent('openid email profile https://www.googleapis.com/auth/calendar');
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=code&scope=${scope}&redirect_uri=${encodeURIComponent(
        redirectUri,
      )}&access_type=offline&prompt=consent`;

      const win = window.open(url, 'gc', 'width=600,height=700');
      if (!win) {
        toast.error('Popup blocked');
        return;
      }

      const onMessage = async (e: MessageEvent) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type !== 'google-calendar-connected') return;
        window.removeEventListener('message', onMessage);
        if (e.data.ok) {
          toast.success('Google Calendar connected.');
          try {
            await refetch();
          } catch {}
          qc.invalidateQueries({ queryKey: ['events'] });
          qc.invalidateQueries({ queryKey: ['google-status'] });
        } else {
          toast.error('Google Calendar connect failed');
        }
      };

      window.addEventListener('message', onMessage);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Google Calendar? Your Axis events stay, but the link is broken.")) return;
    setBusy(true);
    try {
      await disconnectFn();
      toast.success("Disconnected.");
      await refetch();
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["google-status"] });
    } finally {
      setBusy(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const r = await syncFn();
      toast.success(`Synced. ${r.imported} pulled, ${r.deleted} removed.`);
      qc.invalidateQueries({ queryKey: ["events"] });
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const toggleSync = async (enabled: boolean) => {
    await setEnabledFn({ data: { enabled } });
    await refetch();
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">Google Calendar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Two-way sync. Axis events push to Google, Google events show up in Axis.
          </p>
        </div>
        {status?.connected ? (
          <span className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">Connected</span>
        ) : null}
      </div>

      {status?.connected ? (
        <div className="mt-4 space-y-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Account: </span>
            <span className="font-medium">{status.email ?? "connected"}</span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={status.syncEnabled}
              onChange={(e) => toggleSync(e.target.checked)}
            />
            <span>Sync events both ways</span>
          </label>
          {status.lastSyncedAt && (
            <p className="text-xs text-muted-foreground">
              Last sync: {new Date(status.lastSyncedAt).toLocaleString()}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={runSync} disabled={syncing}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              Sync now
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const r = await repairFn();
                  toast.success(
                    r.repaired > 0
                      ? `Fixed ${r.repaired} recurring event${r.repaired === 1 ? "" : "s"}.`
                      : "Nothing to fix — all imported recurrences look good.",
                  );
                  qc.invalidateQueries({ queryKey: ["events"] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Repair failed");
                }
              }}
            >
              Fix imported recurrences
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={disconnect} disabled={busy}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Button type="button" onClick={connect} disabled={busy}>
            {busy ? "Connecting…" : "Connect Google Calendar"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Opens a Google sign-in popup. You'll be asked to grant read + write access to your calendar.
          </p>
        </div>
      )}
    </section>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-border bg-transparent" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-sm" />
      </div>
    </div>
  );
}
