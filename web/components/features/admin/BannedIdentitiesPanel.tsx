"use client";

/**
 * Banned Identities Panel
 * ============================================================================
 * Shows a list of banned email/Discord identities with unban capability.
 * Displayed within the Users tab when filtered by "Banned" status.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  ShieldBan,
  ShieldOff,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import {
  getBannedIdentities,
  unbanIdentity,
  type BannedIdentity,
} from "@/actions/admin-user-actions";
import { cn } from "@/lib/utils";

export function BannedIdentitiesPanel() {
  const [identities, setIdentities] = useState<BannedIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const perPage = 10;

  const fetchIdentities = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBannedIdentities(page, perPage);
      setIdentities(data);
      setTotalCount(data.length > 0 ? data[0].total_count : 0);
    } catch (err: any) {
      console.error("Failed to fetch banned identities:", err);
      toast.error(`Failed to fetch banned identities: ${err.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchIdentities();
  }, [fetchIdentities]);

  const handleUnban = async (bannedId: string) => {
    try {
      await unbanIdentity(bannedId);
      toast.success("Identity unbanned", {
        description: "The user can now re-register.",
      });
      fetchIdentities();
    } catch (err: any) {
      toast.error(`Failed to unban: ${err.message || "Unknown error"}`);
    }
  };

  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <div className="bg-neutral-900/30 border border-white/5 rounded-xl shadow-lg backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/5 bg-neutral-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldBan className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-semibold text-neutral-200">
            Banned Identities
          </h3>
          <Badge
            variant="secondary"
            className="bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] px-1.5"
          >
            {totalCount}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchIdentities}
          className="h-8 w-8 shrink-0 bg-black/40 border-white/10 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-black/20">
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-neutral-400 font-medium h-10 text-xs">
                Email
              </TableHead>
              <TableHead className="text-neutral-400 font-medium h-10 text-xs">
                Discord ID
              </TableHead>
              <TableHead className="text-neutral-400 font-medium h-10 text-xs">
                Reason
              </TableHead>
              <TableHead className="text-neutral-400 font-medium h-10 text-xs">
                Banned By
              </TableHead>
              <TableHead className="text-neutral-400 font-medium h-10 text-xs">
                Date
              </TableHead>
              <TableHead className="text-right text-neutral-400 font-medium h-10 text-xs">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && identities.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-neutral-500"
                >
                  <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2 text-neutral-600" />
                  Loading banned identities...
                </TableCell>
              </TableRow>
            ) : identities.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-neutral-500"
                >
                  <ShieldOff className="h-5 w-5 mx-auto mb-2 text-neutral-600" />
                  No banned identities.
                </TableCell>
              </TableRow>
            ) : (
              identities.map((identity) => (
                <TableRow
                  key={identity.id}
                  className="border-white/5 hover:bg-neutral-800/40 transition-colors"
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="text-sm text-neutral-300 font-mono truncate max-w-[200px]">
                        {identity.email || "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-neutral-400 font-mono">
                      {identity.discord_id || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-neutral-400 truncate max-w-[150px] block">
                      {identity.reason || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-neutral-400">
                      {identity.banned_by_name || "Unknown"}
                    </span>
                  </TableCell>
                  <TableCell className="text-neutral-400 text-sm font-mono">
                    {new Date(identity.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnban(identity.id)}
                      className="h-7 px-3 text-xs bg-transparent border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors"
                    >
                      <ShieldOff className="w-3.5 h-3.5 mr-1.5" />
                      Unban
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalCount > perPage && (
        <div className="flex items-center justify-between p-3 border-t border-white/5 bg-black/20">
          <div className="text-xs text-neutral-500 font-medium">
            Showing <span className="text-neutral-300">{identities.length}</span>{" "}
            of <span className="text-neutral-300">{totalCount}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="h-7 border-transparent bg-neutral-800/50 hover:bg-neutral-700 text-neutral-300 text-xs px-2"
            >
              Previous
            </Button>
            <span className="text-xs text-neutral-400 font-medium px-1">
              Page {page} of {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="h-7 border-transparent bg-neutral-800/50 hover:bg-neutral-700 text-neutral-300 text-xs px-2"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
