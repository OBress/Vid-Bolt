"use client";

// Re-export from the shared GCP VM context provider.
// All VM state is now managed by GCPVMProvider — this file exists
// for backward compatibility so existing imports continue to work.
export { useGCPVM } from "@/providers/GCPVMProvider";
export type { GCPVMState as UseGCPVMReturn } from "@/providers/GCPVMProvider";
