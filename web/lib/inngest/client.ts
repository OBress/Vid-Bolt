import { Inngest } from "inngest";

// Use local dev server if INNGEST_DEV is set, otherwise use cloud
const isDev = process.env.INNGEST_DEV === "true";

// Create a single Inngest client used throughout the application.
export const inngest = new Inngest({
  id: "vid-bolt",
  // Event key for cloud integration (not needed for local dev server)
  eventKey: isDev ? undefined : process.env.INNGEST_EVENT_KEY,
  // Point to local dev server when in dev mode
  ...(isDev && { baseUrl: "http://localhost:8288" }),
});
