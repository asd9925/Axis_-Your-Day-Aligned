import { differenceInDays, addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Clock } from "lucide-react";

export function isStale(first_parked_at: string | null, snoozed_until: string | null, cutoffDays: number) {
  if (!first_parked_at) return false;
  if (snoozed_until && new Date(snoozed_until) > new Date()) return false;
  return differenceInDays(new Date(), new Date(first_parked_at)) >= cutoffDays;
}

export function StaleParkedChip({
  taskId,
  firstParkedAt,
}: {
  taskId: string;
  firstParkedAt: string;
}) {
  const qc = useQueryClient();
  const days = differenceInDays(new Date(), new Date(firstParkedAt));

  const promote = async () => {
    await supabase.from("tasks").update({ bucket: "today" }).eq("id", taskId);
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };
  const snooze = async () => {
    const until = format(addDays(new Date(), 7), "yyyy-MM-dd");
    await supabase.from("tasks").update({ parked_snoozed_until: until }).eq("id", taskId);
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px]"
      style={{
        borderColor: "color-mix(in oklab, var(--accent) 50%, var(--border))",
        backgroundColor: "color-mix(in oklab, var(--accent) 10%, transparent)",
      }}
    >
      <Clock className="h-3 w-3 text-muted-foreground" />
      <span className="text-foreground">
        Parked {days} day{days === 1 ? "" : "s"} — no rush, just noticing.
      </span>
      <div className="ml-auto flex gap-1">
        <button
          onClick={promote}
          className="inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] text-background hover:opacity-90"
        >
          <ArrowUp className="h-2.5 w-2.5" /> Move to Must Do
        </button>
        <button
          onClick={snooze}
          className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary"
        >
          Snooze 7 days
        </button>
      </div>
    </div>
  );
}
