"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Download,
  X,
  Globe,
  Youtube,
  ArrowLeft,
  Search,
  Database,
} from "lucide-react";
import { useState, useEffect } from "react";

interface StockScraperTesterProps {
  isOpen: boolean;
  onClose: () => void;
  inline?: boolean;
}

type TabType = "wikimedia" | "youtube";

export function StockScraperTester({
  isOpen,
  onClose,
  inline = false,
}: StockScraperTesterProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("wikimedia");

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      // Dynamic import to avoid SSR issues if any, though standard import works too.
      // For now, let's just fetch from the API directly or import the service.
      // Since `StockMediaService` calls an API route, we can import it.
      const { StockMediaService } = await import("@/lib/stock-media/service");
      const service = new StockMediaService();
      const results = await service.search(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error("Search failed:", error);
      // In a real app, show error toast
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen) return null;

  const innerContent = (
    <div
      className={
        inline
          ? "relative flex flex-col h-full bg-neutral-950 overflow-hidden"
          : "fixed top-0 left-0 w-full h-full z-[9999] bg-neutral-950 flex flex-col pointer-events-auto overflow-hidden"
      }
    >
      {!inline && (
        <div className="sr-only">
          <h2>Stock Scraper Tester</h2>
          <p>Search and download stock assets</p>
        </div>
      )}

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          {inline && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-neutral-400 hover:text-white -ml-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <Download className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Stock Scraper</h1>
            <p className="text-sm text-neutral-400">
              Search and download stock assets
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const res = await fetch("/api/dev/seed-mock-vector", {
                  method: "POST",
                });
                const data = await res.json();
                if (data.success) {
                  alert("Mock data seeded! Try searching for 'dog' or 'park'.");
                } else {
                  alert(`Seeding failed: ${data.error}`);
                }
              } catch (e) {
                alert("Seeding request failed completely.");
              }
            }}
            className="text-neutral-400 hover:text-white border-neutral-800"
          >
            <Database className="w-4 h-4 mr-2" />
            Seed Mock Data
          </Button>
          {!inline && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-neutral-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex gap-2 px-6 py-3 border-b border-neutral-800 overflow-x-auto">
        <Button
          variant={activeTab === "wikimedia" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("wikimedia")}
          className={
            activeTab === "wikimedia" ? "bg-teal-600 hover:bg-teal-700" : ""
          }
        >
          <Globe className="w-4 h-4 mr-2" />
          Wikimedia
        </Button>
        <Button
          variant={activeTab === "youtube" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("youtube")}
          className={
            activeTab === "youtube" ? "bg-red-600 hover:bg-red-700" : ""
          }
        >
          <Youtube className="w-4 h-4 mr-2" />
          YouTube
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto touch-auto relative z-0 pointer-events-auto transition-all">
          <div className="max-w-2xl mx-auto p-6 relative z-10">
            {/* Wikimedia Tab */}
            {activeTab === "wikimedia" && (
              <div className="space-y-6">
                <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 flex flex-col items-center justify-center space-y-4">
                  <div className="h-16 w-16 rounded-full bg-neutral-800 flex items-center justify-center">
                    <Globe className="w-8 h-8 text-neutral-600" />
                  </div>
                  <h3 className="text-lg font-medium text-white">
                    Wikimedia Commons Search
                  </h3>
                  <p className="text-neutral-400 text-center max-w-sm">
                    Search for free-to-use images and media from Wikimedia
                    Commons.
                  </p>

                  <div className="w-full max-w-md flex gap-2 pt-4">
                    <Input
                      placeholder="Search query..."
                      className="bg-neutral-900 border-neutral-700 text-neutral-200"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                    <Button
                      className="bg-teal-600 hover:bg-teal-700"
                      onClick={handleSearch}
                      disabled={isSearching}
                    >
                      {isSearching ? (
                        <Search className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Results Grid */}
                {searchResults.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="group relative aspect-video bg-neutral-800 rounded-lg overflow-hidden border border-neutral-700"
                      >
                        {/* Placeholder for media preview - in real app would use R2 URL */}
                        <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
                          {result.metadata.thumbnailUrl ? (
                            <img
                              src={result.metadata.thumbnailUrl}
                              alt={result.metadata.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center">
                              <Download className="w-8 h-8 mb-2 opacity-50" />
                              <span className="text-xs">No Preview</span>
                            </div>
                          )}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                          <p className="text-sm font-medium text-white truncate">
                            {result.metadata.title || "Untitled"}
                          </p>
                          <p className="text-xs text-neutral-400 truncate">
                            {Math.round((result.similarity || 0) * 100)}% match
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* YouTube Tab */}
            {activeTab === "youtube" && (
              <div className="space-y-6">
                <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 flex flex-col items-center justify-center space-y-4">
                  <div className="h-16 w-16 rounded-full bg-neutral-800/80 flex items-center justify-center">
                    <Youtube className="w-8 h-8 text-neutral-600" />
                  </div>
                  <h3 className="text-lg font-medium text-white">
                    YouTube Video Search
                  </h3>
                  <p className="text-neutral-400 text-center max-w-sm">
                    Search for creative commons videos on YouTube.
                  </p>

                  <div className="w-full max-w-md flex gap-2 pt-4">
                    <Input
                      placeholder="Search query..."
                      className="bg-neutral-900 border-neutral-700 text-neutral-200"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                    <Button
                      className="bg-red-600 hover:bg-red-700"
                      onClick={handleSearch}
                      disabled={isSearching}
                    >
                      {isSearching ? (
                        <Search className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Results Grid - Share state for now */}
                {searchResults.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="group relative aspect-video bg-neutral-800 rounded-lg overflow-hidden border border-neutral-700"
                      >
                        <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
                          {result.metadata.thumbnailUrl ? (
                            <img
                              src={result.metadata.thumbnailUrl}
                              alt={result.metadata.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center">
                              <Youtube className="w-8 h-8 mb-2 opacity-50" />
                              <span className="text-xs">No Preview</span>
                            </div>
                          )}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                          <p className="text-sm font-medium text-white truncate">
                            {result.metadata.title || "Untitled"}
                          </p>
                          <p className="text-xs text-neutral-400 truncate">
                            {Math.round((result.similarity || 0) * 100)}% match
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="h-full w-full border border-neutral-800 rounded-lg overflow-hidden">
        {innerContent}
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl h-[80vh] p-0 bg-neutral-950 border-neutral-800 overflow-hidden text-neutral-200">
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
