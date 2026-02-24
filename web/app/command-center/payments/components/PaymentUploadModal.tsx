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
import { Label } from "@/components/ui/label";
import { Loader2, UploadCloud, ImageIcon, Wallet } from "lucide-react";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { confirmPayment, getProofUploadUrl } from "../actions";

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
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const processFile = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    // Generate thumbnail preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(selectedFile);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type.startsWith("image/")) {
      processFile(droppedFile);
    }
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleUpload = async () => {
    if (!file || !statementId) return;

    try {
      setUploading(true);

      const ext = file.name.split(".").pop() || "png";
      const { putUrl, publicUrl } = await getProofUploadUrl(
        statementId,
        "payment",
        ext
      );

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

      await confirmPayment(statementId, publicUrl);

      toast.success("Payment proof uploaded successfully!");
      onOpenChange(false);
      setFile(null);
      setPreview(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload payment proof. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) { setFile(null); setPreview(null); }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Payment</DialogTitle>
          <DialogDescription>
            Upload a screenshot of your payment transfer.
          </DialogDescription>
        </DialogHeader>

        {/* Amount Due callout */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 shrink-0">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Amount Due</p>
            <p className="text-xl font-bold text-primary tabular-nums">${amountDue.toFixed(2)}</p>
          </div>
        </div>

        <div className="grid gap-3">
          <Label htmlFor="proof">Payment Screenshot</Label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              border-2 border-dashed rounded-xl p-6
              flex flex-col items-center justify-center
              cursor-pointer relative transition-all duration-200
              ${isDragOver
                ? "border-primary bg-primary/5 scale-[1.02]"
                : "border-input hover:bg-muted/50 hover:border-muted-foreground/30"
              }
            `}
          >
            <input
              id="proof"
              type="file"
              accept="image/*"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"
              onChange={handleFileChange}
              disabled={uploading}
            />
            
            {preview ? (
              <div className="flex flex-col items-center gap-3 w-full">
                <div className="relative w-full max-w-[200px] aspect-video rounded-lg overflow-hidden border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Payment proof preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium truncate max-w-[200px]">{file?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {file ? (file.size / 1024 / 1024).toFixed(2) : "0"} MB · Click or drop to change
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                {isDragOver ? (
                  <ImageIcon className="w-10 h-10 text-primary animate-bounce" />
                ) : (
                  <UploadCloud className="w-10 h-10 text-muted-foreground" />
                )}
                <div className="text-center">
                  <p className="text-sm font-medium">
                    {isDragOver ? "Drop your image here" : "Drag & drop or click to select"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, or WEBP</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading} className="gap-1.5">
            {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirm Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
