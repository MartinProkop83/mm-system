import { resolveCircuitLocation, resolveCircuitTravel, type CircuitLocationInput } from "../../circuit-location";
import { getApiUser } from "../../server-auth";

export async function POST(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  const payload = await request.json().catch(() => null) as CircuitLocationInput | null;
  if (!payload) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const location = await resolveCircuitLocation(payload);
  if (!location) return Response.json({ error: "Location could not be determined" }, { status: 422 });
  const travel = await resolveCircuitTravel(location);
  return Response.json({ location, travel });
}
