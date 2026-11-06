import { notFound } from "next/navigation"
import { getAllEquipment } from "@/app/_data/equipment"
import ItemBookingPage from "./ItemBookingPage"

export default async function ItemBookingRoute({ itemId }: { itemId: string }) {
  const item = (await getAllEquipment()).find((entry) => entry.id === itemId)
  if (!item) notFound()
  return <ItemBookingPage item={item} />
}
