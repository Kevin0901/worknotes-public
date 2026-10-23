import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, googleConfig, hasDatabase } from "@/lib/env";
import { logEvent } from "@/lib/logs";
import { exchangeGoogleCode, safeNext } from "@/lib/oauth";
import {
  OAUTH_COOKIE, USER_COOKIE, USER_SESSION_SECONDS, cookieOptions, signToken, verifyToken, type OAuthToken,
} from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { createSession } from "@/lib/sessions";
import { createPendingUser, getUserByEmail, touchLogin } from "@/lib/users";

export async function GET(req: NextRequest) {
  const origin = appOrigin(req.headers);
  const toLogin = (error: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${error}`, origin));
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  };

  const google = googleConfig();
  if (!google || !hasDatabase()) return toLogin("config");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return toLogin("cancelled");

  const saved = await verifyToken<OAuthToken>(req.cookies.get(OAUTH_COOKIE)?.value, "oauth");
  const code = params.get("code");
  if (!saved || !code || params.get("state") !== saved.state) return toLogin("state");

  let profile;
  try {
    profile = await exchangeGoogleCode({
      code,
      verifier: saved.verifier,
      clientId: google.clientId,
      clientSecret: google.clientSecret,
      redirectUri: `${origin}/api/auth/callback/google`,
    });
  } catch (err) {
    console.error("[oauth]", err);
    await logEvent({ event: "login_error", path: "/api/auth/callback/google", detail: String(err).slice(0, 300) });
    return toLogin("google");
  }

  const settings = await getSettings();
  let user = await getUserByEmail(profile.email);
  const logBase = { path: "/api/auth/callback/google", actor: profile.email, actorType: "anonymous" as const };

  if (!user) {
    if (!settings.allowRegistration) {
      await logEvent({ ...logBase, event: "login_registration_closed" });
      return toLogin("closed");
    }
    user = await createPendingUser(profile.email, profile.name, profile.picture);
    await logEvent({ ...logBase, event: "login_pending", detail: profile.name ?? undefined });
    const res = NextResponse.redirect(new URL(`/pending?email=${encodeURIComponent(profile.email)}`, origin));
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  }

  if (user.status === "pending") {
    await logEvent({ ...logBase, event: "login_waiting" });
    const res = NextResponse.redirect(new URL(`/pending?email=${encodeURIComponent(profile.email)}`, origin));
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  }

  if (user.status !== "approved") {
    await logEvent({ ...logBase, event: "login_denied", detail: user.status });
    return toLogin("denied");
  }

  await touchLogin(user.id, profile.name, profile.picture);
  const sid = await createSession(user.id, "google", USER_SESSION_SECONDS, req.headers);
  const session = await signToken({ typ: "user", sub: user.id, email: user.email, sid }, USER_SESSION_SECONDS);
  await logEvent({ ...logBase, event: "login_success", actorType: "user" });

  const res = NextResponse.redirect(new URL(safeNext(saved.next), origin));
  res.cookies.delete(OAUTH_COOKIE);
  res.cookies.set(USER_COOKIE, session, cookieOptions(USER_SESSION_SECONDS));
  return res;
}
