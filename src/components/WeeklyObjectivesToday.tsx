import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { Check, Target } from "lucide-react";
import {
  listWeeklyForDate,
  toggleObjective,
  toggleObjectiveDay,
} from "@/lib/objectives.functions";
import { cn } from "@/lib/utils";

export function WeeklyObjectivesToday({
  date,
  variant = "card",
  hideWhenEmpty = false,
}: {
  date: Date;
  variant?: "card" | "inline";
  hideWhenEmpty?: boolean;
}) {
  const dateStr = format(date, "yyyy-MM-dd");
  const qc = useQueryClient();
  const list = useServerFn(listWeeklyForDate);
  const toggleDay = useServerFn(toggleObjectiveDay);
  const toggleObj = useServerFn(toggleObjective);

  const queryKey = ["objectives-weekly-for-date", dateStr] as const;
  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => list({ data: { date: dateStr } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ["objectives"] });
  };

  const dayMut = useMutation({
    mutationFn: (v: { objectiveId: string; completed: boolean }) =>
      toggleDay({ data: { objectiveId: v.objectiveId, date: dateStr, completed: v.completed } }),
    onSuccess: invalidate,
  });
  const objMut = useMutation({
    mutationFn: (v: { id: string; completed: boolean }) => toggleObj({ data: v }),
    onSuccess: invalidate,
  });

  if (isLoading) return null;
  if (items.length === 0 && hideWhenEmpty) return null;

  const wrapperCls =
    variant === "card"
      ? "rounded-xl border border-border bg-card/60 p-3"
      : "rounded-lg border border-dashed border-border/70 bg-background/40 p-2";

  return (
    <div className={wrapperCls}>
      <div className="mb-2 flex items-center gap-2">
        <Target className="h-3.5 w-3.5 text-foreground/70" />
        <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
          {variant === "card" ? "This week's objectives" : "From this week"}
        </h3>
        {variant === "card" && (
          <span className="ml-auto text-xs text-muted-foreground">
            Repeat-daily items check off for today.
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="py-1 text-center text-xs text-muted-foreground">
          No weekly objectives yet. Add them in Calendar → Week view.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((o) => {
            const objDone = !!o.completed_at;
            const checked = o.repeat_daily ? o.day_completed || objDone : objDone;
            const struck = objDone || (o.repeat_daily && o.day_completed);
            return (
              <li
                key={o.id}
                className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (objDone) {
                      // Uncompleting the whole objective if user taps a done one
                      objMut.mutate({ id: o.id, completed: false });
                    } else if (o.repeat_daily) {
                      dayMut.mutate({ objectiveId: o.id, completed: !o.day_completed });
                    } else {
                      objMut.mutate({ id: o.id, completed: true });
                    }
                  }}
                  disabled={dayMut.isPending || objMut.isPending}
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                  aria-label={checked ? "Mark incomplete" : "Mark complete"}
                >
                  {checked && <Check className="h-3 w-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "truncate text-sm font-medium",
                        struck && "text-muted-foreground line-through",
                      )}
                    >
                      {o.title}
                    </span>
                    {o.repeat_daily && !objDone && (
                      <span className="shrink-0 rounded-full bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {o.days_completed_count}/7
                      </span>
                    )}
                    {!o.repeat_daily && !objDone && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        Weekly
                      </span>
                    )}
                  </div>
                  {o.description && (
                    <p
                      className={cn(
                        "mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground",
                        struck && "line-through",
                      )}
                    >
                      {o.description}
                    </p>
                  )}
                </div>
                {!objDone && o.repeat_daily && (
                  <button
                    type="button"
                    onClick={() => objMut.mutate({ id: o.id, completed: true })}
                    className="rounded px-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Mark done
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
