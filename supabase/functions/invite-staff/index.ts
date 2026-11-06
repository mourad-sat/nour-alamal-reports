// Nour Al Amal: authenticated, admin-only staff invitation.
// Deploy as a Supabase Edge Function with verify_jwt=true.
// The service role key exists ONLY in the Supabase Edge runtime environment.
// Never put that key into Vercel public environment, static files, or responses.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const APP_ORIGIN = "https://nour-alamal-reports.vercel.app";
const LOGIN_URL = APP_ORIGIN + "/login.html";
const ROLES = new Set([
  "vocational_instructor",
  "pedagogical_instructor",
  "activity_facilitator",
  "attendance_officer",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function response(body: Record<string, unknown>, status = 200, origin = APP_ORIGIN): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Vary": "Origin",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== APP_ORIGIN) {
    return new Response(null, { status: 403 });
  }
  if (req.method === "OPTIONS") {
    return response({ ok: true }, 200);
  }
  if (req.method !== "POST") {
    return response({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  }

  const authorization = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) return response({ ok: false, code: "LOGIN_REQUIRED" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return response({ ok: false, code: "SERVER_NOT_CONFIGURED" }, 503);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Server-side JWT verification; never trust user_metadata or a client role.
    const { data: verified, error: identityError } = await admin.auth.getUser(match[1]);
    if (identityError || !verified.user || verified.user.is_anonymous) {
      return response({ ok: false, code: "LOGIN_REQUIRED" }, 401);
    }
    const { data: adminProfile, error: profileError } = await admin
      .from("staff_profiles")
      .select("role,is_active")
      .eq("user_id", verified.user.id)
      .maybeSingle();
    if (profileError) return response({ ok: false, code: "VERIFY_FAILED" }, 503);
    if (!adminProfile?.is_active || adminProfile.role !== "admin") {
      return response({ ok: false, code: "ADMIN_REQUIRED" }, 403);
    }

    // Reject oversized inputs before any privileged operation.
    const inputLength = Number(req.headers.get("content-length") || 0);
    if (inputLength > 8192) return response({ ok: false, code: "BAD_INPUT" }, 400);
    const raw: unknown = await req.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return response({ ok: false, code: "BAD_INPUT" }, 400);
    }
    const input = raw as Record<string, unknown>;
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const fullName = typeof input.full_name === "string" ? input.full_name.trim() : "";
    const role = input.role;
    const ids = input.center_ids;

    if (email.length > 254 || !EMAIL.test(email) ||
        fullName.length < 2 || fullName.length > 150 ||
        typeof role !== "string" || !ROLES.has(role) ||
        !Array.isArray(ids) || ids.length < 1 || ids.length > 25 ||
        !ids.every(id => typeof id === "string" && UUID.test(id))) {
      return response({ ok: false, code: "BAD_INPUT" }, 400);
    }
    const centerIds = [...new Set(ids as string[])];
    if (centerIds.length !== ids.length) {
      return response({ ok: false, code: "BAD_INPUT" }, 400);
    }

    const { data: activeCenters, error: centersError } = await admin
      .from("centers")
      .select("id")
      .eq("is_active", true)
      .in("id", centerIds);
    if (centersError) return response({ ok: false, code: "VERIFY_FAILED" }, 503);
    if (!activeCenters || activeCenters.length !== centerIds.length) {
      return response({ ok: false, code: "INVALID_CENTERS" }, 400);
    }

    // Auth Admin APIs can only be called from this server function, never the browser.
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: LOGIN_URL,
    });
    if (inviteError) {
      // The bundled Supabase email sender has restrictive quotas. Never fake success.
      if (inviteError.status === 429 || /rate limit/i.test(inviteError.message)) {
        return response({ ok: false, code: "EMAIL_RATE_LIMIT" }, 429);
      }
      if (/already|registered|exists/i.test(inviteError.message)) {
        return response({ ok: false, code: "ALREADY_EXISTS" }, 409);
      }
      return response({ ok: false, code: "INVITE_UNAVAILABLE" }, 502);
    }
    const userId = invited.user?.id;
    if (!userId || !UUID.test(userId)) {
      return response({ ok: false, code: "INVITED_BUT_UNASSIGNED" }, 500);
    }

    // Keep profile disabled until *all* memberships were saved, preventing partial access.
    const { error: staffError } = await admin.from("staff_profiles").insert({
      user_id: userId, full_name: fullName, role, is_active: false,
    });
    if (staffError) {
      return response({ ok: false, code: "INVITED_BUT_UNASSIGNED" }, 500);
    }
    const { error: assignError } = await admin.from("center_memberships").insert(
      centerIds.map(center_id => ({ center_id, user_id: userId, is_active: true })),
    );
    if (assignError) {
      return response({ ok: false, code: "INVITED_BUT_UNASSIGNED" }, 500);
    }
    const { error: activateError } = await admin.from("staff_profiles")
      .update({ is_active: true })
      .eq("user_id", userId)
      .eq("is_active", false);
    if (activateError) {
      return response({ ok: false, code: "INVITED_BUT_UNASSIGNED" }, 500);
    }

    return response({ ok: true, code: "INVITATION_SENT" }, 201);
  } catch {
    return response({ ok: false, code: "UNEXPECTED_ERROR" }, 500);
  }
});
