import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionUser } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, isSameDay } from "date-fns";
import { Check } from "lucide-react";
import { toast } from "sonner";

type Habit = { id: string; title: string };
type HabitLog = { id: string; habit_id: string; log_date: string };

export function useTodayHabits() {
  const { user } = useSessionUser();
  const habits = useQuery({
    queryKey: ["habits", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as Habit[];
      const { data } = await supabase.from("habits").select("id,title").eq("user_id", user.id).order("created_at");
      return (data ?? []) as Habit[];
    },
  });
  const logs = useQuery({
    queryKey: ["habit_logs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as HabitLog[];
      const since = format(subDays(new Date(), 14), "yyyy-MM-dd");
      const { data } = await supabase.from("habit_logs").select("*").eq("user_id", user.id).gte("log_date", since);
      return (data ?? []) as HabitLog[];
    },
  });
  return { habits: habits.data ?? [], logs: logs.data ?? [] };
}

export function TodayHabitsRow() {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const { habits, logs } = useTodayHabits();
  const today = format(new Date(), "yyyy-MM-dd");

  const toggle = async (habitId: string) => {
    if (!user) return;
    const existing = logs.find((l) => l.habit_id === habitId && l.log_date === today);
    if (existing) {
      await supabase.from("habit_logs").delete().eq("id", existing.id);
    } else {
      await supabase.from("habit_logs").insert({ user_id: user.id, habit_id: habitId, log_date: today });
      toast.success("Nice — habit logged.");
    }
    qc.invalidateQueries({ queryKey: ["habit_logs"] });
  };

  if (habits.length === 0) return null;

  const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg">Today's habits</h2>
        <span className="text-xs text-muted-foreground">Tap to check off</span>
      </div>
      <ul className="space-y-2">
        {habits.map((h) => {
          const doneToday = logs.some((l) => l.habit_id === h.id && l.log_date === today);
          return (
            <li key={h.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
              <button
                onClick={() => toggle(h.id)}
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition ${
                  doneToday ? "border-transparent text-background" : "border-border text-transparent hover:border-foreground/40"
                }`}
                style={{ backgroundColor: doneToday ? "var(--bucket-habits)" : "transparent" }}
                aria-label={doneToday ? "Undo" : "Mark done"}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <span className={`flex-1 text-sm ${doneToday ? "text-muted-foreground line-through" : ""}`}>{h.title}</span>
              <div className="flex gap-1">
                {days.map((d) => {
                  const dstr = format(d, "yyyy-MM-dd");
                  const done = logs.some((l) => l.habit_id === h.id && l.log_date === dstr);
                  return (
                    <span
                      key={dstr}
                      title={format(d, "EEE MMM d") + (done ? " ✓" : "")}
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: done
                          ? "var(--bucket-habits)"
                          : isSameDay(d, new Date())
                            ? "color-mix(in oklab, var(--bucket-habits) 20%, transparent)"
                            : "var(--border)",
                      }}
                    />
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HabitsRing() {
  const { habits, logs } = useTodayHabits();
  const today = format(new Date(), "yyyy-MM-dd");
  const done = habits.filter((h) => logs.some((l) => l.habit_id === h.id && l.log_date === today)).length;
  const total = habits.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const size = 96;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} stroke="var(--muted)" fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            stroke="var(--bucket-habits)"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 400ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-display text-xl">{pct}%</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium">Today's habits</p>
        <p className="text-xs text-muted-foreground">
          {done} of {total || "—"} logged
        </p>
      </div>
    </div>
  );
}
