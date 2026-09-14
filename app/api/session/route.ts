import { getApiUser } from "../../server-auth";

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  return auth.json({
    user: {
      ...user,
      authMode: process.env.NODE_ENV === "production" ? "chatgpt" : "development",
    },
  });
}
