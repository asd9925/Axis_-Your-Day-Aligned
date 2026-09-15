import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  authorizeAppUserOAuth,
  callAsAppUser,
  disconnectAppUser,
} from "@/integrations/lovable/appUserConnector";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_calendar";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar",
];

// ---------------- OAuth start ----------------

export const startGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((targetOrigin: string) => targetOrigin)
  .handler(async ({ data: targetOrigin, context }) => {
    const clientKey = process.env.GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY;
    if (!clientKey) throw new Error("GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY not set");
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl: targetOrigin,
      responseMode: "web_message",
      webMessageTargetOrigin: targetOrigin,
      credentialsConfiguration: { scopes: GOOGLE_SCOPES },
    });
    return { authorizationUrl };
  });

// ---------------- Save / disconnect ----------------

export const saveGoogleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ connectionAPIKey: z.string().min(1) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { saveConnectionKeyForUser } = await import("@/server/appUserConnections.server");

    // Fetch the Google account email so we can display it in settings.
    let email: string | undefined;
    try {
      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: data.connectionAPIKey,
        connectorId: CONNECTOR_ID,
        path: "/calendar/v3/calendars/primary",
      });
      if (res.ok) {
        const j = (await res.json()) as { id?: string };
        email = j.id;
      }
    } catch {
      // non-fatal
    }

    await saveConnectionKeyForUser(context.userId, CONNECTOR_ID, data.connectionAPIKey, email);

    // Enable sync + reset any stale sync token.
    await context.supabase
      .from("profiles")
      .update({
        google_sync_enabled: true,
        google_sync_token: null,
        google_sync_calendar_id: "primary",
      })
      .eq("id", context.userId);

    return { ok: true, email };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser, deleteConnectionForUser } = await import(
      "@/server/appUserConnections.server"
    );
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (key) {
      try {
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: key,
          connectorId: CONNECTOR_ID,
        });
      } catch {
        // continue — still delete local record
      }
    }
    await deleteConnectionForUser(context.userId, CONNECTOR_ID);
    await context.supabase
      .from("profiles")
      .update({
        google_sync_enabled: false,
        google_sync_token: null,
      })
      .eq("id", context.userId);
    // Clear google id refs on local events (keep the events themselves).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("events")
      .update({
        google_event_id: null,
        google_calendar_id: null,
        google_etag: null,
        google_updated_at: null,
      })
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const getGoogleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionMetaForUser } = await import("@/server/appUserConnections.server");
    const meta = await getConnectionMetaForUser(context.userId, CONNECTOR_ID);
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("google_sync_enabled, google_sync_calendar_id, google_last_synced_at")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      connected: !!meta,
      email: meta?.account_email ?? null,
      syncEnabled: profile?.google_sync_enabled ?? false,
      calendarId: profile?.google_sync_calendar_id ?? "primary",
      lastSyncedAt: profile?.google_last_synced_at ?? null,
    };
  });

export const setGoogleSyncEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ enabled: z.boolean() }).parse(raw))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("profiles")
      .update({ google_sync_enabled: data.enabled })
      .eq("id", context.userId);
    return { ok: true };
  });

// ---------------- Recurrence mapping ----------------

// Axis RecurrenceRule shape (mirrors src/routes/_authenticated/calendar.tsx).
type AxisRule = {
  freq: "daily" | "weekly" | "monthly";
  interval: number;
  byweekday?: number[]; // 0..6 (Sun..Sat)
  endMode: "never" | "on" | "count";
  endDate?: string; // yyyy-MM-dd
  count?: number;
};

const BYDAY_TO_NUM: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const NUM_TO_BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function ruleToRRuleString(rule: AxisRule | null | undefined): string | null {
  if (!rule?.freq) return null;
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byweekday && rule.byweekday.length) {
    parts.push(`BYDAY=${rule.byweekday.map((n) => NUM_TO_BYDAY[n]).filter(Boolean).join(",")}`);
  }
  if (rule.endMode === "count" && rule.count) parts.push(`COUNT=${rule.count}`);
  if (rule.endMode === "on" && rule.endDate) {
    parts.push(`UNTIL=${rule.endDate.replace(/-/g, "")}T235959Z`);
  }
  return `RRULE:${parts.join(";")}`;
}

