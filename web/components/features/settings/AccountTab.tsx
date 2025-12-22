"use client";

import React from "react";
import { User, Globe, LogOut, Trash2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AccountTab() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
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
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 uppercase font-bold">
                Name
              </label>
              <p className="text-sm font-medium text-white">Owen</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 uppercase font-bold">
                Username
              </label>
              <p className="text-sm font-medium text-white">@owen</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 uppercase font-bold">
                Email
              </label>
              <p className="text-sm font-medium text-white">owen@example.com</p>
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
              <p className="text-sm font-medium text-orange-500 font-bold">
                PRO PLAN
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 uppercase font-bold">
                Next Bill Date
              </label>
              <p className="text-sm font-medium text-white">January 21, 2026</p>
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
              <p className="text-xs text-neutral-400">English (US)</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-orange-500 hover:text-orange-400 hover:bg-orange-500/10"
            >
              Change
            </Button>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-neutral-800">
            <div>
              <p className="text-sm font-medium text-white">Active Sessions</p>
              <p className="text-xs text-neutral-400">
                Authenticated on 3 devices
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-neutral-400 hover:text-white hover:bg-neutral-800"
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
