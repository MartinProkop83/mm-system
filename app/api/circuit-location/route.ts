import { resolveCircuitLocation, resolveCircuitTravel, type CircuitLocationInput } from "../../circuit-location";
import { getAppUser } from "../../server-auth";

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => null) as CircuitLocationInput | null;
  if (!payload) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const location = await resolveCircuitLocation(payload);
  if (!location) return Response.json({ error: "Location could not be determined" }, { status: 422 });
  const travel = await resolveCircuitTravel(location);
  return Response.json({ location, travel });
}
