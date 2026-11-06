import type { ReactNode } from "react"
import { getCurrentAccount } from "@/features/identity/server"
import AccessBoundary from "./AccessBoundary"

export default async function ProtectedPage({ role = "account", children }: {
  role?: "account" | "staff" | "admin"; children: ReactNode
}) {
  const account = await getCurrentAccount()
  if (!account) return <AccessBoundary />
  if ((role === "admin" && account.role !== "ADMIN") ||
    (role === "staff" && account.role !== "ADMIN" && account.role !== "RENTAL")) return <AccessBoundary forbidden />
  return children
}
