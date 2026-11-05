import { auth } from "../../../../../auth"

/** HTTP 204 stops old EventSource clients reconnecting. Notifications now poll
 * the bounded, authenticated notifications.getAll query across all instances. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })
}
