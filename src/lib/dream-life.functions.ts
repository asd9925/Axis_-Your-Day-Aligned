import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// -------- Legacy vision workbook (kept for older data references) --------

const AREA_KEYS = ["health", "relationships", "work", "money", "growth", "play"] as const;
const AREA_TITLES: Record<string, string> = {
  health: "Health",
  relationships: "Relationships",
  work: "Work & Craft",
  money: "Money",
  growth: "Growth",
  play: "Play",
};

const DraftInput = z.object({ dream_text: z.string().min(1) });
const AreaSchema = z.object({
  key: z.string(), title: z.string(), vision: z.string(), why: z.string(),
  one_year: z.string(), ninety_day: z.string(), weekly_habit: z.string(),
});
const DraftShape = z.object({ vision_statement: z.string(), areas: z.array(AreaSchema) });

async function callAI(system: string, prompt: string): Promise<unknown> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) throw new Error("Axis is catching its breath — try again in a minute.");
  if (res.status === 402) throw new Error("AI credits exhausted for this workspace.");
  if (!res.ok) throw new Error(`AI error: ${res.status}`);
  const json = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(text); } catch { throw new Error("AI returned invalid JSON."); }
}

const LEGACY_SYSTEM =
  "You are a warm, grounded, ADHD-friendly life-vision coach. No toxic positivity. Concrete, measurable, humane language. Return strict JSON only.";

export const generateVisionDraft = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => DraftInput.parse(raw))
  .handler(async ({ data }) => {
    const prompt = `The user described their dream life:
"""
${data.dream_text}
"""
Return JSON: {"vision_statement":"...","areas":[{"key","title","vision","why","one_year","ninety_day","weekly_habit"}]} with exactly 6 areas keyed: ${AREA_KEYS.join(", ")}.`;
    const parsed = await callAI(LEGACY_SYSTEM, prompt);
    const out = DraftShape.safeParse(parsed);
    if (!out.success) throw new Error("AI returned an unexpected shape.");
    const byKey = new Map(out.data.areas.map((a) => [a.key, a] as const));
    const areas = AREA_KEYS.map((k) => {
      const a = byKey.get(k);
      return {
        key: k, title: AREA_TITLES[k],
        vision: a?.vision ?? "", why: a?.why ?? "",
        one_year: a?.one_year ?? "", ninety_day: a?.ninety_day ?? "",
        weekly_habit: a?.weekly_habit ?? "",
      };
    });
    return { vision_statement: out.data.vision_statement, areas };
  });

export const refineArea = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({
      area_key: z.string(), area_title: z.string(),
      vision: z.string().optional(), why: z.string().optional(),
      one_year: z.string().optional(), ninety_day: z.string().optional(),
      weekly_habit: z.string().optional(), notes: z.string().optional(),
    }).parse(raw))
  .handler(async ({ data }) => {
    const prompt = `Refine this life area. Area: ${data.area_title}. Current vision: ${data.vision ?? ""}. Why: ${data.why ?? ""}. 1-year: ${data.one_year ?? ""}. 90-day: ${data.ninety_day ?? ""}. Weekly habit: ${data.weekly_habit ?? ""}. Notes: ${data.notes ?? ""}. Return JSON {"vision","why","one_year","ninety_day","weekly_habit"}.`;
    const parsed = await callAI(LEGACY_SYSTEM, prompt);
    return z.object({
      vision: z.string(), why: z.string(), one_year: z.string(),
      ninety_day: z.string(), weekly_habit: z.string(),
    }).parse(parsed);
  });

// -------- New: Dream Planner --------

const HORIZONS: Record<string, number> = {
  "30d": 30, "90d": 90, "6mo": 180, "1yr": 365, "3yr": 1095,
};

const PlanInput = z.object({
  dream_id: z.string().uuid(),
  notes: z.string().optional(),
});

const PlanShape = z.object({
  summary: z.string(),
  milestones: z.array(z.object({
    title: z.string(),
    target_offset_days: z.number().int().min(1),
  })).min(1).max(6),
  weekly_rhythm: z.array(z.object({
    title: z.string(),
    weekday: z.number().int().min(0).max(6),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    duration_min: z.number().int().min(5).max(240),
  })).max(6),
  daily_micro: z.object({
    title: z.string(),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  }).nullable(),
  starter_tasks: z.array(z.object({
    title: z.string(),
    must_do: z.boolean(),
  })).max(6),
});

export type DreamPlan = z.infer<typeof PlanShape>;

const PLANNER_SYSTEM =
  "You are an ADHD-friendly life planner for the Axis app. Turn a user's dream into a concrete, humane daily plan they can actually live. Small steps. Realistic time blocks. Never preachy. Return strict JSON matching the requested schema.";

