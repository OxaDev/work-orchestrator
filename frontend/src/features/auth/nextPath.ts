/** Only accepts in-app relative paths, to prevent open redirects via ?next=. */
export function safeNextPath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
