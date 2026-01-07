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
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CostItem,
  MonthlyStatement,
  PaymentStatus,
  upsertStatement,
} from "../actions";
import { PaymentUploadModal } from "./PaymentUploadModal";

interface FinancialFormProps {
  currentDate: string; // The selected month date string
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

// Helper type for form state, allowing empty strings for controlled inputs
type CostItemFormState = {
  id: string;
  name: string;
  amount: string | number; // Allow string for empty state
  isCustom?: boolean;
};

export function FinancialForm({
  currentDate,
  initialStatement,
  defaultCosts = [],
}: FinancialFormProps) {
  // State
  // Revenue as string to allow empty input
  const [revenue, setRevenue] = useState<string | number>(
    initialStatement?.total_revenue !== undefined
      ? initialStatement.total_revenue
      : ""
  );

  // Map initial costs or default costs to form state
  const initializeCosts = () => {
    const rawCosts = initialStatement?.costs || defaultCosts || [];
    return rawCosts.map((c) => ({
      id: c.id,
      name: c.name,
      amount: c.amount === 0 ? "" : c.amount, // If 0 (and pre-filled), show empty to prompt user
      isCustom: !COMMON_COSTS.includes(c.name) && c.name !== "",
    }));
  };

  const [costs, setCosts] = useState<CostItemFormState[]>(initializeCosts());
  const [loading, setLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [errors, setErrors] = useState<Set<string>>(new Set()); // IDs of fields with errors

  // Derived state
  const status: PaymentStatus = initialStatement?.status || "draft";
  const commissionRate = initialStatement?.commission_rate || 0.1; // Default 10%

  const totalCosts = costs.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );
  const revenueNum = Number(revenue) || 0;
  const profit = Math.max(0, revenueNum - totalCosts);
  const commission = profit * commissionRate;

  const isReadOnly = status === "paid" || status === "pending_verification";

  // Sync state when initialStatement changes (e.g. switching months)
  useEffect(() => {
    setRevenue(
      initialStatement?.total_revenue !== undefined
        ? initialStatement.total_revenue
        : ""
    );
    setCosts(initializeCosts());
    setErrors(new Set());
  }, [initialStatement, currentDate]);

  const handleAddCost = () => {
    if (isReadOnly) return;
    setCosts([...costs, { id: crypto.randomUUID(), name: "", amount: "" }]);
  };

  const handleRemoveCost = (id: string) => {
    if (isReadOnly) return;
    setCosts(costs.filter((c) => c.id !== id));
  };

  const handleCostNameChange = (id: string, value: string) => {
    if (isReadOnly) return;
    setCosts(
      costs.map((c) => {
        if (c.id !== id) return c;
        if (value === "Other") {
          return { ...c, name: "", isCustom: true };
        }
        return { ...c, name: value, isCustom: false };
      })
    );
  };

  const handleCostCustomNameChange = (id: string, value: string) => {
    if (isReadOnly) return;
    setCosts(costs.map((c) => (c.id === id ? { ...c, name: value } : c)));
  };

  const handleAmountChange = (id: string, value: string) => {
    if (isReadOnly) return;
    // Allow empty string or valid number
    if (value === "" || !isNaN(parseFloat(value))) {
      setCosts(costs.map((c) => (c.id === id ? { ...c, amount: value } : c)));
    }
  };

  const validate = (): boolean => {
    const newErrors = new Set<string>();

    // Revenue must not be empty (0 is okay if explicit, but "" is not)
    if (revenue === "") {
      newErrors.add("revenue");
    }

    costs.forEach((c) => {
      if (!c.name.trim()) newErrors.add(`${c.id}-name`);
      if (c.amount === "") newErrors.add(`${c.id}-amount`);
    });

    setErrors(newErrors);
    if (newErrors.size > 0) {
      toast.error("Please fill in all required fields.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      // Convert form state back to strict types
      const cleanCosts: CostItem[] = costs.map((c) => ({
        id: c.id,
        name: c.name,
        amount: Number(c.amount),
      }));

      await upsertStatement(
        initialStatement?.id,
        currentDate,
        Number(revenue),
        cleanCosts
      );
      toast.success("Changes saved successfully");
    } catch (error) {
      toast.error("Failed to save changes");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Financial Overview
          </h2>
          <p className="text-muted-foreground">
            Manage your monthly revenue and expenses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status === "paid" && (
            <Badge className="bg-green-500 hover:bg-green-600">Paid</Badge>
          )}
          {status === "pending_verification" && (
            <Badge
              variant="secondary"
              className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
            >
              Pending Verification
            </Badge>
          )}
          {status === "draft" && <Badge variant="outline">Draft</Badge>}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>
            Enter the total revenue generated across all channels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <Label htmlFor="revenue">Total Revenue ($)</Label>
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
                "text-lg font-medium",
                errors.has("revenue") &&
                  "border-destructive focus-visible:ring-destructive"
              )}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle>Costs</CardTitle>
            <CardDescription>
              Deduct operational expenses (API costs, hosting, etc).
            </CardDescription>
          </div>
          {!isReadOnly && (
            <Button variant="outline" size="sm" onClick={handleAddCost}>
              <Plus className="w-4 h-4 mr-2" /> Add Cost
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {costs.length === 0 && (
            <p className="text-sm text-center text-muted-foreground py-4 italic">
              No costs added yet.
            </p>
          )}

          {costs.map((cost) => (
            <div
              key={cost.id}
              className="flex gap-4 items-start animate-in fade-in slide-in-from-top-2 duration-200"
            >
              <div className="grid gap-2 flex-1">
                <Label className="text-xs">Description</Label>
                <div className="flex gap-2">
                  {!cost.isCustom ? (
                    <Select
                      value={
                        COMMON_COSTS.includes(cost.name)
                          ? cost.name
                          : cost.name
                          ? "Other"
                          : ""
                      }
                      onValueChange={(val) =>
                        handleCostNameChange(cost.id, val)
                      }
                      disabled={isReadOnly}
                    >
                      <SelectTrigger
                        className={cn(
                          errors.has(`${cost.id}-name`) && "border-destructive"
                        )}
                      >
                        <SelectValue placeholder="Select cost type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMON_COSTS.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="relative w-full">
                      <Input
                        value={cost.name}
                        onChange={(e) =>
                          handleCostCustomNameChange(cost.id, e.target.value)
                        }
                        placeholder="Enter description..."
                        disabled={isReadOnly}
                        className={cn(
                          errors.has(`${cost.id}-name`) && "border-destructive"
                        )}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => handleCostNameChange(cost.id, "")} // Reset to dropdown
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid gap-2 w-32">
                <Label className="text-xs">Amount ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost.amount}
                  onChange={(e) => handleAmountChange(cost.id, e.target.value)}
                  placeholder="0.00"
                  disabled={isReadOnly}
                  className={cn(
                    errors.has(`${cost.id}-amount`) && "border-destructive"
                  )}
                />
              </div>
              {!isReadOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-6 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveCost(cost.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}

          {costs.length > 0 && (
            <>
              <Separator className="my-2" />
              <div className="flex justify-between items-center text-sm font-medium">
                <span>Total Costs</span>
                <span className="text-muted-foreground">
                  -${totalCosts.toFixed(2)}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle>Commission Calculation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm">
            <span>Net Profit (Revenue - Costs)</span>
            <span className="font-semibold">${profit.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Commission Rate</span>
            <span>{(commissionRate * 100).toFixed(0)}%</span>
          </div>
          <Separator className="bg-primary/20" />
          <div className="flex justify-between items-center text-lg font-bold text-primary">
            <span>Amount Due</span>
            <span>${commission.toFixed(2)}</span>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3 pt-6">
          {!isReadOnly && (
            <>
              <Button variant="ghost" onClick={handleSave} disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Draft
              </Button>
              <Button
                onClick={() => {
                  if (validate()) {
                    // Ensure we save first before opening modal
                    handleSave().then(() => setShowUploadModal(true));
                  }
                }}
                disabled={loading}
              >
                Confirm & Pay
              </Button>
            </>
          )}
          {isReadOnly && initialStatement?.payment_proof_url && (
            <Button variant="outline" asChild>
              <a
                href={initialStatement.payment_proof_url}
                target="_blank"
                rel="noreferrer"
              >
                View Payment Proof
              </a>
            </Button>
          )}
        </CardFooter>
      </Card>

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
