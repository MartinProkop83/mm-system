import { getAppUser } from "../../server-auth";

export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({
    user: {
      ...user,
      authMode: process.env.NODE_ENV === "production" ? "chatgpt" : "development",
    },
  });
}
