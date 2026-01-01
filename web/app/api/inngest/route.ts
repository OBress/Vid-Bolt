import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions/index";

// Serve the Inngest API endpoint for Next.js App Router
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
  // If we're in dev mode, explicitly skip signing key validation unless we want it.
  // This prevents production keys in .env.local from blocking local dev server sync.
  signingKey: process.env.INNGEST_DEV === "true" ? undefined : process.env.INNGEST_SIGNING_KEY,
});
