import { RoomDashboard } from "@/components/RoomDashboard";

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <RoomDashboard roomId={roomId} />;
}
