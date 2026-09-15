import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { useTodayHabits } from "@/components/TodayHabitsRow";
import { format } from "date-fns";
import { Sparkles } from "lucide-react";

const SUGGESTIONS = [
  { title: "5-minute walk", body: "Get up. Windows count.", url: null as string | null },
  { title: "Duolingo lesson", body: "One tiny language win.", url: "https://www.duolingo.com" as string | null },
  { title: "Stella manifestation", body: "Reconnect to your bigger picture.", url: "https://www.thestella.app" as string | null },
  { title: "Box breathing (4·4·4·4)", body: "Slow it down for four rounds.", url: null as string | null },
  { title: "Water + stretch", body: "Neck, shoulders, deep breath.", url: null as string | null },
];

function isQuiet(now: Date, start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

export function BreakNudger() {
  const { data: profile } = useProfile();
  const { habits, logs } = useTodayHabits();
  const [open, setOpen] = useState(false);
  const [pick] = useState(() => SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)]);
  const lastRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!profile) return;
    const interval = Math.max(15, profile.nudge_interval_min) * 60 * 1000;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (isQuiet(new Date(), profile.quiet_start, profile.quiet_end)) return;
      if (Date.now() - lastRef.current < interval) return;
      lastRef.current = Date.now();
      setOpen(true);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [profile]);

  const log = async (activity: string) => {
    setOpen(false);
    lastRef.current = Date.now();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("break_logs").insert({ user_id: u.user.id, activity });
    toast.success("Nice — logged your rest.");
  };

  const today = format(new Date(), "yyyy-MM-dd");
  const unloggedHabit = habits.find((h) => !logs.some((l) => l.habit_id === h.id && l.log_date === today));

  const logHabit = async () => {
    if (!unloggedHabit) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("habit_logs").insert({ user_id: u.user.id, habit_id: unloggedHabit.id, log_date: today });
    await supabase.from("break_logs").insert({ user_id: u.user.id, activity: `Habit: ${unloggedHabit.title}` });
    toast.success(`Habit logged — nicely done.`);
    setOpen(false);
    lastRef.current = Date.now();
  };

  if (!open || !pick) return null;
  return (
    <div className="fixed bottom-24 right-4 z-50 w-80 rounded-2xl border border-border bg-card p-4 shadow-lg md:bottom-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">gentle nudge</p>
      <h3 className="mt-1 font-display text-lg">Time to breathe.</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Instead of scrolling, try: <span className="text-foreground">{pick.title}</span> — {pick.body}
      </p>

      {unloggedHabit && (
        <button
          onClick={logHabit}
          className="mt-3 flex w-full items-start gap-2 rounded-lg border border-dashed border-border p-2.5 text-left text-sm hover:bg-secondary/60"
        >
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--bucket-habits)" }} />
          <span>
            Or knock out a habit → <span className="font-medium">{unloggedHabit.title}</span>
          </span>
        </button>
      )}

      <div className="mt-3 flex gap-2">
        {pick.url && (
          <a
            href={pick.url}
            target="_blank"
            rel="noreferrer"
            onClick={() => log(pick.title)}
            className="flex-1 rounded-lg bg-primary px-3 py-2 text-center text-sm text-primary-foreground"
          >
            Open
          </a>
        )}
        <button
          onClick={() => log(pick.title)}
          className="flex-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
        >
          Done
        </button>
        <button
          onClick={() => { setOpen(false); lastRef.current = Date.now() - 15 * 60 * 1000; }}
          className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
        >
          Snooze
        </button>
      </div>
    </div>
  );
}
