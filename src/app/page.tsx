// src/app/page.tsx (or wherever your HomePage component is)
"use client"

import { useCallback, useEffect, useState, useRef, useMemo } from "react"
import { trpc } from "@/utils/trpc"
import { SearchBar } from "@/components/SearchBar"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { useI18n } from "@/locales/i18n"
import { Container } from "@/components/ui/container"
import { useSession, signIn } from "next-auth/react"
// import { toast } from "@/components/ui/use-toast"; // Not used directly here
import { ChevronLeft } from "lucide-react"
import { enGB, de } from "date-fns/locale"
import type { Locale } from "date-fns"
import { ItemCard } from "@/components/ItemCard"
import BookingFormView from "@/components/BookingFormView"
import MyBookingsComponent from "@/components/MyBookings"
import RentalDashboardView from "@/components/RentalDashboardView" // Create this new component
import ChatDialog from "@/components/ChatDialog"
import { useView, View } from "@/contexts/ViewContext" // Import View type
import type { Item } from "@/components/ItemCard" // Ensure this type path is correct
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@/server/routers/appRouter"

// Import content components
import AboutPage from "@/content/about/page"
import ContactPage from "@/content/contact/page"
import DevelopersPage from "@/content/developers/page"
import FaqPage from "@/content/faq/page"
import ImprintPage from "@/content/imprint/page"
import PrivacyPage from "@/content/privacy/page"

type DbItem =
  | inferRouterOutputs<AppRouter>["items"]["all"][number]
  | NonNullable<inferRouterOutputs<AppRouter>["items"]["byId"]>

function mapDbItemToClient(it: DbItem, locale: string): Item {
  const localeKey = locale === "de" ? "De" : "En"
  const name = it[`title${localeKey}` as "titleEn"] ?? ""
  const description = it[`description${localeKey}` as "descriptionEn"] ?? ""
  let type: Item["type"] = "sports"
  if (it.type) {
    const itemTypeLower = String(it.type).toLowerCase()
    if (
      itemTypeLower === "room" ||
      itemTypeLower === "sports" ||
      itemTypeLower === "game" ||
      itemTypeLower === "other"
    ) {
      type = itemTypeLower as Item["type"]
    }
  }
  let images: string[] | undefined
  try {
    if ("imagesJson" in it && it.imagesJson) {
      const parsed = JSON.parse(it.imagesJson as string)
      if (Array.isArray(parsed)) images = parsed.map(String)
    }
  } catch {
    images = undefined
  }
  let rulesText: string | undefined
  if (localeKey === "De") {
    rulesText = "rulesDe" in it ? (it.rulesDe ?? undefined) : undefined
  } else {
    rulesText = "rulesEn" in it ? (it.rulesEn ?? undefined) : undefined
  }
  let rules: string | string[] | undefined
  if (rulesText) {
    const parsed = rulesText
      .split("\n")
      .map((r) => r.replace(/^\s*-\s*/, "").trim())
      .filter(Boolean)
    rules = parsed.length > 1 ? parsed : parsed[0]
  }
  return {
    id: String(it.id),
    type,
    name: String(name),
    description: String(description),
    capacity: "capacity" in it && it.capacity != null ? Number(it.capacity) : undefined,
    players: "players" in it ? (it.players ?? undefined) : undefined,
    images,
    totalQuantity: "totalQuantity" in it ? (it.totalQuantity ?? 1) : 1,
    rules,
  }
}

import AdminDashboardView from "@/components/AdminDashboardView"

