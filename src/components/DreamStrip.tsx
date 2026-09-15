import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/hooks/useProfile";
import { Sparkles, Check } from "lucide-react";
import { format } from "date-fns";

type DreamTask = {
  id: string;
  title: string;
  completed_at: string | null;
  dream_id: string | null;
};

export function DreamStrip({ date }: { date: Date }) {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const dateStr = format(date, "yyyy-MM-dd");

  const { data: items = [] } = useQuery({
    queryKey: ["dream-strip", user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as DreamTask[];
      const { data } = await supabase
        .from("tasks")
        .select("id, title, completed_at, dream_id")
        .eq("user_id", user.id)
        .not("dream_id", "is", null)
        .or(`task_date.eq.${dateStr},and(bucket.eq.later,completed_at.is.null)`)
        .order("position");
      return (data ?? []) as DreamTask[];
    },
  });

  if (items.length === 0) return null;

  const toggle = async (t: DreamTask) => {
    await supabase
      .from("tasks")
      .update({ completed_at: t.completed_at ? null : new Date().toISOString() })
      .eq("id", t.id);
    qc.invalidateQueries({ queryKey: ["dream-strip"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-foreground/70" />
        <h3 className="text-xs uppercase tracking-widest text-muted-foreground">Dream life today</h3>
        <span className="ml-auto text-xs text-muted-foreground">Check off — no clock required</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((t) => {
          const done = !!t.completed_at;
          return (
            <button
              key={t.id}
              onClick={() => toggle(t)}
              className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                done
                  ? "border-border bg-background/40 text-muted-foreground line-through"
                  : "border-border bg-background hover:bg-secondary"
              }`}
            >
              <span
                className={`grid h-4 w-4 place-items-center rounded-full border ${
                  done ? "border-foreground bg-foreground text-background" : "border-border"
                }`}
              >
                {done && <Check className="h-3 w-3" />}
              </span>
              {t.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
