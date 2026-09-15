import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const scopeSchema = z.enum(["week", "day"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export type Objective = {
  id: string;
  user_id: string;
  scope: "week" | "day";
  scope_date: string;
  title: string;
  description: string | null;
  position: number;
  completed_at: string | null;
  repeat_daily: boolean;
  created_at: string;
  updated_at: string;
};

export type WeeklyObjectiveForDate = Objective & {
  day_completed: boolean;
  days_completed_count: number;
};

// Monday of the ISO week for a given YYYY-MM-DD
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export const listObjectives = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ scope: scopeSchema, scopeDate: dateSchema }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("objectives" as never)
      .select("*")
      .eq("user_id", context.userId)
      .eq("scope", data.scope)
      .eq("scope_date", data.scopeDate)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as unknown as Objective[];
  });

export const addObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        scope: scopeSchema,
        scopeDate: dateSchema,
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { count, error: countErr } = await context.supabase
      .from("objectives" as never)
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("scope", data.scope)
      .eq("scope_date", data.scopeDate);
    if (countErr) throw countErr;
    if ((count ?? 0) >= 5) throw new Error("Up to 5 objectives per period");

    const { data: row, error } = await context.supabase
      .from("objectives" as never)
      .insert({
        user_id: context.userId,
        scope: data.scope,
        scope_date: data.scopeDate,
        title: data.title,
        description: data.description || null,
        position: count ?? 0,
      } as never)
      .select("*")
      .single();
    if (error) throw error;
    return row as unknown as Objective;
  });

export const updateObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(500).optional().nullable(),
        repeat_daily: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.repeat_daily !== undefined) patch.repeat_daily = data.repeat_daily;
    const { error } = await context.supabase
      .from("objectives" as never)
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const toggleObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), completed: z.boolean() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("objectives" as never)
      .update({ completed_at: data.completed ? new Date().toISOString() : null } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("objectives" as never)
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const listWeeklyForDate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ date: dateSchema }).parse(raw))
  .handler(async ({ context, data }) => {
    const monday = mondayOf(data.date);
    const { data: rows, error } = await context.supabase
      .from("objectives" as never)
      .select("*")
      .eq("user_id", context.userId)
      .eq("scope", "week")
      .eq("scope_date", monday)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    const objectives = (rows ?? []) as unknown as Objective[];
    if (objectives.length === 0) return [] as WeeklyObjectiveForDate[];

    const ids = objectives.map((o) => o.id);
    const { data: logs, error: logErr } = await context.supabase
      .from("objective_day_logs" as never)
      .select("objective_id, log_date")
      .eq("user_id", context.userId)
      .in("objective_id", ids);
    if (logErr) throw logErr;

    const byId = new Map<string, { count: number; today: boolean }>();
    for (const id of ids) byId.set(id, { count: 0, today: false });
    for (const l of (logs ?? []) as { objective_id: string; log_date: string }[]) {
      const rec = byId.get(l.objective_id);
      if (!rec) continue;
      rec.count += 1;
      if (l.log_date === data.date) rec.today = true;
    }

    return objectives.map((o) => {
      const rec = byId.get(o.id)!;
      return {
        ...o,
        day_completed: rec.today,
        days_completed_count: rec.count,
      };
    }) as WeeklyObjectiveForDate[];
  });

export const toggleObjectiveDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        objectiveId: z.string().uuid(),
        date: dateSchema,
        completed: z.boolean(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    // Verify objective belongs to caller
    const { data: obj, error: objErr } = await context.supabase
      .from("objectives" as never)
      .select("id, scope, scope_date, user_id")
      .eq("id", data.objectiveId)
      .eq("user_id", context.userId)
      .single();
    if (objErr) throw objErr;
    const o = obj as unknown as { scope: string; scope_date: string };
    if (o.scope !== "week") throw new Error("Only weekly objectives support daily logs");
    if (o.scope_date !== mondayOf(data.date)) {
      throw new Error("Date is outside this objective's week");
    }

    if (data.completed) {
      const { error } = await context.supabase
        .from("objective_day_logs" as never)
        .upsert(
          {
            objective_id: data.objectiveId,
            user_id: context.userId,
            log_date: data.date,
          } as never,
          { onConflict: "objective_id,log_date" } as never,
        );
      if (error) throw error;
    } else {
      const { error } = await context.supabase
        .from("objective_day_logs" as never)
        .delete()
        .eq("objective_id", data.objectiveId)
        .eq("user_id", context.userId)
        .eq("log_date", data.date);
      if (error) throw error;
    }
    return { ok: true };
  });
