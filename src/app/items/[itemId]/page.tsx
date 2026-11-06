import { notFound } from "next/navigation"
import { getAllEquipment } from "@/app/_data/equipment"
import ItemBookingPage from "@/features/booking-request/ItemBookingPage"
export default async function Page({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  const item = (await getAllEquipment()).find((entry) => entry.id === itemId)
  if (!item) notFound()
  return <ItemBookingPage item={item} />
}
