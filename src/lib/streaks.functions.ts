import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type StreakRow = {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_qualified_date: string | null;
  stage: number;
  max_stage: number;
  variant: "flower" | "rocket";
};

const STAGE_CAP = 5;

function stageFor(streak: number): number {
  if (streak >= 30) return 5;
  if (streak >= 14) return 4;
  if (streak >= 7) return 3;
  if (streak >= 3) return 2;
  if (streak >= 1) return 1;
  return 0;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export const getStreak = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_streaks" as never)
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (data) return data as unknown as StreakRow;
    // Create initial row
    const row: StreakRow = {
      user_id: context.userId,
      current_streak: 0,
      longest_streak: 0,
      last_qualified_date: null,
      stage: 0,
      max_stage: 0,
      variant: "flower",
    };
    await context.supabase.from("user_streaks" as never).insert(row as never);
    return row;
  });

export const setStreakVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ variant: z.enum(["flower", "rocket"]) }).parse(raw))
  .handler(async ({ context, data }) => {
    await context.supabase
      .from("user_streaks" as never)
      .update({ variant: data.variant } as never)
      .eq("user_id", context.userId);
    return { ok: true };
  });

/** Recompute streak based on today's completion. Called lazily from Today. */
export const recordDayQualification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ qualified: z.boolean(), date: z.string() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const { data: existing } = await sb
      .from("user_streaks" as never)
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    const row: StreakRow = (existing as unknown as StreakRow) ?? {
      user_id: context.userId,
      current_streak: 0,
      longest_streak: 0,
      last_qualified_date: null,
      stage: 0,
      max_stage: 0,
      variant: "flower",
    };

    const today = new Date(data.date + "T00:00:00");
    const last = row.last_qualified_date ? new Date(row.last_qualified_date + "T00:00:00") : null;
    const dayDiff = last ? Math.round((today.getTime() - last.getTime()) / 86400000) : null;

    let current = row.current_streak;
    let lastDate = row.last_qualified_date;

    if (data.qualified) {
      if (dayDiff === 0) {
        // already counted today
      } else if (dayDiff === 1) {
        current += 1;
      } else {
        current = 1;
      }
      lastDate = data.date;
    } else if (dayDiff !== null && dayDiff > 1) {
      current = 0;
    }

    const longest = Math.max(row.longest_streak, current);
    const stage = Math.min(STAGE_CAP, stageFor(current));
    const maxStage = Math.max(row.max_stage, stage);

    const patch = {
      current_streak: current,
      longest_streak: longest,
      last_qualified_date: lastDate,
      stage,
      max_stage: maxStage,
    };
    if (!existing) {
      await sb.from("user_streaks" as never).insert({ ...row, ...patch } as never);
    } else {
      await sb.from("user_streaks" as never).update(patch as never).eq("user_id", context.userId);
    }
    return { ...row, ...patch };
  });
