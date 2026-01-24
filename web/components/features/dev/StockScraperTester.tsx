"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, X } from "lucide-react";
import { useState, useEffect } from "react";

interface StockScraperTesterProps {
  isOpen: boolean;
  onClose: () => void;
  inline?: boolean;
}

export function StockScraperTester({
  isOpen,
  onClose,
  inline = false,
}: StockScraperTesterProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen) return null;

  const content = (
    <div className="flex flex-col h-full bg-black text-white p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Download className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Stock Scraper</h2>
            <p className="text-neutral-400 text-sm">
              Search and download stock assets
            </p>
          </div>
        </div>
        {!inline && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      <div className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900/50 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <div className="h-16 w-16 rounded-full bg-neutral-800 flex items-center justify-center mx-auto">
            <Download className="w-8 h-8 text-neutral-600" />
          </div>
          <h3 className="text-lg font-medium text-white">
            Tool Under Construction
          </h3>
          <p className="text-neutral-400">
            The Stock Scraper tool is currently being developed. Check back soon
            for updates.
          </p>
          <Button
            variant="outline"
            className="border-neutral-700 hover:bg-neutral-800"
          >
            View Documentation
          </Button>
        </div>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="h-full border border-neutral-800 rounded-lg overflow-hidden">
        {content}
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl h-[80vh] p-0 bg-black border-neutral-800 overflow-hidden">
        {content}
      </DialogContent>
    </Dialog>
  );
}
