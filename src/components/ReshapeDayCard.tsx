import { useEffect, useState } from "react";
import { useSessionUser } from "@/hooks/useProfile";
import { loadInsights, type InsightSummary } from "@/lib/task-insights";
import { Sparkles, X } from "lucide-react";
import { format } from "date-fns";

const DISMISS_KEY = "axis:reshape-dismissed";

function hourLabel(h: number) {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return format(d, "h a").toLowerCase();
}

export function ReshapeDayCard() {
  const { user } = useSessionUser();
  const [insights, setInsights] = useState<InsightSummary | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    const today = format(new Date(), "yyyy-MM-dd");
    if (localStorage.getItem(DISMISS_KEY) === today) {
      setDismissed(true);
      return;
    }
    loadInsights(user.id).then(setInsights).catch(() => {});
  }, [user]);

  if (dismissed || !insights?.shouldNudge) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, format(new Date(), "yyyy-MM-dd"));
    setDismissed(true);
  };

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-5" style={{ borderLeft: "3px solid var(--bucket-later)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-secondary p-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--bucket-later)" }} />
          </div>
          <div>
            <h3 className="font-display text-lg leading-tight">Let's reshape your day</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The last week has been heavy — that's data, not a verdict. A few gentle shifts might help.
            </p>
          </div>
        </div>
        <button onClick={dismiss} className="rounded-md p-1 text-muted-foreground hover:bg-secondary" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="mt-4 space-y-2 pl-11 text-sm">
        <li className="flex gap-2"><span className="text-muted-foreground">·</span> Try three must-dos instead of five. Finished feels better than started.</li>
        {insights.peakHour !== null && (
          <li className="flex gap-2">
            <span className="text-muted-foreground">·</span>
            You tend to finish things around <strong className="font-medium">{hourLabel(insights.peakHour)}</strong>. Put the hardest thing there.
          </li>
        )}
        <li className="flex gap-2"><span className="text-muted-foreground">·</span> If something bigger is in the way — sleep, stress, an unmet need — it's okay to name it and ask for help.</li>
      </ul>
    </div>
  );
}
