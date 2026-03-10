"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Youtube,
  Instagram,
  Facebook,
  Twitter,
  Music2,
  Share2,
  Ghost,
  LinkIcon,
  Loader2,
  Trash2,
  ChevronDown,
  Check,
} from "lucide-react";
import { useProjectSettings } from "@/hooks/use-project-settings";
import { SaveStatusIndicator } from "@/components/ui/SaveStatusIndicator";
import { usePathname } from "next/navigation";

// ============================================================================
// Types
// ============================================================================

interface SocialConnection {
  id: string;
  provider: string;
  provider_email: string | null;
  provider_name: string | null;
  provider_avatar: string | null;
  is_primary: boolean;
  connected_at: string;
}

interface YouTubeChannel {
  id: string;
  channel_id: string;
  channel_title: string;
  channel_handle: string | null;
  thumbnail_url: string | null;
  subscriber_count: number;
  connection_id: string | null;
}

// ============================================================================
// Other social providers (future)
// ============================================================================

const OTHER_SOCIALS = [
  { id: "tiktok", label: "TikTok", icon: Share2, color: "text-white" },
  { id: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-500" },
  { id: "x", label: "X (Twitter)", icon: Twitter, color: "text-blue-400" },
  { id: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-600" },
  { id: "snapchat", label: "Snapchat", icon: Ghost, color: "text-yellow-400" },
  { id: "spotify", label: "Spotify", icon: Music2, color: "text-green-500" },
];

// ============================================================================
// Component
// ============================================================================

export function ConnectionsTab({ projectId }: { projectId?: string }) {
  const { settings, loading: settingsLoading, saveStatus, updateSettings } =
    useProjectSettings(projectId);
  const pathname = usePathname();

  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);

  const selectedChannelId = settings?.connections?.youtubeChannelId || null;

  // Fetch all user connections
  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/connections");
      const data = await res.json();
      setConnections(data.connections || []);
    } catch (err) {
      console.error("Failed to fetch connections:", err);
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Fetch channels only from explicitly connected Google accounts (not migrated GCP connections)
  useEffect(() => {
    const explicitConnections = connections.filter(
      (c) => c.provider === "google" && c.provider_email
    );
    if (explicitConnections.length === 0) return;

    setLoadingChannels(true);
    Promise.all(
      explicitConnections.map((conn) =>
        fetch(`/api/connections/${conn.id}/channels`)
          .then((r) => r.json())
          .then((d) => d.channels || [])
          .catch(() => [])
      )
    ).then((results) => {
      const all = results.flat();
      const unique = Array.from(new Map(all.map((c: YouTubeChannel) => [c.id, c])).values());
      setChannels(unique);
      setLoadingChannels(false);
    });
  }, [connections]);

  const connectGoogle = () => {
    const returnTo = pathname || "/command-center";
    window.location.href = `/api/youtube/oauth/authorize?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const disconnectCurrentAccount = async () => {
    // Find the connection that owns the selected channel, or fallback to first Google connection
    const selectedCh = channels.find((c) => c.id === selectedChannelId);
    const connectionId = selectedCh?.connection_id ||
      connections.find((c) => c.provider === "google")?.id;

    if (!connectionId) return;

    setDisconnecting(true);
    try {
      await fetch(`/api/connections?connectionId=${connectionId}`, { method: "DELETE" });
      setConnections((prev) => prev.filter((c) => c.id !== connectionId));
      setChannels((prev) => prev.filter((c) => c.connection_id !== connectionId));
      // Clear the project's channel selection
      selectChannel(null);
    } catch (err) {
      console.error("Failed to disconnect:", err);
    } finally {
      setDisconnecting(false);
    }
  };

  const selectChannel = (channelId: string | null) => {
    updateSettings({
      connections: {
        ...settings?.connections,
        youtubeChannelId: channelId,
      },
    });
    setChannelDropdownOpen(false);
  };

  // Only show Google connections that were explicitly created through this flow
  // (auto-migrated GCP connections have no provider_email since the old OAuth didn't request userinfo)
  const googleConnections = connections.filter(
    (c) => c.provider === "google" && c.provider_email
  );
  const hasGoogleConnection = googleConnections.length > 0;
  const selectedChannel = channels.find((c) => c.id === selectedChannelId);

  // Find the Google connection associated with the selected channel (for display)
  const activeConnection = selectedChannel?.connection_id
    ? googleConnections.find((c) => c.id === selectedChannel.connection_id)
    : googleConnections[0] || null;

  if (settingsLoading || loadingConnections) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
          <div className="h-64 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 w-full">
      {/* Save Status */}
      <div className="flex justify-end">
        <SaveStatusIndicator status={saveStatus} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        {/* YouTube Connection — Single per project */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Youtube className="text-red-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                YouTube Channel
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasGoogleConnection ? (
              /* No Google account connected */
              <div className="text-center py-6">
                <Youtube className="w-8 h-8 mx-auto mb-2 text-neutral-600" />
                <p className="text-sm text-neutral-500 mb-3">
                  Connect a Google account to link a YouTube channel to this project.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={connectGoogle}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  Connect Google Account
                </Button>
              </div>
            ) : (
              <>
                {/* Connected account info */}
                {activeConnection && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-neutral-800/50">
                    <div className="flex items-center gap-3 min-w-0">
                      {activeConnection.provider_avatar ? (
                        <img
                          src={activeConnection.provider_avatar}
                          alt=""
                          className="w-8 h-8 rounded-full"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            // Hide broken image and show fallback
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div className={`w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center ${activeConnection.provider_avatar ? 'hidden' : ''}`}>
                        <Youtube className="w-4 h-4 text-red-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {activeConnection.provider_name || activeConnection.provider_email || "Google Account"}
                        </p>
                        {activeConnection.provider_email && (
                          <p className="text-[10px] text-neutral-500 truncate">
                            {activeConnection.provider_email}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] uppercase font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded">
                        Connected
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={disconnectCurrentAccount}
                        disabled={disconnecting}
                        className="h-7 px-2 text-neutral-500 hover:text-red-400"
                        title="Disconnect"
                      >
                        {disconnecting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Channel selector */}
                {loadingChannels ? (
                  <div className="flex items-center gap-2 text-sm text-neutral-500 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Discovering channels...
                  </div>
                ) : channels.length > 0 ? (
                  <div>
                    <p className="text-xs text-neutral-500 mb-2">
                      Select the channel for this project:
                    </p>
                    <div className="relative">
                      <button
                        onClick={() => setChannelDropdownOpen(!channelDropdownOpen)}
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-black/20 border border-neutral-800/50 hover:border-neutral-700 transition-colors text-left"
                      >
                        {selectedChannel ? (
                          <div className="flex items-center gap-3">
                            {selectedChannel.thumbnail_url && (
                              <img
                                src={selectedChannel.thumbnail_url}
                                alt=""
                                className="w-6 h-6 rounded-full"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <div>
                              <p className="text-sm font-medium text-white">
                                {selectedChannel.channel_title}
                              </p>
                              {selectedChannel.channel_handle && (
                                <p className="text-[10px] text-neutral-500">
                                  @{selectedChannel.channel_handle}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-neutral-500">Select a channel...</span>
                        )}
                        <ChevronDown className="w-4 h-4 text-neutral-500" />
                      </button>

                      {channelDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 shadow-xl max-h-48 overflow-y-auto">
                          {channels.map((ch) => (
                            <button
                              key={ch.id}
                              onClick={() => selectChannel(ch.id)}
                              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-neutral-800 transition-colors text-left"
                            >
                              <div className="flex items-center gap-3">
                                {ch.thumbnail_url && (
                                  <img
                                    src={ch.thumbnail_url}
                                    alt=""
                                    className="w-5 h-5 rounded-full"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                                <div>
                                  <p className="text-sm text-white">{ch.channel_title}</p>
                                  {ch.channel_handle && (
                                    <p className="text-[10px] text-neutral-500">
                                      @{ch.channel_handle}
                                    </p>
                                  )}
                                </div>
                              </div>
                              {selectedChannelId === ch.id && (
                                <Check className="w-4 h-4 text-green-500" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500">
                    No YouTube channels found on this Google account.
                  </p>
                )}

                {/* Switch account link */}
                <button
                  onClick={connectGoogle}
                  className="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors underline underline-offset-2"
                >
                  Connect a different Google account
                </button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Other Social Platforms (coming soon) */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <LinkIcon className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Other Platforms
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {OTHER_SOCIALS.map((social) => (
              <div
                key={social.id}
                className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-neutral-800/50"
              >
                <div className="flex items-center gap-3">
                  <social.icon className={`w-5 h-5 ${social.color}`} />
                  <span className="text-sm font-medium text-white">
                    {social.label}
                  </span>
                </div>
                <span className="text-[10px] uppercase font-bold text-neutral-600 bg-neutral-800 px-2 py-0.5 rounded">
                  Coming Soon
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
