"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { useSession, signIn } from "next-auth/react"
import { enGB, de } from "date-fns/locale"
import type { Locale } from "date-fns"
import { Container } from "@/components/ui/container"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { SearchBar } from "@/components/SearchBar"
import { useI18n } from "@/locales/i18n"
import { useView, View } from "@/contexts/ViewContext"
import { CatalogBridgeProvider } from "./catalog-bridge"
import type { Item } from "@/components/ItemCard"
import { trpc } from "@/utils/trpc"
import { mapDbItemToClient } from "@/lib/mapItem"
import type { MappableItem } from "@/lib/mapItem"
import { Spinner } from "@/components/ui/spinner"

function BookingViewSkeleton() {
  return (
    <div className="mx-auto space-y-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-6 md:sticky md:top-24 md:self-start">
          <Skeleton className="h-10 w-3/4 rounded-md md:h-12" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-5/6 rounded-md" />
          </div>
          <Skeleton className="mt-4 aspect-video w-full rounded-lg" />
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <Skeleton className="h-7 w-24 rounded-md px-2 py-1" />
            <Skeleton className="h-7 w-20 rounded-md px-2 py-1" />
          </div>
          <div className="mt-6 rounded-lg border bg-muted/50 p-4">
            <Skeleton className="mb-3 h-5 w-1/2 rounded-md" />
            <div className="space-y-1.5 pl-5">
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-11/12 rounded-md" />
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-md space-y-6 md:min-h-[600px]">
          <Card className="bg-muted/50 shadow-sm">
            <CardHeader>
              <Skeleton className="mb-2 h-6 w-48" />
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

function SectionFallback() {
  return (
    <div className="flex items-center justify-center rounded-xl border bg-muted/40 p-6 shadow-sm">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Spinner className="size-6" />
      </div>
    </div>
  )
}

const BookingFormView = dynamic(() => import("@/components/BookingFormView"), {
  ssr: false,
  loading: () => <BookingViewSkeleton />,
})

const MyBookingsComponent = dynamic(() => import("@/components/MyBookings"), {
  ssr: false,
  loading: SectionFallback,
})

const RentalDashboardView = dynamic(() => import("@/components/RentalDashboardView"), {
  ssr: false,
  loading: SectionFallback,
})

const AdminDashboardView = dynamic(() => import("@/components/AdminDashboardView"), {
  ssr: false,
  loading: SectionFallback,
})

const ChatDialog = dynamic(() => import("@/components/ChatDialog"), {
  ssr: false,
  loading: () => null,
})

const AboutPage = dynamic(() => import("@/content/about/page"), {
  ssr: false,
  loading: SectionFallback,
})

const ContactPage = dynamic(() => import("@/content/contact/page"), {
  ssr: false,
  loading: SectionFallback,
})

const DevelopersPage = dynamic(() => import("@/content/developers/page"), {
  ssr: false,
  loading: SectionFallback,
})

const FaqPage = dynamic(() => import("@/content/faq/page"), {
  ssr: false,
  loading: SectionFallback,
})

const ImprintPage = dynamic(() => import("@/content/imprint/page"), {
  ssr: false,
  loading: SectionFallback,
})

const PrivacyPage = dynamic(() => import("@/content/privacy/page"), {
  ssr: false,
  loading: SectionFallback,
})

const SELECTED_ITEM_KEY = "grh-selected-item-id"

type IdleCapableWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
    cancelIdleCallback?: (handle: number) => void
  }

function usePrefetchViewBundles() {
  useEffect(() => {
    if (typeof window === "undefined") return
    let cancelled = false

    const loadBundles = () => {
      Promise.all([
        import("@/components/BookingFormView"),
        import("@/components/MyBookings"),
        import("@/components/RentalDashboardView"),
        import("@/components/AdminDashboardView"),
        import("@/components/ChatDialog"),
      ]).catch(() => {
        // swallow prefetch errors; runtime load path will retry
      })
    }

    const idleWindow = window as IdleCapableWindow
    const cancel =
      idleWindow.requestIdleCallback != null
        ? (() => {
            const idleId = idleWindow.requestIdleCallback!(
              () => {
                if (!cancelled) loadBundles()
              },
              { timeout: 2000 },
            )
            return () => idleWindow.cancelIdleCallback?.(idleId)
          })()
        : (() => {
            const timeoutId = setTimeout(() => {
              if (!cancelled) loadBundles()
            }, 1200)
            return () => clearTimeout(timeoutId)
          })()

    return () => {
      cancelled = true
      cancel()
    }
  }, [])
}

interface HomeShellProps {
  catalog: ReactNode
}

export default function HomeShell({ catalog }: HomeShellProps) {
  const [mounted, setMounted] = useState(false)
  const { view, setView, currentRoute } = useView()
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [newlyBookedId, setNewlyBookedId] = useState<string | null>(null)
  const [chatBookingId, setChatBookingId] = useState<string | null>(null)
  const [chatItemTitle, setChatItemTitle] = useState<string | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [chatSuppressed, setChatSuppressed] = useState(false)
  const mainContentRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [listReady, setListReady] = useState(false)

  usePrefetchViewBundles()

  const openChatWindow = useCallback(
    (bookingId: string, itemTitle?: string | null, options?: { force?: boolean }) => {
      const force = options?.force ?? false
      if (chatSuppressed && !force) {
        return
      }
      setChatSuppressed(false)
      setChatBookingId(bookingId)
      setChatItemTitle(itemTitle ?? null)
      setIsChatOpen(true)
    },
    [chatSuppressed],
  )

  const handleChatOpenChange = useCallback((open: boolean) => {
    setIsChatOpen(open)
    setChatSuppressed(!open)
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mainContentRef.current && "startViewTransition" in document) {
      mainContentRef.current.style.setProperty("view-transition-name", "main-content")
    }
  }, [])

  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState<"room" | "sports" | "game" | "other">("room")

  const { t, locale: i18nLocale } = useI18n()
  const { data: session, status: authStatus } = useSession()
  const dateFnsLocales: Record<string, Locale> = { en: enGB, de }
  const currentLocale = dateFnsLocales[i18nLocale] || enGB

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
        !items.find((item) => item.id === itemIdToFetch),
    },
  )

  const itemDetailsLoading = view === View.BOOKING && !selectedItem && (!listReady || isFetchingItem)

  useEffect(() => {
    if (mounted && currentRoute.view === "booking" && currentRoute.itemId && !selectedItem) {
      const found = items.find((item) => item.id === currentRoute.itemId)
      if (found) {
        setSelectedItem(found)
        localStorage.setItem(SELECTED_ITEM_KEY, found.id)
      }
    }
  }, [mounted, currentRoute, selectedItem, items])

  useEffect(() => {
    window.scrollTo(0, 0)
    if (view !== View.BOOKING) setSelectedItem(null)
    if (view !== View.MY_BOOKINGS) setNewlyBookedId(null)
  }, [view])

  const handleItemsHydrated = useCallback((hydrated: Item[]) => {
    setItems(hydrated)
    setListReady(true)
  }, [])

  const handleSelect = useCallback(
    (item: Item) => {
      setSelectedItem(item)
      localStorage.setItem(SELECTED_ITEM_KEY, item.id)
      setSearchTerm("")
      setView(View.BOOKING, item.id)
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
      setView(View.MY_BOOKINGS, undefined, id)
    },
    [setView],
  )

  const onLogin = useCallback(
    async (email: string) => {
      const res = await signIn("email", { email, redirect: false })
      if (res?.error) {
        let errorMessage = t("errors.loginUnexpected")
        if (res.error === "EmailSignin" || res.error === "CredentialsSignin") {
          errorMessage = t("errors.emailSignin")
        } else if (res.error.includes("configuration")) {
          errorMessage = t("errors.authConfig")
        }
        return { error: errorMessage }
      }
      return {}
    },
    [t],
  )

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

  useEffect(() => {
    if (view !== View.BOOKING || selectedItem) return
    const itemId = itemIdToFetch
    if (!itemId) return
    const found = items.find((item) => item.id === itemId)
    if (found) {
      setSelectedItem(found)
    } else if (fetchedItem) {
      setSelectedItem(mapDbItemToClient(fetchedItem as MappableItem, i18nLocale))
    }
  }, [view, items, selectedItem, fetchedItem, i18nLocale, itemIdToFetch])

  useEffect(() => {
    const openChatBookingId = localStorage.getItem("grh-open-chat-booking-id")
    if (openChatBookingId && session?.user) {
      openChatWindow(openChatBookingId, null, { force: true })
      localStorage.removeItem("grh-open-chat-booking-id")
    }
  }, [session, openChatWindow])

  useEffect(() => {
    const handler = (event: Event) => {
      const { bookingId, itemTitle } = (
        event as CustomEvent<{ bookingId: string; itemTitle?: string }>
      ).detail
      openChatWindow(bookingId, itemTitle ?? null, { force: true })
    }
    window.addEventListener("grh-open-chat", handler)
    return () => window.removeEventListener("grh-open-chat", handler)
  }, [openChatWindow])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_CLICK") {
        const { bookingId, notificationType } = event.data
        if (bookingId) {
          if (notificationType === "chat") {
            localStorage.setItem("grh-open-chat-booking-id", bookingId)
            openChatWindow(bookingId, null, { force: true })
          } else {
            localStorage.setItem("grh-highlight-booking-id", bookingId)
            setView(View.MY_BOOKINGS)
          }
        }
      }
    }

    navigator.serviceWorker?.addEventListener("message", handleMessage)
    return () => navigator.serviceWorker?.removeEventListener("message", handleMessage)
  }, [setView, openChatWindow])

  useEffect(() => {
    if (typeof window === "undefined" || !session?.user) return

    const urlParams = new URLSearchParams(window.location.search)
    const chatParam = urlParams.get("chat")
    const highlightBookingId = urlParams.get("highlight")

    if (chatParam) {
      openChatWindow(chatParam, null, { force: true })
      window.history.replaceState({}, "", "/")
    } else if (highlightBookingId) {
      localStorage.setItem("grh-highlight-booking-id", highlightBookingId)
      setView(View.MY_BOOKINGS)
      window.history.replaceState({}, "", "/")
    }
  }, [session, setView, openChatWindow])

  const listBridgeValue = useMemo(
    () => ({
      searchTerm,
      activeTab,
      onSelectItem: handleSelect,
      onItemsHydrated: handleItemsHydrated,
    }),
    [searchTerm, activeTab, handleSelect, handleItemsHydrated],
  )

  const listView = (
    <>
      <div className="mb-10 text-center">
        <h1 className="mb-3 text-4xl font-bold">{t("homePage.title")}</h1>
        <p className="mx-auto max-w-2xl text-lg text-foreground/80 dark:text-muted-foreground">
          {t("homePage.description")}
        </p>
      </div>
      <SearchBar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
      <CatalogBridgeProvider value={listBridgeValue}>{catalog}</CatalogBridgeProvider>
    </>
  )

  let currentViewComponent: ReactNode
  switch (view) {
    case View.LIST:
      currentViewComponent = listView
      break
    case View.BOOKING:
      currentViewComponent = (
        <>
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
            <p className="py-16 text-center text-muted-foreground">{t("errors.loadingItemDetails")}</p>
          )}
        </>
      )
      break
    case View.MY_BOOKINGS:
      currentViewComponent = (
        <MyBookingsComponent highlightBookingId={newlyBookedId} onGoBackToList={goBack} />
      )
      break
    case View.RENTAL_DASHBOARD:
      currentViewComponent = <RentalDashboardView onGoBack={goBack} />
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
      currentViewComponent = listView
  }

  if (!mounted) {
    return (
      <Container className="py-8 md:py-12 lg:py-16">
        <div className="mb-10 text-center">
          <Skeleton className="mx-auto mb-3 h-10 w-64" />
          <Skeleton className="mx-auto h-6 w-96" />
        </div>
      </Container>
    )
  }

  return (
    <Container className="py-8 md:py-12 lg:py-16">
      <div ref={mainContentRef}>{currentViewComponent}</div>
      <ChatDialog
        open={isChatOpen}
        onOpenChange={handleChatOpenChange}
        bookingId={chatBookingId}
        itemTitle={chatItemTitle}
      />
    </Container>
  )
}
