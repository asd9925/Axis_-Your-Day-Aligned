import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSessionUser } from "@/hooks/useProfile";
import { Coffee } from "lucide-react";

export function NextBreakChip() {
  const { user } = useSessionUser();
  const { data: profile } = useProfile();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const { data: lastLog } = useQuery({
    queryKey: ["last-break", user?.id, tick],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("break_logs")
        .select("taken_at")
        .eq("user_id", user.id)
        .order("taken_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.taken_at ?? null;
    },
  });

  if (!profile) return null;
  const interval = Math.max(15, profile.nudge_interval_min);
  const lastMs = lastLog ? new Date(lastLog).getTime() : Date.now() - interval * 60_000;
  const nextMs = lastMs + interval * 60_000;
  const minsUntil = Math.round((nextMs - Date.now()) / 60_000);
  const overdue = minsUntil <= 0;

  const label = overdue ? `Break due ${Math.abs(minsUntil)}m ago` : `Next break in ~${minsUntil}m`;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
      style={{
        borderColor: overdue ? "color-mix(in oklab, var(--accent) 60%, var(--border))" : "var(--border)",
        backgroundColor: overdue ? "color-mix(in oklab, var(--accent) 15%, transparent)" : "transparent",
        color: overdue ? "var(--foreground)" : "var(--muted-foreground)",
      }}
      title="Nudge cadence set in Settings"
    >
      <Coffee className="h-3 w-3" />
      {label}
    </span>
  );
}
