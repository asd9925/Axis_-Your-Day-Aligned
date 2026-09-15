import { Lock } from "lucide-react";
import { FEATURE_LABEL, FEATURE_PRICE, useTier, type FeatureKey } from "@/lib/tiers";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/hooks/useProfile";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function LockedFeature({
  featureKey,
  children,
  compact,
}: {
  featureKey: FeatureKey;
  children?: ReactNode;
  compact?: boolean;
}) {
  const { hasFeature } = useTier();
  const { user } = useSessionUser();
  const qc = useQueryClient();

  if (hasFeature(featureKey)) return <>{children}</>;

  const unlock = async () => {
    if (!user) return;
    // Scaffold: mark unlocked locally. Real payment flow coming soon.
    const { data: profile } = await supabase
      .from("profiles")
      .select("unlocked_features")
      .eq("id", user.id)
      .maybeSingle();
    const current = ((profile as { unlocked_features?: string[] } | null)?.unlocked_features ?? []);
    if (current.includes(featureKey)) return;
    await supabase
      .from("profiles")
      .update({ unlocked_features: [...current, featureKey] } as never)
      .eq("id", user.id);
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success(`${FEATURE_LABEL[featureKey]} unlocked. Real checkout coming soon.`);
  };

  return (
    <div
      className={
        compact
          ? "flex items-center gap-2 rounded-lg border border-dashed border-border bg-background/40 px-3 py-2"
          : "relative overflow-hidden rounded-2xl border border-dashed border-border bg-background/40 p-6 text-center"
      }
    >
      <Lock className={compact ? "h-3.5 w-3.5 text-muted-foreground" : "mx-auto mb-2 h-5 w-5 text-muted-foreground"} />
      <div className={compact ? "flex-1 text-xs" : "text-sm"}>
        <span className="font-medium">{FEATURE_LABEL[featureKey]}</span>{" "}
        <span className="text-muted-foreground">on Plus or Pro.</span>
      </div>
      <div className={compact ? "flex items-center gap-1.5" : "mt-3 flex items-center justify-center gap-2"}>
        <Button size="sm" variant="outline" onClick={unlock}>
          Unlock — ${FEATURE_PRICE[featureKey]}
        </Button>
        <Link to="/onboarding">
          <Button size="sm">Upgrade</Button>
        </Link>
      </div>
    </div>
  );
}
