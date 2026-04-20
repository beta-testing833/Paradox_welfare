/**
 * agentAssignment.ts
 * ----------------------------------------------------------------------------
 * Helpers that pick an agent for a scheme application.
 *
 * Two callers:
 *
 *   1. ApplyModal — when a user submits a brand-new application, we need to
 *      pick the FIRST agent for that scheme. That agent is locked in for all
 *      future calls/visits on this application unless the user explicitly
 *      changes them via the Change Agent modal.
 *
 *   2. BookNextCallModal — when an application already has an
 *      `assigned_agent_id`, we keep that agent. We only need to filter the
 *      available time slots on the chosen date so we don't double-book them.
 *
 * Selection rules for the FIRST agent:
 *   • Active agents only.
 *   • Specialization array overlaps the scheme's category (case-sensitive).
 *     If no overlap exists, fall back to the least-busy active agent overall.
 *   • Exclude any agent already booked at the user's chosen scheduled_at slot
 *     (matched at minute precision via the agent_bookings view).
 *   • Order by current "open booking" load ascending so we balance the team.
 *
 * Time-slot helpers:
 *   • Standard slots are 09:00–10:00, 10:00–11:00, …, 17:00–18:00 (we skip
 *     the 13:00–14:00 lunch hour to mirror the existing ApplyModal).
 *   • slotStartHHMM(slot) returns the "HH:MM" key used in agent_bookings.
 *   • bookedSlotsFor(agentId, dateISO) returns the set of "HH:MM" slot
 *     starts that agent is already booked into on that calendar date.
 *
 * Everything talks to the linked Supabase project. No mock data.
 */
import { supabase } from "@/integrations/supabase/client";

/** Standard, lunch-skipping consultation slot list. */
export const TIME_SLOTS = [
  "09:00–10:00",
  "10:00–11:00",
  "11:00–12:00",
  "12:00–13:00",
  "14:00–15:00",
  "15:00–16:00",
  "16:00–17:00",
  "17:00–18:00",
] as const;

export type TimeSlot = typeof TIME_SLOTS[number];

/** Convert "09:00–10:00" → "09:00", which is how agent_bookings keys slots. */
export function slotStartHHMM(slot: string): string {
  return slot.split("–")[0]!.trim();
}

/**
 * Combine a calendar date string ("2026-04-25") and a slot
 * ("10:00–11:00") into an ISO timestamp at the slot's start, in local time.
 * We then convert to ISO so Supabase stores it consistently in UTC.
 */
export function combineDateAndSlot(dateISO: string, slot: TimeSlot | string): string {
  const start = slotStartHHMM(slot);
  // Build a local Date — Supabase will accept the ISO with timezone offset.
  const local = new Date(`${dateISO}T${start}:00`);
  return local.toISOString();
}

/**
 * Fetch the set of "HH:MM" slot starts an agent is already booked into on a
 * given date. Used by the BookNextCallModal to grey out unavailable slots.
 */
export async function bookedSlotsFor(
  agentId: string,
  dateISO: string,
): Promise<Set<string>> {
  // The view returns a `booking_date` (date) and `slot_start` (HH:MM text).
  // We over-select with a generous timestamp window and filter client-side
  // because the view's `booking_date` is a UTC-derived calendar date, which
  // can drift by a day at the edges of timezones.
  const dayStart = new Date(`${dateISO}T00:00:00`);
  const dayEnd = new Date(`${dateISO}T23:59:59`);

  const { data, error } = await supabase
    .from("interactions")
    .select("scheduled_at, interaction_type, completed_at")
    .eq("agent_id", agentId)
    .in("interaction_type", ["call_booked", "visit_booked"])
    .is("completed_at", null)
    .gte("scheduled_at", dayStart.toISOString())
    .lte("scheduled_at", dayEnd.toISOString());

  if (error || !data) return new Set();

  // Convert each scheduled_at to "HH:MM" in local time and collect.
  const result = new Set<string>();
  for (const row of data) {
    if (!row.scheduled_at) continue;
    const d = new Date(row.scheduled_at as string);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    result.add(`${hh}:${mm}`);
  }
  return result;
}

interface AgentRow {
  id: string;
  full_name: string;
  specialization: string[] | null;
  is_active: boolean | null;
}

/**
 * Pick the best available agent for a brand-new application.
 *
 * @param schemeCategory  The scheme's category text (e.g. "Agriculture").
 * @param scheduledAtIso  The user's chosen consultation start time, ISO. We
 *                        exclude any agent already booked in that exact slot.
 *
 * Returns the agent's id, or null if the agent table is empty (which would
 * only happen if the seeds were never run).
 */
