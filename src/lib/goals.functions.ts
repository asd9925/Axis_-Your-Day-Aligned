import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  target_date: z.string().optional(),
});

const StepSchema = z.object({
  steps: z
    .array(
      z.object({
        title: z.string(),
        cadence: z.enum(["daily", "weekly"]),
        preferred_time: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(6),
});

export const suggestGoalSteps = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const system =
      "You are a calm ADHD-friendly coach. Given a goal, return 3-6 small, concrete, actionable steps a person can do repeatedly. Each step should take under 30 minutes. Use warm, plain language. Return strict JSON.";
    const prompt = `Goal: ${data.title}${data.notes ? `\nNotes: ${data.notes}` : ""}${data.target_date ? `\nTarget date: ${data.target_date}` : ""}\n\nReturn JSON: {"steps":[{"title":"...","cadence":"daily"|"weekly","preferred_time":"HH:MM"|null}]}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("AI returned invalid JSON.");
    }
    const out = StepSchema.safeParse(parsed);
    if (!out.success) throw new Error("AI returned an unexpected shape.");
    return out.data;
  });