function rruleStringToRule(rrule: string): AxisRule | null {
  const body = rrule.replace(/^RRULE:/i, "");
  const map: Record<string, string> = {};
  for (const pair of body.split(";")) {
    const [k, v] = pair.split("=");
    if (k && v) map[k.toUpperCase()] = v;
  }
  const rawFreq = map.FREQ?.toLowerCase();
  if (rawFreq !== "daily" && rawFreq !== "weekly" && rawFreq !== "monthly") return null;

  const rule: AxisRule = {
    freq: rawFreq,
    interval: map.INTERVAL ? Math.max(1, parseInt(map.INTERVAL, 10) || 1) : 1,
    endMode: "never",
  };

  if (map.BYDAY) {
    const nums = map.BYDAY.split(",")
      .map((d) => BYDAY_TO_NUM[d.trim().toUpperCase().slice(-2)])
      .filter((n) => typeof n === "number");
    if (nums.length) rule.byweekday = nums;
  }

  if (map.COUNT) {
    const n = parseInt(map.COUNT, 10);
    if (n > 0) {
      rule.endMode = "count";
      rule.count = n;
    }
  } else if (map.UNTIL) {
    // Accept YYYYMMDD or YYYYMMDDTHHMMSSZ
    const m = map.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) {
      rule.endMode = "on";
      rule.endDate = `${m[1]}-${m[2]}-${m[3]}`;
    }
  }

  return rule;
}

// Detect legacy Google-shaped rules stored before the fix.
function isLegacyGoogleRule(r: unknown): boolean {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  if (!o.freq) return false;
  if (typeof o.endMode === "string") return false; // already Axis shape
  return "until" in o || "byday" in o || "count" in o || !("endMode" in o);
}

function legacyGoogleRuleToAxis(r: Record<string, unknown>): AxisRule | null {
  const rawFreq = typeof r.freq === "string" ? r.freq.toLowerCase() : "";
  if (rawFreq !== "daily" && rawFreq !== "weekly" && rawFreq !== "monthly") return null;
  const rule: AxisRule = {
    freq: rawFreq,
    interval: typeof r.interval === "number" && r.interval > 0 ? r.interval : 1,
    endMode: "never",
  };
  if (Array.isArray(r.byday)) {
    const nums = (r.byday as unknown[])
      .map((d) => (typeof d === "string" ? BYDAY_TO_NUM[d.trim().toUpperCase().slice(-2)] : undefined))
      .filter((n): n is number => typeof n === "number");
    if (nums.length) rule.byweekday = nums;
  }
  if (typeof r.count === "number" && r.count > 0) {
    rule.endMode = "count";
    rule.count = r.count;
  } else if (typeof r.until === "string") {
    const m = r.until.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
    if (m) {
      rule.endMode = "on";
      rule.endDate = `${m[1]}-${m[2]}-${m[3]}`;
    }
  }
  return rule;
}

// ---------------- Push to Google ----------------

type AxisEventRow = {
  id: string;
  user_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  notes: string | null;
  is_important: boolean;
  recurrence_rule: unknown;
  recurrence_parent_id: string | null;
  google_event_id: string | null;
  google_calendar_id: string | null;
};

function buildGoogleBody(evt: AxisEventRow) {
  const startMs = new Date(evt.starts_at).getTime();
  let endMs = new Date(evt.ends_at).getTime();
  // Google rejects empty/inverted ranges (timeRangeEmpty). Ensure end > start.
  if (!Number.isFinite(endMs) || endMs <= startMs) {
    endMs = startMs + 5 * 60 * 1000;
  }
  const body: Record<string, unknown> = {
    summary: evt.title,
    description: evt.notes ?? undefined,
    location: evt.location ?? undefined,
    start: { dateTime: new Date(startMs).toISOString() },
    end: { dateTime: new Date(endMs).toISOString() },
  };
  if (evt.is_important) body.colorId = "11"; // red-ish
  const rrule = evt.recurrence_rule && typeof evt.recurrence_rule === "object"
    ? ruleToRRuleString(evt.recurrence_rule as AxisRule)
    : null;
  if (rrule) body.recurrence = [rrule];
  return body;
}

