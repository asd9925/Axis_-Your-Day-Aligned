import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionUser, useProfile } from "@/hooks/useProfile";
import { TIERS, type FeatureKey } from "@/lib/tiers";
import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import type { Tier } from "@/hooks/useProfile";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const { user } = useSessionUser();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState<Tier | null>(null);
  const currentTier = profile?.tier ?? "free";

  const choose = async (tier: Tier) => {
    if (!user) return;
    setSaving(tier);
    const { error } = await supabase
      .from("profiles")
      .update({ tier, onboarding_completed_at: new Date().toISOString() } as never)
      .eq("id", user.id);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`You're on ${tier}. Welcome to Axis.`);
    qc.invalidateQueries({ queryKey: ["profile"] });
    navigate({ to: "/rhythm", search: { from: "onboarding" } });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 md:px-10 md:py-14">
      <header className="mb-10 text-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Pick your plan</p>
        <h1 className="mt-2 font-display text-3xl md:text-4xl">Find your axis.</h1>
        <p className="mt-3 text-sm text-muted-foreground">Start free. Add more only when it earns its place.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((t) => {
          const isCurrent = currentTier === t.key;
          const isPopular = t.key === "plus";
          return (
            <div
              key={t.key}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                isPopular ? "border-foreground bg-card" : "border-border bg-card"
              }`}
            >
              {isPopular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-[10px] uppercase tracking-widest text-background">
                  <Sparkles className="mr-1 inline h-3 w-3" /> Most picked
                </span>
              )}
              <h2 className="font-display text-2xl">{t.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.tagline}</p>
              <p className="mt-4 font-display text-3xl">{t.price}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {t.includes.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => choose(t.key)}
                disabled={saving !== null}
                variant={isPopular ? "default" : "outline"}
                className="mt-6"
              >
                {saving === t.key ? "Saving…" : isCurrent ? "Continue on " + t.name : `Choose ${t.name}`}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        On Free or Plus? You can unlock individual features à la carte anywhere you see them.
        Real payments coming soon — for now, everything is on the house so you can try it.
      </p>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Next: a short optional rhythm questionnaire — helps most on Plus & Pro. Free users can skip it.
      </p>
    </div>
  );
}

// Keeps TS from complaining about unused import when Tier is only used in signature above
export type _Tier = FeatureKey;
