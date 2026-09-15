import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionUser } from "@/hooks/useProfile";
import {
  addDays, addMinutes, addMonths, addQuarters, addYears, differenceInMinutes,
  eachDayOfInterval, eachMonthOfInterval, endOfMonth, endOfQuarter, endOfWeek,
  endOfYear, format, getWeek, isSameDay, isSameMonth, setHours, setMinutes,
  startOfDay, startOfMonth, startOfQuarter, startOfWeek, startOfYear,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as MiniCalendar } from "@/components/ui/calendar";
import { CalendarIcon, Check, ChevronLeft, ChevronRight, GripVertical, Plus, Repeat } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTier } from "@/lib/tiers";
import { LockedFeature } from "@/components/LockedFeature";
import { useServerFn } from "@tanstack/react-start";
import {
  pushEventToGoogle,
  deleteEventFromGoogle,
  syncGoogleCalendar,
  getGoogleStatus,
} from "@/lib/google-calendar.functions";
import { RefreshCw } from "lucide-react";
import { HabitsRing } from "@/components/TodayHabitsRow";
import { DreamStrip } from "@/components/DreamStrip";
import { ObjectivesStrip } from "@/components/ObjectivesStrip";
import { PlanMyDayButton } from "@/components/PlanMyDayButton";

type View = "day" | "week" | "month" | "quarter" | "year";

export const Route = createFileRoute("/_authenticated/calendar")({
  validateSearch: (s: Record<string, unknown>) => ({
    view: (typeof s.view === "string" && ["day","week","month","quarter","year"].includes(s.view) ? s.view : "week") as View,
  }),
  component: CalendarPage,
});

type RecurrenceRule = {
  freq: "daily" | "weekly" | "monthly";
  interval: number;
  byweekday?: number[]; // 0..6 (Sun..Sat)
  endMode: "never" | "on" | "count";
  endDate?: string; // yyyy-MM-dd
  count?: number;
};

type Event = {
  id: string;
  user_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  notes: string | null;
  category: string | null;
  task_id: string | null;
  is_important: boolean;
  recurrence_rule: RecurrenceRule | null;
  recurrence_parent_id: string | null;
  recurrence_exception_dates: string[] | null;
  completed_at: string | null;
  completed_occurrence_dates: string[] | null;
  google_event_id?: string | null;
  google_calendar_id?: string | null;
};

// Virtual expanded instance carries the master id and its occurrence date
type EventInstance = Event & { _masterId?: string; _isVirtual?: boolean; _occurrenceDate?: string };

type UnscheduledTask = {
  id: string;
  title: string;
  bucket: "today" | "later";
  due_time: string | null;
};




function useEvents(from: Date, to: Date) {
  const { user } = useSessionUser();
  return useQuery({
    queryKey: ["events", user?.id, from.toISOString(), to.toISOString()],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as Event[];
      // Fetch events that start before range end (non-recurring) OR any recurring master.
      // Then client-side expand.
      const { data, error } = await supabase.from("events")
        .select("*").eq("user_id", user.id)
        .lte("starts_at", to.toISOString())
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as unknown as Event[];
    },
  });
}

// Expand recurring masters into virtual instances within [from, to].
// Non-recurring events pass through if they fall in range.
function expandRecurrences(events: Event[], from: Date, to: Date): EventInstance[] {
  const out: EventInstance[] = [];
  for (const e of events) {
    const rule = e.recurrence_rule;
    const start = new Date(e.starts_at);
    const end = new Date(e.ends_at);
    const durMin = Math.max(1, differenceInMinutes(end, start));

    if (!rule) {
      if (start <= to && start >= from) out.push(e as EventInstance);
      continue;
    }

    const exceptions = new Set(e.recurrence_exception_dates ?? []);
    const interval = Math.max(1, rule.interval || 1);
    const endDate = rule.endMode === "on" && rule.endDate ? new Date(rule.endDate + "T23:59:59") : null;
    const maxCount = rule.endMode === "count" && rule.count ? rule.count : Infinity;
    const HARD_CAP = 366;

    let cursor = new Date(start);
    let produced = 0;
    let iterations = 0;
    while (cursor <= to && produced < maxCount && iterations < HARD_CAP) {
      iterations++;
      if (endDate && cursor > endDate) break;
      const inRange = cursor >= from && cursor <= to;
      const dstr = format(cursor, "yyyy-MM-dd");
      const skip = exceptions.has(dstr);

      const matchesRule = (() => {
        if (rule.freq === "weekly" && rule.byweekday && rule.byweekday.length > 0) {
          return rule.byweekday.includes(cursor.getDay());
        }
        return true;
      })();

      if (matchesRule && !skip && inRange) {
        const instStart = new Date(cursor);
        const instEnd = addMinutes(instStart, durMin);
        const completedForOccurrence = (e.completed_occurrence_dates ?? []).includes(dstr);
        out.push({
          ...e,
          id: `${e.id}::${dstr}`,
          starts_at: instStart.toISOString(),
          ends_at: instEnd.toISOString(),
          completed_at: completedForOccurrence ? new Date().toISOString() : null,
          _masterId: e.id,
          _isVirtual: true,
          _occurrenceDate: dstr,
        });
        produced++;
      }

      // Advance cursor
      if (rule.freq === "daily") cursor = addDays(cursor, interval);
      else if (rule.freq === "weekly") {
        if (rule.byweekday && rule.byweekday.length > 0) {
          // Step one day at a time within the week, then jump by (interval-1) weeks after Saturday
          cursor = addDays(cursor, 1);
          // If we've passed the end of a "cycle" week, add extra weeks
          // Approximation: after we wrap past Saturday of the start-of-week we jump interval weeks minus one.
          // Simpler: at every Sunday, add (interval-1)*7 days.
          if (cursor.getDay() === 0 && interval > 1) cursor = addDays(cursor, (interval - 1) * 7);
        } else {
          cursor = addDays(cursor, 7 * interval);
        }
      } else if (rule.freq === "monthly") cursor = addMonths(cursor, interval);
    }
  }
  return out;
}


function useUnscheduledTasks(date: Date) {
  const { user } = useSessionUser();
  const dstr = format(date, "yyyy-MM-dd");
  return useQuery({
    queryKey: ["unscheduled-tasks", user?.id, dstr],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as UnscheduledTask[];
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("id, title, bucket, due_time, parent_id, completed_at")
        .eq("user_id", user.id)
        .eq("task_date", dstr)
        .is("parent_id", null);
      if (error) throw error;
      const { data: scheduled } = await supabase
        .from("events")
        .select("task_id")
        .eq("user_id", user.id)
        .not("task_id", "is", null);
      const scheduledIds = new Set((scheduled ?? []).map((s) => s.task_id));
      return (tasks ?? [])
        .filter((t) => !t.completed_at && !scheduledIds.has(t.id))
        .map((t) => ({ id: t.id, title: t.title, bucket: t.bucket as "today" | "later", due_time: t.due_time }));
    },
  });
}

type ComposeState = { date: Date; start?: string };

