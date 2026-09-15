import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionUser, useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Clock, Plus, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { format, setHours, setMinutes } from "date-fns";
import { ReshapeDayCard } from "@/components/ReshapeDayCard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TodayHabitsRow, HabitsRing } from "@/components/TodayHabitsRow";
import { NextBreakChip } from "@/components/NextBreakChip";
import { StaleParkedChip, isStale } from "@/components/StaleParkedChip";
import { TaskMaxButton } from "@/components/TaskMaxButton";
import { StreakBadge, todayStr as streakToday } from "@/components/StreakBadge";
import { WeeklyObjectivesToday } from "@/components/WeeklyObjectivesToday";

export const Route = createFileRoute("/_authenticated/today")({
  component: TodayPage,
});

type Task = {
  id: string;
  user_id: string;
  parent_id: string | null;
  title: string;
  bucket: "today" | "later";
  task_date: string;
  completed_at: string | null;
  position: number;
  due_time: string | null;
  first_parked_at: string | null;
  parked_snoozed_until: string | null;
};

const MAX_TOP = 5;

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function useTasks() {
  const { user } = useSessionUser();
  return useQuery({
    queryKey: ["tasks", user?.id, todayStr()],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as Task[];
      // Today's must-do tasks + all parked ("later") tasks regardless of date,
      // plus any subtasks whose parent is in either set.
      const { data: primary, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .is("parent_id", null)
        .or(`and(bucket.eq.today,task_date.eq.${todayStr()}),bucket.eq.later`)
        .order("position", { ascending: true });
      if (error) throw error;
      const parents = (primary ?? []) as Task[];
      if (parents.length === 0) return parents;
      const parentIds = parents.map((p) => p.id);
      const { data: subs } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .in("parent_id", parentIds)
        .order("position", { ascending: true });
      return [...parents, ...((subs ?? []) as Task[])];
    },
  });
}


