import Link from "next/link"
import { Button } from "@/components/ui/button"
export default function NotFound() {
  return (
    <section className="mx-auto max-w-md space-y-5 py-12 text-center">
      <h1 className="text-3xl font-semibold">Page not found · Seite nicht gefunden</h1>
      <p className="text-muted-foreground">This item or page is no longer available.</p>
      <Button asChild>
        <Link href="/">Home · Startseite</Link>
      </Button>
    </section>
  )
}
