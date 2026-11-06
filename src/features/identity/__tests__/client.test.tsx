import React, { type ReactNode } from "react"
import { act, cleanup, render, renderHook, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { IdentitySession, IdentityStatus } from "../types"

const mocks = vi.hoisted(() => ({
  session: null as IdentitySession | null,
  status: "unauthenticated" as IdentityStatus,
  update: vi.fn(), signOut: vi.fn(), provider: vi.fn(),
}))
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: mocks.session, status: mocks.status, update: mocks.update }),
  signOut: mocks.signOut,
  SessionProvider: ({ children, session }: { children: ReactNode; session?: IdentitySession | null }) => {
    mocks.provider(session)
    return <>{children}</>
  },
}))

import { IdentityProvider, useCurrentAccount } from "../client"

const session: IdentitySession = {
  user: { id: "existing-account", name: "Sample Resident", email: "sample@example.test", role: "ADMIN", isSuperAdmin: true },
  expires: "2026-11-07T10:00:00.000Z",
}

describe("client identity provider compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session = session
    mocks.status = "authenticated"
    mocks.update.mockResolvedValue(session)
    mocks.signOut.mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  it("passes the existing SSR/test session through without changing its contents", () => {
    render(<IdentityProvider session={session}><span>Account UI</span></IdentityProvider>)
    expect(screen.getByText("Account UI")).toBeDefined()
    expect(mocks.provider).toHaveBeenCalledWith(session)
    expect(mocks.provider.mock.calls[0][0]).toEqual(session)
  })

  it("normalizes a nullable application email for the existing provider without changing identity", () => {
    const initial = { ...session, user: { ...session.user, email: null } }
    render(<IdentityProvider session={initial}><span>Account UI</span></IdentityProvider>)
    expect(mocks.provider).toHaveBeenCalledWith({ ...initial, user: { ...initial.user, email: "" } })
    expect(initial.user.email).toBeNull()
  })

  it("lets the existing provider load a session when no initial value was supplied", () => {
    render(<IdentityProvider><span>Account UI</span></IdentityProvider>)
    expect(mocks.provider).toHaveBeenCalledWith(undefined)
  })

  it("exposes an application-owned account and reflects a changed session on rerender", () => {
    const { result, rerender } = renderHook(useCurrentAccount)
    expect(result.current.user).toEqual({ ...session.user, image: null })
    expect(result.current.status).toBe("authenticated")
    mocks.session = { ...session, user: { ...session.user, role: "USER", isSuperAdmin: false } }
    rerender()
    expect(result.current.user).toMatchObject({ role: "USER", isSuperAdmin: false })
  })

  it.each(["loading", "unauthenticated"] as const)("does not expose a retained account while %s", status => {
    mocks.status = status
    const { result } = renderHook(useCurrentAccount)
    expect(result.current).toMatchObject({ user: null, status })
  })

  it("treats the provider's deleted-account sentinel as signed out", () => {
    mocks.session = { ...session, user: { ...session.user, id: "" } }
    expect(renderHook(useCurrentAccount).result.current).toMatchObject({ user: null, status: "unauthenticated" })
  })

  it("does not elevate missing or unfamiliar session roles", () => {
    mocks.session = { ...session, user: { id: session.user.id, email: null, role: "OWNER" } }
    expect(renderHook(useCurrentAccount).result.current.user).toEqual({
      id: session.user.id, name: null, email: "", image: null, role: "USER", isSuperAdmin: false,
    })
  })

  it("refreshes through the provider without accepting caller-supplied claims", async () => {
    mocks.update.mockResolvedValue({ ...session, user: { ...session.user, role: "RENTAL", isSuperAdmin: false } })
    const { result } = renderHook(useCurrentAccount)
    await act(async () => {
      expect(await result.current.refresh()).toMatchObject({ role: "RENTAL", isSuperAdmin: false })
    })
    expect(mocks.update).toHaveBeenCalledWith()
  })

  it("returns null if the refreshed session was revoked", async () => {
    mocks.update.mockResolvedValue(null)
    expect(await renderHook(useCurrentAccount).result.current.refresh()).toBeNull()
  })

  it("delegates sign-out to the existing provider and returns to the public root", async () => {
    await renderHook(useCurrentAccount).result.current.signOut()
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: "/" })
  })
})