export const generatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => PlanInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: dream, error } = await context.supabase
      .from("dreams").select("*").eq("id", data.dream_id).maybeSingle();
    if (error || !dream) throw new Error("Dream not found.");
    const days = HORIZONS[dream.horizon as string] ?? 90;
    const prompt = `Dream: ${dream.title}
Why it matters: ${dream.why ?? "(not given)"}
Category: ${dream.category}
Horizon: ${dream.horizon} (~${days} days)
User adjustments: ${data.notes ?? "(none)"}

Return JSON:
{
  "summary": "1-sentence framing of the plan",
  "milestones": [ {"title":"measurable checkpoint","target_offset_days": int 1..${days}} ],   // 3-5 items, spaced across horizon
  "weekly_rhythm": [ {"title":"action","weekday": 0(Mon)..6(Sun),"time":"HH:MM","duration_min": 15..90} ],  // 2-5 items
  "daily_micro": {"title":"small daily thing under 10 min","time":"HH:MM"} | null,
  "starter_tasks": [ {"title":"one-off setup task","must_do": bool} ]  // 3-5 items
}
Times use 24h. Weekdays: 0=Mon..6=Sun. Titles under 60 chars, start with a verb.`;
    const parsed = await callAI(PLANNER_SYSTEM, prompt);
    const out = PlanShape.safeParse(parsed);
    if (!out.success) throw new Error("Plan came back in an unexpected shape.");
    return out.data;
  });

// Apply an already-edited plan. All fields come from the client (user may have edited).
const ApplyInput = z.object({
  dream_id: z.string().uuid(),
  plan: PlanShape,
  include: z.object({
    milestones: z.boolean(),
    weekly_rhythm: z.boolean(),
    daily_micro: z.boolean(),
    starter_tasks: z.boolean(),
  }),
});

function nextDateForWeekday(weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6): Date {
  // weekday: 0=Mon..6=Sun. JS getDay: 0=Sun..6=Sat.
  const targetJs = (weekday + 1) % 7;
  const now = new Date();
  const diff = (targetJs - now.getDay() + 7) % 7;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d;
}

export const applyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ApplyInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: dream, error: dErr } = await supabase
      .from("dreams").select("*").eq("id", data.dream_id).maybeSingle();
    if (dErr || !dream) throw new Error("Dream not found.");

    let goalId: string | null = null;
    if (data.include.milestones && data.plan.milestones.length > 0) {
      const targetDate = new Date();
      const maxOffset = Math.max(...data.plan.milestones.map((m) => m.target_offset_days));
      targetDate.setDate(targetDate.getDate() + maxOffset);
      const { data: g, error } = await supabase.from("goals").insert({
        user_id: userId,
        title: dream.title,
        notes: dream.why,
        cadence: "weekly",
        target_date: targetDate.toISOString().slice(0, 10),
        status: "active",
        dream_id: dream.id,
      } as never).select("id").single();
      if (error) throw error;
      goalId = (g as { id: string }).id;
      for (let i = 0; i < data.plan.milestones.length; i++) {
        const m = data.plan.milestones[i];
        await supabase.from("goal_steps").insert({
          user_id: userId,
          goal_id: goalId,
          title: m.title,
          cadence: "weekly",
          position: i,
          is_ai_suggested: true,
        } as never);
      }
    }

    if (data.include.weekly_rhythm) {
      for (const w of data.plan.weekly_rhythm) {
        const d = nextDateForWeekday(w.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6);
        const [hh, mm] = w.time.split(":").map(Number);
        const starts = new Date(d);
        starts.setHours(hh, mm, 0, 0);
        const ends = new Date(starts.getTime() + w.duration_min * 60_000);
        await supabase.from("events").insert({
          user_id: userId,
          title: w.title,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          category: "dream",
          dream_id: dream.id,
          source: "dream_life",
          recurrence_rule: { freq: "weekly", interval: 1 },
        } as never);
      }
    }

    if (data.include.daily_micro && data.plan.daily_micro) {
      await supabase.from("habits").insert({
        user_id: userId,
        title: data.plan.daily_micro.title,
        cadence: "daily",
        kind: "build",
        dream_id: dream.id,
      } as never);
    }

    if (data.include.starter_tasks) {
      const today = new Date().toISOString().slice(0, 10);
      for (let i = 0; i < data.plan.starter_tasks.length; i++) {
        const t = data.plan.starter_tasks[i];
        await supabase.from("tasks").insert({
          user_id: userId,
          title: t.title,
          bucket: t.must_do ? "today" : "later",
          task_date: today,
          position: i,
          dream_id: dream.id,
        } as never);
      }
    }

    return { ok: true, goalId };
  });