function BookingViewSkeleton() {
  return (
    <div className="space-y-8 mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Item Details Column */}
        <div className="space-y-6 md:sticky md:top-24 md:self-start">
          <Skeleton className="h-10 w-3/4 rounded-md md:h-12" />
          <div className="space-y-2 mt-4">
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-5/6 rounded-md" />
          </div>
          <Skeleton className="aspect-video w-full mt-4 rounded-lg" />
          <div className="flex flex-wrap items-center gap-2 text-sm mt-4">
            <Skeleton className="h-7 w-24 rounded-md py-1 px-2" />
            <Skeleton className="h-7 w-20 rounded-md py-1 px-2" />
          </div>
          <div className="p-4 border rounded-lg bg-muted/50 mt-6">
            <Skeleton className="h-5 w-1/2 mb-3 rounded-md" />
            <div className="space-y-1.5 pl-5">
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-11/12 rounded-md" />
            </div>
          </div>
        </div>
        {/* Booking Form Column */}
        <div className="space-y-6 w-full max-w-md mx-auto min-h-[600px]">
          <Card className="bg-muted/50 shadow-sm">
            <CardHeader>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// Define a more specific type for the view if not already in ViewContext
// type AppView = "list" | "booking" | "myBookings" | "rentalDashboard" | "adminDashboard";

export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  const { view, setView, currentRoute } = useView()
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [newlyBookedId, setNewlyBookedId] = useState<string | null>(null)
  const [chatBookingId, setChatBookingId] = useState<string | null>(null)
  const [chatItemTitle, setChatItemTitle] = useState<string | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const mainContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Set view transition name for main content
  useEffect(() => {
    if (mainContentRef.current && "startViewTransition" in document) {
      mainContentRef.current.style.setProperty("view-transition-name", "main-content")
    }
  }, [])

  const SELECTED_ITEM_KEY = "grh-selected-item-id"

  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState<"room" | "sports" | "game" | "other">("room")

  const { t, locale: i18nLocale } = useI18n()
  const { data: session, status: authStatus } = useSession()
  const dateFnsLocales: Record<string, Locale> = { en: enGB, de }
  const currentLocale = dateFnsLocales[i18nLocale] || enGB // Progressive loading: load rooms first (default tab), then others in background
  const { data: roomItems, isLoading: isLoadingRooms } = trpc.items.byType.useQuery(
    { types: ["ROOM"] },
    {
      refetchOnWindowFocus: false,
    },
  )

  const { data: otherItems, isLoading: isLoadingOthers } = trpc.items.byType.useQuery(
    { types: ["SPORTS", "GAME", "OTHER"] },
    {
      refetchOnWindowFocus: false,
      // Start loading other items after rooms are loaded
      enabled: !isLoadingRooms,
    },
  )

  const items: Item[] = useMemo(() => {
    const roomItemsArray = Array.isArray(roomItems) ? roomItems : []
    const otherItemsArray = Array.isArray(otherItems) ? otherItems : []
    const combined = [...roomItemsArray, ...otherItemsArray]
    return combined.map((it) => mapDbItemToClient(it, i18nLocale))
  }, [roomItems, otherItems, i18nLocale])

  // Smart loading: only show loading when current tab's items are loading
  const isLoading = useMemo(() => {
    if (activeTab === "room") {
      return isLoadingRooms
    }
    // For other tabs, we need both room items (for search) and the specific items
    return isLoadingRooms || isLoadingOthers
  }, [activeTab, isLoadingRooms, isLoadingOthers])

  // Initialize from current route when component mounts (handle page refresh)
  useEffect(() => {
    if (mounted && currentRoute.view === "booking" && currentRoute.itemId && !selectedItem) {
      // If we're on a booking route but don't have a selected item, try to load it
      const found = items.find((it) => it.id === currentRoute.itemId)
      if (found) {
        setSelectedItem(found)
        localStorage.setItem(SELECTED_ITEM_KEY, found.id)
      }
    }
  }, [mounted, currentRoute, selectedItem, items])

  // Determine which item ID to fetch (from URL route or localStorage)
  const itemIdToFetch =
    currentRoute.view === "booking" && currentRoute.itemId
      ? currentRoute.itemId
      : typeof window !== "undefined"
        ? localStorage.getItem(SELECTED_ITEM_KEY)
        : null

  const { data: fetchedItem, isLoading: isFetchingItem } = trpc.items.byId.useQuery(
    itemIdToFetch ?? "",
    {
      enabled:
        view === View.BOOKING &&
        !selectedItem &&
        !!itemIdToFetch &&
        !items.find((it) => it.id === itemIdToFetch),
    },
  )

  const itemDetailsLoading = view === View.BOOKING && !selectedItem && (isLoading || isFetchingItem)

  useEffect(() => {
    window.scrollTo(0, 0)
    if (view !== View.BOOKING) setSelectedItem(null) // Use enum from context
    if (view !== View.MY_BOOKINGS) setNewlyBookedId(null)
  }, [view])

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
          (searchTerm.trim() === "" ? item.type === activeTab : true),
      ),
    [items, searchTerm, activeTab],
  )

  // Dynamic grid classes based on item count for optimal responsive layout
  const getGridClasses = useCallback((itemCount: number) => {
    if (itemCount === 0) return "grid-cols-1" // Empty state
    if (itemCount === 1) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3" // One item - thirds
    if (itemCount === 2) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3" // Two items - thirds
    if (itemCount === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3" // Three items - thirds
    if (itemCount <= 6)
      return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4" // Small collections
    if (itemCount <= 12)
      return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5" // Medium collections
    return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" // Large collections - more dense
  }, [])
  const handleSelect = useCallback(
    (item: Item) => {
      setSelectedItem(item)
      localStorage.setItem(SELECTED_ITEM_KEY, item.id)
      setSearchTerm("") // Clear search when item is selected
      setView(View.BOOKING, item.id) // Pass itemId for routing
    },
    [setView],
  )
  const goBack = useCallback(() => {
    localStorage.removeItem(SELECTED_ITEM_KEY)
    setView(View.LIST)
  }, [setView])
  const onBooked = useCallback(
    (id: string) => {
      setNewlyBookedId(id)
      setView(View.MY_BOOKINGS, undefined, id) // Pass highlightId for routing
    },
    [setView],
  )
  const onLogin = useCallback(
    async (email: string) => {
      const res = await signIn("email", { email, redirect: false })
      if (res?.error) {
        // Map common NextAuth errors to your translation keys
        let errorMessage = t("errors.loginUnexpected") // Default
        if (res.error === "EmailSignin" || res.error === "CredentialsSignin") {
          // Common NextAuth error codes
          errorMessage = t("errors.emailSignin")
        } else if (res.error.includes("configuration")) {
          // Generic check
          errorMessage = t("errors.authConfig")
        }
        // Or if your onLoginRequest already localizes, use res.error directly
        return { error: errorMessage }
      }
      return {}
    },
    [t],
  )

  // Persist selected item across reloads when in booking view
  const initialPersistRef = useRef(true)
  useEffect(() => {
    if (initialPersistRef.current) {
      initialPersistRef.current = false
      return
    }
    if (view === View.BOOKING && selectedItem) {
      localStorage.setItem(SELECTED_ITEM_KEY, selectedItem.id)
    } else if (view !== View.BOOKING) {
      localStorage.removeItem(SELECTED_ITEM_KEY)
    }
  }, [view, selectedItem])

  // Restore selected item after refresh if items are loaded or fetched directly
  useEffect(() => {
    if (view !== View.BOOKING || selectedItem) return
    const itemId = itemIdToFetch
    if (!itemId) return
    const found = items.find((it) => it.id === itemId)
    if (found) {
      setSelectedItem(found)
    } else if (fetchedItem) {
      setSelectedItem(mapDbItemToClient(fetchedItem, i18nLocale))
    }
  }, [view, items, selectedItem, fetchedItem, i18nLocale, itemIdToFetch])
  // Handle chat navigation from localStorage (triggered by notifications)
  useEffect(() => {
    const openChatBookingId = localStorage.getItem("grh-open-chat-booking-id")
    if (openChatBookingId && session?.user) {
      setChatBookingId(openChatBookingId)
      setChatItemTitle(null) // We'll update this when we have booking data
      setIsChatOpen(true)
      localStorage.removeItem("grh-open-chat-booking-id")
    }
  }, [session])

  // Listen for custom events to open the chat dialog
  useEffect(() => {
    const handler = (event: Event) => {
      const { bookingId, itemTitle } = (
        event as CustomEvent<{ bookingId: string; itemTitle?: string }>
      ).detail
      setChatBookingId(bookingId)
      setChatItemTitle(itemTitle ?? null)
      setIsChatOpen(true)
    }
    window.addEventListener("grh-open-chat", handler)
    return () => window.removeEventListener("grh-open-chat", handler)
  }, [])
  // Handle navigation from service worker messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_CLICK") {
        const { bookingId, notificationType } = event.data
        if (bookingId) {
          if (notificationType === "chat") {
            localStorage.setItem("grh-open-chat-booking-id", bookingId)
            setChatBookingId(bookingId)
            setChatItemTitle(null)
            setIsChatOpen(true)
          } else {
            localStorage.setItem("grh-highlight-booking-id", bookingId)
            setView(View.MY_BOOKINGS)
          }
        }
      }
    }

    navigator.serviceWorker?.addEventListener("message", handleMessage)
    return () => {
      navigator.serviceWorker?.removeEventListener("message", handleMessage)
    }
  }, [setView])

  // Handle URL parameters for navigation (when app is opened from native notifications)
  useEffect(() => {
    if (typeof window === "undefined" || !session?.user) return

    const urlParams = new URLSearchParams(window.location.search)
    const chatBookingId = urlParams.get("chat")
    const highlightBookingId = urlParams.get("highlight")

    if (chatBookingId) {
      setChatBookingId(chatBookingId)
      setChatItemTitle(null)
      setIsChatOpen(true)
      // Clean up URL without triggering a page reload
      window.history.replaceState({}, "", "/")
    } else if (highlightBookingId) {
      localStorage.setItem("grh-highlight-booking-id", highlightBookingId)
      setView(View.MY_BOOKINGS)
      // Clean up URL without triggering a page reload
      window.history.replaceState({}, "", "/")
    }
  }, [session, setView])

  const ListView = useMemo(
    () => (
      <>
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-3">{t("homePage.title")}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("homePage.description")}
          </p>
        </div>
        <SearchBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        {isLoading ? (
          <div className={`grid ${getGridClasses(3)} gap-4 md:gap-6`}>
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="overflow-hidden rounded-xl shadow-md">
                <Skeleton className="w-full aspect-video bg-muted" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-6 w-3/4 rounded-md" />
                  <Skeleton className="h-4 w-1/2 rounded-md" />
                  <Skeleton className="h-4 w-1/3 rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              </Card>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className={`grid ${getGridClasses(filtered.length)} gap-4 md:gap-6`}>
            {filtered.map((item) => (
              <ItemCard key={item.id} item={item} onSelectItem={handleSelect} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <p>{t("homePage.noItemsFound")}</p> {/* Changed key */}
          </div>
        )}
      </>
    ),
    [
      t,
      searchTerm,
      setSearchTerm,
      activeTab,
      setActiveTab,
      isLoading,
      filtered,
      handleSelect,
      getGridClasses,
    ],
  )

  const BookingViewComponent = () => (
    // Renamed for clarity
    <>
      <div className="flex justify-end mb-6">
        <Button variant="outline" size="sm" onClick={goBack} className="flex items-center gap-2">
          <ChevronLeft className="h-4 w-4" />
          {t("common.back")}
        </Button>
      </div>
      {selectedItem ? (
        <BookingFormView
          item={selectedItem}
          session={session}
          authStatus={authStatus}
          currentLocale={currentLocale}
          onGoBack={goBack}
          onBookingSuccess={onBooked}
          onLoginRequest={onLogin}
        />
      ) : itemDetailsLoading ? (
        <BookingViewSkeleton />
      ) : (
        <p className="text-center py-16 text-muted-foreground">
          {t("errors.loadingItemDetails")} {/* Changed key */}
        </p>
      )}
    </>
  )

  const MyBookingsViewComponent = () => (
    // Renamed for clarity
    <MyBookingsComponent
      highlightBookingId={newlyBookedId}
      onGoBackToList={goBack} // To go back to the item list view
    />
  )

  const RentalDashboardViewComponent = () => (
    // New view renderer
    // Basic placeholder, implement RentalDashboardView.tsx next
    <RentalDashboardView onGoBack={goBack} />
  )

  // Render logic based on view state
  if (!mounted) {
    // Show a loading state during hydration to prevent mismatch
    return (
      <Container className="py-8 md:py-12 lg:py-16">
        <div className="text-center mb-10">
          <Skeleton className="h-10 w-64 mx-auto mb-3" />
          <Skeleton className="h-6 w-96 mx-auto" />
        </div>
      </Container>
    )
  }
  let currentViewComponent
  switch (view) {
    case View.LIST:
      currentViewComponent = ListView
      break
    case View.BOOKING:
      currentViewComponent = <BookingViewComponent />
      break
    case View.MY_BOOKINGS:
      currentViewComponent = <MyBookingsViewComponent />
      break
    case View.RENTAL_DASHBOARD:
      currentViewComponent = <RentalDashboardViewComponent />
      break
    case View.ADMIN_DASHBOARD:
      currentViewComponent = <AdminDashboardView onGoBack={goBack} />
      break
    case View.ABOUT:
      currentViewComponent = <AboutPage />
      break
    case View.CONTACT:
      currentViewComponent = <ContactPage />
      break
    case View.DEVELOPERS:
      currentViewComponent = <DevelopersPage />
      break
    case View.FAQ:
      currentViewComponent = <FaqPage />
      break
    case View.IMPRINT:
      currentViewComponent = <ImprintPage />
      break
    case View.PRIVACY:
      currentViewComponent = <PrivacyPage />
      break
    default:
      currentViewComponent = ListView
  }
  // goBack function is not used consistently in all components.
  // We might want to pass it down to all components that need it the same way.
  return (
    <Container className="py-8 md:py-12 lg:py-16">
      <div ref={mainContentRef}>{currentViewComponent}</div>
      <ChatDialog
        open={isChatOpen}
        onOpenChange={setIsChatOpen}
        bookingId={chatBookingId}
        itemTitle={chatItemTitle}
      />
    </Container>
  )
}
