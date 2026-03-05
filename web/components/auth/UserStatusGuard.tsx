"use client";

import { useUserProfile } from "@/hooks/use-user-profile";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface UserStatusGuardProps {
  children: React.ReactNode;
}

export function UserStatusGuard({ children }: UserStatusGuardProps) {
  const { profile, loading, refresh } = useUserProfile();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  // Realtime subscription to kick users immediately
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`realtime-status-check:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          console.log("Status update detected:", payload);
          const newStatus = payload.new.status;

          if (newStatus && newStatus !== profile.status) {
            // Trigger refresh of profile data hook
            refresh();

            // Immediate check for critical status changes
            if (newStatus === "banned" || newStatus === "paused") {
              toast.error(`Your account has been ${newStatus}.`);
              router.replace(`/waitlist?reason=${newStatus}`);
            } else if (newStatus === "active") {
              toast.success("Account activated!");
              if (pathname.includes("waitlist")) {
                router.replace("/command-center");
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, profile?.status, refresh, router, supabase, pathname]);

  // Standard effective check
  useEffect(() => {
    if (loading || !profile) return;

    // Admins always bypass waitlist — never lock out the site owner
    if (profile.is_admin) return;

    if (profile.status === "pending") {
      router.replace("/waitlist");
    } else if (profile.status === "paused") {
      router.replace("/waitlist?reason=paused");
    } else if (profile.status === "banned") {
      router.replace("/waitlist?reason=banned");
    } else if (pathname === "/waitlist" && profile.status === "active") {
      router.replace("/command-center");
    }
  }, [profile, loading, router, pathname]);

  if (loading) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center">
        <div className="text-neutral-500 animate-pulse">Checking access...</div>
      </div>
    );
  }

  // If we're not active (and not admin), we render nothing while redirect happens
  if (profile && profile.status !== "active" && !profile.is_admin) {
    return null;
  }

  return <>{children}</>;
}