export const pushEventToGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ eventId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (!key) return { ok: false, reason: "not_connected" };

    const { data: evt, error } = await context.supabase
      .from("events")
      .select("*")
      .eq("id", data.eventId)
      .maybeSingle();
    if (error) throw error;
    if (!evt) return { ok: false, reason: "not_found" };
    // Skip virtual recurrence instances (they're not stored anyway).
    if (evt.recurrence_parent_id) return { ok: false, reason: "instance" };

    const calId = evt.google_calendar_id ?? "primary";
    const body = buildGoogleBody(evt as AxisEventRow);
    const encoded = encodeURIComponent(calId);
    const isUpdate = !!evt.google_event_id;
    const path = isUpdate
      ? `/calendar/v3/calendars/${encoded}/events/${encodeURIComponent(evt.google_event_id!)}`
      : `/calendar/v3/calendars/${encoded}/events`;

    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: key,
      connectorId: CONNECTOR_ID,
      path,
      init: {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      // If the remote event was deleted, insert a fresh one.
      if (isUpdate && (res.status === 404 || res.status === 410)) {
        const res2 = await callAsAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: key,
          connectorId: CONNECTOR_ID,
          path: `/calendar/v3/calendars/${encoded}/events`,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        });
        if (!res2.ok) throw new Error(`Google create failed: ${res2.status}`);
        const j = (await res2.json()) as { id: string; etag?: string; updated?: string };
        await context.supabase
          .from("events")
          .update({
            google_event_id: j.id,
            google_calendar_id: calId,
            google_etag: j.etag ?? null,
            google_updated_at: j.updated ?? null,
          })
          .eq("id", evt.id);
        return { ok: true, googleEventId: j.id };
      }
      throw new Error(`Google push failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const j = (await res.json()) as { id: string; etag?: string; updated?: string };
    await context.supabase
      .from("events")
      .update({
        google_event_id: j.id,
        google_calendar_id: calId,
        google_etag: j.etag ?? null,
        google_updated_at: j.updated ?? null,
      })
      .eq("id", evt.id);
    return { ok: true, googleEventId: j.id };
  });

export const deleteEventFromGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      googleEventId: z.string().min(1),
      googleCalendarId: z.string().min(1).default("primary"),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (!key) return { ok: false };
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: key,
      connectorId: CONNECTOR_ID,
      path: `/calendar/v3/calendars/${encodeURIComponent(data.googleCalendarId)}/events/${encodeURIComponent(data.googleEventId)}`,
      init: { method: "DELETE" },
    });
    // 404/410 = already gone, treat as success.
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`Google delete failed: ${res.status}`);
    }
    return { ok: true };
  });

// ---------------- Pull from Google ----------------

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  recurrence?: string[];
  recurringEventId?: string;
  etag?: string;
  updated?: string;
  colorId?: string;
};

export const syncGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (!key) throw new Error("Google Calendar is not connected.");

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("google_sync_calendar_id, google_sync_token")
      .eq("id", context.userId)
      .maybeSingle();
    const calId = profile?.google_sync_calendar_id ?? "primary";
    let syncToken: string | null = profile?.google_sync_token ?? null;

    let imported = 0;
    let deleted = 0;
    let pageToken: string | null = null;
    let nextSyncToken: string | null = null;
    let attempt = 0;

    while (true) {
      attempt++;
      if (attempt > 25) break; // safety
      const params = new URLSearchParams();
      params.set("maxResults", "250");
      if (syncToken) {
        params.set("syncToken", syncToken);
      } else {
        // First run: last 30 days forward 1 year.
        const min = new Date();
        min.setDate(min.getDate() - 30);
        const max = new Date();
        max.setFullYear(max.getFullYear() + 1);
        params.set("timeMin", min.toISOString());
        params.set("timeMax", max.toISOString());
        params.set("singleEvents", "false");
      }
      if (pageToken) params.set("pageToken", pageToken);

      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: key,
        connectorId: CONNECTOR_ID,
        path: `/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params.toString()}`,
      });
      if (res.status === 410) {
        // Sync token expired — restart fresh.
        syncToken = null;
        pageToken = null;
        await context.supabase
          .from("profiles")
          .update({ google_sync_token: null })
          .eq("id", context.userId);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google list failed (${res.status}): ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        items?: GoogleEvent[];
        nextPageToken?: string;
        nextSyncToken?: string;
      };

      for (const item of json.items ?? []) {
        // Skip individual instances of recurring events — we store only masters.
        if (item.recurringEventId) continue;
        if (item.status === "cancelled") {
          const { count } = await context.supabase
            .from("events")
            .delete({ count: "exact" })
            .eq("user_id", context.userId)
            .eq("google_event_id", item.id);
          deleted += count ?? 0;
          continue;
        }
        const startISO = item.start?.dateTime ?? (item.start?.date ? `${item.start.date}T00:00:00Z` : null);
        const endISO = item.end?.dateTime ?? (item.end?.date ? `${item.end.date}T23:59:59Z` : null);
        if (!startISO || !endISO) continue;
        const rrule = item.recurrence?.find((r) => r.startsWith("RRULE:"));
        const recurrenceRule = rrule ? rruleStringToRule(rrule) : null;

        const row = {
          user_id: context.userId,
          title: item.summary ?? "(untitled)",
          notes: item.description ?? null,
          location: item.location ?? null,
          starts_at: startISO,
          ends_at: endISO,
          is_important: item.colorId === "11",
          recurrence_rule: recurrenceRule,
          source: "google",
          google_event_id: item.id,
          google_calendar_id: calId,
          google_etag: item.etag ?? null,
          google_updated_at: item.updated ?? null,
        } as never;

        // Upsert by (user_id, google_calendar_id, google_event_id).
        const { data: existing } = await context.supabase
          .from("events")
          .select("id")
          .eq("user_id", context.userId)
          .eq("google_event_id", item.id)
          .maybeSingle();
        if (existing) {
          await context.supabase.from("events").update(row).eq("id", existing.id);
        } else {
          await context.supabase.from("events").insert(row);
        }
        imported++;
      }

      if (json.nextPageToken) {
        pageToken = json.nextPageToken;
        continue;
      }
      nextSyncToken = json.nextSyncToken ?? null;
      break;
    }

    await context.supabase
      .from("profiles")
      .update({
        google_sync_token: nextSyncToken,
        google_last_synced_at: new Date().toISOString(),
      })
      .eq("id", context.userId);

    // Repair any legacy-shaped recurrence rules from previous imports.
    const repaired = await repairLegacyRulesForUser(context.userId, context.supabase);

    return { ok: true, imported, deleted, repaired };
  });

async function repairLegacyRulesForUser(
  userId: string,
  supabase: { from: (t: string) => any },
): Promise<number> {
  const { data, error } = await supabase
    .from("events")
    .select("id, recurrence_rule")
    .eq("user_id", userId)
    .not("recurrence_rule", "is", null);
  if (error || !data) return 0;
  let fixed = 0;
  for (const row of data as Array<{ id: string; recurrence_rule: unknown }>) {
    if (!isLegacyGoogleRule(row.recurrence_rule)) continue;
    const next = legacyGoogleRuleToAxis(row.recurrence_rule as Record<string, unknown>);
    await supabase
      .from("events")
      .update({ recurrence_rule: next })
      .eq("id", row.id);
    fixed++;
  }
  return fixed;
}

export const repairGoogleRecurrences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const repaired = await repairLegacyRulesForUser(context.userId, context.supabase);
    return { ok: true, repaired };
  });
