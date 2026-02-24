"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Loader2,
  Minus,
  Plus,
  Save,
  TrendingUp,
  Trash2,
  Wallet,
  ImageIcon,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CostItem,
  MonthlyStatement,
  PaymentStatus,
  upsertStatement,
  getProofUploadUrl,
} from "../actions";
import { PaymentUploadModal } from "./PaymentUploadModal";

interface FinancialFormProps {
  currentDate: string;
  initialStatement?: MonthlyStatement;
  defaultCosts?: CostItem[];
}

const COMMON_COSTS = [
  "OpenRouter",
  "Inworld TTS",
  "Elevenlabs TTS",
  "GenAI TTS",
  "Google Cloud",
  "Runpod",
  "Other",
];

type CostItemFormState = {
  id: string;
  name: string;
  amount: string | number;
  isCustom?: boolean;
};

/* ─── Summary Stat Card ─── */
function StatCard({
  icon: Icon,
  label,
  value,
  prefix = "$",
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  prefix?: string;
  color: "emerald" | "red" | "blue" | "primary";
}) {
  const colorMap = {
    emerald: {
      bg: "bg-emerald-500/10",
      icon: "text-emerald-500",
      value: "text-emerald-600 dark:text-emerald-400",
    },
    red: {
      bg: "bg-red-500/10",
      icon: "text-red-500",
      value: "text-red-600 dark:text-red-400",
    },
    blue: {
      bg: "bg-blue-500/10",
      icon: "text-blue-500",
      value: "text-blue-600 dark:text-blue-400",
    },
    primary: {
      bg: "bg-primary/10",
      icon: "text-primary",
      value: "text-primary",
    },
  };

  const c = colorMap[color];

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border bg-card transition-all duration-200 hover:shadow-sm">
      <div className={cn("flex items-center justify-center w-10 h-10 rounded-lg shrink-0", c.bg)}>
        <Icon className={cn("w-5 h-5", c.icon)} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        <p className={cn("text-lg font-bold tabular-nums tracking-tight", c.value)}>
          {prefix}{value.toFixed(2)}
        </p>
      </div>
    </div>
  );
}

