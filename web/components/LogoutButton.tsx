"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useState } from "react";

export function LogoutButton({ isCollapsed }: { isCollapsed?: boolean }) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      // Sign out from Supabase
      await supabase.auth.signOut();

      // Clear the is_logged_in cookie
      document.cookie =
        "is_logged_in=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";

      // Redirect to login
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      onClick={handleLogout}
      disabled={isLoading}
      className="text-neutral-400 hover:text-red-400 hover:bg-red-950/20 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)] border border-transparent hover:border-red-500/20 gap-2 font-mono text-xs uppercase tracking-wider transition-all duration-300 group"
    >
      <div className="flex items-center justify-center">
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <LogOut className="w-4 h-4" />
        )}
      </div>
      <span
        className={`transition-all duration-300 ${
          isCollapsed
            ? "opacity-0 w-0 overflow-hidden"
            : "opacity-100 w-auto ml-2"
        } whitespace-nowrap`}
      >
        SECURE_LOGOUT
      </span>
    </Button>
  );
}