export async function pickAgentForNewApplication(
  schemeCategory: string | null,
  scheduledAtIso: string,
): Promise<string | null> {
  // 1. Pull every active agent.
  const { data: agents, error: agErr } = await supabase
    .from("agents")
    .select("id, full_name, specialization, is_active")
    .eq("is_active", true);
  if (agErr || !agents || agents.length === 0) return null;

  // 2. Determine which agents are already booked in that exact slot. We match
  //    on the minute — two bookings at the same minute count as conflict.
  const slotDate = new Date(scheduledAtIso);
  const slotStart = new Date(slotDate);
  slotStart.setSeconds(0, 0);
  const slotEnd = new Date(slotStart);
  slotEnd.setMinutes(slotEnd.getMinutes() + 59);

  const { data: conflicts } = await supabase
    .from("interactions")
    .select("agent_id")
    .in("interaction_type", ["call_booked", "visit_booked"])
    .is("completed_at", null)
    .gte("scheduled_at", slotStart.toISOString())
    .lte("scheduled_at", slotEnd.toISOString());

  const busy = new Set((conflicts ?? []).map((r) => r.agent_id).filter(Boolean) as string[]);

  // 3. Compute open-booking load for each agent so we can sort ascending.
  const { data: openLoad } = await supabase
    .from("interactions")
    .select("agent_id")
    .in("interaction_type", ["call_booked", "visit_booked"])
    .is("completed_at", null);

  const loadCount = new Map<string, number>();
  for (const row of openLoad ?? []) {
    if (!row.agent_id) continue;
    loadCount.set(row.agent_id, (loadCount.get(row.agent_id) ?? 0) + 1);
  }

  // 4. Filter and rank.
  const available = (agents as AgentRow[]).filter((a) => !busy.has(a.id));
  if (available.length === 0) {
    // All available agents are booked at that slot — fall back to ANY agent.
    // (We still want the application to get a continuity agent; in practice
    // this is exceedingly rare with 8 seeded agents.)
    available.push(...(agents as AgentRow[]));
  }

  // Specialization match comes first — case-insensitive substring overlap.
  const cat = (schemeCategory ?? "").toLowerCase();
  const matchesCat = (a: AgentRow) =>
    !!a.specialization?.some((s) => s && cat && s.toLowerCase().includes(cat));

  const matched = available.filter(matchesCat);
  const pool = matched.length > 0 ? matched : available;

  // Sort ascending by current load.
  pool.sort((a, b) => (loadCount.get(a.id) ?? 0) - (loadCount.get(b.id) ?? 0));
  return pool[0]?.id ?? null;
}

/**
 * For the Change Agent modal: pick up to 5 candidate agents the user can
 * switch to (excluding the current one). Specialization match first, then
 * least loaded.
 */
export async function listChangeAgentCandidates(
  schemeCategory: string | null,
  excludeAgentId: string | null,
): Promise<Array<{ id: string; full_name: string; specialization: string[] | null; languages: string[] | null }>> {
  const { data: agents } = await supabase
    .from("agents")
    .select("id, full_name, specialization, languages, is_active")
    .eq("is_active", true);
  if (!agents) return [];

  const { data: openLoad } = await supabase
    .from("interactions")
    .select("agent_id")
    .in("interaction_type", ["call_booked", "visit_booked"])
    .is("completed_at", null);

  const loadCount = new Map<string, number>();
  for (const row of openLoad ?? []) {
    if (!row.agent_id) continue;
    loadCount.set(row.agent_id, (loadCount.get(row.agent_id) ?? 0) + 1);
  }

  const cat = (schemeCategory ?? "").toLowerCase();
  const filtered = agents.filter((a) => a.id !== excludeAgentId);
  const matchesCat = (a: typeof agents[0]) =>
    !!a.specialization?.some((s: string) => s && cat && s.toLowerCase().includes(cat));
  const matched = filtered.filter(matchesCat);
  const pool = matched.length >= 3 ? matched : filtered;
  pool.sort((a, b) => (loadCount.get(a.id) ?? 0) - (loadCount.get(b.id) ?? 0));
  return pool.slice(0, 5).map((a) => ({
    id: a.id,
    full_name: a.full_name,
    specialization: a.specialization,
    languages: a.languages,
  }));
}
