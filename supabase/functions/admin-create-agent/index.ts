/**
 * admin-create-agent
 * ----------------------------------------------------------------------------
 * Single-shot agent onboarding endpoint, callable only by admins.
 *
 * Flow:
 *   1. Verify the caller's JWT and confirm app_metadata.role === "admin".
 *   2. Create a new Supabase auth user (email + password, auto-confirmed).
 *   3. Insert a row into public.agents with the provided profile fields.
 *   4. Link the agent row to the new auth user via agents.auth_user_id.
 *   5. Set the new auth user's app_metadata to { role: "agent", agent_id }.
 *   6. Return the new agent row + auth user id.
 *
 * Uses the service role key — NEVER expose this function path to anonymous
 * traffic without the admin check below.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateAgentBody {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  languages?: string[];
  specialization?: string[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  // ---- 1. Authenticate the caller and verify they are an admin. ----
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  // Use a per-request client bound to the caller's JWT to identify them.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerData.user) {
    return jsonResponse({ error: "Invalid or expired session" }, 401);
  }
  const callerRole = (callerData.user.app_metadata as { role?: string } | null)?.role;
  if (callerRole !== "admin") {
    return jsonResponse({ error: "Forbidden — admin role required" }, 403);
  }

  // ---- 2. Validate body. ----
  let body: CreateAgentBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const errors: Record<string, string> = {};
  if (!body.email || !isValidEmail(body.email)) errors.email = "Valid email required";
  if (!body.password || body.password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  }
  if (!body.full_name || body.full_name.trim().length < 2) {
    errors.full_name = "Full name required";
  }
  if (Object.keys(errors).length > 0) {
    return jsonResponse({ error: "Validation failed", fields: errors }, 400);
  }

  // ---- 3. Create the auth user (service-role client). ----
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email: body.email.trim(),
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: body.full_name.trim() },
  });
  if (userErr || !userData.user) {
    return jsonResponse(
      { error: userErr?.message ?? "Could not create auth user" },
      400,
    );
  }
  const newUserId = userData.user.id;

  // ---- 4. Insert agents row, then link auth_user_id. ----
  const { data: agentRow, error: agentErr } = await admin
    .from("agents")
    .insert({
      full_name: body.full_name.trim(),
      email: body.email.trim(),
      phone: body.phone?.trim() || null,
      languages: body.languages && body.languages.length > 0
        ? body.languages
        : ["English", "Hindi"],
      specialization: body.specialization ?? [],
      auth_user_id: newUserId,
      is_active: true,
    })
    .select()
    .single();

  if (agentErr || !agentRow) {
    // Roll back the auth user so we don't leave orphans.
    await admin.auth.admin.deleteUser(newUserId);
    return jsonResponse(
      { error: agentErr?.message ?? "Could not create agent row" },
      400,
    );
  }

  // ---- 5. Set app_metadata on the auth user. ----
  const { error: metaErr } = await admin.auth.admin.updateUserById(newUserId, {
    app_metadata: { role: "agent", agent_id: agentRow.id },
  });
  if (metaErr) {
    // Best-effort cleanup.
    await admin.from("agents").delete().eq("id", agentRow.id);
    await admin.auth.admin.deleteUser(newUserId);
    return jsonResponse({ error: metaErr.message }, 400);
  }

  return jsonResponse(
    {
      ok: true,
      agent: agentRow,
      auth_user_id: newUserId,
    },
    200,
  );
});
