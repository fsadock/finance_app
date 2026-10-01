/**
 * Asking for the device's biometrics again after a while away.
 *
 * The session lasts a year on purpose — signing in every day would be worse than useless. But a year-long
 * session means anyone holding an unlocked phone has the whole thing, which is the gap bank apps close by
 * asking again when you come back to the app.
 */

/** Minutes idle before the passkey is asked for again. */
export const DEFAULT_LOCK_MINUTES = 2;

/** What the settings screen offers. 0 turns it off. */
export const LOCK_CHOICES = [0, 1, 2, 5, 15, 60] as const;

export function lockLabel(minutes: number) {
  if (minutes <= 0) return "Nunca";
  if (minutes === 1) return "Depois de 1 minuto";
  if (minutes < 60) return `Depois de ${minutes} minutos`;
  return "Depois de 1 hora";
}

/**
 * Whether the session has to prove itself again. Measured from the last check, not from sign-in, so
 * using the app keeps it open and walking away is what locks it.
 */
export function isLocked(verifiedAt: Date, lockMinutes: number, now: Date) {
  return lockMinutes > 0 && now.getTime() - verifiedAt.getTime() >= lockMinutes * 60_000;
}
