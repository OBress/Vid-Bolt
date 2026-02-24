"use client";

import { useEffect, useState, Fragment } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  ChevronDown,
  ChevronUp,
  User as UserIcon,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import {
  resetPaymentMonth,
  verifyPaymentMonth,
} from "@/actions/admin-payment-actions";
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

// Unified Cost Item to handle potential schema variations
interface CostItem {
  id?: string;
  // New Schema
  name?: string;
  amount?: number;
  // Legacy/Alternative Schema
  title?: string;
  cost_type?: string;
  amount_usd?: number;
}

interface MonthlyStatement {
  id: string;
  month_date: string;
  total_revenue: number;
  status: "draft" | "pending_verification" | "paid";
  payment_proof_url: string | null;
  revenue_proof_url: string | null;
  commission_rate: number;
  costs: CostItem[];
  paid_at: string | null;
}

interface UserDetailSheetProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function UserDetailSheet({
  user,
  open,
  onOpenChange,
  onUpdate,
}: UserDetailSheetProps) {
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

  const initials = (user.name || user.email || "U")
    .substring(0, 2)
    .toUpperCase();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-neutral-950 border-l border-neutral-800 text-white w-full sm:max-w-3xl flex flex-col p-0 h-full overflow-hidden shadow-2xl"
      >
        <SheetHeader className="p-6 border-b border-white/5 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12 border border-white/10 ring-2 ring-white/5">
                <AvatarFallback className="bg-neutral-800 text-white font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-1 text-left">
                <SheetTitle className="text-2xl font-bold flex items-center gap-3 text-white m-0">
                  {user.name || user.email}
                  {user.is_admin && (
                    <Badge
                      variant="outline"
                      className="border-red-500/50 text-red-400 bg-red-500/10 text-[10px] uppercase font-bold px-2 py-0.5"
                    >
                      Admin
                    </Badge>
                  )}
                </SheetTitle>
                {user.name && (
                  <p className="text-sm text-neutral-400">{user.email}</p>
                )}
              </div>
            </div>
            <Badge
              variant="secondary"
              className={cn(
                "px-3 py-1 text-xs font-semibold uppercase tracking-wider",
                user.status === "active"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : user.status === "pending"
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  : "bg-neutral-800 text-neutral-400 border border-neutral-700"
              )}
            >
              {user.status}
            </Badge>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex flex-col flex-1 h-full overflow-hidden">
          <div className="px-6 pt-4 border-b border-white/5 bg-neutral-900/20">
            <TabsList className="bg-transparent space-x-2">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:bg-neutral-800/80 data-[state=active]:text-white text-neutral-400 hover:text-neutral-200"
              >
                <UserIcon className="w-4 h-4 mr-2" />
                Profile Overview
              </TabsTrigger>
              <TabsTrigger
                value="financials"
                className="data-[state=active]:bg-neutral-800/80 data-[state=active]:text-white text-neutral-400 hover:text-neutral-200"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Financial History
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-0 space-y-6 animate-in fade-in-50">
              <div className="grid gap-6">
                <div className="bg-neutral-900/50 border border-white/5 rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-white mb-6 uppercase tracking-wider">
                    Account Information
                  </h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                    <div>
                      <p className="text-xs text-neutral-500 mb-1 uppercase tracking-wider font-semibold">
                        Full Name
                      </p>
                      <p className="font-medium text-base text-neutral-200">
                        {user.name || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 mb-1 uppercase tracking-wider font-semibold">
                        Username
                      </p>
                      <p className="font-medium text-base text-neutral-200">
                        {user.username ? `@${user.username}` : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 mb-1 uppercase tracking-wider font-semibold">
                        Email Address
                      </p>
                      <p className="font-medium text-base text-neutral-200">
                        {user.email}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 mb-1 uppercase tracking-wider font-semibold">
                        Joined Date
                      </p>
                      <p className="font-medium text-base text-neutral-200">
                        {new Date(user.date_joined).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    <div className="col-span-2 pt-4 mt-2 border-t border-white/5">
                      <p className="text-xs text-neutral-500 mb-1 uppercase tracking-wider font-semibold">
                        Account ID
                      </p>
                      <div className="bg-black/50 p-3 rounded-lg flex items-center justify-between border border-white/5">
                        <code className="font-mono text-sm text-neutral-300">
                          {user.id}
                        </code>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Financial History Tab */}
            <TabsContent value="financials" className="mt-0 space-y-4 animate-in fade-in-50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-lg text-white">
                  Monthly Statements
                </h3>
                <Badge variant="outline" className="text-neutral-400 border-neutral-800">
                  {history.length} Total
                </Badge>
              </div>

              <div className="border border-white/5 rounded-xl overflow-hidden bg-neutral-900/30">
                <Table>
                  <TableHeader className="bg-neutral-900/80">
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead className="text-neutral-400 font-medium">Month</TableHead>
                      <TableHead className="text-neutral-400 font-medium">Status</TableHead>
                      <TableHead className="text-neutral-400 font-medium text-right">Revenue</TableHead>
                      <TableHead className="text-neutral-400 font-medium text-right">Payout</TableHead>
                      <TableHead className="text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-40 text-center">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-neutral-500" />
                        </TableCell>
                      </TableRow>
                    ) : history.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-40 text-center text-neutral-500">
                          No payment history found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      history.map((stmt) => {
                        const isExpanded = expandedStatementId === stmt.id;
                        const totalCosts =
                          stmt.costs?.reduce((acc: number, curr: CostItem) => {
                            const amount = curr.amount ?? curr.amount_usd ?? 0;
                            return acc + amount;
                          }, 0) || 0;
                        const profit = stmt.total_revenue - totalCosts;
                        const payout = profit * stmt.commission_rate;

                        return (
                          <Fragment key={stmt.id}>
                            <TableRow
                              className={cn(
                                "border-white/5 transition-all cursor-pointer group",
                                isExpanded
                                  ? "bg-neutral-800/40 hover:bg-neutral-800/50"
                                  : "hover:bg-neutral-800/30"
                              )}
                              onClick={() =>
                                setExpandedStatementId(isExpanded ? null : stmt.id)
                              }
                            >
                              <TableCell className="text-center">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-neutral-500" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-neutral-500 transition-transform group-hover:text-white" />
                                )}
                              </TableCell>
                              <TableCell className="font-medium text-neutral-200">
                                {stmt.month_date}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={cn(
                                    "px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider",
                                    stmt.status === "paid"
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                                      : stmt.status === "pending_verification"
                                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                                      : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700"
                                  )}
                                >
                                  {stmt.status === "pending_verification"
                                    ? "Pending"
                                    : stmt.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-neutral-300 font-mono text-sm">
                                ${stmt.total_revenue.toFixed(2)}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "text-right font-mono font-semibold text-sm",
                                  stmt.status === "draft"
                                    ? "text-neutral-500"
                                    : "text-emerald-400"
                                )}
                              >
                                ${payout.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right">
                                {(stmt.status === "paid" || stmt.status === "pending_verification") && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResetPayment(stmt);
                                    }}
                                    disabled={resettingId === stmt.id}
                                  >
                                    {resettingId === stmt.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    )}
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>

                            {/* Expanded Details Row */}
                            {isExpanded && (
                              <TableRow className="bg-black/40 hover:bg-black/40">
                                <TableCell colSpan={6} className="p-0 border-b border-white/5">
                                  <div className="p-6 grid grid-cols-2 gap-8 shadow-inner">
                                    {/* Financial Breakdown */}
                                    <div className="space-y-4">
                                      <h4 className="text-xs uppercase tracking-wider font-semibold text-neutral-400 border-b border-white/5 pb-2">
                                        Statement Details
                                      </h4>
                                      <div className="bg-neutral-900/50 rounded-lg p-4 space-y-3 font-mono text-sm border border-white/5">
                                        {stmt.paid_at && (
                                          <div className="flex justify-between items-center pb-3 mb-3 border-b border-white/5">
                                            <span className="font-sans text-neutral-400">Payment Date</span>
                                            <span className="text-emerald-400">{new Date(stmt.paid_at).toLocaleDateString()}</span>
                                          </div>
                                        )}
                                        <div className="flex justify-between items-center">
                                          <span className="font-sans text-neutral-400">Total Revenue</span>
                                          <span className="text-white">${stmt.total_revenue.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                          <span className="font-sans text-neutral-400">Total Costs</span>
                                          <span className="text-red-400">-${totalCosts.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-2 border-t border-white/5">
                                          <span className="font-sans text-neutral-300 font-medium">Net Profit</span>
                                          <span className="text-white font-medium">${profit.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                          <span className="font-sans text-neutral-500">Commission Rate</span>
                                          <span className="text-neutral-400">{(stmt.commission_rate * 100).toFixed(0)}%</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-3 mt-3 border-t border-dashed border-white/10">
                                          <span className={cn("font-sans font-bold", stmt.status === "draft" ? "text-neutral-500" : "text-emerald-400")}>
                                            Payout Due
                                          </span>
                                          <div className="flex items-center gap-3">
                                            <span className={cn("text-lg font-bold", stmt.status === "draft" ? "text-neutral-500" : "text-emerald-400")}>
                                              ${payout.toFixed(2)}
                                            </span>
                                            {stmt.status === "pending_verification" && (
                                              <Button
                                                size="sm"
                                                className="h-7 bg-emerald-500 hover:bg-emerald-600 text-black border-0 font-bold"
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  if (!user || !confirm("Verify this payment? This will mark it as paid.")) return;
                                                  try {
                                                    await verifyPaymentMonth(user.id, stmt.month_date);
                                                    toast.success("Payment verified successfully");
                                                    await fetchPaymentHistory(user.id);
                                                    onUpdate();
                                                  } catch (err: any) {
                                                    toast.error(`Verification failed: ${err.message}`);
                                                  }
                                                }}
                                              >
                                                Verify
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Costs Section */}
                                      {stmt.costs && stmt.costs.length > 0 && (
                                        <div className="mt-4 pt-4 border-t border-white/5">
                                          <p className="text-xs text-neutral-500 mb-2 font-semibold uppercase tracking-wider">
                                            Itemized Costs
                                          </p>
                                          <div className="space-y-2 bg-neutral-900/30 rounded-lg p-3 border border-white/5">
                                            {stmt.costs.map((cost, idx) => (
                                              <div key={idx} className="flex justify-between text-xs items-center">
                                                <span className="text-neutral-300 font-medium">
                                                  {cost.name ?? cost.title ?? "Untitled Cost"}
                                                  {cost.cost_type && (
                                                    <Badge variant="outline" className="ml-2 text-[9px] bg-neutral-800 border-neutral-700 text-neutral-400 px-1 py-0">
                                                      {cost.cost_type}
                                                    </Badge>
                                                  )}
                                                </span>
                                                <span className="font-mono text-neutral-400">
                                                  ${(cost.amount ?? cost.amount_usd ?? 0).toFixed(2)}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Proof Images */}
                                    <div className="space-y-4">
                                      <h4 className="text-xs uppercase tracking-wider font-semibold text-neutral-400 border-b border-white/5 pb-2">
                                        Proof Documents
                                      </h4>
                                      <div className="space-y-4">
                                        {/* Revenue Proof */}
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium text-neutral-300">Revenue Screenshots</p>
                                          </div>
                                          {stmt.revenue_proof_url ? (
                                            <div
                                              className="relative h-32 bg-neutral-900 rounded-lg border border-white/10 overflow-hidden group cursor-pointer hover:border-blue-500/50 transition-all shadow-md"
                                              onClick={() => window.open(stmt.revenue_proof_url!, "_blank")}
                                            >
                                              <img
                                                src={stmt.revenue_proof_url}
                                                alt="Revenue Proof"
                                                className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                                              />
                                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                                                <div className="bg-white/10 text-white rounded-full p-2 flex items-center gap-2 text-sm font-medium border border-white/20 shadow-xl">
                                                  <ExternalLink className="w-4 h-4" /> View Full Image
                                                </div>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="h-24 bg-neutral-900/50 rounded-lg border border-white/5 border-dashed flex flex-col items-center justify-center text-neutral-600 text-xs">
                                              No revenue proof uploaded
                                            </div>
                                          )}
                                        </div>

                                        {/* Payment Proof */}
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium text-neutral-300">Payment Receipt</p>
                                          </div>
                                          {stmt.payment_proof_url ? (
                                            <div
                                              className="relative h-32 bg-neutral-900 rounded-lg border border-white/10 overflow-hidden group cursor-pointer hover:border-emerald-500/50 transition-all shadow-md"
                                              onClick={() => window.open(stmt.payment_proof_url!, "_blank")}
                                            >
                                              <img
                                                src={stmt.payment_proof_url}
                                                alt="Payment Proof"
                                                className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                                              />
                                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                                                <div className="bg-white/10 text-white rounded-full p-2 flex items-center gap-2 text-sm font-medium border border-white/20 shadow-xl">
                                                  <ExternalLink className="w-4 h-4" /> View Full Image
                                                </div>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="h-24 bg-neutral-900/50 rounded-lg border border-white/5 border-dashed flex flex-col items-center justify-center text-neutral-600 text-xs">
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
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
