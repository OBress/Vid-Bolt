"use client";

import { useEffect, useState, Fragment } from "react";
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
import {
  Loader2,
  ExternalLink,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { resetPaymentMonth } from "@/actions/admin-payment-actions";
import { cn } from "@/lib/utils";

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
  revenue_proof_url: string | null;
  commission_rate: number;
  costs: { title: string; cost_type: string; amount_usd: number }[];
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
  const [expandedStatementId, setExpandedStatementId] = useState<string | null>(
    null
  );

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
      <DialogContent className="bg-neutral-950 border-neutral-800 text-white w-full sm:max-w-5xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 border-b border-neutral-800">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            User Details
            {user.is_admin && (
              <Badge
                variant="outline"
                className="border-red-500 text-red-500 text-[10px]"
              >
                ADMIN
              </Badge>
            )}
            <Badge
              variant="secondary"
              className={
                user.status === "active"
                  ? "bg-green-500/10 text-green-500 ml-auto"
                  : "bg-neutral-800 text-neutral-400 ml-auto"
              }
            >
              {user.status.toUpperCase()}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* User Info Grid */}
          <div className="grid grid-cols-3 gap-6 p-6 bg-neutral-900/30 rounded-lg border border-neutral-800">
            <div>
              <p className="text-sm text-neutral-500 mb-1">Full Name</p>
              <p className="font-medium text-lg text-neutral-200">
                {user.name || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm text-neutral-500 mb-1">Username</p>
              <p className="font-medium text-lg text-neutral-200">
                {user.username ? `@${user.username}` : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm text-neutral-500 mb-1">Email Address</p>
              <p className="font-medium text-lg text-neutral-200">
                {user.email}
              </p>
            </div>
            <div>
              <p className="text-sm text-neutral-500 mb-1">Account ID</p>
              <p className="font-mono text-sm text-neutral-400 select-all">
                {user.id}
              </p>
            </div>
            <div>
              <p className="text-sm text-neutral-500 mb-1">Joined Date</p>
              <p className="font-medium text-neutral-200">
                {new Date(user.date_joined).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Payment History Section */}
          <div className="space-y-4">
            <h3 className="font-bold text-xl text-neutral-200 flex items-center gap-2">
              Payment History
              <span className="text-sm font-normal text-neutral-500">
                ({history.length} statements)
              </span>
            </h3>

            <div className="border border-neutral-800 rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-neutral-900/50">
                  <TableRow className="border-neutral-800 hover:bg-neutral-900/50">
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead className="text-neutral-400">Month</TableHead>
                    <TableHead className="text-neutral-400">Status</TableHead>
                    <TableHead className="text-neutral-400 text-right">
                      Total Revenue
                    </TableHead>
                    <TableHead className="text-neutral-400 text-right">
                      Payout Due
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
                        colSpan={6}
                        className="h-32 text-center text-neutral-500"
                      >
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
                        Loading payment history...
                      </TableCell>
                    </TableRow>
                  ) : history.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-32 text-center text-neutral-500 text-lg"
                      >
                        No payment history found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    history.map((stmt) => {
                      const isExpanded = expandedStatementId === stmt.id;
                      const totalCosts =
                        stmt.costs?.reduce(
                          (acc: number, curr: any) =>
                            acc + (curr.amount_usd || 0),
                          0
                        ) || 0;
                      const profit = stmt.total_revenue - totalCosts;
                      // const payout = profit * (stmt.commission_rate || 0.5); // Example

                      return (
                        <Fragment key={stmt.id}>
                          <TableRow
                            className={cn(
                              "border-neutral-800 transition-colors cursor-pointer",
                              isExpanded
                                ? "bg-neutral-900/50 hover:bg-neutral-900/60"
                                : "hover:bg-neutral-900/30"
                            )}
                            onClick={() =>
                              setExpandedStatementId(
                                isExpanded ? null : stmt.id
                              )
                            }
                          >
                            <TableCell className="text-center">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-neutral-500" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-neutral-500" />
                              )}
                            </TableCell>
                            <TableCell className="font-medium text-neutral-300 text-lg">
                              {stmt.month_date}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  stmt.status === "paid"
                                    ? "bg-green-500/10 text-green-500 border-green-500/20"
                                    : stmt.status === "pending_verification"
                                    ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                                    : "bg-neutral-800 text-neutral-400 border-neutral-700"
                                }
                              >
                                {stmt.status === "pending_verification"
                                  ? "PENDING"
                                  : stmt.status.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-neutral-300 font-mono text-base">
                              ${stmt.total_revenue.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-green-400 font-mono font-bold text-base">
                              --
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {(stmt.status === "paid" ||
                                  stmt.status === "pending_verification") && (
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-8 px-3 text-xs bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResetPayment(stmt);
                                    }}
                                    disabled={resettingId === stmt.id}
                                  >
                                    {resettingId === stmt.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin mr-2" />
                                    ) : (
                                      <RotateCcw className="w-3 h-3 mr-2" />
                                    )}
                                    Reset
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Expanded Details Row */}
                          {isExpanded && (
                            <TableRow className="bg-neutral-950 hover:bg-neutral-950 border-b border-neutral-800">
                              <TableCell colSpan={6} className="p-0">
                                <div className="p-6 grid grid-cols-2 gap-8 bg-neutral-900/20 inset-shadow-sm">
                                  {/* Financial Breakdown */}
                                  <div className="space-y-4">
                                    <h4 className="font-semibold text-neutral-300 border-b border-neutral-800 pb-2">
                                      Financial Breakdown
                                    </h4>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-neutral-500">
                                          Total Revenue Reported
                                        </span>
                                        <span className="font-mono text-neutral-200">
                                          ${stmt.total_revenue.toFixed(2)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-neutral-500">
                                          Total Costs
                                        </span>
                                        <span className="font-mono text-red-400">
                                          -${totalCosts.toFixed(2)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between font-medium pt-2 border-t border-neutral-800">
                                        <span className="text-neutral-400">
                                          Net Profit
                                        </span>
                                        <span className="font-mono text-neutral-200">
                                          ${profit.toFixed(2)}
                                        </span>
                                      </div>

                                      <div className="mt-4 pt-4 border-t border-neutral-800">
                                        <p className="text-xs text-neutral-500 mb-2 font-semibold uppercase tracking-wider">
                                          Approved Costs
                                        </p>
                                        {!stmt.costs ||
                                        stmt.costs.length === 0 ? (
                                          <p className="text-xs text-neutral-600 italic">
                                            No costs reported for this month.
                                          </p>
                                        ) : (
                                          <div className="space-y-1">
                                            {stmt.costs.map((cost, idx) => (
                                              <div
                                                key={idx}
                                                className="flex justify-between text-xs"
                                              >
                                                <span className="text-neutral-400">
                                                  {cost.title ||
                                                    "Untitled Cost"}{" "}
                                                  <span className="opacity-50">
                                                    ({cost.cost_type})
                                                  </span>
                                                </span>
                                                <span className="font-mono text-neutral-300">
                                                  $
                                                  {(
                                                    cost.amount_usd || 0
                                                  ).toFixed(2)}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Proof Images */}
                                  <div className="space-y-4">
                                    <h4 className="font-semibold text-neutral-300 border-b border-neutral-800 pb-2">
                                      Proof Documents
                                    </h4>
                                    <div className="grid grid-cols-2 gap-4">
                                      {/* Revenue Proof */}
                                      <div className="space-y-2">
                                        <p className="text-xs text-neutral-500 font-medium uppercase">
                                          Revenue Proof
                                        </p>
                                        {stmt.revenue_proof_url ? (
                                          <div
                                            className="relative aspect-video bg-neutral-900 rounded-md border border-neutral-800 overflow-hidden group cursor-pointer hover:border-blue-500/50 transition-all"
                                            onClick={() =>
                                              window.open(
                                                stmt.revenue_proof_url!,
                                                "_blank"
                                              )
                                            }
                                          >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                              src={stmt.revenue_proof_url}
                                              alt="Revenue Proof"
                                              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <ExternalLink className="w-5 h-5 text-white" />
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="aspect-video bg-neutral-900 rounded-md border border-neutral-800 flex items-center justify-center text-neutral-600 text-xs italic">
                                            No revenue proof uploaded
                                          </div>
                                        )}
                                      </div>

                                      {/* Payment Proof */}
                                      <div className="space-y-2">
                                        <p className="text-xs text-neutral-500 font-medium uppercase">
                                          Payment Proof
                                        </p>
                                        {stmt.payment_proof_url ? (
                                          <div
                                            className="relative aspect-video bg-neutral-900 rounded-md border border-neutral-800 overflow-hidden group cursor-pointer hover:border-green-500/50 transition-all"
                                            onClick={() =>
                                              window.open(
                                                stmt.payment_proof_url!,
                                                "_blank"
                                              )
                                            }
                                          >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                              src={stmt.payment_proof_url}
                                              alt="Payment Proof"
                                              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <ExternalLink className="w-5 h-5 text-white" />
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="aspect-video bg-neutral-900 rounded-md border border-neutral-800 flex items-center justify-center text-neutral-600 text-xs italic">
                                            No payment proof uploaded
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
