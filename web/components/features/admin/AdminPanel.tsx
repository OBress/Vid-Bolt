"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Shield, Lock, LayoutDashboard, Users, Wrench } from "lucide-react";
import { AnalyticsTab } from "./tabs/AnalyticsTab";
import { UsersTab } from "./tabs/UsersTab";
import { DevToolsTab } from "./tabs/DevToolsTab";

export function AdminPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20 hover:text-red-400"
        >
          <Shield className="w-4 h-4 mr-2" />
          ADMIN
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] h-[90vh] bg-neutral-950 border-neutral-800 flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-neutral-800 flex flex-row items-center gap-2 space-y-0 text-left">
          <Lock className="w-5 h-5 text-red-500" />
          <DialogTitle className="font-bold text-white text-base">
            Admin Control Panel
          </DialogTitle>
        </DialogHeader>

        <Tabs
          defaultValue="overview"
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="px-6 py-2 border-b border-neutral-800 bg-neutral-900/30">
            <TabsList className="bg-transparent p-0 gap-4 h-auto">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:bg-transparent data-[state=active]:text-red-500 data-[state=active]:border-b-2 data-[state=active]:border-red-500 rounded-none px-4 py-2 border-transparent border-b-2 text-neutral-400 hover:text-neutral-200 transition-all"
              >
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="users"
                className="data-[state=active]:bg-transparent data-[state=active]:text-red-500 data-[state=active]:border-b-2 data-[state=active]:border-red-500 rounded-none px-4 py-2 border-transparent border-b-2 text-neutral-400 hover:text-neutral-200 transition-all"
              >
                <Users className="w-4 h-4 mr-2" />
                User Management
              </TabsTrigger>
              <TabsTrigger
                value="devtools"
                className="data-[state=active]:bg-transparent data-[state=active]:text-red-500 data-[state=active]:border-b-2 data-[state=active]:border-red-500 rounded-none px-4 py-2 border-transparent border-b-2 text-neutral-400 hover:text-neutral-200 transition-all"
              >
                <Wrench className="w-4 h-4 mr-2" />
                Dev Tools
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-neutral-950/50">
            <TabsContent value="overview" className="m-0 h-full">
              <AnalyticsTab />
            </TabsContent>
            <TabsContent value="users" className="m-0 h-full">
              <UsersTab />
            </TabsContent>
            <TabsContent value="devtools" className="m-0 h-full">
              <DevToolsTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
