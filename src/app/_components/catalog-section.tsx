import CatalogListClient from "./catalog-list.client"
import { getAllEquipment } from "../_data/equipment"

export default async function CatalogSection() {
  let items: Awaited<ReturnType<typeof getAllEquipment>>

  try {
    items = await getAllEquipment()
  } catch (error) {
    console.error("Failed to fetch equipment:", error)
    return (
      <div className="p-4 text-center text-muted-foreground">
        Unable to load catalog items at this time.
      </div>
    )
  }

  return <CatalogListClient items={items} />
}
