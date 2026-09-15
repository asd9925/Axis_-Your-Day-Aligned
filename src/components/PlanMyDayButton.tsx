import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { suggestDaySchedule } from "@/lib/schedule-suggest.functions";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format, parse, addMinutes } from "date-fns";

type Suggestion = { taskId: string; start: string; end: string; reason: string; title: string; accepted?: boolean };

export function PlanMyDayButton({ date, taskList, busy }: {
  date: Date;
  taskList: Array<{ id: string; title: string; notes?: string | null }>;
  busy: Array<{ start: string; end: string; title: string }>;
}) {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const suggestFn = useServerFn(suggestDaySchedule);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const run = async () => {
    if (taskList.length === 0) {
      toast("No must-do tasks yet — add a few first.");
      return;
    }
    setOpen(true);
    setLoading(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const out = await suggestFn({ data: { date: dateStr, tasks: taskList, busy } });
      const titled = out.suggestions
        .map((s) => {
          const t = taskList.find((x) => x.id === s.taskId);
          return t ? { ...s, title: t.title } : null;
        })
        .filter((x): x is Suggestion => x !== null);
      setSuggestions(titled);
      if (titled.length === 0) toast("Axis couldn't find good slots today. Try clearing space or adjusting rhythm.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suggestion failed");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const accept = async (s: Suggestion) => {
    if (!user) return;
    const dateStr = format(date, "yyyy-MM-dd");
    const start = parse(`${dateStr} ${s.start}`, "yyyy-MM-dd HH:mm", new Date());
    let end = parse(`${dateStr} ${s.end}`, "yyyy-MM-dd HH:mm", new Date());
    if (end <= start) end = addMinutes(start, 30);
    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      title: s.title,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      task_id: s.taskId,
      category: "planned",
    } as never);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSuggestions((prev) => prev.map((x) => (x.taskId === s.taskId ? { ...x, accepted: true } : x)));
    qc.invalidateQueries({ queryKey: ["events"] });
  };

  const acceptAll = async () => {
    for (const s of suggestions) {
      if (!s.accepted) await accept(s);
    }
    toast.success("Added to your day.");
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={run} disabled={loading}>
        <Sparkles className="mr-1 h-3.5 w-3.5" />
        {loading ? "Thinking…" : "Plan my day"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suggested times</DialogTitle>
          </DialogHeader>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Axis is picking gentle slots…</p>
          ) : suggestions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No suggestions yet.</p>
          ) : (
            <ul className="space-y-2">
              {suggestions.map((s) => (
                <li
                  key={s.taskId}
                  className={`flex items-start gap-3 rounded-lg border border-dashed border-border bg-background/40 p-3 ${s.accepted ? "opacity-60" : ""}`}
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.start}–{s.end} · {s.reason}
                    </p>
                  </div>
                  {s.accepted ? (
                    <span className="text-xs text-muted-foreground">Added</span>
                  ) : (
                    <>
                      <button
                        onClick={() => accept(s)}
                        className="rounded p-1 hover:bg-secondary"
                        title="Accept"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setSuggestions((prev) => prev.filter((x) => x.taskId !== s.taskId))}
                        className="rounded p-1 hover:bg-secondary"
                        title="Dismiss"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            <Button onClick={acceptAll} disabled={loading || suggestions.every((s) => s.accepted)}>
              Accept all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
