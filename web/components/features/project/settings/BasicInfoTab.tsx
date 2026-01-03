"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Wand2 } from "lucide-react";

import { useProjectSettings } from "@/hooks/use-project-settings";
import { SaveStatusIndicator } from "@/components/ui/SaveStatusIndicator";

export function BasicInfoTab({ projectId }: { projectId?: string }) {
  const { settings, loading, saveStatus, updateSettings } =
    useProjectSettings(projectId);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-48 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
          <div className="h-48 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  const { basic_info } = settings;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 w-full">
      {/* Save Status */}
      <div className="flex justify-end">
        <SaveStatusIndicator status={saveStatus} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        {/* Project Identity */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Camera className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Project Identity
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="project-name"
                className="text-xs text-neutral-400 uppercase font-bold"
              >
                Media Project Name
              </Label>
              <Input
                id="project-name"
                placeholder="Enter project name"
                className="bg-black/40 border-neutral-800 focus:border-orange-500 transition-colors text-white"
                value={basic_info.projectName}
                onChange={(e) =>
                  updateSettings({
                    basic_info: { ...basic_info, projectName: e.target.value },
                  })
                }
              />
            </div>

            <div className="space-y-4">
              <Label className="text-xs text-neutral-400 uppercase font-bold">
                Project Picture
              </Label>
              <div className="flex items-center gap-4">
                <div className="h-20 w-32 rounded-lg bg-neutral-800 flex items-center justify-center border-2 border-dashed border-neutral-700 hover:border-orange-500/50 transition-colors cursor-pointer group overflow-hidden">
                  {basic_info.pictureUrl ? (
                    <img
                      src={basic_info.pictureUrl}
                      alt="Project"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-neutral-500 text-xs group-hover:text-neutral-400">
                      Click to upload
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-neutral-700 bg-transparent hover:bg-neutral-800 text-xs"
                >
                  Change Picture
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Automation Settings */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Wand2 className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Automation & Smart Workflows
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-neutral-800/50">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium text-white">
                  Automatic Idea Verification
                </Label>
                <p className="text-xs text-neutral-500 italic">
                  Automatically validate generated ideas before scriptwriting.
                </p>
              </div>
              <Switch
                checked={basic_info.autoIdeaVerification}
                onCheckedChange={(checked) =>
                  updateSettings({
                    basic_info: {
                      ...basic_info,
                      autoIdeaVerification: checked,
                    },
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-neutral-800/50">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium text-white">
                  Automatic Script Verification
                </Label>
                <p className="text-xs text-neutral-500 italic">
                  Verify script flow and tone consistency automatically.
                </p>
              </div>
              <Switch
                checked={basic_info.autoScriptVerification}
                onCheckedChange={(checked) =>
                  updateSettings({
                    basic_info: {
                      ...basic_info,
                      autoScriptVerification: checked,
                    },
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-neutral-800/50">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium text-white">
                  Automatic Export to Media
                </Label>
                <p className="text-xs text-neutral-500 italic">
                  Trigger export immediately after rendering finishes.
                </p>
              </div>
              <Switch
                checked={basic_info.autoExportToMedia}
                onCheckedChange={(checked) =>
                  updateSettings({
                    basic_info: { ...basic_info, autoExportToMedia: checked },
                  })
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
