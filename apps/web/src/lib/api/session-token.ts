/**
 * The Clerk session, as code outside React reads it — the cart's write queue
 * runs in a store, not a component, and cannot call `useAuth()`.
 * `SessionTokenBridge` registers it once Clerk has loaded.
 */
export interface RegisteredSession {
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
}

/**
 * How long a request waits for Clerk to load. Past it the visitor is treated as
 * signed out, so a Clerk script that never arrives cannot hold the cart hostage.
 */
export const SESSION_WAIT_MS = 5_000;

let session: RegisteredSession | null = null;
let markRegistered: () => void = () => {};
const registered = new Promise<void>((resolve) => {
  markRegistered = resolve;
});

export function registerSession(next: RegisteredSession): void {
  session = next;
  markRegistered();
}

/**
 * The bearer token for the signed-in customer, or null for a guest. Waits for
 * Clerk: asked earlier, a signed-in customer would read as a guest.
 */
export async function getSessionToken(): Promise<string | null> {
  await Promise.race([registered, delay(SESSION_WAIT_MS)]);

  return session?.isSignedIn ? session.getToken() : null;
}

/** Whether a signed-in session is registered, for a render that cannot wait. */
export function hasSession(): boolean {
  return session?.isSignedIn ?? false;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
