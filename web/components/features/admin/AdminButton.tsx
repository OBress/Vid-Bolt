"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, Lock } from "lucide-react";

export function AdminButton() {
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
          ADMIN PANEL
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-neutral-950 border-neutral-800">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-red-500" />
            Admin Control Panel
          </DialogTitle>
        </DialogHeader>

        <div className="py-6 text-center space-y-4">
          <div className="p-4 bg-red-950/20 border border-red-900/50 rounded-lg">
            <p className="text-red-200">
              <span className="font-bold">Restricted Access Area</span>
              <br />
              This panel is only visible to users with the 'admin' role.
            </p>
          </div>
          <p className="text-neutral-400 text-sm">
            Administrative functions will be implemented here.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