/* ─── Status Badge ─── */
function StatusBadge({ status }: { status: PaymentStatus }) {
  if (status === "paid") {
    return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20">Paid</Badge>;
  }
  if (status === "pending_verification") {
    return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20">Pending Verification</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">Draft</Badge>;
}

/* ─── Main Form ─── */
export function FinancialForm({ currentDate, initialStatement, defaultCosts = [] }: FinancialFormProps) {
  // State
  const [revenue, setRevenue] = useState<string | number>(
    initialStatement?.total_revenue !== undefined ? initialStatement.total_revenue : ""
  );
  const [revenueProofUrl, setRevenueProofUrl] = useState<string | null>(initialStatement?.revenue_proof_url || null);
  
  const initializeCosts = () => {
    const rawCosts = initialStatement?.costs || defaultCosts || [];
    return rawCosts.map(c => ({
      id: c.id,
      name: c.name,
      amount: c.amount === 0 ? "" : c.amount,
      isCustom: !COMMON_COSTS.includes(c.name) && c.name !== "" 
    }));
  };

  const [costs, setCosts] = useState<CostItemFormState[]>(initializeCosts());
  const [loading, setLoading] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  
  // Derived state
  const status: PaymentStatus = initialStatement?.status || "draft";
  const commissionRate = initialStatement?.commission_rate || 0.1;
  
  const totalCosts = costs.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const revenueNum = Number(revenue) || 0;
  const profit = Math.max(0, revenueNum - totalCosts); 
  const commission = profit * commissionRate;
  
  const isReadOnly = status === "paid" || status === "pending_verification";

  // Sync state when initialStatement changes
  useEffect(() => {
    setRevenue(initialStatement?.total_revenue !== undefined ? initialStatement.total_revenue : "");
    setRevenueProofUrl(initialStatement?.revenue_proof_url || null);
    setCosts(initializeCosts());
    setErrors(new Set());
  }, [initialStatement, currentDate]);

  const handleAddCost = () => {
    if (isReadOnly) return;
    setCosts([...costs, { id: crypto.randomUUID(), name: "", amount: "" }]);
  };

  const handleRemoveCost = (id: string) => {
    if (isReadOnly) return;
    setCosts(costs.filter(c => c.id !== id));
  };

  const handleCostNameChange = (id: string, value: string) => {
    if (isReadOnly) return;
    setCosts(costs.map(c => {
      if (c.id !== id) return c;
      if (value === "Other") {
        return { ...c, name: "", isCustom: true };
      }
      return { ...c, name: value, isCustom: false };
    }));
  };

  const handleCostCustomNameChange = (id: string, value: string) => {
    if (isReadOnly) return;
    setCosts(costs.map(c => c.id === id ? { ...c, name: value } : c));
  };

  const handleAmountChange = (id: string, value: string) => {
    if (isReadOnly) return;
    if (value === "" || !isNaN(parseFloat(value))) {
      setCosts(costs.map(c => c.id === id ? { ...c, amount: value } : c));
    }
  };

  const handleRevenueProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
        setUploadingProof(true);
        
        let targetId = initialStatement?.id;
        
        if (!targetId) {
             const res = await upsertStatement(undefined, currentDate, Number(revenue), [], null);
             targetId = res.id;
        }

        const ext = file.name.split(".").pop() || "png";

        const { putUrl, publicUrl } = await getProofUploadUrl(targetId, "revenue", ext);

        await fetch(putUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
        });

        setRevenueProofUrl(publicUrl);
        toast.success("Revenue proof uploaded");
        
        const cleanCosts: CostItem[] = costs.map(c => ({
            id: c.id,
            name: c.name,
            amount: Number(c.amount)
        }));
        
        await upsertStatement(targetId, currentDate, Number(revenue), cleanCosts, publicUrl);

    } catch (error) {
        console.error(error);
        toast.error("Failed to upload proof");
    } finally {
        setUploadingProof(false);
    }
  };

  const validate = (): boolean => {
    const newErrors = new Set<string>();
    
    if (revenue === "") {
      newErrors.add("revenue");
    }
    
    if (!revenueProofUrl) {
       newErrors.add("revenue_proof");
    }

    costs.forEach(c => {
      if (!c.name.trim()) newErrors.add(`${c.id}-name`);
      if (c.amount === "") newErrors.add(`${c.id}-amount`);
    });

    setErrors(newErrors);
    if (newErrors.size > 0) {
      toast.error("Please fill in all required fields, including revenue proof.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const cleanCosts: CostItem[] = costs.map(c => ({
        id: c.id,
        name: c.name,
        amount: Number(c.amount)
      }));

      await upsertStatement(initialStatement?.id, currentDate, Number(revenue), cleanCosts, revenueProofUrl);
      toast.success("Changes saved successfully");
    } catch (_error) {
      toast.error("Failed to save changes");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl space-y-6 pb-20">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Financial Overview</h2>
          <p className="text-sm text-muted-foreground">Manage your monthly revenue and expenses.</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* ─── Summary Stats Row ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={ArrowUpRight} label="Revenue" value={revenueNum} color="emerald" />
        <StatCard icon={ArrowDownRight} label="Total Costs" value={totalCosts} color="red" />
        <StatCard icon={TrendingUp} label="Net Profit" value={profit} color="blue" />
        <StatCard icon={Wallet} label="Amount Due" value={commission} color="primary" />
      </div>

      {/* ─── Revenue Card ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            Revenue
          </CardTitle>
          <CardDescription>Enter the total revenue generated and upload proof.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5">
            <div className="grid gap-2">
                <Label htmlFor="revenue">Total Revenue ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                  <Input
                    id="revenue"
                    type="number"
                    min="0"
                    step="0.01"
                    value={revenue}
                    onChange={(e) => setRevenue(e.target.value)}
                    disabled={isReadOnly}
                    placeholder="0.00"
                    className={cn(
                        "pl-7 text-lg font-medium h-11",
                        errors.has("revenue") && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                </div>
            </div>

            <div className="grid gap-2">
                <Label>Revenue Proof (Screenshot)</Label>
                <div className="flex items-center gap-3">
                     {!isReadOnly && (
                         <div className="relative">
                            <Input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id="revenue-proof-upload"
                                onChange={handleRevenueProofUpload}
                                disabled={uploadingProof}
                            />
                            <Label 
                                htmlFor="revenue-proof-upload" 
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer transition-all duration-200",
                                    "hover:bg-muted hover:border-muted-foreground/30",
                                    errors.has("revenue_proof") && !revenueProofUrl && "border-destructive text-destructive"
                                )}
                            >
                                {uploadingProof ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : revenueProofUrl ? (
                                  <ImageIcon className="w-4 h-4 text-emerald-500" />
                                ) : (
                                  <Plus className="w-4 h-4" />
                                )}
                                {revenueProofUrl ? "Change Proof" : "Upload Screenshot"}
                            </Label>
                         </div>
                     )}
                     
                     {revenueProofUrl && (
                         <Button variant="ghost" size="sm" asChild className="text-muted-foreground gap-1.5">
                             <a href={revenueProofUrl} target="_blank" rel="noreferrer">
                               <ExternalLink className="w-3.5 h-3.5" />
                               View Proof
                             </a>
                         </Button>
                     )}
                </div>
                {errors.has("revenue_proof") && !revenueProofUrl && (
                     <p className="text-xs text-destructive">Proof of revenue is required.</p>
                )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Costs Card ─── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Minus className="w-4 h-4 text-red-500" />
              Costs
            </CardTitle>
            <CardDescription>Deduct operational expenses (API costs, hosting, etc).</CardDescription>
          </div>
          {!isReadOnly && (
            <Button variant="outline" size="sm" onClick={handleAddCost} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Cost
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {costs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
                <DollarSign className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No costs added yet.</p>
              {!isReadOnly && (
                <p className="text-xs text-muted-foreground/70 mt-1">Click &quot;Add Cost&quot; to get started.</p>
              )}
            </div>
          )}
          
          {costs.map((cost, index) => (
            <div
              key={cost.id}
              className={cn(
                "flex gap-3 items-start p-3 rounded-lg transition-all duration-200 animate-in fade-in slide-in-from-top-2",
                index % 2 === 0 ? "bg-muted/30" : "bg-transparent"
              )}
            >
              <div className="grid gap-1.5 flex-1">
                <Label className="text-xs text-muted-foreground">Description</Label>
                <div className="flex gap-2">
                    {!cost.isCustom ? (
                        <Select 
                            value={COMMON_COSTS.includes(cost.name) ? cost.name : (cost.name ? "Other" : "")} 
                            onValueChange={(val) => handleCostNameChange(cost.id, val)}
                            disabled={isReadOnly}
                        >
                        <SelectTrigger className={cn("h-9", errors.has(`${cost.id}-name`) && "border-destructive")}>
                            <SelectValue placeholder="Select cost type..." />
                        </SelectTrigger>
                        <SelectContent>
                            {COMMON_COSTS.map(item => (
                                <SelectItem key={item} value={item}>{item}</SelectItem>
                            ))}
                        </SelectContent>
                        </Select>
                    ) : (
                         <div className="relative w-full">
                            <Input
                                value={cost.name}
                                onChange={(e) => handleCostCustomNameChange(cost.id, e.target.value)}
                                placeholder="Enter description..."
                                disabled={isReadOnly}
                                className={cn("h-9", errors.has(`${cost.id}-name`) && "border-destructive")}
                                autoFocus
                            />
                             <Button 
                                variant="ghost" 
                                size="sm" 
                                className="absolute right-0 top-0 h-full text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => handleCostNameChange(cost.id, "")}
                             >
                                Cancel
                             </Button>
                         </div>
                    )}
                </div>
              </div>
              <div className="grid gap-1.5 w-28">
                 <Label className="text-xs text-muted-foreground">Amount ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost.amount}
                  onChange={(e) => handleAmountChange(cost.id, e.target.value)}
                  placeholder="0.00"
                  disabled={isReadOnly}
                  className={cn("h-9", errors.has(`${cost.id}-amount`) && "border-destructive")}
                />
              </div>
              {!isReadOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-5 h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={() => handleRemoveCost(cost.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
          
          {costs.length > 0 && (
            <>
              <Separator className="my-1" />
              <div className="flex justify-between items-center text-sm font-semibold px-3">
                <span>Total Costs</span>
                <span className="text-red-500 tabular-nums">-${totalCosts.toFixed(2)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Commission Card ─── */}
      <Card className="border-primary/20 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            Commission Calculation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
           <div className="flex justify-between items-center text-sm">
             <span className="text-muted-foreground">Net Profit (Revenue - Costs)</span>
             <span className="font-semibold tabular-nums">${profit.toFixed(2)}</span>
           </div>
           <div className="flex justify-between items-center text-sm">
             <span className="text-muted-foreground">Commission Rate</span>
             <span className="font-medium">{(commissionRate * 100).toFixed(0)}%</span>
           </div>

           {/* Visual breakdown bar */}
           <div className="relative h-3 rounded-full bg-muted overflow-hidden">
             {revenueNum > 0 && (
               <>
                 <div
                   className="absolute inset-y-0 left-0 bg-emerald-500/40 rounded-full transition-all duration-500"
                   style={{ width: "100%" }}
                 />
                 <div
                   className="absolute inset-y-0 left-0 bg-blue-500/50 rounded-full transition-all duration-500"
                   style={{ width: `${Math.min(100, (profit / revenueNum) * 100)}%` }}
                 />
                 <div
                   className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500"
                   style={{ width: `${Math.min(100, (commission / revenueNum) * 100)}%` }}
                 />
               </>
             )}
           </div>
           <div className="flex gap-4 text-[10px] text-muted-foreground">
             <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500/40" /> Revenue</span>
             <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500/50" /> Profit</span>
             <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> Due</span>
           </div>

           <Separator className="bg-primary/10" />
           <div className="flex justify-between items-center">
             <span className="text-lg font-bold">Amount Due</span>
             <span className="text-2xl font-bold text-primary tabular-nums">${commission.toFixed(2)}</span>
           </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3 pt-4 pb-5">
          {!isReadOnly && (
            <>
              <Button variant="ghost" onClick={handleSave} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Draft
              </Button>
              <Button onClick={() => {
                   if (validate()) {
                       handleSave().then(() => setShowUploadModal(true));
                   }
                }} 
                disabled={loading}
                className="gap-2"
              >
                Confirm & Pay
              </Button>
            </>
          )}
          {isReadOnly && initialStatement?.payment_proof_url && (
             <Button variant="outline" asChild className="gap-1.5">
                <a href={initialStatement.payment_proof_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Payment Proof
                </a>
             </Button>
          )}
        </CardFooter>
      </Card>

      {/* Sticky mobile footer */}
      {!isReadOnly && (
        <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-background/80 backdrop-blur-lg border-t p-4 flex gap-3 justify-end z-50">
          <Button variant="ghost" onClick={handleSave} disabled={loading} size="sm" className="gap-1.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </Button>
          <Button
            onClick={() => {
              if (validate()) {
                handleSave().then(() => setShowUploadModal(true));
              }
            }}
            disabled={loading}
            size="sm"
          >
            Confirm & Pay
          </Button>
        </div>
      )}

      {/* Upload Modal */}
      {initialStatement && (
        <PaymentUploadModal 
            open={showUploadModal}
            onOpenChange={setShowUploadModal}
            statementId={initialStatement.id}
            amountDue={commission}
        />
      )}
    </div>
  );
}
