"use client";

import React, { useState, useEffect } from "react";
import { User, Globe, LogOut, Trash2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useUserSettings } from "@/hooks/use-user-settings";
import { useUserProfile } from "@/hooks/use-user-profile";
import { SaveStatusIndicator } from "@/components/ui/SaveStatusIndicator";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

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

  const [name, setName] = useState("");

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

        {/* Plan Information */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CreditCard className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Subscription
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 uppercase font-bold">
                Current Plan
              </label>
              <p className="text-sm font-medium text-orange-500 font-bold uppercase">
                {profile?.account_tier || "STARTER"} PLAN
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 uppercase font-bold">
                Credits
              </label>
              <p className="text-sm font-medium text-white">
                {profile?.credits || 0}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 uppercase font-bold">
                Next Bill Date
              </label>
              <p className="text-sm font-medium text-white">N/A</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2 border-neutral-700 bg-transparent hover:bg-neutral-800 text-neutral-300 hover:text-white"
            >
              Manage Subscription
            </Button>
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
