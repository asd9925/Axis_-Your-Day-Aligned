import { useProfile, type Tier } from "@/hooks/useProfile";

export type FeatureKey =
  | "recurring_events"
  | "unlimited_habits"
  | "goals"
  | "break_nudges"
  | "reshape_day"
  | "insights"
  | "stale_parked"
  | "dream_life"
  | "task_max";


export const FEATURE_LABEL: Record<FeatureKey, string> = {
  recurring_events: "Recurring events",
  unlimited_habits: "Unlimited habits",
  goals: "Goals",
  break_nudges: "Break nudges",
  reshape_day: "Reshape day",
  insights: "Insights",
  stale_parked: "Stale-parked review",
  dream_life: "Dream Life with Stella",
  task_max: "Task Max (AI pairings)",
};

export const FEATURE_PRICE: Record<FeatureKey, number> = {
  recurring_events: 3,
  unlimited_habits: 3,
  goals: 4,
  break_nudges: 3,
  reshape_day: 4,
  insights: 5,
  stale_parked: 3,
  dream_life: 5,
  task_max: 4,
};


const TIER_FEATURES: Record<Tier, Set<FeatureKey>> = {
  free: new Set<FeatureKey>(),
  plus: new Set<FeatureKey>([
    "recurring_events",
    "unlimited_habits",
    "goals",
    "break_nudges",
    "reshape_day",
    "task_max",
  ]),
  pro: new Set<FeatureKey>([
    "recurring_events",
    "unlimited_habits",
    "goals",
    "break_nudges",
    "reshape_day",
    "insights",
    "stale_parked",
    "dream_life",
    "task_max",
  ]),
};


export const TIERS: {
  key: Tier;
  name: string;
  price: string;
  tagline: string;
  includes: string[];
}[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    tagline: "The essentials, calm.",
    includes: ["Calendar events", "Up to 3 habits", "Today list", "Basic tasks"],
  },
  {
    key: "plus",
    name: "Plus",
    price: "$6/mo",
    tagline: "For the busy brain.",
    includes: [
      "Everything in Free",
      "Recurring events",
      "Unlimited habits",
      "Goals",
      "Gentle break nudges",
      "Reshape your day",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$12/mo",
    tagline: "Every axis, aligned.",
    includes: [
      "Everything in Plus",
      "Task insights",
      "Stale-parked review",
      "Dream Life with Stella",
      "Early access to new features",
    ],
  },
];


export function tierHasFeature(tier: Tier, key: FeatureKey): boolean {
  return TIER_FEATURES[tier].has(key);
}

export function useTier() {
  const { data: profile, isLoading } = useProfile();
  const tier: Tier = profile?.tier ?? "free";
  const unlocked = new Set(profile?.unlocked_features ?? []);
  return {
    tier,
    isLoading,
    hasFeature: (key: FeatureKey) => tierHasFeature(tier, key) || unlocked.has(key),
    isUnlockedAlaCarte: (key: FeatureKey) => unlocked.has(key),
    onboardingComplete: !!profile?.onboarding_completed_at,
  };
}
