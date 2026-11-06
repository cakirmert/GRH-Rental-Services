"use client"
import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { de, enGB } from "date-fns/locale"
import { useCurrentAccount } from "@/features/identity/client"
import { useI18n } from "@/locales/i18n"
import { mapDbItemToClient } from "@/lib/mapItem"
import type { CatalogEquipmentRecord } from "@/app/_data/equipment"
import BookingRequestFeature from "./BookingRequestFeature"

export default function ItemBookingPage({ item }: { item: CatalogEquipmentRecord }) {
  const router = useRouter()
  const { user, status } = useCurrentAccount()
  const { locale } = useI18n()
  const mapped = useMemo(() => mapDbItemToClient(item, locale), [item, locale])
  return (
    <BookingRequestFeature
      key={(user?.id ?? "guest") + ":" + item.id}
      item={mapped}
      session={user ? { user } : null}
      authStatus={status}
      currentLocale={locale === "de" ? de : enGB}
      onGoBack={() => router.push("/")}
      onBookingSuccess={(id) => router.push("/bookings/" + encodeURIComponent(id))}
    />
  )
}
