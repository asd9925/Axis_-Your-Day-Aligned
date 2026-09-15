import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionUser } from "@/hooks/useProfile";
import { useTier } from "@/lib/tiers";
import { LockedFeature } from "@/components/LockedFeature";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Flame, Sprout, Ban } from "lucide-react";
import { format, subDays, isSameDay } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/habits")({
  component: HabitsPage,
});

type Habit = { id: string; user_id: string; title: string; created_at: string; kind: "build" | "break" };
type HabitLog = { id: string; habit_id: string; log_date: string };

function HabitsPage() {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"build" | "break">("build");
  const { hasFeature } = useTier();
  const canUnlimited = hasFeature("unlimited_habits");
  const dragState = useRef<{ habitId: string; touched: Set<string> } | null>(null);

  const { data: habits = [] } = useQuery({
    queryKey: ["habits", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as Habit[];
      const { data, error } = await supabase.from("habits").select("*").eq("user_id", user.id).order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Habit[];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["habit_logs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as HabitLog[];
      const since = format(subDays(new Date(), 30), "yyyy-MM-dd");
      const { data, error } = await supabase.from("habit_logs").select("*").eq("user_id", user.id).gte("log_date", since);
      if (error) throw error;
      return (data ?? []) as HabitLog[];
    },
  });

  const FREE_HABIT_CAP = 3;
  const atFreeCap = !canUnlimited && habits.length >= FREE_HABIT_CAP;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;
    if (atFreeCap) {
      toast.error(`Free plan caps at ${FREE_HABIT_CAP} habits. Upgrade or unlock unlimited habits.`);
      return;
    }
    const { error } = await supabase.from("habits").insert({ user_id: user.id, title: title.trim(), kind } as never);
    if (error) return toast.error(error.message);
    setTitle("");
    qc.invalidateQueries({ queryKey: ["habits"] });
  };

  const remove = async (id: string) => {
    await supabase.from("habits").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["habits"] });
  };

  const toggle = async (habit: Habit, date: Date) => {
    if (!user) return;
    const d = format(date, "yyyy-MM-dd");
    const existing = logs.find((l) => l.habit_id === habit.id && l.log_date === d);
    if (existing) await supabase.from("habit_logs").delete().eq("id", existing.id);
    else await supabase.from("habit_logs").insert({ user_id: user.id, habit_id: habit.id, log_date: d });
    qc.invalidateQueries({ queryKey: ["habit_logs"] });
  };

  const markDone = async (habit: Habit, date: Date) => {
    if (!user) return;
    const d = format(date, "yyyy-MM-dd");
    if (logs.some((l) => l.habit_id === habit.id && l.log_date === d)) return;
    await supabase.from("habit_logs").insert({ user_id: user.id, habit_id: habit.id, log_date: d });
    qc.invalidateQueries({ queryKey: ["habit_logs"] });
  };

  const beginDrag = (habit: Habit, date: Date) => {
    const key = habit.id + ":" + format(date, "yyyy-MM-dd");
    dragState.current = { habitId: habit.id, touched: new Set([key]) };
  };
  const dragOver = (habit: Habit, date: Date) => {
    const s = dragState.current;
    if (!s || s.habitId !== habit.id) return;
    const key = habit.id + ":" + format(date, "yyyy-MM-dd");
    if (s.touched.has(key)) return;
    s.touched.add(key);
    markDone(habit, date);
  };
  const endDrag = () => { dragState.current = null; };

  const days = Array.from({ length: 14 }, (_, i) => subDays(new Date(), 13 - i));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-10 md:py-10">
      <header className="mb-6">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Habits</p>
        <h1 className="mt-1 font-display text-3xl md:text-4xl">Small, daily. That's the trick.</h1>
      </header>

      <form onSubmit={add} className="mb-6 space-y-2">
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              atFreeCap
                ? `Free plan: ${FREE_HABIT_CAP} habits max — unlock unlimited below`
                : kind === "build"
                  ? "e.g. Drink water · 10-min walk · Journal"
                  : "e.g. No phone in bed · Skip soda · No doomscroll"
            }
            disabled={atFreeCap}
          />
          <Button type="submit" disabled={!title.trim() || atFreeCap}><Plus className="mr-1 h-4 w-4" /> Add</Button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setKind("build")}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
              kind === "build" ? "border-transparent text-background" : "border-border text-muted-foreground hover:border-foreground/40"
            }`}
            style={{ backgroundColor: kind === "build" ? "var(--bucket-habits)" : "transparent" }}
          >
            <Sprout className="h-3 w-3" /> Build
          </button>
          <button
            type="button"
            onClick={() => setKind("break")}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
              kind === "break" ? "border-transparent text-background" : "border-border text-muted-foreground hover:border-foreground/40"
            }`}
            style={{ backgroundColor: kind === "break" ? "var(--primary)" : "transparent" }}
          >
            <Ban className="h-3 w-3" /> Break
          </button>
          <span className="ml-auto self-center text-xs text-muted-foreground">
            {habits.length}{canUnlimited ? "" : `/${FREE_HABIT_CAP}`} habits
          </span>
        </div>
        {atFreeCap && (
          <LockedFeature featureKey="unlimited_habits" compact />
        )}
      </form>

      <div className="space-y-3">
        {habits.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Start with one habit. Really.
          </div>
        )}
        {habits.map((h) => {
          const hLogs = logs.filter((l) => l.habit_id === h.id);
          const streak = computeStreak(hLogs);
          const isBreak = h.kind === "break";
          const accent = isBreak ? "var(--primary)" : "var(--bucket-habits)";
          return (
            <div key={h.id} className="rounded-2xl border bg-card p-4" style={{ borderLeft: `3px solid ${accent}` }}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{h.title}</h3>
                    <span
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
                      style={{ backgroundColor: `color-mix(in oklab, ${accent} 15%, transparent)`, color: accent }}
                    >
                      {isBreak ? <><Ban className="h-2.5 w-2.5" /> breaking</> : <><Sprout className="h-2.5 w-2.5" /> building</>}
                    </span>
                  </div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Flame className="h-3 w-3" /> {streak}-day {isBreak ? "clean" : ""} streak
                  </p>
                </div>
                <button onClick={() => remove(h.id)} className="rounded p-1 text-muted-foreground hover:bg-secondary">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div
                className="flex gap-1 overflow-x-auto select-none"
                onPointerUp={endDrag}
                onPointerLeave={endDrag}
                onPointerCancel={endDrag}
              >
                {days.map((d) => {
                  const done = hLogs.some((l) => isSameDay(new Date(l.log_date), d));
                  const isToday = isSameDay(d, new Date());
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => toggle(h, d)}
                      onPointerDown={(e) => {
                        // Only start drag on primary button; still allow click to fire for single toggle
                        if (e.button === 0) beginDrag(h, d);
                      }}
                      onPointerEnter={() => dragOver(h, d)}
                      title={isBreak ? (done ? "Clean day" : "Tap if you avoided it, drag to mark a streak") : (done ? "Done" : "Tap to log, drag across days")}
                      className={`flex flex-col items-center rounded-md border p-2 text-[10px] transition touch-none ${
                        done ? "border-transparent text-background" : "border-border text-muted-foreground hover:border-foreground/40"
                      } ${isToday ? "ring-2 ring-foreground/20" : ""}`}
                      style={{ backgroundColor: done ? accent : "transparent", minWidth: 40 }}
                    >
                      <span>{format(d, "EEEEE")}</span>
                      <span className={`text-sm ${done ? "font-bold" : ""}`}>{format(d, "d")}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function computeStreak(logs: HabitLog[]) {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = format(subDays(new Date(), i), "yyyy-MM-dd");
    if (logs.some((l) => l.log_date === d)) streak++;
    else if (i === 0) continue; // today may not yet be logged
    else break;
  }
  return streak;
}
