import { Suspense } from "react"
import HomeShell from "./_components/home-shell.client"
import CatalogSection from "./_components/catalog-section"
import ListSkeleton from "./_components/list-skeleton"

export const dynamic = "force-static"
export const revalidate = 60

export default function Page() {
  return (
    <HomeShell
      catalog={
        <Suspense fallback={<ListSkeleton />}>
          <CatalogSection />
        </Suspense>
      }
    />
  )
}
