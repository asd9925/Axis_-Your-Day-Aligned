import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  date: z.string(), // yyyy-MM-dd
  tasks: z.array(z.object({ id: z.string(), title: z.string(), notes: z.string().nullable().optional() })).max(20),
  busy: z.array(z.object({ start: z.string(), end: z.string(), title: z.string() })).max(40),
});

const Output = z.object({
  suggestions: z
    .array(z.object({ taskId: z.string(), start: z.string(), end: z.string(), reason: z.string() }))
    .max(20),
});

export const suggestDaySchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ context, data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: rhythm } = await context.supabase
      .from("user_rhythm" as never)
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    const rhythmDesc = rhythm
      ? Object.entries(rhythm as Record<string, unknown>)
          .filter(([k, v]) => v && !["user_id", "created_at", "updated_at"].includes(k))
          .map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join("\n")
      : "(no rhythm preferences set)";

    const busyDesc = data.busy.length
      ? data.busy.map((b) => `${b.start}–${b.end} ${b.title}`).join("; ")
      : "(nothing scheduled yet)";

    const tasksDesc = data.tasks.map((t) => `- ${t.id}: ${t.title}${t.notes ? ` — ${t.notes}` : ""}`).join("\n");

    const system =
      "You are a calm ADHD-friendly day planner. Suggest realistic times for the user's must-do tasks around what's already booked, matching their known rhythm. Never overlap busy times. Prefer 25–60 min blocks. Leave breathing room. Avoid scheduling anything between 21:00 and 07:00 (quiet hours) unless the user's rhythm, an existing busy block, or the task itself explicitly falls in that window. Return strict JSON only.";

    const prompt = `Date: ${data.date}
User rhythm:
${rhythmDesc}

Already scheduled (busy):
${busyDesc}

Must-do tasks:
${tasksDesc}

Return JSON: {"suggestions":[{"taskId":"<id from above>","start":"HH:MM","end":"HH:MM","reason":"one short warm sentence"}]}. Only include tasks you have a good slot for. Use 24-hour times on ${data.date}.`;

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

    if (res.status === 429) throw new Error("Rate limit — try again in a minute.");
    if (res.status === 402) throw new Error("AI credits exhausted for this workspace.");
    if (!res.ok) throw new Error(`AI error: ${res.status}`);

    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error("AI returned invalid JSON."); }
    const out = Output.safeParse(parsed);
    if (!out.success) throw new Error("AI returned an unexpected shape.");

    // Quiet-hours filter: drop suggestions inside 21:00–07:00 unless the user's
    // rhythm, an existing busy block, or the task itself explicitly lives there.
    const toMin = (s: string) => {
      const [h, m] = s.split(":").map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    };
    const inQuiet = (startM: number, endM: number) => {
      // treat window as [21:00, 24:00) ∪ [0, 07:00)
      const overlaps = (a: number, b: number, x: number, y: number) => a < y && x < b;
      return (
        (overlaps(startM, endM, 21 * 60, 24 * 60) || overlaps(startM, endM, 0, 7 * 60)) &&
        !(startM < 21 * 60 && endM > 7 * 60 && endM <= 21 * 60 === false)
      );
    };

    const rhythmAnchors: string[] = [];
    if (rhythm) {
      for (const [k, v] of Object.entries(rhythm as Record<string, unknown>)) {
        if (typeof v === "string" && /^\d{1,2}:\d{2}/.test(v) &&
            ["wake_time", "winddown_time", "focus_start", "focus_end", "movement_time", "journaling_time"].includes(k)) {
          rhythmAnchors.push(v);
        }
      }
    }
    const rhythmInQuiet = rhythmAnchors.some((t) => {
      const m = toMin(t);
      return m >= 21 * 60 || m < 7 * 60;
    });
    const busyInQuiet = data.busy.some((b) => {
      const s = toMin(b.start), e = toMin(b.end);
      return s >= 21 * 60 || s < 7 * 60 || e > 21 * 60 + 1 && e <= 24 * 60 || (e > 0 && e <= 7 * 60);
    });

    const filtered = out.data.suggestions.filter((s) => {
      const startM = toMin(s.start);
      const endM = toMin(s.end);
      if (!inQuiet(startM, endM)) return true;
      if (rhythmInQuiet || busyInQuiet) return true;
      const task = data.tasks.find((t) => t.id === s.taskId);
      const blob = `${task?.title ?? ""} ${task?.notes ?? ""}`;
      const matches = blob.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) ?? [];
      return matches.some((t) => {
        const m = toMin(t);
        return m >= 21 * 60 || m < 7 * 60;
      });
    });

    return { suggestions: filtered };
  });
