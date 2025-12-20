"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useState } from "react";

export function LogoutButton() {
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
      className="text-neutral-400 hover:text-white hover:bg-neutral-800 gap-2 font-mono text-xs uppercase tracking-wider"
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <LogOut className="w-4 h-4" />
      )}
      SECURE_LOGOUT
    </Button>
  );
}
