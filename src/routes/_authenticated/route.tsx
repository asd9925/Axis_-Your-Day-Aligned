import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, CheckCircle2, Coffee, Home, Settings as SettingsIcon, Sparkles, LogOut, Star } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { BreakNudger } from "@/components/BreakNudger";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const NAV = [
  { to: "/today", label: "Today", icon: Home },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/habits", label: "Habits", icon: Sparkles },
  { to: "/dream-life", label: "Dream", icon: Star },
  { to: "/breaks", label: "Breaks", icon: Coffee },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;


function AuthedLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Redirect to onboarding until the user has picked a tier
  useEffect(() => {
    if (profile && !profile.onboarding_completed_at && path !== "/onboarding") {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [profile, path, navigate]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar p-4 md:flex">
        <Link to="/today" className="mb-8 flex items-center gap-2 px-2">
          <div className="grid h-8 w-8 place-items-center rounded-full border-2 border-foreground">
            <div className="h-2 w-2 rounded-full bg-foreground" />
          </div>
          <span className="text-lg font-display">axis</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = path.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 px-3 text-sm text-foreground">
            {profile?.display_name ?? "you"}
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex min-h-screen flex-1 flex-col pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-sidebar md:hidden">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = path.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <BreakNudger />
    </div>
  );
}
