import CatalogFeature from "@/features/catalog/CatalogFeature"
import { getAllEquipment } from "./_data/equipment"

export default async function Page() {
  const items = await getAllEquipment()
  return <CatalogFeature items={items} />
}
