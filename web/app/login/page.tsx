"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Cpu } from "lucide-react";
import { useState } from "react";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
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
                  PROTO_V0.4 // ENCRYPTION_ACTIVE // OAUTH_MANDATORY
                </div>
              </div>

              <Button
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-3 shadow-[0_4px_15px_rgba(249,115,22,0.3)] group"
              >
                {isLoading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <svg
                      className="w-5 h-5 fill-current"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" />
                    </svg>
                    CONTINUE WITH GOOGLE
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
