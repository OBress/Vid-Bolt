/**
 * PostHog Provider Stub
 * 
 * This is a stub version for Next.js compatibility.
 * PostHog functionality is disabled in this ported version.
 * To enable PostHog, use the Next.js-specific PostHog integration.
 */

import React from "react";

// PostHog is disabled in this Next.js port
// To enable, integrate with Next.js-specific PostHog package

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  // Simply pass through children without PostHog tracking
  return <>{children}</>;
}