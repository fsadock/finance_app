import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, createSession } from "@/lib/auth/session";
import { deviceName } from "@/lib/auth/rules";
import { AuthError, authenticate, authenticationOptions, register, registrationOptions, relyingParty } from "@/lib/auth/webauthn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The sign-in page's calls, the only API open without a session (see lib/auth/rules.ts).
const body = z.object({ code: z.string().max(20).optional(), response: z.any().optional() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ step: string }> }) {
  try {
    const rp = relyingParty(request.headers);
    const { code, response } = body.parse(await request.json().catch(() => ({})));
    switch ((await params).step) {
      case "login-options":
        return NextResponse.json(await authenticationOptions(rp));
      case "login":
        return signIn(await authenticate(rp, response), rp.origin);
      case "register-options":
        return NextResponse.json(await registrationOptions(rp, code));
      case "register":
        return signIn(await register(rp, code, response, deviceName(request.headers.get("user-agent"))), rp.origin);
      default:
        return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }
  } catch (e) {
    if (e instanceof AuthError || e instanceof z.ZodError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

async function signIn(passkeyId: string, origin: string) {
  const { token, expiresAt } = await createSession(passkeyId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // http://localhost can't keep a Secure cookie in every browser; any other address is HTTPS (passkeys require it)
    secure: origin.startsWith("https:"),
    path: "/",
    expires: expiresAt,
  });
  return res;
}
