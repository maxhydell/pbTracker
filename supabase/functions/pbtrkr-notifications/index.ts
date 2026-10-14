import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async request => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const oneSignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
  const oneSignalRestKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
  if (!authorization || !supabaseUrl || !anonKey || !oneSignalAppId || !oneSignalRestKey) {
    return Response.json({ error: "Notification service is not configured" }, { status: 503, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const role = authData.user?.app_metadata?.role;
  if (authError || !authData.user || !["pbtrkr_editor", "pbtrkr_admin", "clinic_admin"].includes(role)) {
    return Response.json({ error: "PBTRKR editor access required" }, { status: 403, headers: corsHeaders });
  }

  let body: { device_id?: string; type?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400, headers: corsHeaders });
  }

  const { data: approved, error: deviceError } = await supabase.rpc(
    "pbtrkr_device_is_whitelisted",
    { p_device_id: body.device_id || "" }
  );
  if (deviceError || approved !== true) {
    return Response.json({ error: "Approved device required" }, { status: 403, headers: corsHeaders });
  }

  let contents = "A new game score was just recorded.";
  let heading = "✅ Score Saved Successfully";
  if (body.type === "tomorrow-reminder") {
    const now = new Date();
    const nyDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(now);
    const [year, month, day] = nyDate.split("-").map(Number);
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1, 12));
    const tomorrowDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(tomorrow);

    const { data: schedule, error: scheduleError } = await supabase
      .from("pbtrkr_schedule_days")
      .select("players")
      .eq("schedule_date", tomorrowDate)
      .order("id", { ascending: true })
      .limit(1);
    if (scheduleError) {
      return Response.json({ error: "Unable to read tomorrow's schedule" }, { status: 500, headers: corsHeaders });
    }
    const players = (schedule?.[0]?.players || []).filter(Boolean);
    if (!players.length) {
      return Response.json({ success: true, skipped: true }, { headers: corsHeaders });
    }
    heading = "Reminder";
    contents = `Reminder, you are playing tomorrow!\nWith ${players.join(", ")}`;
  }

  const notificationResponse = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${oneSignalRestKey}`
    },
    body: JSON.stringify({
      app_id: oneSignalAppId,
      included_segments: ["All"],
      headings: { en: heading },
      contents: { en: contents }
    })
  });

  const responseText = await notificationResponse.text();
  if (!notificationResponse.ok) {
    console.error("OneSignal request failed:", notificationResponse.status, responseText);
    return Response.json({ error: "Notification delivery failed" }, { status: 502, headers: corsHeaders });
  }
  return Response.json({ success: true }, { headers: corsHeaders });
});
