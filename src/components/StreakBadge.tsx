import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getStreak, recordDayQualification } from "@/lib/streaks.functions";
import { format } from "date-fns";

const FLOWER_STAGES = ["🌱", "🌱", "🌿", "🌷", "🌸", "🌺"];
const ROCKET_STAGES = ["🛠️", "🚀", "🚀", "🌤️", "🌌", "✨"];

export function StreakBadge({ qualified, date }: { qualified: boolean; date: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getStreak);
  const recordFn = useServerFn(recordDayQualification);

  const { data: streak } = useQuery({
    queryKey: ["streak"],
    queryFn: () => getFn(),
  });

  const record = useMutation({
    mutationFn: (args: { qualified: boolean; date: string }) => recordFn({ data: args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["streak"] }),
  });

  // Auto-record once per day when qualification is known
  useEffect(() => {
    if (!streak) return;
    if (streak.last_qualified_date === date && qualified) return;
    if (!qualified && streak.last_qualified_date !== date) return;
    record.mutate({ qualified, date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualified, streak?.last_qualified_date, date]);

  if (!streak) return null;
  const variant = streak.variant === "rocket" ? ROCKET_STAGES : FLOWER_STAGES;
  const emoji = variant[Math.min(streak.stage, 5)];
  const tip =
    streak.current_streak === 0
      ? "Hit 95% today to plant a seed."
      : `${streak.current_streak}-day streak. Milestone rewards coming soon.`;

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3 animate-fade-in"
      title={tip}
    >
      <div className="grid h-16 w-16 place-items-center text-4xl">
        <span className="animate-scale-in">{emoji}</span>
      </div>
      <div>
        <p className="text-sm font-medium">
          {streak.current_streak > 0 ? `${streak.current_streak}-day streak` : "Grow your streak"}
        </p>
        <p className="text-xs text-muted-foreground">
          {streak.longest_streak > streak.current_streak
            ? `Best: ${streak.longest_streak} days`
            : "95% closes today"}
        </p>
      </div>
    </div>
  );
}

export function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}
