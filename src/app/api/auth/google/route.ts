import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, googleConfig } from "@/lib/env";
import { googleAuthorizeUrl, pkceChallenge, randomToken, safeNext } from "@/lib/oauth";
import { OAUTH_COOKIE, OAUTH_STATE_SECONDS, cookieOptions, signToken } from "@/lib/session";

export async function GET(req: NextRequest) {
  const origin = appOrigin(req.headers);
  const google = googleConfig();
  if (!google) return NextResponse.redirect(new URL("/login?error=config", origin));

  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const state = randomToken(16);
  const verifier = randomToken(32);
  let token: string;
  try {
    token = await signToken({ typ: "oauth", state, verifier, next }, OAUTH_STATE_SECONDS);
  } catch {
    return NextResponse.redirect(new URL("/login?error=config", origin));
  }

  const res = NextResponse.redirect(
    googleAuthorizeUrl({
      clientId: google.clientId,
      redirectUri: `${origin}/api/auth/callback/google`,
      state,
      challenge: pkceChallenge(verifier),
    }),
  );
  res.cookies.set(OAUTH_COOKIE, token, cookieOptions(OAUTH_STATE_SECONDS));
  return res;
}
