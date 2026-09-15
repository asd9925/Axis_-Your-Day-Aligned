import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionUser } from "@/hooks/useProfile";
import { format, subDays, isSameDay, startOfWeek, isAfter } from "date-fns";
import { Coffee, ExternalLink, Sparkles, Check } from "lucide-react";
import { useTodayHabits } from "@/components/TodayHabitsRow";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/breaks")({
  component: BreaksPage,
});

const ALT_TO_SCROLLING = [
  { title: "Duolingo lesson", body: "5 minutes. Tiny win, real streak.", url: "https://www.duolingo.com" },
  { title: "Stella manifestation", body: "Reconnect with your dream day.", url: "https://www.thestella.app" },
  { title: "Step outside", body: "Sun on your face for 3 minutes.", url: null },
  { title: "Water + stretch", body: "Refill. Neck rolls. Shoulder shrug.", url: null },
  { title: "Box breathing", body: "4 in · 4 hold · 4 out · 4 hold. ×4.", url: null },
  { title: "Text someone you love", body: "One sentence is enough.", url: null },
  { title: "Tidy 1 square meter", body: "Just what's in front of you.", url: null },
];

function BreaksPage() {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const { habits, logs: habitLogs } = useTodayHabits();
  const { data: logs = [] } = useQuery({
    queryKey: ["break_logs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as { taken_at: string; activity: string }[];
      const { data } = await supabase.from("break_logs").select("*").eq("user_id", user.id)
        .gte("taken_at", subDays(new Date(), 30).toISOString()).order("taken_at", { ascending: false });
      return data ?? [];
    },
  });

  const days = Array.from({ length: 14 }, (_, i) => subDays(new Date(), 13 - i));
  const todayCount = logs.filter((l) => isSameDay(new Date(l.taken_at), new Date())).length;
  const weekStart = startOfWeek(new Date());
  const weekCount = logs.filter((l) => isAfter(new Date(l.taken_at), weekStart)).length;

  // best day by weekday name
  const byDow = new Map<string, number>();
  for (const l of logs) {
    const key = format(new Date(l.taken_at), "EEE");
    byDow.set(key, (byDow.get(key) ?? 0) + 1);
  }
  let bestDay = "—";
  let bestCount = 0;
  for (const [k, v] of byDow.entries()) if (v > bestCount) { bestDay = k; bestCount = v; }

  const today = format(new Date(), "yyyy-MM-dd");
  const unlogged = habits.filter((h) => !habitLogs.some((l) => l.habit_id === h.id && l.log_date === today));

  const logHabit = async (habitId: string, title: string) => {
    if (!user) return;
    await supabase.from("habit_logs").insert({ user_id: user.id, habit_id: habitId, log_date: today });
    await supabase.from("break_logs").insert({ user_id: user.id, activity: `Habit: ${title}` });
    toast.success("Two birds, one break.");
    qc.invalidateQueries({ queryKey: ["habit_logs"] });
    qc.invalidateQueries({ queryKey: ["break_logs"] });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-10 md:py-10">
      <header className="mb-6">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Breaks</p>
        <h1 className="mt-1 font-display text-3xl md:text-4xl">Rest is part of the work.</h1>
      </header>

      <section className="mb-8 rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <Coffee className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Today: {todayCount} · This week: {weekCount} · Best day: {bestDay}</p>
              <p className="text-sm text-muted-foreground">Aim for 3–5. Little pauses, big compounding.</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1">
          {days.map((d) => {
            const count = logs.filter((l) => isSameDay(new Date(l.taken_at), d)).length;
            const opacity = count === 0 ? 0.08 : Math.min(1, 0.3 + count * 0.2);
            const isToday = isSameDay(d, new Date());
            return (
              <div key={d.toISOString()} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="h-16 w-full rounded-md transition-colors"
                  style={{ backgroundColor: `color-mix(in oklab, var(--bucket-later) ${opacity * 100}%, transparent)` }}
                  title={`${count} break${count === 1 ? "" : "s"} · ${format(d, "EEE MMM d")}`}
                />
                <span className={`text-[10px] uppercase ${isToday ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                  {format(d, "EEEEE")}
                </span>
                <span className="text-[9px] text-muted-foreground/70">{format(d, "d")}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          14-day history · darker = more breaks
        </p>
      </section>

      {unlogged.length > 0 && (
        <section className="mb-8 rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--bucket-habits)" }} />
            <h2 className="font-display text-xl">Pair a break with a habit</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Rests are a great time to knock out something small you want to build.
          </p>
          <div className="flex flex-wrap gap-2">
            {unlogged.map((h) => (
              <button
                key={h.id}
                onClick={() => logHabit(h.id, h.title)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-3 py-1.5 text-sm hover:bg-secondary"
              >
                <Check className="h-3 w-3" />
                {h.title}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-xl">Instead of scrolling…</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ALT_TO_SCROLLING.map((s) => (
            <div key={s.title} className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-medium">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              {s.url && (
                <a href={s.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
