import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RhythmInput = z.object({
  wake_time: z.string().nullable().optional(),
  winddown_time: z.string().nullable().optional(),
  focus_start: z.string().nullable().optional(),
  focus_end: z.string().nullable().optional(),
  movement_time: z.string().nullable().optional(),
  journaling_time: z.string().nullable().optional(),
  chore_anchors: z.string().nullable().optional(),
  prefers_times: z.boolean().optional(),
  keep_free_windows: z
    .array(z.object({ start: z.string(), end: z.string(), label: z.string().optional() }))
    .optional(),
  notes: z.string().nullable().optional(),
});

export const getRhythm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_rhythm" as never)
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data ?? null;
  });

export const saveRhythm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RhythmInput.parse(raw))
  .handler(async ({ context, data }) => {
    const row = { user_id: context.userId, ...data };
    const { error } = await context.supabase
      .from("user_rhythm" as never)
      .upsert(row as never, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
