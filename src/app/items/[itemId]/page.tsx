import ItemBookingRoute from "@/features/booking-request/ItemBookingRoute"
export default async function Page({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  return <ItemBookingRoute itemId={itemId} />
}
