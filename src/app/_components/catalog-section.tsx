import CatalogListClient from "./catalog-list.client"
import { getAllEquipment } from "../_data/equipment"

export default async function CatalogSection() {
  try {
    const items = await getAllEquipment()
    return <CatalogListClient items={items} />
  } catch (error) {
    console.error("Failed to fetch equipment:", error)
    return <div className="p-4 text-center text-muted-foreground">Unable to load catalog items at this time.</div>
  }
}
