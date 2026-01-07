"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UploadCloud } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { confirmPayment, getPaymentUploadUrl } from "../actions";

interface PaymentUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statementId: string;
  amountDue: number;
}

export function PaymentUploadModal({
  open,
  onOpenChange,
  statementId,
  amountDue,
}: PaymentUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !statementId) return;

    try {
      setUploading(true);

      // 1. Get presigned URL
      const ext = file.name.split(".").pop() || "png";
      const { putUrl, publicUrl } = await getPaymentUploadUrl(statementId, ext);

      // 2. Upload to R2
      const uploadRes = await fetch(putUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload image");
      }

      // 3. Confirm payment in DB
      await confirmPayment(statementId, publicUrl);

      toast.success("Payment proof uploaded successfully!");
      onOpenChange(false);
      setFile(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload payment proof. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Payment</DialogTitle>
          <DialogDescription>
            Please upload a screenshot of your payment transfer for{" "}
            <span className="font-semibold text-foreground">
              ${amountDue.toFixed(2)}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="proof">Payment Screenshot</Label>
            <div className="border-2 border-dashed border-input hover:bg-muted/50 transition-colors rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer relative">
              <Input
                id="proof"
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileChange}
                disabled={uploading}
              />
              <UploadCloud className="w-8 h-8 text-muted-foreground mb-2" />
              {file ? (
                <div className="text-center">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center">
                  Drag & drop or click to select
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirm Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
