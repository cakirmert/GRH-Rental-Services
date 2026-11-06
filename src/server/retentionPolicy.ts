export const accountInactivityThreshold = (now = new Date()) =>
  new Date(now.getTime() - 365 * 86400000)

export function isInactiveStaff(
  account: { role: string; lastLoginAt: Date; lastActiveAt: Date },
  now = new Date(),
) {
  const threshold = accountInactivityThreshold(now)
  return (
    (account.role === "ADMIN" || account.role === "RENTAL") &&
    account.lastLoginAt < threshold &&
    account.lastActiveAt < threshold
  )
}
