"use client";

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Youtube,
  Instagram,
  Facebook,
  Twitter,
  Music2,
  Share2,
  Download,
  LinkIcon, // Changed from Link to LinkIcon
  Ghost,
} from "lucide-react";
import { useProjectSettings } from "@/hooks/use-project-settings";
import { SaveStatusIndicator } from "@/components/ui/SaveStatusIndicator";

export function ExportTab({ projectId }: { projectId?: string }) {
  const { settings, loading, saveStatus, updateSettings } =
    useProjectSettings(projectId);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
          <div className="h-64 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  const { export: exportSettings } = settings;

  const socials = [
    {
      id: "youtube",
      label: "YouTube",
      icon: Youtube,
      color: "text-red-500",
      connected: true,
    },
    {
      id: "tiktok",
      label: "TikTok",
      icon: Share2,
      color: "text-white",
      connected: false,
    },
    {
      id: "instagram",
      label: "Instagram",
      icon: Instagram,
      color: "text-pink-500",
      connected: true,
    },
    {
      id: "x",
      label: "X (Twitter)",
      icon: Twitter,
      color: "text-blue-400",
      connected: false,
    },
    {
      id: "facebook",
      label: "Facebook",
      icon: Facebook,
      color: "text-blue-600",
      connected: false,
    },
    {
      id: "snapchat",
      label: "Snapchat",
      icon: Ghost,
      color: "text-yellow-400",
      connected: false,
    },
    {
      id: "spotify",
      label: "Spotify",
      icon: Music2,
      color: "text-green-500",
      connected: false,
    },
  ];

  const toggleTarget = (targetId: string) => {
    const current = exportSettings.defaultTargets || [];
    const next = current.includes(targetId)
      ? current.filter((id) => id !== targetId)
      : [...current, targetId];
    updateSettings({ export: { ...exportSettings, defaultTargets: next } });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Save Status */}
      <div className="flex justify-end">
        <SaveStatusIndicator status={saveStatus} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Social Connections */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <LinkIcon className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Social Connections
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {socials.map((social) => (
              <div
                key={social.id}
                className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-neutral-800/50 hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <social.icon className={`w-5 h-5 ${social.color}`} />
                  <span className="text-sm font-medium text-white">
                    {social.label}
                  </span>
                </div>
                {social.connected ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded">
                      Connected
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] text-neutral-500 hover:text-white"
                    >
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] border-neutral-800 bg-neutral-800/50 hover:bg-neutral-800 text-neutral-400 hover:text-white"
                  >
                    Connect Account
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Global Export Rules */}
        <div className="space-y-6">
          <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Share2 className="text-orange-500 w-5 h-5" />
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                  Default Export Targets
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-neutral-500 mb-4">
                Select which connected targets should be active for automatic
                exports.
              </p>
              {socials
                .filter((s) => s.connected)
                .map((target) => (
                  <div
                    key={`default-${target.id}`}
                    className="flex items-center space-x-3 p-2"
                  >
                    <Checkbox
                      id={`default-${target.id}`}
                      checked={(exportSettings.defaultTargets || []).includes(
                        target.id
                      )}
                      onCheckedChange={() => toggleTarget(target.id)}
                      className="border-neutral-700 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                    />
                    <label
                      htmlFor={`default-${target.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-neutral-300"
                    >
                      Sync to {target.label}
                    </label>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
