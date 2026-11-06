import CatalogFeature from "@/features/catalog/CatalogFeature"
import { getAllEquipment } from "./_data/equipment"
import { readBookmark, type BookmarkParameters } from "@/utils/bookmarks"
import ProtectedPage from "@/features/shell/ProtectedPage"
import BookingsPage from "@/features/bookings/BookingsPage"
import StaffPage from "@/features/staff/StaffPage"
import AdminPage from "@/features/admin/AdminPage"
import ConversationPage from "@/features/chat/ConversationPage"
import ItemBookingRoute from "@/features/booking-request/ItemBookingRoute"
import AboutPage from "@/content/about/page"
import ContactPage from "@/content/contact/page"
import DevelopersPage from "@/content/developers/page"
import FAQPage from "@/content/faq/page"
import ImprintPage from "@/content/imprint/page"
import PrivacyPage from "@/content/privacy/page"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<BookmarkParameters>
}) {
  const bookmark = readBookmark(await searchParams)
  switch (bookmark?.view) {
    case "booking":
      return <ItemBookingRoute itemId={bookmark.itemId} />
    case "my-bookings":
      return (
        <ProtectedPage>
          <BookingsPage highlightId={bookmark.highlightId} />
        </ProtectedPage>
      )
    case "rental-dashboard":
      return (
        <ProtectedPage role="staff">
          <StaffPage />
        </ProtectedPage>
      )
    case "admin-dashboard":
      return (
        <ProtectedPage role="admin">
          <AdminPage />
        </ProtectedPage>
      )
    case "chat":
      return (
        <ProtectedPage>
          <ConversationPage bookingId={bookmark.bookingId} />
        </ProtectedPage>
      )
    case "about":
      return <AboutPage />
    case "contact":
      return <ContactPage />
    case "developers":
      return <DevelopersPage />
    case "faq":
      return <FAQPage />
    case "imprint":
      return <ImprintPage />
    case "privacy":
      return <PrivacyPage />
  }
  const items = await getAllEquipment()
  return <CatalogFeature items={items} />
}
