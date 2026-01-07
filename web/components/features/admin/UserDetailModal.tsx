"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { createClient } from "@/lib/supabase/client";
import { Loader2, ExternalLink, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { resetPaymentMonth } from "@/actions/admin-payment-actions";

interface User {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  status: string;
  date_joined: string;
  is_admin: boolean;
}

interface MonthlyStatement {
  id: string;
  month_date: string;
  total_revenue: number;
  status: "draft" | "pending_verification" | "paid";
  payment_proof_url: string | null;
  costs: any[];
}

interface UserDetailModalProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function UserDetailModal({
  user,
  open,
  onOpenChange,
  onUpdate,
}: UserDetailModalProps) {
  const [history, setHistory] = useState<MonthlyStatement[]>([]);
  const [loading, setLoading] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (open && user) {
      fetchPaymentHistory(user.id);
    }
  }, [open, user]);

  const fetchPaymentHistory = async (userId: string) => {
    setLoading(true);
    try {
      // We use the client-side RPC created in the migration
      // Note: Since we are admin, we should be able to call this securely
      const { data, error } = await supabase.rpc("get_user_payment_history", {
        target_user_id: userId,
      });

      if (error) throw error;
      setHistory(data as MonthlyStatement[]);
    } catch (err) {
      console.error("Failed to fetch history:", err);
      toast.error("Could not load payment history");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPayment = async (statement: MonthlyStatement) => {
    if (!user) return;
    if (
      !confirm(
        `Are you sure you want to RESET payment for ${statement.month_date}? This will delete the proof image and set status to Draft.`
      )
    ) {
      return;
    }

    setResettingId(statement.id);
    try {
      await resetPaymentMonth(
        user.id,
        statement.month_date,
        statement.payment_proof_url
      );
      toast.success(`Payment for ${statement.month_date} reset successfully`);
      await fetchPaymentHistory(user.id); // Refresh local list
      onUpdate(); // Refresh parent user list if needed
    } catch (err: any) {
      console.error("Reset failed:", err);
      toast.error(`Reset failed: ${err.message}`);
    } finally {
      setResettingId(null);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-950 border-neutral-800 text-white max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            User Details
            {user.is_admin && (
              <Badge
                variant="outline"
                className="border-red-500 text-red-500 text-[10px]"
              >
                ADMIN
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4 border-b border-neutral-800">
          <div>
            <p className="text-sm text-neutral-500">Name</p>
            <p className="font-medium text-neutral-200">{user.name || "N/A"}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">Username</p>
            <p className="font-medium text-neutral-200">
              {user.username ? `@${user.username}` : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">Email</p>
            <p className="font-medium text-neutral-200">{user.email}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">Status</p>
            <Badge
              variant="secondary"
              className={
                user.status === "active"
                  ? "bg-green-500/10 text-green-500"
                  : "bg-neutral-800 text-neutral-400"
              }
            >
              {user.status.toUpperCase()}
            </Badge>
          </div>
        </div>

        <div className="space-y-4 pt-4">
          <h3 className="font-bold text-lg text-neutral-200">
            Payment History
          </h3>

          <div className="border border-neutral-800 rounded-md overflow-hidden">
            <Table>
              <TableHeader className="bg-neutral-900/50">
                <TableRow className="border-neutral-800 hover:bg-neutral-900/50">
                  <TableHead className="text-neutral-400">Month</TableHead>
                  <TableHead className="text-neutral-400">Status</TableHead>
                  <TableHead className="text-neutral-400 text-right">
                    Revenue
                  </TableHead>
                  <TableHead className="text-neutral-400 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-24 text-center text-neutral-500"
                    >
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading history...
                    </TableCell>
                  </TableRow>
                ) : history.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-24 text-center text-neutral-500"
                    >
                      No payment history found.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((stmt) => (
                    <TableRow
                      key={stmt.id}
                      className="border-neutral-800 hover:bg-neutral-900/30"
                    >
                      <TableCell className="font-medium text-neutral-300">
                        {stmt.month_date}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            stmt.status === "paid"
                              ? "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                              : stmt.status === "pending_verification"
                              ? "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
                              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                          }
                        >
                          {stmt.status === "pending_verification"
                            ? "PENDING"
                            : stmt.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-neutral-300 font-mono">
                        ${stmt.total_revenue.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {stmt.payment_proof_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                              onClick={() =>
                                window.open(stmt.payment_proof_url!, "_blank")
                              }
                              title="View Proof"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          )}

                          {(stmt.status === "paid" ||
                            stmt.status === "pending_verification") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResetPayment(stmt);
                              }}
                              disabled={resettingId === stmt.id}
                              title="Reset Payment"
                            >
                              {resettingId === stmt.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RotateCcw className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
