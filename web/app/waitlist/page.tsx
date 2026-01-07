"use client";

import { useUserProfile } from "@/hooks/use-user-profile";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Lock, Clock, AlertOctagon } from "lucide-react";
import { toast } from "sonner";

export default function WaitlistPage() {
  const { profile, loading } = useUserProfile();
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const copyUsername = () => {
    if (profile?.username) {
      navigator.clipboard.writeText(profile.username);
      toast.success("Username copied to clipboard");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-neutral-500">
        Loading status...
      </div>
    );
  }

  const getStatusContent = () => {
    if (reason === "banned") {
      return {
        icon: <AlertOctagon className="w-16 h-16 text-red-500 mb-4" />,
        title: "Account Suspended",
        description:
          "Your account has been suspended due to a violation of our terms of service.",
        color: "text-red-500",
      };
    }
    if (reason === "paused") {
      return {
        icon: <Lock className="w-16 h-16 text-orange-500 mb-4" />,
        title: "Account Paused",
        description:
          "Your account is currently paused. Please contact support/admin to reactivate.",
        color: "text-orange-500",
      };
    }
    return {
      icon: <Clock className="w-16 h-16 text-yellow-500 mb-4" />,
      title: "Access Pending",
      description:
        "You are on the waitlist! To get access, please send your username to the administrator for approval.",
      color: "text-yellow-500",
    };
  };

  const content = getStatusContent();

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
        <div className="flex justify-center">{content.icon}</div>

        <h1 className={`text-2xl font-bold mb-2 ${content.color}`}>
          {content.title}
        </h1>

        <p className="text-neutral-400 mb-8">{content.description}</p>

        {profile && (
          <div className="bg-black/50 border border-neutral-800 rounded-lg p-4 mb-8 flex items-center justify-between group">
            <div className="text-left">
              <div className="text-xs text-neutral-500 uppercase font-bold">
                Your Handle
              </div>
              <div className="text-white font-mono">@{profile.username}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-neutral-500 hover:text-white"
              onClick={copyUsername}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        )}

        <Button
          variant="outline"
          onClick={handleLogout}
          className="w-full bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-white"
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
}
