"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Cpu, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, { title: string; message: string }> = {
  banned: {
    title: "ACCESS DENIED",
    message: "Your account has been permanently banned. You cannot register with this email or Discord account.",
  },
  profile_creation_failed: {
    title: "REGISTRATION ERROR",
    message: "Failed to create your profile. Please try again or contact support.",
  },
  auth_failed: {
    title: "AUTHENTICATION FAILED",
    message: "Something went wrong during sign in. Please try again.",
  },
};

function LoginPageContent() {
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();
  const errorType = searchParams.get("error");
  const errorInfo = errorType ? ERROR_MESSAGES[errorType] : null;
  const supabase = createClient();

  const handleDiscordLogin = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "identify email guilds",
      },
    });

    if (error) {
      console.error("Login error:", error.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neutral-800 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md z-10">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-500 flex items-center justify-center rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.4)]">
              <Cpu className="text-white w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tighter leading-none">
                VID-BOLT
              </h1>
              <p className="text-[10px] text-orange-500 font-mono tracking-widest uppercase">
                Operations Node
              </p>
            </div>
          </div>
        </div>

        <Card className="bg-neutral-900/80 border-neutral-800 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 bg-neutral-800 rounded-full flex items-center justify-center mb-4 border border-neutral-700">
              <ShieldCheck className="text-white w-6 h-6" />
            </div>
            <CardTitle className="text-xl font-bold text-white tracking-wider uppercase">
              Authorization Required
            </CardTitle>
            <p className="text-sm text-neutral-400 mt-1">
              Secure access to VID-BOLT Command & Control
            </p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="bg-black/50 border border-neutral-800 p-4 rounded-lg mb-6">
                <div className="flex items-center gap-3 text-xs text-neutral-500 font-mono">
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                  SYSTEM STATUS: ONLINE
                </div>
                <div className="mt-2 text-[10px] text-neutral-600 font-mono uppercase tracking-tight">
                  PROTO_V0.4 // ENCRYPTION_ACTIVE // DISCORD_AUTH
                </div>
              </div>

              {errorInfo && (
                <div className="bg-red-950/40 border border-red-500/30 p-4 rounded-lg mb-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-red-400 tracking-wider uppercase">
                      {errorInfo.title}
                    </p>
                    <p className="text-xs text-red-300/80 mt-1">
                      {errorInfo.message}
                    </p>
                  </div>
                </div>
              )}

              <Button
                onClick={handleDiscordLogin}
                disabled={isLoading}
                className="w-full h-12 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-lg transition-all flex items-center justify-center gap-3 shadow-[0_4px_15px_rgba(88,101,242,0.3)] group"
              >
                {isLoading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <svg
                      className="w-5 h-5 fill-current"
                      viewBox="0 0 256 199"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M216.856 16.597A208.502 208.502 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.4-4.55-9.933-6.846-14.046a207.809 207.809 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193A161.094 161.094 0 0 0 79.735 175.3a136.413 136.413 0 0 1-21.846-10.632 108.636 108.636 0 0 0 5.356-4.237c42.122 19.702 87.89 19.702 129.51 0a131.66 131.66 0 0 0 5.355 4.237 136.07 136.07 0 0 1-21.886 10.653c4.006 8.02 8.638 15.67 13.873 22.848 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.36ZM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18Zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18Z" />
                    </svg>
                    CONTINUE WITH DISCORD
                  </>
                )}
              </Button>

              <div className="pt-4 text-center">
                <p className="text-[10px] text-neutral-600 font-mono tracking-widest uppercase">
                  UNAUTHORIZED ACCESS IS PROHIBITED
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer info */}
        <div className="mt-8 flex justify-center gap-6 text-[10px] text-neutral-600 font-mono tracking-widest">
          <span>SECURE_SHELL</span>
          <span>S_LAYER_V3</span>
          <span>AES_256</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <LoginPageContent />
    </Suspense>
  );
}