function CalendarPage() {
  const [details, setDetails] = useState<EventInstance | null>(null);
  const openDetails = (ev: EventInstance) => setDetails(ev);

  const { view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [anchor, setAnchor] = useState(new Date());
  const [compose, setCompose] = useState<ComposeState | null>(null);

  const setView = (v: View) => navigate({ search: { view: v } });

  const range = getRange(view, anchor);
  const { data: rawEvents = [] } = useEvents(range.from, range.to);
  const events = useMemo(() => expandRecurrences(rawEvents, range.from, range.to), [rawEvents, range.from, range.to]);

  const label = getLabel(view, anchor);

  const step = (dir: 1 | -1) => {
    setAnchor((d) => {
      switch (view) {
        case "day": return addDays(d, dir);
        case "week": return addDays(d, 7 * dir);
        case "month": return addMonths(d, dir);
        case "quarter": return addQuarters(d, dir);
        case "year": return addYears(d, dir);
        default: return d;
      }
    });
  };

  const openCompose = (d: Date, start?: string) => setCompose({ date: d, start });

  const qc = useQueryClient();
  const getStatus = useServerFn(getGoogleStatus);
  const runSync = useServerFn(syncGoogleCalendar);
  const { data: gStatus } = useQuery({
    queryKey: ["google-status"],
    queryFn: () => getStatus(),
    staleTime: 60_000,
  });
  const [syncing, setSyncing] = useState(false);
  const onSync = async () => {
    setSyncing(true);
    try {
      const r = await runSync();
      toast.success(`Synced. ${r.imported} pulled, ${r.deleted} removed.`);
      qc.invalidateQueries({ queryKey: ["events"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-10 md:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-widest text-muted-foreground">Calendar</p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl">{label}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-card p-1">
            {(["day","week","month","quarter","year"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-xs capitalize ${view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></Button>
          {gStatus?.connected && gStatus.syncEnabled && (
            <Button variant="outline" size="sm" onClick={onSync} disabled={syncing} title="Sync Google Calendar">
              <RefreshCw className={cn("mr-1 h-3.5 w-3.5", syncing && "animate-spin")} />
              Sync
            </Button>
          )}
          <Button onClick={() => openCompose(anchor)}><Plus className="mr-1 h-4 w-4" /> Event</Button>
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
        {view === "day" && <DayView date={anchor} events={events} onAddEvent={openCompose} onEventClick={openDetails} />}
        {view === "week" && <WeekView date={anchor} events={events} onDayClick={openCompose} onEventClick={openDetails} />}
        {view === "month" && <MonthView date={anchor} events={events} onDayClick={openCompose} onEventClick={openDetails} />}
        {view === "quarter" && <QuarterView date={anchor} events={events} onDayClick={openCompose} onEventClick={openDetails} />}
        {view === "year" && <YearView date={anchor} events={events} onDayClick={(d) => { openCompose(d); }} onEventClick={openDetails} />}
      </div>

      <EventDialog
        open={compose !== null}
        onOpenChange={(o) => { if (!o) setCompose(null); }}
        defaultDate={compose?.date ?? anchor}
        defaultStart={compose?.start}
      />
      <EventDetailsDialog
        event={details}
        onOpenChange={(o) => { if (!o) setDetails(null); }}
      />
    </div>
  );
}


function getRange(view: View, d: Date) {
  switch (view) {
    case "day": return { from: startOfDay(d), to: addDays(startOfDay(d), 1) };
    case "week": return { from: startOfWeek(d), to: endOfWeek(d) };
    case "month": return { from: startOfMonth(d), to: endOfMonth(d) };
    case "quarter": return { from: startOfQuarter(d), to: endOfQuarter(d) };
    case "year": return { from: startOfYear(d), to: endOfYear(d) };
  }
}

function getLabel(view: View, d: Date) {
  switch (view) {
    case "day": return format(d, "EEEE, MMMM d, yyyy");
    case "week": return `Week ${getWeek(d)} · ${format(startOfWeek(d), "MMM d")}–${format(endOfWeek(d), "MMM d")}`;
    case "month": return format(d, "MMMM yyyy");
    case "quarter": return `Q${Math.floor(d.getMonth()/3)+1} ${format(d, "yyyy")}`;
    case "year": return format(d, "yyyy");
  }
}

// ---------------- Day view (rewritten) ----------------

const HOUR_PX = 56;
const SNAP_MIN = 5;
const snapMinutes = (m: number) => Math.round(m / SNAP_MIN) * SNAP_MIN;

// Given a drop/click y-offset within an hour slot for `hour`, returns the
// snapped (hour, minute) — carries over to the next hour if snapping rounds
// up past 60 minutes.
function slotYToTime(hour: number, relY: number): { hour: number; minute: number } {
  const rawMin = Math.max(0, Math.min(59, Math.round((relY / HOUR_PX) * 60)));
  const total = snapMinutes(hour * 60 + rawMin);
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

type Layout = { event: EventInstance; top: number; height: number; col: number; cols: number };


function layoutEvents(events: EventInstance[], startHour: number): Layout[] {
  const sorted = [...events].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const layouts: Layout[] = [];
  const groups: Event[][] = [];
  let currentGroup: Event[] = [];
  let groupEnd = 0;

  for (const e of sorted) {
    const s = new Date(e.starts_at).getTime();
    const en = new Date(e.ends_at).getTime();
    if (s >= groupEnd && currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [];
      groupEnd = 0;
    }
    currentGroup.push(e);
    groupEnd = Math.max(groupEnd, en);
  }
  if (currentGroup.length) groups.push(currentGroup);

  for (const g of groups) {
    const columns: Event[][] = [];
    for (const e of g) {
      const s = new Date(e.starts_at).getTime();
      let placed = false;
      for (const col of columns) {
        const last = col[col.length - 1];
        if (new Date(last.ends_at).getTime() <= s) {
          col.push(e);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([e]);
    }
    for (let ci = 0; ci < columns.length; ci++) {
      for (const e of columns[ci]) {
        const start = new Date(e.starts_at);
        const end = new Date(e.ends_at);
        const rawStartMin = start.getHours() * 60 + start.getMinutes() - startHour * 60;
        // Snap display top to the 15-min grid so events line up with slot lines.
        const startMin = snapMinutes(rawStartMin);
        const dur = Math.max(20, differenceInMinutes(end, start));
        layouts.push({
          event: e,
          top: (startMin / 60) * HOUR_PX,
          height: (dur / 60) * HOUR_PX,
          col: ci,
          cols: columns.length,
        });
      }
    }
  }
  return layouts;
}

// -------- Shared timeline used by Day and Week views --------

type TimelineDropPayload = { kind: "task" | "event"; id: string; title?: string };

function useTimelineHandlers(events: EventInstance[]) {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const pushToGoogle = useServerFn(pushEventToGoogle);
  const removeFromGoogle = useServerFn(deleteEventFromGoogle);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["unscheduled-tasks"] });
  };

  const onDropSlot = async (day: Date, hour: number, minute: number, e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/json");
    if (!raw || !user) return;
    const payload = JSON.parse(raw) as TimelineDropPayload;
    const dropStart = setMinutes(setHours(day, hour), minute);

    if (payload.kind === "task") {
      const dropEnd = addMinutes(dropStart, 60);
      const { data: inserted, error } = await supabase.from("events").insert({
        user_id: user.id,
        title: payload.title ?? "Task",
        starts_at: dropStart.toISOString(),
        ends_at: dropEnd.toISOString(),
        task_id: payload.id,
      }).select("id").single();
      if (error) { toast.error(error.message); return; }
      toast.success("Scheduled.");
      if (inserted?.id) pushToGoogle({ data: { eventId: inserted.id } }).catch(() => {});
      invalidate();
      return;
    }

    const existing = events.find((ev) => ev.id === payload.id);
    if (!existing) return;
    const durMin = Math.max(15, differenceInMinutes(new Date(existing.ends_at), new Date(existing.starts_at)));
    const dropEnd = addMinutes(dropStart, durMin);

    if (existing._isVirtual && existing._masterId && existing._occurrenceDate) {
      // Detach this occurrence: add exception on master, insert one-off at new time.
      const newExceptions = [...(existing.recurrence_exception_dates ?? []), existing._occurrenceDate];
      const { error: e1 } = await supabase.from("events")
        .update({ recurrence_exception_dates: newExceptions } as never)
        .eq("id", existing._masterId);
      if (e1) { toast.error(e1.message); return; }
      const { data: inserted, error: e2 } = await supabase.from("events").insert({
        user_id: user.id,
        title: existing.title,
        starts_at: dropStart.toISOString(),
        ends_at: dropEnd.toISOString(),
        location: existing.location,
        notes: existing.notes,
        is_important: existing.is_important,
      } as never).select("id").single();
      if (e2) { toast.error(e2.message); return; }
      toast.success("Moved this occurrence.");
      if (inserted && "id" in inserted) {
        pushToGoogle({ data: { eventId: (inserted as { id: string }).id } }).catch(() => {});
      }
      invalidate();
      return;
    }

    const { error } = await supabase.from("events").update({
      starts_at: dropStart.toISOString(),
      ends_at: dropEnd.toISOString(),
    }).eq("id", payload.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Moved.");
    pushToGoogle({ data: { eventId: payload.id } }).catch(() => {});
    invalidate();
  };

  const onDropTray = async (dayEvents: EventInstance[], e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;
    const payload = JSON.parse(raw) as TimelineDropPayload;
    if (payload.kind !== "event") return;
    const ev = dayEvents.find((x) => x.id === payload.id);
    if (!ev?.task_id) return;
    if (ev.google_event_id) {
      removeFromGoogle({
        data: {
          googleEventId: ev.google_event_id,
          googleCalendarId: ev.google_calendar_id ?? "primary",
        },
      }).catch(() => {});
    }
    await supabase.from("events").delete().eq("id", payload.id);
    invalidate();
  };

  return { onDropSlot, onDropTray };
}

function useToggleEventComplete() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["events"] });
  return async (ev: EventInstance) => {
    const nowIso = new Date().toISOString();
    if (ev._isVirtual && ev._masterId && ev._occurrenceDate) {
      // toggle occurrence in master's completed_occurrence_dates
      const { data: master } = await supabase
        .from("events")
        .select("completed_occurrence_dates")
        .eq("id", ev._masterId)
        .maybeSingle();
      const current: string[] = ((master as { completed_occurrence_dates?: string[] } | null)?.completed_occurrence_dates ?? []);
      const has = current.includes(ev._occurrenceDate);
      const next = has ? current.filter((d) => d !== ev._occurrenceDate) : [...current, ev._occurrenceDate];
      const { error } = await supabase
        .from("events")
        .update({ completed_occurrence_dates: next } as never)
        .eq("id", ev._masterId);
      if (error) toast.error(error.message);
      else toast.success(has ? "Marked open." : "Nice — done.");
      invalidate();
      return;
    }
    const newVal = ev.completed_at ? null : nowIso;
    const { error } = await supabase.from("events").update({ completed_at: newVal } as never).eq("id", ev.id);
    if (error) toast.error(error.message);
    else toast.success(newVal ? "Nice — done." : "Marked open.");
    invalidate();
  };
}

function isRecurringEvent(e: EventInstance) {
  return !!(e.recurrence_rule || e._isVirtual || e.recurrence_parent_id);
}

function useEventResize() {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const pushToGoogle = useServerFn(pushEventToGoogle);
  const [overrides, setOverrides] = useState<Record<string, { top: number; height: number }>>({});

  const startResize = (
    ev: EventInstance,
    edge: "top" | "bottom",
    layout: { top: number; height: number },
    pe: React.PointerEvent,
  ) => {
    if (!user) return;
    pe.stopPropagation();
    pe.preventDefault();
    const target = pe.currentTarget as HTMLElement;
    try { target.setPointerCapture(pe.pointerId); } catch { /* noop */ }
    const startY = pe.clientY;
    const origTop = layout.top;
    const origHeight = layout.height;
    const origStart = new Date(ev.starts_at);
    const origEnd = new Date(ev.ends_at);
    const minHeight = (15 / 60) * HOUR_PX;

    const computeDeltaMin = (clientY: number) => {
      const raw = Math.round(((clientY - startY) / HOUR_PX) * 60);
      return Math.round(raw / SNAP_MIN) * SNAP_MIN;
    };

    const onMove = (mev: PointerEvent) => {
      const deltaPx = (computeDeltaMin(mev.clientY) / 60) * HOUR_PX;
      let newTop = origTop;
      let newHeight = origHeight;
      if (edge === "top") {
        newTop = origTop + deltaPx;
        newHeight = origHeight - deltaPx;
        if (newHeight < minHeight) {
          newTop = origTop + origHeight - minHeight;
          newHeight = minHeight;
        }
        if (newTop < 0) { newHeight += newTop; newTop = 0; }
      } else {
        newHeight = origHeight + deltaPx;
        if (newHeight < minHeight) newHeight = minHeight;
        const maxPx = 24 * HOUR_PX - origTop;
        if (newHeight > maxPx) newHeight = maxPx;
      }
      setOverrides((o) => ({ ...o, [ev.id]: { top: newTop, height: newHeight } }));
    };

    const onUp = async (uev: PointerEvent) => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      const deltaMin = computeDeltaMin(uev.clientY);
      let newStart = origStart;
      let newEnd = origEnd;
      if (edge === "top") {
        newStart = addMinutes(origStart, deltaMin);
        if (differenceInMinutes(origEnd, newStart) < 15) newStart = addMinutes(origEnd, -15);
      } else {
        newEnd = addMinutes(origEnd, deltaMin);
        if (differenceInMinutes(newEnd, origStart) < 15) newEnd = addMinutes(origStart, 15);
        const eod = new Date(origStart); eod.setHours(23, 59, 0, 0);
        if (newEnd > eod) newEnd = eod;
      }
      setOverrides((o) => { const next = { ...o }; delete next[ev.id]; return next; });

      if (newStart.getTime() === origStart.getTime() && newEnd.getTime() === origEnd.getTime()) return;

      if (ev._isVirtual && ev._masterId && ev._occurrenceDate) {
        const newExceptions = [...(ev.recurrence_exception_dates ?? []), ev._occurrenceDate];
        const { error: e1 } = await supabase.from("events")
          .update({ recurrence_exception_dates: newExceptions } as never)
          .eq("id", ev._masterId);
        if (e1) { toast.error(e1.message); return; }
        const { data: inserted, error: e2 } = await supabase.from("events").insert({
          user_id: user.id,
          title: ev.title,
          starts_at: newStart.toISOString(),
          ends_at: newEnd.toISOString(),
          location: ev.location,
          notes: ev.notes,
          is_important: ev.is_important,
        } as never).select("id").single();
        if (e2) { toast.error(e2.message); return; }
        if (inserted && "id" in inserted) {
          pushToGoogle({ data: { eventId: (inserted as { id: string }).id } }).catch(() => {});
        }
      } else {
        const { error } = await supabase.from("events").update({
          starts_at: newStart.toISOString(),
          ends_at: newEnd.toISOString(),
        }).eq("id", ev.id);
        if (error) { toast.error(error.message); return; }
        pushToGoogle({ data: { eventId: ev.id } }).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ["events"] });
    };

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  return { overrides, startResize };
}

function TimelineGrid({
  days, events, startHour, endHour, onDropSlot, onSlotClick, onEventClick,
}: {
  days: Date[];
  events: EventInstance[];
  startHour: number;
  endHour: number;
  onDropSlot: (day: Date, hour: number, minute: number, e: React.DragEvent) => void;
  onSlotClick: (day: Date, hour: number, minute: number) => void;
  onEventClick?: (ev: EventInstance) => void;
}) {

  const toggleComplete = useToggleEventComplete();
  const { overrides, startResize } = useEventResize();
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const cols = days.length;
  const dayLayouts = days.map((d) => ({
    d,
    layouts: layoutEvents(events.filter((e) => isSameDay(new Date(e.starts_at), d)), startHour),
  }));

  return (
    <div className="grid" style={{ gridTemplateColumns: `56px repeat(${cols}, minmax(0, 1fr))` }}>
      {/* Time gutter */}
      <div>
        {hours.map((h) => (
          <div
            key={h}
            className="pr-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground"
            style={{ height: HOUR_PX, paddingTop: 2 }}
          >
            {format(setHours(new Date(), h), "ha").toLowerCase()}
          </div>
        ))}
      </div>

      {/* Day columns */}
      {dayLayouts.map(({ d, layouts }, di) => (
        <div
          key={d.toISOString()}
          className="relative"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const minutesFromStart = ((e.clientY - rect.top) / HOUR_PX) * 60;
            const snapped = Math.max(0, Math.round(minutesFromStart / SNAP_MIN) * SNAP_MIN);
            const totalMin = startHour * 60 + snapped;
            const hour = Math.min(23, Math.floor(totalMin / 60));
            const minute = Math.min(59, totalMin % 60);
            onDropSlot(d, hour, minute, e);
          }}
        >
          {hours.map((h, hi) => (
            <div
              key={h}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const { hour, minute } = slotYToTime(h, e.clientY - rect.top);
                onSlotClick(d, hour, minute);
              }}
              className={cn(
                "cursor-pointer transition-colors hover:bg-secondary/30",
                "border-t border-border/60",
                hi === 0 && "border-t-transparent",
                di > 0 && "border-l border-border/40",
              )}
              style={{ height: HOUR_PX }}
            />
          ))}

          {layouts.map((l) => {
            const important = l.event.is_important;
            const recurring = isRecurringEvent(l.event);
            const done = !!l.event.completed_at;
            const baseColor = important
              ? "var(--accent)"
              : recurring
                ? "var(--event-recurring)"
                : "var(--bucket-today)";
            return (
              <div
                key={l.event.id}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData("application/json", JSON.stringify({ kind: "event", id: l.event.id }));
                }}
                onClick={(e) => { e.stopPropagation(); onEventClick?.(l.event); }}
                className={cn(
                  "group absolute cursor-grab overflow-hidden rounded-md border-l-2 px-2 py-1 text-xs shadow-sm active:cursor-grabbing hover:ring-1 hover:ring-foreground/40",
                  done && "opacity-60",
                )}
                style={{
                  top: overrides[l.event.id]?.top ?? l.top,
                  height: Math.max((overrides[l.event.id]?.height ?? l.height) - 2, 22),
                  left: `calc(${(l.col / l.cols) * 100}% + 2px)`,
                  width: `calc(${(1 / l.cols) * 100}% - 4px)`,
                  borderColor: baseColor,
                  borderLeftWidth: important ? 3 : 2,
                  backgroundColor: important
                    ? "color-mix(in oklab, var(--accent) 22%, transparent)"
                    : recurring
                      ? "color-mix(in oklab, var(--event-recurring) 22%, transparent)"
                      : "color-mix(in oklab, var(--secondary) 70%, transparent)",
                }}
                title={`${l.event.title} · ${format(new Date(l.event.starts_at), "h:mma").toLowerCase()}`}
              >
                <div className="flex items-start gap-1">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleComplete(l.event); }}
                    className={cn(
                      "mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border transition",
                      done ? "border-transparent text-background" : "border-current text-transparent hover:border-foreground/60",
                    )}
                    style={{ backgroundColor: done ? baseColor : "transparent" }}
                    aria-label={done ? "Mark open" : "Mark done"}
                    title={done ? "Mark open" : "Mark done"}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={cn("truncate font-medium", done && "line-through")}>
                      {important && <span className="mr-0.5" aria-hidden>★</span>}
                      {recurring && !important && <Repeat className="mr-0.5 inline h-2.5 w-2.5 opacity-70" aria-hidden />}
                      {l.event.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(new Date(l.event.starts_at), "h:mm").toLowerCase()}–{format(new Date(l.event.ends_at), "h:mma").toLowerCase()}
                    </div>
                    {l.event.location && l.height > 44 && (
                      <div className="truncate text-[10px] text-muted-foreground">{l.event.location}</div>
                    )}
                  </div>
                </div>
                <div
                  onPointerDown={(e) => startResize(l.event, "top", { top: l.top, height: l.height }, e)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => e.preventDefault()}
                  draggable={false}
                  className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100"
                  style={{ touchAction: "none" }}
                  aria-label="Resize start"
                />
                <div
                  onPointerDown={(e) => startResize(l.event, "bottom", { top: l.top, height: l.height }, e)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => e.preventDefault()}
                  draggable={false}
                  className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100"
                  style={{ touchAction: "none" }}
                  aria-label="Resize end"
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function computeTimelineRange(events: EventInstance[]) {
  const startHours = events.map((e) => new Date(e.starts_at).getHours());
  const endHours = events.map((e) => {
    const end = new Date(e.ends_at);
    return end.getHours() + (end.getMinutes() > 0 ? 1 : 0);
  });
  return {
    startHour: Math.min(8, ...startHours, 8),
    endHour: Math.max(18, ...endHours, 18),
  };
}


function DayView({
  date, events, onAddEvent, onEventClick,
}: {
  date: Date;
  events: EventInstance[];
  onAddEvent: (d: Date, start?: string) => void;
  onEventClick?: (ev: EventInstance) => void;
}) {

  const { data: unscheduled = [] } = useUnscheduledTasks(date);
  const dayEvents = events.filter((e) => isSameDay(new Date(e.starts_at), date));
  const { startHour, endHour } = computeTimelineRange(dayEvents);
  const { onDropSlot, onDropTray } = useTimelineHandlers(events);
  const isToday = isSameDay(date, new Date());

  const handleSlotClick = (day: Date, hour: number, minute: number) => {
    onAddEvent(day, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  };

  return (
    <div className="space-y-4">
      {isToday && (
        <div className="grid gap-3 md:grid-cols-2">
          <DayViewProgressCard />
          <DayViewHabitsCard />
        </div>
      )}

      <ObjectivesStrip scope="day" scopeDate={date} />

      <DreamStrip date={date} />

      <div className="flex items-center gap-2">
        <div className="flex-1"><AddTaskForDay date={date} count={unscheduled.length} /></div>
        <PlanMyDayButton
          date={date}
          taskList={unscheduled.map((t) => ({ id: t.id, title: t.title }))}
          busy={dayEvents.map((e) => ({
            start: format(new Date(e.starts_at), "HH:mm"),
            end: format(new Date(e.ends_at), "HH:mm"),
            title: e.title,
          }))}
        />
        <Button variant="outline" size="sm" onClick={() => onAddEvent(date)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Event
        </Button>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onDropTray(dayEvents, e)}
        className="rounded-xl border border-dashed border-border bg-background/40 p-3"
      >
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
            Unscheduled {isSameDay(date, new Date()) ? "today" : format(date, "EEE MMM d")}
          </h3>
          <span className="text-xs text-muted-foreground">Drag onto an hour to plan it</span>
        </div>
        {unscheduled.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">All your tasks have a home. Nice.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ kind: "task", id: t.id, title: t.title }))}
                className="group flex cursor-grab items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm active:cursor-grabbing"
                style={{ borderLeft: `3px solid ${t.bucket === "today" ? "var(--bucket-today)" : "var(--bucket-later)"}` }}
              >
                <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                <span>{t.title}</span>
                {t.due_time && <DueBadge due={t.due_time} />}
              </div>
            ))}
          </div>
        )}
      </div>

      <TimelineGrid
        days={[date]}
        events={dayEvents}
        startHour={startHour}
        endHour={endHour}
        onDropSlot={onDropSlot}
        onSlotClick={handleSlotClick}
        onEventClick={onEventClick}
      />


      <p className="text-center text-xs text-muted-foreground">
        Plans bend. If today wandered, tomorrow is a fresh page.
      </p>
    </div>
  );
}


function DueBadge({ due }: { due: string }) {
  // due is "HH:MM:SS" or "HH:MM"
  const [h, m] = due.split(":").map(Number);
  const dueDate = setMinutes(setHours(new Date(), h), m);
  const past = new Date() > dueDate;
  const label = format(dueDate, "h:mma").toLowerCase();
  return (
    <span
      className="ml-1 rounded-full px-1.5 py-0.5 text-[10px]"
      style={{
        backgroundColor: past ? "color-mix(in oklab, var(--accent) 40%, transparent)" : "var(--secondary)",
        color: "var(--foreground)",
      }}
      title={past ? "Shift it, don't skip it." : `by ${label}`}
    >
      {past ? `was ${label}` : `by ${label}`}
    </span>
  );
}

// ---------------- Other views (unchanged behavior) ----------------

function WeekView({
  date, events, onDayClick, onEventClick,
}: {
  date: Date;
  events: EventInstance[];
  onDayClick: (d: Date, start?: string) => void;
  onEventClick?: (ev: EventInstance) => void;
}) {

  const days = eachDayOfInterval({ start: startOfWeek(date), end: endOfWeek(date) });
  const weekEvents = events.filter((e) => days.some((d) => isSameDay(new Date(e.starts_at), d)));
  const { startHour, endHour } = computeTimelineRange(weekEvents);
  const { onDropSlot } = useTimelineHandlers(events);

  return (
    <div className="space-y-4">
      <ObjectivesStrip scope="week" scopeDate={startOfWeek(date)} />

      {/* Header strip with day labels + click-to-add */}
      <div className="grid" style={{ gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))` }}>
        <div />
        {days.map((d) => {
          const isToday = isSameDay(d, new Date());
          return (
            <button
              type="button"
              key={d.toISOString()}
              onClick={() => onDayClick(d)}
              className={cn(
                "flex flex-col items-center rounded-md py-1 text-center transition hover:bg-secondary/40",
                isToday && "bg-primary/5",
              )}
              title={`Add event on ${format(d, "EEE MMM d")}`}
            >
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{format(d, "EEE")}</span>
              <span className={cn("font-display text-lg", isToday && "text-primary")}>{format(d, "d")}</span>
            </button>
          );
        })}
      </div>

      {/* Google-style hourly timeline */}
      <TimelineGrid
        days={days}
        events={weekEvents}
        startHour={startHour}
        endHour={endHour}
        onDropSlot={onDropSlot}
        onSlotClick={(d, h, m) => onDayClick(d, `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)}
        onEventClick={onEventClick}

      />

      <p className="text-center text-xs text-muted-foreground">
        Click an empty slot to add · drag an event to move it.
      </p>
    </div>
  );
}

function MonthView({
  date, events, onDayClick, onEventClick,
}: {
  date: Date;
  events: EventInstance[];
  onDayClick: (d: Date, start?: string) => void;
  onEventClick?: (ev: EventInstance) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(date));
  const gridEnd = endOfWeek(endOfMonth(date));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const MAX_VISIBLE = 3;

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 text-center text-xs uppercase text-muted-foreground">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const dayEvents = events
            .filter((e) => isSameDay(new Date(e.starts_at), d))
            .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
          const inMonth = isSameMonth(d, date);
          const isToday = isSameDay(d, new Date());
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - visible.length;
          return (
            <div
              role="button"
              tabIndex={0}
              key={d.toISOString()}
              onClick={() => onDayClick(d)}
              className={cn(
                "flex min-h-28 cursor-pointer flex-col rounded-md border p-1.5 text-left text-xs transition hover:border-foreground/60",
                isToday ? "border-primary" : "border-border",
                !inMonth && "opacity-40",
              )}
            >
              <div className={cn("mb-1 text-right", isToday && "font-bold")}>{format(d, "d")}</div>
              <div className="flex flex-1 flex-col gap-0.5">
                {visible.map((e) => {
                  const important = e.is_important;
                  const recurring = isRecurringEvent(e);
                  const done = !!e.completed_at;
                  const color = important ? "var(--accent)" : recurring ? "var(--event-recurring)" : "var(--bucket-today)";
                  const time = format(new Date(e.starts_at), "h:mma").toLowerCase();
                  return (
                    <span
                      key={e.id}
                      onClick={(ev) => { ev.stopPropagation(); onEventClick?.(e); }}
                      className={cn(
                        "flex cursor-pointer items-center gap-1 truncate rounded-sm px-1 py-0.5 text-[10px] leading-tight hover:ring-1 hover:ring-foreground/40",
                        important && "font-medium",
                        done && "opacity-60 line-through",
                      )}
                      style={{
                        backgroundColor: `color-mix(in oklab, ${color} ${important ? 22 : 16}%, transparent)`,
                        borderLeft: `2px solid ${color}`,
                        color: "var(--foreground)",
                      }}
                      title={`${important ? "★ " : recurring ? "↻ " : ""}${e.title} · ${time}`}
                    >
                      {important && <span aria-hidden>★</span>}
                      {recurring && !important && <span aria-hidden className="opacity-70">↻</span>}
                      <span className="shrink-0 text-muted-foreground">{time}</span>
                      <span className="truncate">{e.title}</span>
                    </span>
                  );
                })}
                {overflow > 0 && (
                  <span className="text-[10px] text-muted-foreground">+{overflow} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

}


function QuarterView({
  date, events, onDayClick, onEventClick,
}: {
  date: Date;
  events: EventInstance[];
  onDayClick: (d: Date) => void;
  onEventClick?: (ev: EventInstance) => void;
}) {

  const months = eachMonthOfInterval({ start: startOfQuarter(date), end: endOfQuarter(date) });
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {months.map((m) => {
        const gridStart = startOfWeek(startOfMonth(m));
        const gridEnd = endOfWeek(endOfMonth(m));
        const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
        const monthEvents = events.filter((e) => isSameMonth(new Date(e.starts_at), m));
        const importantCount = monthEvents.filter((e) => e.is_important).length;
        return (
          <div key={m.toISOString()} className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-display text-lg">{format(m, "MMMM")}</h3>
              <span className="text-xs text-muted-foreground">
                {monthEvents.length} event{monthEvents.length === 1 ? "" : "s"}
                {importantCount > 0 && ` · ${importantCount}★`}
              </span>
            </div>
            <div className="mb-1 grid grid-cols-7 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
              {["S","M","T","W","T","F","S"].map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d) => {
                const inMonth = isSameMonth(d, m);
                const isToday = isSameDay(d, new Date());
                const dayEvents = monthEvents.filter((e) => isSameDay(new Date(e.starts_at), d));
                const hasImportant = dayEvents.some((e) => e.is_important);
                const count = dayEvents.length;
                const intensity = count === 0 ? 0 : Math.min(1, 0.25 + count * 0.2);
                const bgColor = hasImportant ? "var(--accent)" : "var(--bucket-today)";
                const cellButton = (
                  <button
                    type="button"
                    key={d.toISOString()}
                    onClick={count === 0 ? () => onDayClick(d) : undefined}
                    className={cn(
                      "relative flex aspect-square items-center justify-center rounded-md text-[10px] transition hover:ring-1 hover:ring-foreground/40",
                      !inMonth && "opacity-30",
                      isToday && "ring-1 ring-primary",
                    )}
                    style={{
                      backgroundColor: count > 0 ? `color-mix(in oklab, ${bgColor} ${intensity * 100}%, transparent)` : "transparent",
                      border: count === 0 ? "1px solid color-mix(in oklab, var(--border) 60%, transparent)" : "none",
                      color: intensity > 0.6 ? "var(--background)" : "var(--foreground)",
                    }}
                    title={`${format(d, "EEE MMM d")}: ${count} event${count === 1 ? "" : "s"}${hasImportant ? " · has ★" : ""}`}
                  >
                    <span className={cn(inMonth ? "" : "text-muted-foreground")}>{format(d, "d")}</span>
                  </button>
                );
                if (count === 0) return cellButton;
                return (
                  <Popover key={d.toISOString()}>
                    <PopoverTrigger asChild>{cellButton}</PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-2">
                      <DayEventsPopover date={d} events={dayEvents} onEventClick={onEventClick} onAdd={() => onDayClick(d)} />
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>

          </div>
        );
      })}
    </div>
  );
}

function YearView({ date, events, onDayClick, onEventClick }: { date: Date; events: EventInstance[]; onDayClick: (d: Date) => void; onEventClick?: (ev: EventInstance) => void }) {
  const months = eachMonthOfInterval({ start: startOfYear(date), end: endOfYear(date) });
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {months.map((m) => {
        const monthEvents = events.filter((e) => isSameMonth(new Date(e.starts_at), m));
        const days = eachDayOfInterval({ start: startOfMonth(m), end: endOfMonth(m) });
        return (
          <div key={m.toISOString()} className="rounded-lg border border-border p-3">
            <h3 className="mb-2 font-display">{format(m, "MMM")}</h3>
            <div className="grid grid-cols-7 gap-0.5">
              {days.map((d) => {
                const dayEvents = monthEvents.filter((e) => isSameDay(new Date(e.starts_at), d));
                const count = dayEvents.length;
                const opacity = count === 0 ? 0.06 : Math.min(1, 0.3 + count * 0.25);
                const cell = (
                  <button
                    type="button"
                    key={d.toISOString()}
                    onClick={count === 0 ? () => onDayClick(d) : undefined}
                    className="aspect-square rounded-sm transition hover:ring-1 hover:ring-foreground/40"
                    style={{ backgroundColor: `color-mix(in oklab, var(--bucket-today) ${opacity * 100}%, transparent)` }}
                    title={`${format(d, "MMM d")}: ${count} event${count === 1 ? "" : "s"}${count === 0 ? " — click to add" : ""}`}
                  />
                );
                if (count === 0) return cell;
                return (
                  <Popover key={d.toISOString()}>
                    <PopoverTrigger asChild>{cell}</PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-2">
                      <DayEventsPopover date={d} events={dayEvents} onEventClick={onEventClick} onAdd={() => onDayClick(d)} />
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{monthEvents.length} events</p>
          </div>
        );
      })}
    </div>
  );
}



function addOneHour(t: string) {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + 60;
  const nh = Math.floor((total % (24 * 60)) / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function EventDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultStart,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDate: Date;
  defaultStart?: string;
}) {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const { hasFeature } = useTier();
  const canRecur = hasFeature("recurring_events");
  const pushToGoogleFn = useServerFn(pushEventToGoogle);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date>(defaultDate);
  const [start, setStart] = useState(defaultStart ?? "09:00");
  const [end, setEnd] = useState(addOneHour(defaultStart ?? "09:00"));
  const [endTouched, setEndTouched] = useState(false);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [important, setImportant] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  // Recurrence state
  const [recurEnabled, setRecurEnabled] = useState(false);
  const [freq, setFreq] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [interval, setInterval] = useState(1);
  const [byweekday, setByweekday] = useState<number[]>([defaultDate.getDay()]);
  const [endMode, setEndMode] = useState<"never" | "on" | "count">("never");
  const [endDate, setEndDate] = useState<string>(format(addMonths(defaultDate, 3), "yyyy-MM-dd"));
  const [count, setCount] = useState<number>(10);

  // Reset date/time-driven state when opening with a new default
  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      setByweekday([defaultDate.getDay()]);
      setEndDate(format(addMonths(defaultDate, 3), "yyyy-MM-dd"));
      if (defaultStart) {
        setStart(defaultStart);
        setEnd(addOneHour(defaultStart));
        setEndTouched(false);
      }
    }
  }, [open, defaultDate, defaultStart]);


  const onStartChange = (v: string) => {
    setStart(v);
    if (!endTouched) setEnd(addOneHour(v));
  };

  const toggleWeekday = (d: number) => {
    setByweekday((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  };

  const buildRule = (): RecurrenceRule | null => {
    if (!recurEnabled || !canRecur) return null;
    const rule: RecurrenceRule = {
      freq,
      interval: Math.max(1, interval),
      endMode,
    };
    if (freq === "weekly" && byweekday.length > 0) rule.byweekday = byweekday;
    if (endMode === "on") rule.endDate = endDate;
    if (endMode === "count") rule.count = Math.max(1, count);
    return rule;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const d = format(date, "yyyy-MM-dd");
    const startsAt = new Date(`${d}T${start}`).toISOString();
    const endsAt = new Date(`${d}T${end}`).toISOString();
    const rule = buildRule();
    const { data: inserted, error } = await supabase.from("events").insert({
      user_id: user.id, title, starts_at: startsAt, ends_at: endsAt,
      location: location || null, notes: notes || null, is_important: important,
      recurrence_rule: rule as never,
    } as never).select("id").single();
    if (error) { toast.error(error.message); return; }
    toast.success(rule ? "Recurring event added." : "Event added.");
    onOpenChange(false);
    setTitle(""); setLocation(""); setNotes(""); setImportant(false); setEndTouched(false);
    setRecurEnabled(false);
    qc.invalidateQueries({ queryKey: ["events"] });
    if (inserted && "id" in inserted) {
      pushToGoogleFn({ data: { eventId: (inserted as { id: string }).id } }).catch(() => {});
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New event · {format(date, "EEE MMM d")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input placeholder="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="justify-start font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <MiniCalendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => { if (d) { setDate(d); setDateOpen(false); } }}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Input type="time" value={start} onChange={(e) => onStartChange(e.target.value)} />
            <Input type="time" value={end} onChange={(e) => { setEnd(e.target.value); setEndTouched(true); }} />
          </div>
          <Input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
            <span>★ Mark as important (stands out in calendar views)</span>
          </label>

          {/* Recurrence */}
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={recurEnabled}
                onChange={(e) => setRecurEnabled(e.target.checked)}
                disabled={!canRecur}
              />
              <Repeat className="h-3.5 w-3.5" />
              <span className="font-medium">Repeats</span>
              {!canRecur && <span className="ml-auto text-xs text-muted-foreground">Plus / Pro</span>}
            </label>

            {!canRecur && recurEnabled === false && (
              <div className="mt-3">
                <LockedFeature featureKey="recurring_events" compact />
              </div>
            )}

            {canRecur && recurEnabled && (
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Every</span>
                  <Input
                    type="number"
                    min={1}
                    value={interval}
                    onChange={(e) => setInterval(Number(e.target.value) || 1)}
                    className="h-8 w-16"
                  />
                  <select
                    value={freq}
                    onChange={(e) => setFreq(e.target.value as "daily" | "weekly" | "monthly")}
                    className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                  >
                    <option value="daily">day{interval > 1 ? "s" : ""}</option>
                    <option value="weekly">week{interval > 1 ? "s" : ""}</option>
                    <option value="monthly">month{interval > 1 ? "s" : ""}</option>
                  </select>
                </div>

                {freq === "weekly" && (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">On</div>
                    <div className="flex gap-1">
                      {WEEKDAY_LABELS.map((lbl, i) => {
                        const active = byweekday.includes(i);
                        return (
                          <button
                            type="button"
                            key={i}
                            onClick={() => toggleWeekday(i)}
                            className={`h-8 w-8 rounded-full border text-xs transition ${active ? "border-transparent bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground/40"}`}
                          >
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Ends</div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={endMode === "never"} onChange={() => setEndMode("never")} />
                      <span>Never</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={endMode === "on"} onChange={() => setEndMode("on")} />
                      <span>On</span>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        disabled={endMode !== "on"}
                        className="h-8 w-40"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={endMode === "count"} onChange={() => setEndMode("count")} />
                      <span>After</span>
                      <Input
                        type="number"
                        min={1}
                        value={count}
                        onChange={(e) => setCount(Number(e.target.value) || 1)}
                        disabled={endMode !== "count"}
                        className="h-8 w-20"
                      />
                      <span className="text-muted-foreground">occurrences</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit">Add event</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddTaskForDay({ date, count }: { date: Date; count: number }) {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const dstr = format(date, "yyyy-MM-dd");
  const MAX = 5;
  const atCap = count >= MAX;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;
    if (atCap) { toast.error(`Cap of ${MAX} — finish or defer one first.`); return; }
    const { data: existing } = await supabase
      .from("tasks")
      .select("id")
      .eq("user_id", user.id)
      .eq("task_date", dstr)
      .eq("bucket", "today")
      .is("parent_id", null);
    const pos = (existing ?? []).length;
    const { error } = await supabase.from("tasks").insert({
      user_id: user.id, title: title.trim(), bucket: "today", position: pos, task_date: dstr,
    });
    if (error) { toast.error(error.message); return; }
    setTitle("");
    toast.success(isSameDay(date, new Date()) ? "Added to today." : `Added to ${format(date, "EEE MMM d")}.`);
    qc.invalidateQueries({ queryKey: ["unscheduled-tasks"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--bucket-today)" }} />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={atCap ? "Full — 5 must-dos already" : `Add a must-do for ${isSameDay(date, new Date()) ? "today" : format(date, "EEE MMM d")}`}
        disabled={atCap}
        className="h-9"
      />
      <Button type="submit" size="sm" disabled={atCap || !title.trim()}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add
      </Button>
    </form>
  );
}


// ---------------- Today mirror cards (Day view header) ----------------

function DayViewProgressCard() {
  const { user } = useSessionUser();
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: tasks = [] } = useQuery({
    queryKey: ["day-progress", user?.id, today],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as { id: string; parent_id: string | null; completed_at: string | null; bucket: string }[];
      const { data } = await supabase
        .from("tasks")
        .select("id, parent_id, completed_at, bucket")
        .eq("user_id", user.id)
        .eq("task_date", today);
      return (data ?? []) as { id: string; parent_id: string | null; completed_at: string | null; bucket: string }[];
    },
  });

  const todayTasks = tasks.filter((t) => t.bucket === "today");
  const parents = todayTasks.filter((t) => !t.parent_id);
  let done = 0, total = 0;
  for (const p of parents) {
    const kids = todayTasks.filter((t) => t.parent_id === p.id);
    if (kids.length === 0) {
      total += 1;
      if (p.completed_at) done += 1;
    } else {
      total += kids.length;
      done += kids.filter((k) => k.completed_at).length;
    }
  }
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const size = 96, stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} stroke="var(--muted)" fill="none" />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            strokeWidth={stroke} stroke="var(--bucket-today)" fill="none"
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 400ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-display text-xl">{pct}%</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium">Today's progress</p>
        <p className="text-xs text-muted-foreground">{done} of {total || "—"} done</p>
      </div>
    </div>
  );
}

function DayViewHabitsCard() {
  return <HabitsRing />;
}

// ---------------- Day-events popover (Quarter / Year) ----------------

function DayEventsPopover({
  date, events, onEventClick, onAdd,
}: {
  date: Date;
  events: EventInstance[];
  onEventClick?: (ev: EventInstance) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">{format(date, "EEE MMM d")}</p>
        <button
          type="button"
          onClick={onAdd}
          className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          + Add
        </button>
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {events
          .slice()
          .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
          .map((e) => {
            const important = e.is_important;
            const recurring = isRecurringEvent(e);
            const done = !!e.completed_at;
            const color = important ? "var(--accent)" : recurring ? "var(--event-recurring)" : "var(--bucket-today)";
            const time = format(new Date(e.starts_at), "h:mma").toLowerCase();
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onEventClick?.(e)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary/50",
                    done && "opacity-60 line-through",
                  )}
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  {important && <span aria-hidden>★</span>}
                  {recurring && !important && <Repeat className="h-3 w-3 opacity-70" aria-hidden />}
                  <span className="shrink-0 text-muted-foreground">{time}</span>
                  <span className="truncate">{e.title}</span>
                </button>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

// ---------------- Event details dialog ----------------

function EventDetailsDialog({
  event, onOpenChange,
}: {
  event: EventInstance | null;
  onOpenChange: (o: boolean) => void;
}) {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const pushToGoogleFn = useServerFn(pushEventToGoogle);
  const removeFromGoogle = useServerFn(deleteEventFromGoogle);
  const toggleComplete = useToggleEventComplete();

  const masterId = event?._masterId ?? event?.id ?? null;
  const isVirtual = !!event?._isVirtual;
  const occurrenceDate = event?._occurrenceDate;

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [important, setImportant] = useState(false);

  useEffect(() => {
    if (!event) return;
    setEditing(false);
    setTitle(event.title);
    const s = new Date(event.starts_at);
    const e = new Date(event.ends_at);
    setDate(s);
    setStart(format(s, "HH:mm"));
    setEnd(format(e, "HH:mm"));
    setLocation(event.location ?? "");
    setNotes(event.notes ?? "");
    setImportant(event.is_important);
  }, [event]);

  if (!event) {
    return <Dialog open={false} onOpenChange={onOpenChange}><DialogContent /></Dialog>;
  }

  const recurring = isRecurringEvent(event);
  const done = !!event.completed_at;

  const save = async () => {
    if (!user || !masterId) return;
    const d = format(date, "yyyy-MM-dd");
    const startsAt = new Date(`${d}T${start}`).toISOString();
    const endsAt = new Date(`${d}T${end}`).toISOString();
    // If editing a virtual occurrence, add an exception on master + insert a one-off.
    if (isVirtual && occurrenceDate) {
      const newExceptions = [...(event.recurrence_exception_dates ?? []), occurrenceDate];
      const { error: e1 } = await supabase
        .from("events")
        .update({ recurrence_exception_dates: newExceptions } as never)
        .eq("id", masterId);
      if (e1) { toast.error(e1.message); return; }
      const { data: inserted, error: e2 } = await supabase.from("events").insert({
        user_id: user.id, title, starts_at: startsAt, ends_at: endsAt,
        location: location || null, notes: notes || null, is_important: important,
      } as never).select("id").single();
      if (e2) { toast.error(e2.message); return; }
      toast.success("Occurrence updated.");
      if (inserted && "id" in inserted) {
        pushToGoogleFn({ data: { eventId: (inserted as { id: string }).id } }).catch(() => {});
      }
    } else {
      const { error } = await supabase.from("events").update({
        title, starts_at: startsAt, ends_at: endsAt,
        location: location || null, notes: notes || null, is_important: important,
      }).eq("id", masterId);
      if (error) { toast.error(error.message); return; }
      toast.success("Saved.");
      pushToGoogleFn({ data: { eventId: masterId } }).catch(() => {});
    }
    qc.invalidateQueries({ queryKey: ["events"] });
    onOpenChange(false);
  };

  const deleteEvent = async (scope: "this" | "all") => {
    if (!masterId) return;
    if (scope === "this" && isVirtual && occurrenceDate) {
      const newExceptions = [...(event.recurrence_exception_dates ?? []), occurrenceDate];
      const { error } = await supabase
        .from("events")
        .update({ recurrence_exception_dates: newExceptions } as never)
        .eq("id", masterId);
      if (error) { toast.error(error.message); return; }
      toast.success("Occurrence removed.");
    } else {
      if (event.google_event_id) {
        removeFromGoogle({
          data: {
            googleEventId: event.google_event_id,
            googleCalendarId: event.google_calendar_id ?? "primary",
          },
        }).catch(() => {});
      }
      const { error } = await supabase.from("events").delete().eq("id", masterId);
      if (error) { toast.error(error.message); return; }
      toast.success("Deleted.");
    }
    qc.invalidateQueries({ queryKey: ["events"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={!!event} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {important && <span aria-hidden>★</span>}
            {recurring && !important && <Repeat className="h-4 w-4 opacity-70" aria-hidden />}
            <span>{editing ? "Edit event" : event.title}</span>
          </DialogTitle>
        </DialogHeader>

        {!editing ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarIcon className="h-4 w-4" />
              <span>
                {format(new Date(event.starts_at), "EEE MMM d, yyyy")} ·{" "}
                {format(new Date(event.starts_at), "h:mma").toLowerCase()}–
                {format(new Date(event.ends_at), "h:mma").toLowerCase()}
              </span>
            </div>
            {event.location && (
              <p><span className="text-muted-foreground">Where:</span> {event.location}</p>
            )}
            {event.notes && (
              <p className="whitespace-pre-wrap"><span className="text-muted-foreground">Notes:</span> {event.notes}</p>
            )}
            {recurring && (
              <p className="text-xs text-muted-foreground">
                Part of a recurring series{occurrenceDate ? ` · ${occurrenceDate}` : ""}.
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => toggleComplete(event)}>
                <Check className="mr-1 h-3.5 w-3.5" /> {done ? "Mark open" : "Mark done"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
              {isVirtual && (
                <Button type="button" variant="outline" size="sm" onClick={() => deleteEvent("this")}>
                  Delete this occurrence
                </Button>
              )}
              <Button type="button" variant="destructive" size="sm" onClick={() => deleteEvent("all")}>
                Delete {recurring && !isVirtual ? "series" : recurring ? "all" : ""}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <Input
                type="date"
                value={format(date, "yyyy-MM-dd")}
                onChange={(e) => { if (e.target.value) setDate(new Date(e.target.value + "T00:00:00")); }}
              />
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <Input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
            <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
              <span>★ Mark as important</span>
            </label>
            {isVirtual && (
              <p className="text-xs text-muted-foreground">
                Saving edits this single occurrence and detaches it from the series.
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="button" onClick={save}>Save</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

