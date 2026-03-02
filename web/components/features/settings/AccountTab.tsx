"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { User, Globe, LogOut, Trash2, CreditCard, Timer, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useUserSettings } from "@/hooks/use-user-settings";
import { useUserProfile } from "@/hooks/use-user-profile";
import { SaveStatusIndicator } from "@/components/ui/SaveStatusIndicator";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useGpuHours } from "@/hooks/use-gpu-hours";
import { toast } from "sonner";

export function AccountTab() {
  const {
    settings,
    loading: settingsLoading,
    saveStatus: settingsSaveStatus,
    updateSettings,
  } = useUserSettings();
  const {
    profile,
    loading: profileLoading,
    saveStatus: profileSaveStatus,
    updateProfile,
  } = useUserProfile();
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { balance: gpuHoursBalance, loading: gpuHoursLoading, refresh: refreshGpuHours } = useGpuHours();
  const [purchaseHours, setPurchaseHours] = useState<number>(10);
  const [isPurchasing, setIsPurchasing] = useState(false);

  // Handle checkout success/cancel from Stripe redirect
  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout");
    if (checkoutStatus === "success") {
      toast.success("Payment successful! GPU hours are being added to your account.");
      refreshGpuHours();
      // Clean up URL params
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      router.replace(url.pathname + url.search);
    } else if (checkoutStatus === "cancelled") {
      toast.info("Payment cancelled.");
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      router.replace(url.pathname + url.search);
    }
  }, [searchParams, refreshGpuHours, router]);

  const handlePurchaseGpuHours = async () => {
    if (purchaseHours < 1 || purchaseHours > 1000) {
      toast.error("Please enter between 1 and 1000 hours.");
      return;
    }

    setIsPurchasing(true);
    try {
      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: Math.round(purchaseHours) }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start purchase");
    } finally {
      setIsPurchasing(false);
    }
  };

  const [name, setName] = useState("");
  const [gpuShutdownMinutes, setGpuShutdownMinutes] = useState<number>(60);
  const [gpuSettingsSaving, setGpuSettingsSaving] = useState(false);
  const gpuSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync name from profile
  useEffect(() => {
    if (profile?.name) {
      setName(profile.name);
    }
  }, [profile?.name]);

  const handleNameChange = (value: string) => {
    setName(value);
    updateProfile({ name: value });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  // Load GPU auto-shutdown setting from user_gcp_config
  useEffect(() => {
    async function loadGpuSettings() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_gcp_config")
        .select("gpu_auto_shutdown_minutes")
        .eq("user_id", user.id)
        .single();

      if (data?.gpu_auto_shutdown_minutes) {
        setGpuShutdownMinutes(data.gpu_auto_shutdown_minutes);
      }
    }
    loadGpuSettings();
  }, [supabase]);

  // Debounced save for GPU shutdown timer
  const handleGpuShutdownChange = useCallback(
    (value: number) => {
      // Clamp value to valid range
      const clamped = Math.min(600, Math.max(10, value));
      setGpuShutdownMinutes(clamped);

      // Clear existing timeout
      if (gpuSaveTimeoutRef.current) {
        clearTimeout(gpuSaveTimeoutRef.current);
      }

      // Debounce save
      gpuSaveTimeoutRef.current = setTimeout(async () => {
        setGpuSettingsSaving(true);
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) return;

          await supabase.from("user_gcp_config").upsert(
            {
              user_id: user.id,
              gpu_auto_shutdown_minutes: clamped,
            },
            { onConflict: "user_id" },
          );
        } catch (err) {
          console.error("Failed to save GPU shutdown setting:", err);
        } finally {
          setGpuSettingsSaving(false);
        }
      }, 1000);
    },
    [supabase],
  );

  const loading = settingsLoading || profileLoading;

  // Combine save statuses - show the active one
  const combinedSaveStatus =
    profileSaveStatus !== "idle" ? profileSaveStatus : settingsSaveStatus;

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-48 bg-neutral-900/40 border border-neutral-800 rounded-xl" />
          <div className="h-48 bg-neutral-900/40 border border-neutral-800 rounded-xl" />
        </div>
        <div className="h-64 bg-neutral-900/40 border border-neutral-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Save Status */}
      <div className="flex justify-end">
        <SaveStatusIndicator status={combinedSaveStatus} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Information */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <User className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Profile Details
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-neutral-400 uppercase font-bold">
                Name
              </label>
              <Input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Enter your display name"
                className="bg-black/40 border-neutral-700 text-white focus:border-orange-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 uppercase font-bold">
                Username
              </label>
              <p className="text-sm font-medium text-neutral-500">
                @{profile?.username || "—"}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 uppercase font-bold">
                Email
              </label>
              <p className="text-sm font-medium text-neutral-500">
                {profile?.email || "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* GPU Hours */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Zap className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                GPU Hours
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 uppercase font-bold">
                Current Balance
              </label>
              <p className="text-2xl font-bold text-white">
                {gpuHoursLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-500 inline" />
                ) : (
                  <>
                    {gpuHoursBalance}
                    <span className="text-sm font-normal text-neutral-400 ml-1">
                      hour{gpuHoursBalance !== 1 ? "s" : ""}
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 uppercase font-bold">
                Current Plan
              </label>
              <p className="text-sm font-medium text-orange-500 font-bold uppercase">
                {profile?.account_tier || "STARTER"} PLAN
              </p>
            </div>

            <div className="pt-3 border-t border-neutral-800 space-y-3">
              <label className="text-xs text-neutral-400 uppercase font-bold">
                Purchase GPU Hours
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={purchaseHours}
                  onChange={(e) => setPurchaseHours(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))}
                  className="bg-black/40 border-neutral-700 text-white focus:border-orange-500 w-24 text-center font-mono"
                />
                <span className="text-xs text-neutral-400">hours</span>
                <span className="text-xs text-neutral-500 ml-auto font-mono">
                  = ${purchaseHours}
                </span>
              </div>
              <div className="flex gap-1.5">
                {[1, 5, 10, 25, 50].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setPurchaseHours(preset)}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                      purchaseHours === preset
                        ? "bg-orange-500/20 text-orange-400 border border-orange-500/50"
                        : "bg-neutral-800/50 text-neutral-400 border border-neutral-700/50 hover:bg-neutral-700/50 hover:text-white"
                    }`}
                  >
                    {preset}h
                  </button>
                ))}
              </div>
              <Button
                onClick={handlePurchaseGpuHours}
                disabled={isPurchasing || purchaseHours < 1}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs h-9"
              >
                {isPurchasing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>Purchase {purchaseHours} Hour{purchaseHours !== 1 ? "s" : ""} — ${purchaseHours}</>
                )}
              </Button>
              <p className="text-[10px] text-neutral-600 text-center">
                $1.00 per GPU hour • Secure payment via Stripe
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preferences & Security */}
      <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Globe className="text-orange-500 w-5 h-5" />
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
              Preferences & Security
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between py-2 border-b border-neutral-800">
            <div>
              <p className="text-sm font-medium text-white">
                Application Language
              </p>
              <p className="text-xs text-neutral-400">
                {settings.language === "en"
                  ? "English (US)"
                  : settings.language}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-orange-500 hover:text-orange-400 hover:bg-orange-500/10"
              onClick={() =>
                updateSettings({
                  language: settings.language === "en" ? "es" : "en",
                })
              }
            >
              Change
            </Button>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-neutral-800">
            <div>
              <p className="text-sm font-medium text-white flex items-center gap-2">
                <Timer className="w-4 h-4 text-orange-500" />
                GPU Auto-Shutdown Timer
              </p>
              <p className="text-xs text-neutral-400">
                Automatically stop your GPU VM after inactivity (10-600 min)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={10}
                max={600}
                value={gpuShutdownMinutes}
                onChange={(e) =>
                  handleGpuShutdownChange(parseInt(e.target.value) || 60)
                }
                className="w-20 bg-black/40 border-neutral-700 text-white focus:border-orange-500 text-sm"
              />
              <span className="text-xs text-neutral-400">min</span>
              {gpuSettingsSaving && (
                <span className="text-xs text-orange-500 animate-pulse">
                  Saving...
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-neutral-800">
            <div>
              <p className="text-sm font-medium text-white">Active Sessions</p>
              <p className="text-xs text-neutral-400">
                Authenticated session active
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-neutral-400 hover:text-white hover:bg-neutral-800"
              onClick={handleSignOut}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out All
            </Button>
          </div>

          <div className="flex items-center justify-between py-2 text-red-500">
            <div>
              <p className="text-sm font-medium">Danger Zone</p>
              <p className="text-xs text-red-500/60 font-medium">
                Permanently delete your account and all data
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
