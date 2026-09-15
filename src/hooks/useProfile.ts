import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

export type Tier = "free" | "plus" | "pro";

export type Profile = {
  id: string;
  display_name: string | null;
  timezone: string | null;
  color_today: string;
  color_later: string;
  color_habits: string;
  color_recurring: string;
  nudge_interval_min: number;
  quiet_start: string;
  quiet_end: string;
  auto_complete_parent: boolean;
  parked_cutoff_days: number;
  tier: Tier;
  unlocked_features: string[];
  onboarding_completed_at: string | null;
};

export function useSessionUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return { user, loading };
}

export function useProfile() {
  const { user } = useSessionUser();
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data as unknown as Profile;
    },
  });
}
