import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sparkles, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { suggestTaskMax } from "@/lib/task-max.functions";
import { toast } from "sonner";
import { useTier } from "@/lib/tiers";

type Suggestion = { anchor: string; pair: string; window: string; reason: string };

export function TaskMaxButton({
  taskTitle,
  taskNotes,
  otherOpenTasks,
}: {
  taskTitle: string;
  taskNotes?: string;
  otherOpenTasks: string[];
}) {
  const { hasFeature } = useTier();
  const canUse = hasFeature("task_max");
  const suggestFn = useServerFn(suggestTaskMax);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  const run = async () => {
    if (!canUse) {
      toast.info("Task Max is on Plus / Pro.");
      return;
    }
    setLoading(true);
    try {
      const r = await suggestFn({
        data: {
          anchorTitle: taskTitle,
          anchorNotes: taskNotes,
          otherOpenTasks: otherOpenTasks.slice(0, 20),
        },
      });
      setSuggestions(r.suggestions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't fetch suggestions");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !suggestions && !loading) run();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          title="Task Max — pair this with something you can do while it runs"
          aria-label="Task Max"
        >
          <Sparkles className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 p-3" align="end">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
          <p className="text-sm font-medium">Task Max</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Pair this with something you can do <em>while it runs</em>.
        </p>
        {loading && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking of pairings…
          </div>
        )}
        {!loading && suggestions && suggestions.length === 0 && (
          <p className="py-2 text-xs text-muted-foreground">No pairings landed. Try refreshing.</p>
        )}
        {!loading && suggestions && (
          <ul className="space-y-2">
            {suggestions.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-border bg-background/60 p-2 text-sm"
              >
                <div className="font-medium">{s.anchor}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  <span className="rounded-full bg-secondary px-1.5 py-0.5">{s.window}</span>
                </div>
                <div className="mt-1.5 text-sm">
                  <span className="text-muted-foreground">while it runs: </span>
                  <span>{s.pair}</span>
                </div>
                <div className="mt-1 text-xs italic text-muted-foreground">{s.reason}</div>
              </li>
            ))}
          </ul>
        )}
        {!loading && suggestions && (
          <button
            type="button"
            onClick={run}
            className="w-full rounded-md border border-border py-1 text-xs text-muted-foreground hover:bg-secondary"
          >
            Suggest again
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
