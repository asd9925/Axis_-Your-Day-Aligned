import { useEffect } from "react";
import { useProfile } from "@/hooks/useProfile";

export function ProfileColorSync() {
  const { data: profile } = useProfile();
  useEffect(() => {
    if (!profile || typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--bucket-today", profile.color_today);
    root.style.setProperty("--bucket-later", profile.color_later);
    root.style.setProperty("--bucket-habits", profile.color_habits);
    if (profile.color_recurring) root.style.setProperty("--event-recurring", profile.color_recurring);
  }, [profile]);
  return null;
}
