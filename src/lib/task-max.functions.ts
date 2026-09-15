import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  anchorTitle: z.string().min(1),
  anchorNotes: z.string().optional(),
  otherOpenTasks: z.array(z.string()).max(40).default([]),
});

const Output = z.object({
  suggestions: z
    .array(
      z.object({
        anchor: z.string(),
        pair: z.string(),
        window: z.string(),
        reason: z.string(),
      }),
    )
    .min(1)
    .max(3),
});

export const suggestTaskMax = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const system =
      "You are a calm ADHD-friendly productivity coach. The user has ONE 'anchor' task. Suggest 1-3 low-friction ways to 'task-double' — pair the anchor with a compatible second task the user can do WHILE the anchor runs in the background (e.g. laundry running, water boiling, download progressing, commute). Prefer pairings from the user's own open task list. Otherwise suggest a light generic option (tidy one drawer, reply to two texts, 20-min stretch, read a chapter). Warm, plain language. Never prescriptive. Return strict JSON.";

    const prompt = `Anchor task: ${data.anchorTitle}${data.anchorNotes ? `\nNotes: ${data.anchorNotes}` : ""}\n\nOther open tasks the user has:\n${data.otherOpenTasks.length ? data.otherOpenTasks.map((t) => `- ${t}`).join("\n") : "(none listed)"}\n\nReturn JSON: {"suggestions":[{"anchor":"short anchor step","pair":"what to do while it runs","window":"~time e.g. ~30 min wash cycle","reason":"one warm sentence"}]}`;

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
    const out = Output.safeParse(parsed);
    if (!out.success) throw new Error("AI returned an unexpected shape.");
    return out.data;
  });
