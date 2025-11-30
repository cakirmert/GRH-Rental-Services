import CatalogListClient from "./catalog-list.client"
import { getAllEquipment } from "../_data/equipment"

export default async function CatalogSection() {
  const items = await getAllEquipment()
  return <CatalogListClient items={items} />
}
