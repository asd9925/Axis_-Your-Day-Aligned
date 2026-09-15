import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";

export type DailyCompletion = {
  date: string;
  total: number;
  done: number;
  rate: number; // 0..1
};

export type InsightSummary = {
  last7: DailyCompletion[];
  lowDays: number; // count of days with rate < 0.4 (and total > 0)
  peakHour: number | null; // 0..23, hour with most task completions in last 14d
  shouldNudge: boolean;
};

export async function loadInsights(userId: string): Promise<InsightSummary> {
  const from = format(subDays(new Date(), 13), "yyyy-MM-dd");
  const { data, error } = await supabase
    .from("tasks")
    .select("id, parent_id, task_date, completed_at")
    .eq("user_id", userId)
    .gte("task_date", from);
  if (error) throw error;

  const rows = data ?? [];
  // Build per-day leaf-based completion for the last 7 days
  const last7: DailyCompletion[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = format(subDays(new Date(), i), "yyyy-MM-dd");
    const dayTasks = rows.filter((r) => r.task_date === d);
    const parents = dayTasks.filter((t) => !t.parent_id);
    let done = 0, total = 0;
    for (const p of parents) {
      const kids = dayTasks.filter((t) => t.parent_id === p.id);
      if (kids.length === 0) {
        total += 1;
        if (p.completed_at) done += 1;
      } else {
        total += kids.length;
        done += kids.filter((k) => k.completed_at).length;
      }
    }
    last7.push({ date: d, total, done, rate: total === 0 ? 1 : done / total });
  }

  const lowDays = last7.filter((d) => d.total > 0 && d.rate < 0.4).length;

  const hourCounts = new Array(24).fill(0);
  for (const r of rows) {
    if (r.completed_at) {
      const h = new Date(r.completed_at).getHours();
      hourCounts[h] += 1;
    }
  }
  const maxCount = Math.max(...hourCounts);
  const peakHour = maxCount > 0 ? hourCounts.indexOf(maxCount) : null;

  return { last7, lowDays, peakHour, shouldNudge: lowDays >= 5 };
}
