"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Layers, Wand2 } from "lucide-react";

export function BasicInfoTab() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                defaultValue="My Media Project"
              />
            </div>

            <div className="space-y-4">
              <Label className="text-xs text-neutral-400 uppercase font-bold">
                Project Picture
              </Label>
              <div className="flex items-center gap-4">
                <div className="h-20 w-32 rounded-lg bg-neutral-800 flex items-center justify-center border-2 border-dashed border-neutral-700 hover:border-orange-500/50 transition-colors cursor-pointer group overflow-hidden">
                  <span className="text-neutral-500 text-xs group-hover:text-neutral-400">
                    Click to upload
                  </span>
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

        {/* Content Configuration */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Layers className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Configuration
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold">
                Content Niche
              </Label>
              <Select defaultValue="entertainment">
                <SelectTrigger className="bg-black/40 border-neutral-800">
                  <SelectValue placeholder="Select niche" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-800">
                  <SelectItem value="entertainment">Entertainment</SelectItem>
                  <SelectItem value="educational">Educational</SelectItem>
                  <SelectItem value="technology">Technology</SelectItem>
                  <SelectItem value="lifestyle">Lifestyle</SelectItem>
                  <SelectItem value="gaming">Gaming</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold">
                Aspect Ratio
              </Label>
              <Select defaultValue="9-16">
                <SelectTrigger className="bg-black/40 border-neutral-800">
                  <SelectValue placeholder="Select ratio" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-800">
                  <SelectItem value="9-16">9:16 (TikTok/Shorts)</SelectItem>
                  <SelectItem value="16-9">16:9 (YouTube)</SelectItem>
                  <SelectItem value="1-1">1:1 (Instagram)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

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
            <Switch defaultChecked />
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
            <Switch defaultChecked />
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
            <Switch />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
