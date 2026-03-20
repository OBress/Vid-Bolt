"use client";

import React from "react";
import { useGCPVM } from "@/hooks/use-gcp-vm";
import { Loader2, Play, Square, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function VMStatus() {
  const { displayStatus, statusColor, statusDetail, status, startVM, stopVM, isLoading, ip } =
    useGCPVM();
  const router = useRouter();

  // Handle Action Click
  const _handleAction = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // SETUP Redirect
    if (displayStatus === "SETUP") {
      router.push("/command-center/settings/general?tab=api-keys");
      return;
    }

    // Toggle Logic
    if (displayStatus === "OFF") {
      await startVM();
    } else if (displayStatus === "ON") {
      await stopVM();
    }
  };

  // If SETUP, button acts as a link, no popover needed (or maybe popover says "Configure")
  // User req: "when clicing on it tell the user to configure in the API Keys page (be able to click onthe text to redierct them to it)."
  // So maybe a popover with a button to redirect is safer than direct redirect on main button click?
  // Let's implement popover for all, but for SETUP the main action is redirect.

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex flex-row items-center gap-3 p-2 rounded-lg hover:bg-neutral-800/50 transition-colors group">
          <span className="text-[12px] font-mono text-neutral-500 uppercase tracking-widest group-hover:text-neutral-400">
            VM
          </span>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-md group-hover:border-neutral-700 transition-colors min-w-[120px]">
            <div className={`w-2 h-2 rounded-full ${statusColor}`} />
            <span className="text-xs font-mono font-bold text-neutral-200 tracking-wider">
              {displayStatus}
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 bg-neutral-900 border-neutral-800 p-3"
        align="end"
      >
        <div className="space-y-3">
          <div className="text-xs font-mono text-neutral-400 uppercase tracking-wider mb-2">
            VM Controls
          </div>

          {displayStatus === "SETUP" ? (
            <div className="space-y-2">
              <p className="text-[10px] text-neutral-500">
                VM not configured. Please set up your Google Cloud instance.
              </p>
              <Button
                onClick={() =>
                  router.push("/command-center/settings/general?tab=api-keys")
                }
                size="sm"
                className="w-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-neutral-600 font-mono"
              >
                CONFIGURE
              </Button>
            </div>
          ) : status === "PROVISIONING" || status === "STAGING" || displayStatus === "STARTING" || displayStatus === "BUILDING" || displayStatus === "LOADING" ? (
            <div className="space-y-2">
              <Button
                disabled
                size="sm"
                className="w-full bg-neutral-800 text-neutral-400 border border-neutral-700"
              >
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                <span className="text-xs">
                  {displayStatus === "BUILDING" ? "Building..." : displayStatus === "LOADING" ? "Loading..." : "Starting..."}
                </span>
              </Button>
              {statusDetail && (
                <p className="text-[10px] text-neutral-500 text-center">
                  {statusDetail}
                </p>
              )}
            </div>
          ) : status === "STOPPING" ? (
            <Button
              disabled
              size="sm"
              className="w-full bg-neutral-800 text-neutral-400 border border-neutral-700"
            >
              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              <span className="text-xs">Stopping...</span>
            </Button>
          ) : displayStatus === "OFF" ? (
            <Button
              onClick={startVM}
              disabled={isLoading}
              size="sm"
              className="w-full bg-green-900/20 text-green-400 hover:bg-green-900/40 hover:text-green-300 border border-green-900/50 font-mono"
            >
              {isLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <div className="flex items-center">
                  <Play className="w-3 h-3 mr-2" />
                  <span className="text-xs font-bold">START</span>
                </div>
              )}
            </Button>
          ) : (
            <Button
              onClick={stopVM}
              disabled={isLoading}
              size="sm"
              className="w-full bg-red-900/20 text-red-400 hover:bg-red-900/40 hover:text-red-300 border border-red-900/50 font-mono"
            >
              {isLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <div className="flex items-center">
                  <Square className="w-3 h-3 mr-2 fill-current" />
                  <span className="text-xs font-bold">STOP</span>
                </div>
              )}
            </Button>
          )}

          {ip && (
            <div className="pt-2 border-t border-neutral-800">
              <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
                <span>EXTERNAL IP</span>
              </div>
              <a
                href={`http://${ip}:8000`}
                target="_blank"
                className="flex items-center gap-1 text-xs font-mono text-orange-500 hover:text-orange-400 mt-1"
              >
                {ip} <ExternalLink size={10} />
              </a>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
