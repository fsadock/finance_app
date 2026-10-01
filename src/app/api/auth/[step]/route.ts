import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, createSession, endSession, findSession, markVerified } from "@/lib/auth/session";
import { deviceName } from "@/lib/auth/rules";
import { issueCode } from "@/lib/auth/enrollment";
import { sendToOwner, EmailError } from "@/lib/email/send";
import { getEmailSettings, maskEmail } from "@/lib/infra/settings";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { getConfigNumber } from "@/lib/infra/config";
import { DEFAULT_LOCK_MINUTES, isLocked } from "@/lib/domain/auth-lock";
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
      case "sign-out": {
        // Reachable while locked on purpose: without it the unlock screen is a dead end for anyone whose
        // device will not show the prompt. Ending a session only costs the person their own way in.
        const token = request.cookies.get(SESSION_COOKIE)?.value;
        if (token) await endSession(token);
        const res = NextResponse.json({ ok: true });
        res.cookies.delete(SESSION_COOKIE);
        return res;
      }
      case "unlock-options": {
        // Naming the session's own passkey is what sends the phone straight to Face ID instead of a
        // chooser: the browser no longer has to ask which credential to use.
        const session = await findSession(request.cookies.get(SESSION_COOKIE)?.value);
        if (!session) return NextResponse.json({ error: "Sessão não encontrada. Entre de novo." }, { status: 401 });
        return NextResponse.json(await authenticationOptions(rp, session.passkeyId));
      }
      case "unlock": {
        // Same ceremony as signing in, but the session is kept: only its last-checked time moves, so
        // unlocking never costs the device its place.
        const token = request.cookies.get(SESSION_COOKIE)?.value;
        const session = await findSession(token);
        if (!session) return NextResponse.json({ error: "Sessão não encontrada. Entre de novo." }, { status: 401 });
        await authenticate(rp, response, session.passkeyId);
        await markVerified(token);
        return NextResponse.json({ ok: true });
      }
      case "send-code":
        return NextResponse.json(await emailCode());
      case "register-options":
        return NextResponse.json(await registrationOptions(rp, code));
      case "add-options":
      case "add": {
        // Adding a passkey from inside the app: the live, unlocked session is the proof, so no code.
        // Locked counts as not proven — otherwise a phone found on a table could enrol itself.
        const session = await findSession(request.cookies.get(SESSION_COOKIE)?.value);
        const minutes = (await getConfigNumber("lockMinutes")) ?? DEFAULT_LOCK_MINUTES;
        if (!session || isLocked(session.verifiedAt, minutes, new Date())) {
          return NextResponse.json({ error: "Entre no app antes de adicionar uma passkey." }, { status: 401 });
        }
        return (await params).step === "add-options"
          ? NextResponse.json(await registrationOptions(rp, null))
          : NextResponse.json({ ok: Boolean(await register(rp, null, response, deviceName(request.headers.get("user-agent")))) });
      }
      case "register":
        return signIn(await register(rp, code, response, deviceName(request.headers.get("user-agent"))), rp.origin);
      default:
        return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }
  } catch (e) {
    if (e instanceof AuthError || e instanceof EmailError || e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}

/**
 * Sends a one-time code to the address saved in the settings — never to one the caller asks for, so this
 * can't be used to find out whether an address exists, or to send mail to anyone else.
 */
async function emailCode() {
  const { to } = await getEmailSettings();
  if (!to) throw new AuthError("Nenhum e-mail configurado para receber o código.");
  if (!checkRateLimit("auth-email-code", 3, 15 * 60_000)) throw new AuthError("Muitos pedidos. Tente de novo em alguns minutos.");
  const { code, expiresAt } = issueCode();
  const minutes = Math.round((expiresAt.getTime() - Date.now()) / 60_000);
  await sendToOwner(
    "código de acesso",
    `Seu código para criar uma passkey é ${code}.\n\nEle vale ${minutes} minutos e só funciona nesta tentativa. ` +
      `Se não foi você que pediu, ignore este e-mail: sem o código, ninguém entra.`
  );
  return { sent: true, to: maskEmail(to) };
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
