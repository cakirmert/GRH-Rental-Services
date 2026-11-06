// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID, createHash } from "node:crypto"
import { PrismaClient, type Prisma, type Role, type BookingStatus } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { localDatabaseUrl } from "../../../scripts/local-database.mjs"
import { router } from "@/lib/trpcServer"
import type { Context } from "@/server/context"

const rawUrl = process.env.GRH_TEST_DATABASE_URL
const target = rawUrl ? localDatabaseUrl(rawUrl) : undefined
const prefix = `retention-test-${randomUUID()}`
const old = new Date(Date.now() - 400 * 86400000)
const past = new Date(Date.now() - 10 * 86400000)
const future = new Date(Date.now() + 86400000)
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

describe.skipIf(!target)("PostgreSQL retention, account deletion and linked data", () => {
  let base: PrismaClient
  let db: Context["prisma"]
  let reviewRouter: ReturnType<
    typeof router<typeof import("../routers/retentionProcedures").retentionProcedures>
  >
  let userRouter: typeof import("../routers/user").userRouter
  let automaticCleanup: typeof import("../jobs/deleteInactiveUsers").deleteInactiveUsers
  const authKeys: string[] = []
  const feedbackIds: string[] = []
  let sequence = 0
  const id = (label: string) => `${prefix}-${label}-${++sequence}`
  const superId = `${prefix}-super`
  const adminId = `${prefix}-admin`
  const itemId = `${prefix}-item`

  const adminCaller = () =>
    reviewRouter.createCaller({
      prisma: db,
      session: {
        user: { id: adminId, role: "ADMIN", email: `${adminId}@example.test` },
        expires: "2099-01-01",
      },
      req: new Request("http://localhost"),
    })
  const selfCaller = (userId: string) =>
    userRouter.createCaller({
      prisma: db,
      session: {
        user: { id: userId, role: "USER", email: `${userId}@example.test` },
        expires: "2099-01-01",
      },
      req: new Request("http://localhost"),
    })
  async function user(
    label: string,
    role: Role = "USER",
    overrides: { lastLoginAt?: Date; lastActiveAt?: Date; isSuperAdmin?: boolean } = {},
  ) {
    const userId = id(label)
    return base.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        role,
        lastLoginAt: old,
        lastActiveAt: old,
        ...overrides,
      },
    })
  }
  async function booking(
    userId: string,
    status: BookingStatus = "COMPLETED",
    endDate = past,
    assignedToId?: string,
  ) {
    return base.booking.create({
      data: {
        id: id("booking"),
        userId,
        itemId,
        status,
        startDate: new Date(endDate.getTime() - 3600000),
        endDate,
        assignedToId,
      },
    })
  }
  async function state(key: string, value: Record<string, string | number>) {
    authKeys.push(key)
    return base.authState.create({ data: { key, value, expiresAt: future } })
  }

  beforeAll(async () => {
    base = new PrismaClient({ adapter: new PrismaPg({ connectionString: target! }) })
    // Candidate reads retain the actual production filters, but are additionally
    // limited to this test's UUID namespace. No original restored row can be deleted.
    db = base.$extends({
      query: {
        user: {
          findMany: ({ args, query }) =>
            query({ ...args, where: { AND: [args.where ?? {}, { id: { startsWith: prefix } }] } }),
          count: ({ args, query }) =>
            query({ ...args, where: { AND: [args.where ?? {}, { id: { startsWith: prefix } }] } }),
        },
        booking: {
          findMany: ({ args, query }) =>
            query({ ...args, where: { AND: [args.where ?? {}, { itemId }] } }),
          updateMany: ({ args, query }) =>
            query({ ...args, where: { AND: [args.where ?? {}, { itemId }] } }),
        },
        session: {
          findMany: ({ args, query }) =>
            query({ ...args, where: { AND: [args.where ?? {}, { id: { startsWith: prefix } }] } }),
        },
        verificationToken: {
          findMany: ({ args, query }) =>
            query({
              ...args,
              where: { AND: [args.where ?? {}, { identifier: { startsWith: prefix } }] },
            }),
        },
      },
    }) as unknown as Context["prisma"]
    vi.doMock("@/lib/prismadb", () => ({ default: db }))
    await base.user.createMany({
      data: [
        { id: superId, email: `${superId}@example.test`, role: "ADMIN", isSuperAdmin: true },
        { id: adminId, email: `${adminId}@example.test`, role: "ADMIN" },
      ],
    })
    await base.item.create({
      data: { id: itemId, titleEn: "Retention fixture", type: "SPORTS", totalQuantity: 1 },
    })
    reviewRouter = router((await import("../routers/retentionProcedures")).retentionProcedures)
    userRouter = (await import("../routers/user")).userRouter
    automaticCleanup = (await import("../jobs/deleteInactiveUsers")).deleteInactiveUsers
  })

  afterAll(async () => {
    if (!base) return
    await base.log.deleteMany({ where: { id: { startsWith: prefix } } })
    await base.authState.deleteMany({ where: { key: { in: authKeys } } })
    await base.verificationToken.deleteMany({
      where: { identifier: { startsWith: prefix, mode: "insensitive" } },
    })
    await base.releaseFeedback.deleteMany({ where: { id: { in: feedbackIds } } })
    await base.booking.deleteMany({ where: { itemId } })
    await base.item.delete({ where: { id: itemId } })
    await base.user.deleteMany({ where: { id: { startsWith: prefix } } })
    await base.$disconnect()
    vi.doUnmock("@/lib/prismadb")
  })

  it("automatically removes only an eligible ordinary user's linked records and message copies", async () => {
    const departing = await user("departing")
    const remaining = await user("remaining", "RENTAL")
    const owned = await booking(departing.id)
    const other = await booking(remaining.id)
    const unrelated = await booking(remaining.id)
    const ownThread = await base.bookingChatThread.create({ data: { bookingId: owned.id } })
    const otherThread = await base.bookingChatThread.create({ data: { bookingId: other.id } })
    const ownMessage = await base.bookingChatMessage.create({
      data: {
        threadId: ownThread.id,
        senderId: remaining.id,
        body: "Other person's message in departing owner's conversation",
      },
    })
    const sentElsewhere = await base.bookingChatMessage.create({
      data: {
        threadId: otherThread.id,
        senderId: departing.id,
        body: "Delete this person's authored text",
      },
    })
    const keepMessage = await base.bookingChatMessage.create({
      data: {
        threadId: otherThread.id,
        senderId: remaining.id,
        body: "Keep this other person's message",
      },
    })
    await base.bookingChatRead.createMany({
      data: [
        { userId: departing.id, messageId: ownMessage.id },
        { userId: remaining.id, messageId: sentElsewhere.id },
        { userId: departing.id, messageId: keepMessage.id },
      ],
    })
    const teamMessage = await base.teamChatMessage.create({
      data: { senderId: departing.id, body: "Departing sender's team message" },
    })
    await base.session.create({
      data: { id: id("session"), userId: departing.id, sessionToken: id("token"), expires: future },
    })
    await base.pushSubscription.create({
      data: {
        userId: departing.id,
        endpoint: `https://example.test/${id("push")}`,
        p256dh: "fixture",
        auth: "fixture",
      },
    })
    const ownedNotification = await base.notification.create({
      data: {
        userId: remaining.id,
        bookingId: owned.id,
        type: "BOOKING_RESPONSE",
        message: "Own thread notification",
      },
    })
    const copy = await base.notification.create({
      data: {
        userId: remaining.id,
        bookingId: other.id,
        type: "BOOKING_RESPONSE",
        message: "Copy of departing sender's text",
      },
    })
    const otherActorSameThread = await base.notification.create({
      data: {
        userId: remaining.id,
        actorId: remaining.id,
        bookingId: other.id,
        type: "BOOKING_RESPONSE",
        message: "Other person's identified alert in the same conversation",
      },
    })
    const keepNotification = await base.notification.create({
      data: {
        userId: remaining.id,
        bookingId: unrelated.id,
        type: "BOOKING_RESPONSE",
        message: "Unrelated alert",
      },
    })
    const actorNotification = await base.notification.create({
      data: {
        userId: remaining.id,
        actorId: departing.id,
        bookingId: unrelated.id,
        type: "BOOKING_RESPONSE",
        message: "Staff status action containing the departing actor's name",
      },
    })
    const proposal = await base.roleProposal.create({
      data: {
        creatorId: remaining.id,
        targetUserId: departing.id,
        proposedRole: "RENTAL",
        expiresAt: future,
      },
    })
    await base.roleVote.create({
      data: { voterId: remaining.id, proposalId: proposal.id, vote: true },
    })
    for (const revoked of [false, true]) {
      await base.passkeyCredential.create({
        data: {
          userId: departing.id,
          legacyCredentialId: id("credential"),
          credentialPublicKey: "AA",
          metadata: {},
          revokedAt: revoked ? past : null,
          aliases: { create: { id: id("alias") } },
        },
      })
    }
    const token = id("legacy-otp")
    await base.verificationToken.create({
      data: { identifier: departing.email.toUpperCase(), token, expires: future },
    })
    const boundKey = id("ceremony")
    const otpKey = `otp:${hash(departing.email)}`
    const budgetKey = `rate:otp-verify-mailbox:${hash(departing.email)}`
    await state(boundKey, { userId: departing.id })
    await state(otpKey, { hash: "fixture" })
    await state(budgetKey, { count: 2 })
    const feedback = await base.releaseFeedback.create({
      data: {
        userId: departing.id,
        releaseId: prefix,
        interfaceMode: "preview",
        sentiment: "good",
        message: "Personal feedback text",
      },
    })
    feedbackIds.push(feedback.id)
    const block = await base.recurringBlock.create({
      data: {
        itemId,
        createdById: departing.id,
        startDate: future,
        endDate: new Date(future.getTime() + 3600000),
        frequency: "WEEKLY",
      },
    })
    await base.recurringBlockException.create({
      data: { blockId: block.id, occurrenceStart: future },
    })
    const logIds = [id("actor-log"), id("booking-log"), id("target-log")]
    await base.log.createMany({
      data: [
        { id: logIds[0], type: "BOOKING", userId: departing.id, message: "actor record" },
        {
          id: logIds[1],
          type: "BOOKING",
          userId: remaining.id,
          bookingId: owned.id,
          message: "booking record",
        },
        { id: logIds[2], type: "ADMIN", userId: adminId, message: `promoted:${departing.id}` },
      ],
    })

    expect((await automaticCleanup()).deleted).toBe(1)
    expect(await base.user.findUnique({ where: { id: departing.id } })).toBeNull()
    expect(await base.booking.findUnique({ where: { id: owned.id } })).toBeNull()
    expect(await base.bookingChatThread.findUnique({ where: { id: ownThread.id } })).toBeNull()
    expect(await base.bookingChatMessage.findUnique({ where: { id: ownMessage.id } })).toBeNull()
    expect(await base.bookingChatMessage.findUnique({ where: { id: sentElsewhere.id } })).toBeNull()
    expect(
      await base.bookingChatMessage.findUnique({ where: { id: keepMessage.id } }),
    ).not.toBeNull()
    expect(
      await base.bookingChatRead.count({
        where: {
          OR: [{ userId: departing.id }, { messageId: { in: [ownMessage.id, sentElsewhere.id] } }],
        },
      }),
    ).toBe(0)
    expect(await base.teamChatMessage.findUnique({ where: { id: teamMessage.id } })).toBeNull()
    expect(await base.session.count({ where: { userId: departing.id } })).toBe(0)
    expect(await base.pushSubscription.count({ where: { userId: departing.id } })).toBe(0)
    expect(await base.roleProposal.findUnique({ where: { id: proposal.id } })).toBeNull()
    expect(await base.roleVote.count({ where: { proposalId: proposal.id } })).toBe(0)
    expect(await base.passkeyCredential.count({ where: { userId: departing.id } })).toBe(0)
    expect(await base.passkeyCredentialAlias.count({ where: { id: { startsWith: prefix } } })).toBe(
      0,
    )
    expect(await base.verificationToken.count({ where: { token } })).toBe(0)
    expect(await base.authState.count({ where: { key: { in: [boundKey, otpKey] } } })).toBe(0)
    expect(await base.authState.findUnique({ where: { key: budgetKey } })).not.toBeNull()
    expect(await base.log.count({ where: { id: { in: logIds } } })).toBe(0)
    expect(
      await base.notification.count({ where: { id: { in: [ownedNotification.id, copy.id] } } }),
    ).toBe(0)
    expect(
      await base.notification.findUnique({ where: { id: keepNotification.id } }),
    ).not.toBeNull()
    expect(
      await base.notification.findUnique({ where: { id: otherActorSameThread.id } }),
    ).not.toBeNull()
    expect(await base.notification.findUnique({ where: { id: actorNotification.id } })).toBeNull()
    // A delayed notification after the account was removed cannot recreate its
    // sender/name/message copy; PostgreSQL rejects the missing actor reference.
    await expect(
      base.notification.create({
        data: {
          userId: remaining.id,
          actorId: departing.id,
          bookingId: unrelated.id,
          type: "BOOKING_RESPONSE",
          message: "Late sender copy must not persist",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" })
    expect(await base.releaseFeedback.findUnique({ where: { id: feedback.id } })).toMatchObject({
      userId: null,
      message: "",
      sentiment: "good",
    })
    expect(await base.recurringBlock.findUnique({ where: { id: block.id } })).toMatchObject({
      createdById: null,
    })
    expect(await base.recurringBlockException.count({ where: { blockId: block.id } })).toBe(1)
  })

  it("preserves staff, recent activity, responsibilities, and every operational booking category automatically", async () => {
    const protectedIds: string[] = []
    for (const role of ["RENTAL", "ADMIN"] as const)
      protectedIds.push((await user(`protected-${role}`, role)).id)
    protectedIds.push((await user("super-flag", "USER", { isSuperAdmin: true })).id)
    protectedIds.push((await user("recent-session", "USER", { lastActiveAt: new Date() })).id)
    protectedIds.push((await user("recent-login", "USER", { lastLoginAt: new Date() })).id)
    const responsible = await user("legacy-responsible")
    protectedIds.push(responsible.id)
    await base.item.update({
      where: { id: itemId },
      data: { responsibleMembers: { connect: { id: responsible.id } } },
    })
    for (const status of ["REQUESTED", "ACCEPTED", "BORROWED"] as const) {
      const owner = await user(`owner-${status}`)
      const assignee = await user(`assignee-${status}`)
      protectedIds.push(owner.id, assignee.id)
      await booking(owner.id, status, past, assignee.id)
    }
    const futureOwner = await user("future-terminal")
    protectedIds.push(futureOwner.id)
    await booking(futureOwner.id, "CANCELLED", future)
    const eligible = await user("eligible-normal")
    await automaticCleanup()
    expect(await base.user.count({ where: { id: { in: protectedIds } } })).toBe(protectedIds.length)
    expect(await base.user.findUnique({ where: { id: eligible.id } })).toBeNull()
  })

  it("requires confirmed inactive staff deletion and refuses reactivated, demoted, or busy accounts", async () => {
    const idle = await user("idle-staff", "RENTAL")
    const review = await adminCaller().inactiveAccounts({ limit: 100 })
    expect(review.accounts.find((account) => account.id === idle.id)).toMatchObject({
      canDelete: true,
      blockers: [],
    })
    expect(review.accounts.every((account) => account.role !== "USER")).toBe(true)
    expect(await base.user.findUnique({ where: { id: idle.id } })).not.toBeNull()
    const confirmation = { userId: idle.id, expectedLastLoginAt: old, expectedLastActiveAt: old }
    await base.user.update({ where: { id: idle.id }, data: { lastActiveAt: new Date() } })
    await expect(adminCaller().deleteInactiveAccount(confirmation)).rejects.toMatchObject({
      code: "CONFLICT",
    })
    await base.user.update({ where: { id: idle.id }, data: { lastActiveAt: old } })
    await expect(adminCaller().deleteInactiveAccount(confirmation)).resolves.toEqual({
      success: true,
    })
    expect(await base.user.findUnique({ where: { id: idle.id } })).toBeNull()
    const busy = await user("busy-staff", "RENTAL")
    await booking(adminId, "REQUESTED", future, busy.id)
    await expect(
      adminCaller().deleteInactiveAccount({
        userId: busy.id,
        expectedLastLoginAt: old,
        expectedLastActiveAt: old,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    const demoted = await user("demoted-staff", "USER")
    await expect(
      adminCaller().deleteInactiveAccount({
        userId: demoted.id,
        expectedLastLoginAt: old,
        expectedLastActiveAt: old,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("protects admin authority and handover for manual self deletion and stepping down", async () => {
    const targetAdmin = await user("inactive-admin", "ADMIN")
    const input = { userId: targetAdmin.id, expectedLastLoginAt: old, expectedLastActiveAt: old }
    await expect(adminCaller().deleteInactiveAccount(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    const superCaller = reviewRouter.createCaller({
      prisma: db,
      session: {
        user: { id: superId, role: "ADMIN", email: `${superId}@example.test` },
        expires: "2099-01-01",
      },
      req: new Request("http://localhost"),
    })
    await expect(superCaller.deleteInactiveAccount(input)).resolves.toEqual({ success: true })
    await expect(selfCaller(superId).deleteAccount()).rejects.toMatchObject({ code: "BAD_REQUEST" })
    const staff = await user("manual-handover", "RENTAL")
    await base.item.update({
      where: { id: itemId },
      data: { responsibleMembers: { connect: { id: staff.id } } },
    })
    await expect(selfCaller(staff.id).deleteAccount()).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    await expect(selfCaller(staff.id).selfDemote()).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await base.item.update({
      where: { id: itemId },
      data: { responsibleMembers: { disconnect: { id: staff.id } } },
    })
    const owner = await user("manual-owner", "USER", { lastActiveAt: new Date() })
    const pending = await booking(owner.id, "REQUESTED", future)
    const thread = await base.bookingChatThread.create({ data: { bookingId: pending.id } })
    await base.bookingChatMessage.create({
      data: { threadId: thread.id, senderId: staff.id, body: "Pending booking conversation" },
    })
    await selfCaller(owner.id).deleteAccount()
    expect(await base.bookingChatThread.findUnique({ where: { id: thread.id } })).toBeNull()
  })

  it("deletes terminal bookings after 180 days with their conversations and logs, preserving active bookings", async () => {
    const owner = await user("retained-owner", "RENTAL")
    const expired = new Date(Date.now() - 181 * 86400000)
    const ids: string[] = []
    for (const status of ["COMPLETED", "CANCELLED", "DECLINED"] as const)
      ids.push((await booking(owner.id, status, expired)).id)
    const active = await booking(owner.id, "BORROWED", expired)
    const recent = await booking(owner.id, "COMPLETED", past)
    const thread = await base.bookingChatThread.create({ data: { bookingId: ids[0] } })
    await base.bookingChatMessage.create({
      data: { threadId: thread.id, senderId: owner.id, body: "Old conversation" },
    })
    const logId = id("expired-booking-log")
    await base.log.create({
      data: { id: logId, type: "BOOKING", bookingId: ids[0], message: "Old booking event" },
    })
    const { deleteOldBookings } = await import("../jobs/cleanOldBookings")
    expect((await deleteOldBookings()).deleted).toBe(3)
    expect(await base.booking.count({ where: { id: { in: ids } } })).toBe(0)
    expect(await base.booking.count({ where: { id: { in: [active.id, recent.id] } } })).toBe(2)
    expect(await base.bookingChatThread.findUnique({ where: { id: thread.id } })).toBeNull()
    expect(await base.log.findUnique({ where: { id: logId } })).toBeNull()
  })

  it("removes expired legacy sessions/tokens while preserving valid credentials and revoked tombstones", async () => {
    const owner = await user("auth-records", "RENTAL")
    const expiredId = id("expired-session")
    const validId = id("valid-session")
    await base.session.createMany({
      data: [
        { id: expiredId, userId: owner.id, sessionToken: id("session-token"), expires: past },
        { id: validId, userId: owner.id, sessionToken: id("session-token"), expires: future },
      ],
    })
    const expiredToken = id("expired-token")
    const validToken = id("valid-token")
    await base.verificationToken.createMany({
      data: [
        { identifier: owner.email, token: expiredToken, expires: past },
        { identifier: owner.email, token: validToken, expires: future },
      ],
    })
    const tombstone = await base.passkeyCredential.create({
      data: {
        userId: owner.id,
        legacyCredentialId: id("revoked"),
        credentialPublicKey: "AA",
        metadata: {},
        revokedAt: past,
      },
    })
    const { cleanExpiredAuthRecords } = await import("../jobs/cleanExpiredAuthRecords")
    expect(await cleanExpiredAuthRecords(db)).toEqual({
      sessionsDeleted: 1,
      verificationTokensDeleted: 1,
    })
    expect(await base.session.findUnique({ where: { id: expiredId } })).toBeNull()
    expect(await base.session.findUnique({ where: { id: validId } })).not.toBeNull()
    expect(await base.verificationToken.count({ where: { token: validToken } })).toBe(1)
    expect(await base.passkeyCredential.findUnique({ where: { id: tombstone.id } })).not.toBeNull()
  })

  it("does not turn an already-ended accepted booking into borrowed during housekeeping", async () => {
    const owner = await user("ended-accepted", "RENTAL")
    const ended = await booking(owner.id, "ACCEPTED", new Date(Date.now() - 30 * 60000))
    const { markUpcomingBookingsBorrowed } = await import("../jobs/autoBorrowed")
    await markUpcomingBookingsBorrowed()
    expect(await base.booking.findUnique({ where: { id: ended.id } })).toMatchObject({
      status: "ACCEPTED",
    })
  })

  it("removes only orphaned parent-reference logs, with test deletion restricted to synthetic IDs", async () => {
    const orphanUser = id("orphan-user-log")
    const orphanBooking = id("orphan-booking-log")
    const valid = id("valid-log")
    const unassociated = id("unassociated-log")
    await base.log.createMany({
      data: [
        { id: orphanUser, type: "ADMIN", userId: id("missing-user"), message: "Orphan" },
        { id: orphanBooking, type: "BOOKING", bookingId: id("missing-booking"), message: "Orphan" },
        { id: valid, type: "ADMIN", userId: adminId, message: "Keep valid parent" },
        { id: unassociated, type: "ADMIN", message: "No parent; no new age policy" },
      ],
    })
    const scoped = {
      $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        base.$transaction(
          async (tx) => {
            const localTx = new Proxy(tx, {
              get(target, key) {
                if (key === "$queryRaw")
                  return async (...args: Parameters<typeof tx.$queryRaw>) => {
                    const rows = await tx.$queryRaw<Array<{ id: string }>>(...args)
                    return rows.filter((row) => row.id.startsWith(prefix))
                  }
                return Reflect.get(target, key)
              },
            })
            return operation(localTx)
          },
          { isolationLevel: "Serializable" },
        ),
    } as unknown as PrismaClient
    const { cleanOrphanLogs } = await import("../jobs/cleanOrphanLogs")
    expect((await cleanOrphanLogs(scoped)).deleted).toBe(2)
    expect(await base.log.count({ where: { id: { in: [orphanUser, orphanBooking] } } })).toBe(0)
    expect(await base.log.count({ where: { id: { in: [valid, unassociated] } } })).toBe(2)
  })
})