function computeCompletion(tasks: Task[]) {
  // Weighted by leaves (subtasks or parents with no children)
  const parents = tasks.filter((t) => !t.parent_id);
  let done = 0, total = 0;
  for (const p of parents) {
    const kids = tasks.filter((t) => t.parent_id === p.id);
    if (kids.length === 0) {
      total += 1;
      if (p.completed_at) done += 1;
    } else {
      total += kids.length;
      done += kids.filter((k) => k.completed_at).length;
    }
  }
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

function TodayPage() {
  const { user } = useSessionUser();
  const { data: profile } = useProfile();
  const { data: tasks = [] } = useTasks();
  const qc = useQueryClient();

  const parentsToday = useMemo(() => tasks.filter((t) => !t.parent_id && t.bucket === "today"), [tasks]);
  const parentsLater = useMemo(() => tasks.filter((t) => !t.parent_id && t.bucket === "later"), [tasks]);
  const completion = useMemo(() => computeCompletion(tasks.filter((t) => t.bucket === "today" || tasks.find((p) => p.id === t.parent_id)?.bucket === "today")), [tasks]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const addTop = useMutation({
    mutationFn: async ({ title, bucket }: { title: string; bucket: "today" | "later" }) => {
      if (!user) throw new Error("no user");
      const existing = tasks.filter((t) => !t.parent_id && t.bucket === bucket);
      if (bucket === "today" && existing.length >= MAX_TOP) {
        throw new Error(`Cap of ${MAX_TOP} — finish or move one first.`);
      }
      const pos = existing.length;
      const { error } = await supabase.from("tasks").insert({
        user_id: user.id, title, bucket, position: pos, task_date: todayStr(),
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-10 md:py-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            {format(new Date(), "EEEE, MMMM d")}
          </p>
          <h1 className="mt-1 font-display text-4xl md:text-5xl">
            {greeting()}, {profile?.display_name ?? "friend"}.
          </h1>
          <div className="mt-3"><NextBreakChip /></div>
        </div>
        <div className="flex flex-wrap gap-3">
          <CompletionRing pct={completion.pct} done={completion.done} total={completion.total} />
          <HabitsRing />
          <StreakBadge qualified={completion.pct >= 95 && completion.total > 0} date={streakToday()} />
        </div>
      </header>

      <ReshapeDayCard />

      <WeeklyObjectivesToday date={new Date()} />



      <div className="grid gap-6 md:grid-cols-2">
        <TaskColumn
          title="Must do today"
          subtitle="The five that matter."
          bucket="today"
          color="var(--bucket-today)"
          tasks={tasks}
          parents={parentsToday}
          onAdd={(title) => addTop.mutate({ title, bucket: "today" })}
          cutoffDays={profile?.parked_cutoff_days ?? 14}
        />
        <TaskColumn
          title="Can wait"
          subtitle="Parked, not forgotten."
          bucket="later"
          color="var(--bucket-later)"
          tasks={tasks}
          parents={parentsLater}
          onAdd={(title) => addTop.mutate({ title, bucket: "later" })}
          cutoffDays={profile?.parked_cutoff_days ?? 14}
        />
      </div>

      <div className="mt-6">
        <TodayHabitsRow />
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function CompletionRing({ pct, done, total }: { pct: number; done: number; total: number }) {
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
            cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke}
            stroke="var(--bucket-today)" fill="none" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 400ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-display text-xl">{pct}%</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium">Today's progress</p>
        <p className="text-xs text-muted-foreground">{done} of {total || "—"} steps done</p>
      </div>
    </div>
  );
}

function TaskColumn({
  title, subtitle, bucket, color, tasks, parents, onAdd, cutoffDays,
}: {
  title: string; subtitle: string; bucket: "today" | "later"; color: string;
  tasks: Task[]; parents: Task[]; onAdd: (t: string) => void; cutoffDays: number;
}) {
  const [input, setInput] = useState("");
  const capped = bucket === "today";
  const atCap = capped && parents.length >= MAX_TOP;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          <div>
            <h2 className="font-display text-xl leading-tight">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {capped ? `${parents.length}/${MAX_TOP}` : parents.length}
        </span>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); if (!input.trim()) return; onAdd(input.trim()); setInput(""); }}
        className="mb-3 flex gap-2"
      >
        <Input
          placeholder={atCap ? "Full — finish or defer one" : bucket === "today" ? "What matters today?" : "Park it here"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={atCap}
        />
        <Button type="submit" size="icon" disabled={atCap || !input.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>


      <ul className="space-y-2">
        {parents.length === 0 && (
          <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing yet. Breathe.
          </li>
        )}
        {parents.map((p) => (
          <TaskItem
            key={p.id}
            task={p}
            subtasks={tasks.filter((t) => t.parent_id === p.id)}
            color={color}
            bucket={bucket}
            cutoffDays={cutoffDays}
            otherOpenTitles={parents.filter((o) => o.id !== p.id && !o.completed_at).map((o) => o.title)}
          />
        ))}
      </ul>
    </section>
  );
}

function TaskItem({ task, subtasks, color, bucket, cutoffDays, otherOpenTitles }: { task: Task; subtasks: Task[]; color: string; bucket: "today" | "later"; cutoffDays: number; otherOpenTitles: string[] }) {
  const { user } = useSessionUser();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [open, setOpen] = useState(subtasks.length > 0);
  const [subInput, setSubInput] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const allSubsDone = subtasks.length > 0 && subtasks.every((s) => s.completed_at);
  const done = !!task.completed_at || allSubsDone;

  const toggle = async (t: Task) => {
    const newVal = t.completed_at ? null : new Date().toISOString();
    await supabase.from("tasks").update({ completed_at: newVal }).eq("id", t.id);
    // auto-complete parent
    if (t.parent_id && profile?.auto_complete_parent && newVal) {
      const siblings = subtasks.filter((s) => s.id !== t.id);
      if (siblings.every((s) => s.completed_at)) {
        await supabase.from("tasks").update({ completed_at: new Date().toISOString() }).eq("id", t.parent_id);
      }
    }
    invalidate();
  };

  const remove = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    invalidate();
  };

  const addSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subInput.trim() || !user) return;
    const pos = subtasks.length;
    await supabase.from("tasks").insert({
      user_id: user.id, title: subInput.trim(), bucket, parent_id: task.id, position: pos, task_date: todayStr(),
    });
    setSubInput("");
    setOpen(true);
    invalidate();
  };

  const move = async () => {
    const newBucket = bucket === "today" ? "later" : "today";
    const patch: { bucket: "today" | "later"; task_date?: string } = { bucket: newBucket };
    if (newBucket === "today") patch.task_date = todayStr();
    await supabase.from("tasks").update(patch).eq("id", task.id);
    // also move children
    await supabase.from("tasks").update(patch).eq("parent_id", task.id);
    invalidate();
  };


  return (
    <li
      className="rounded-lg border bg-background/60 transition-colors"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Checkbox checked={done} onCheckedChange={() => toggle(task)} />
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-1 text-left"
        >
          {subtasks.length > 0 ? (
            open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <span className="w-3.5" />
          )}
          <span className={`text-sm ${done ? "text-muted-foreground line-through" : ""}`}>{task.title}</span>
          {subtasks.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">
              {subtasks.filter((s) => s.completed_at).length}/{subtasks.length}
            </span>
          )}
          {task.due_time && !done && <DueTimeBadge due={task.due_time} />}
        </button>
        <DueTimePicker task={task} onChange={() => qc.invalidateQueries({ queryKey: ["tasks"] })} />
        <TaskMaxButton taskTitle={task.title} otherOpenTasks={otherOpenTitles} />
        <button onClick={move} className="rounded p-1 text-muted-foreground hover:bg-secondary" title={bucket === "today" ? "Move to Later" : "Move to Today"}>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => remove(task.id)} className="rounded p-1 text-muted-foreground hover:bg-secondary">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {bucket === "later" && task.first_parked_at && isStale(task.first_parked_at, task.parked_snoozed_until, cutoffDays) && (
        <div className="px-3 pb-2">
          <StaleParkedChip taskId={task.id} firstParkedAt={task.first_parked_at} />
        </div>
      )}

      {open && (
        <div className="border-t border-border/60 bg-background/30 px-3 py-2">
          <ul className="space-y-1">
            {subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-1 pl-6">
                <Checkbox checked={!!s.completed_at} onCheckedChange={() => toggle(s)} />
                <span className={`flex-1 text-sm ${s.completed_at ? "text-muted-foreground line-through" : ""}`}>
                  {s.title}
                </span>
                <button onClick={() => remove(s.id)} className="rounded p-1 text-muted-foreground hover:bg-secondary">
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={addSub} className="mt-2 flex gap-2 pl-6">
            <Input
              value={subInput}
              onChange={(e) => setSubInput(e.target.value)}
              placeholder="Break it down…"
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" variant="ghost" disabled={!subInput.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      )}
    </li>
  );
}

function DueTimeBadge({ due }: { due: string }) {
  const [h, m] = due.split(":").map(Number);
  const dueDate = setMinutes(setHours(new Date(), h), m);
  const past = new Date() > dueDate;
  const label = format(dueDate, "h:mma").toLowerCase();
  return (
    <span
      className="ml-2 rounded-full px-1.5 py-0.5 text-[10px]"
      style={{
        backgroundColor: past ? "color-mix(in oklab, var(--accent) 40%, transparent)" : "var(--secondary)",
        color: "var(--foreground)",
      }}
      title={past ? "Shift it, don't skip it — tomorrow is a fresh page." : `Aim for ${label}`}
    >
      {past ? `was ${label}` : `by ${label}`}
    </span>
  );
}

function DueTimePicker({ task, onChange }: { task: Task; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(task.due_time?.slice(0, 5) ?? "");

  const save = async (v: string | null) => {
    await supabase.from("tasks").update({ due_time: v }).eq("id", task.id);
    onChange();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`rounded p-1 hover:bg-secondary ${task.due_time ? "text-foreground" : "text-muted-foreground"}`}
          title={task.due_time ? "Change soft deadline" : "Add a soft deadline"}
        >
          <Clock className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2 p-3" align="end">
        <p className="text-xs text-muted-foreground">A soft aim — no alarms, just intention.</p>
        <Input type="time" value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="flex justify-between gap-2">
          {task.due_time && (
            <Button type="button" variant="ghost" size="sm" onClick={() => save(null)}>Clear</Button>
          )}
          <Button type="button" size="sm" className="ml-auto" onClick={() => value && save(value)} disabled={!value}>
            Set
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
