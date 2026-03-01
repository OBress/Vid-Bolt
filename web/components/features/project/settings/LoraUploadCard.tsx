'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, FileCheck, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import type { LoraConfig } from '@/types/settings';

interface LoraUploadCardProps {
  loras: LoraConfig[];
  defaultLoraName?: string;
  onLorasChange: (loras: LoraConfig[]) => void;
  onDefaultChange: (name: string | undefined) => void;
  projectId: string;
}

/**
 * LoRA upload, management, and default selection card.
 * Handles upload to R2 via API, and stores LoRA metadata.
 */
export function LoraUploadCard({
  loras,
  defaultLoraName,
  onLorasChange,
  onDefaultChange,
  projectId,
}: LoraUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingWeight, setEditingWeight] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file
      if (!file.name.endsWith('.safetensors')) {
        setUploadError('Only .safetensors files are supported');
        return;
      }

      if (file.size > 500 * 1024 * 1024) {
        setUploadError('File too large. Max 500MB.');
        return;
      }

      setUploading(true);
      setUploadError(null);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId);

        const response = await fetch('/api/lora/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Upload failed');
        }

        const result = await response.json();

        const newLora: LoraConfig = {
          name: file.name.replace(/\.safetensors$/i, ''),
          storageKey: result.storageKey,
          url: result.url,
          defaultWeight: 0.8,
          uploadedAt: new Date().toISOString(),
        };

        const updated = [...loras, newLora];
        onLorasChange(updated);

        // If this is the first LoRA, set it as default
        if (updated.length === 1) {
          onDefaultChange(newLora.name);
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [loras, onLorasChange, onDefaultChange, projectId],
  );

  const removeLora = useCallback(
    (index: number) => {
      const lora = loras[index];
      const updated = loras.filter((_, i) => i !== index);
      onLorasChange(updated);

      if (defaultLoraName === lora.name) {
        onDefaultChange(updated.length > 0 ? updated[0].name : undefined);
      }
    },
    [loras, onLorasChange, defaultLoraName, onDefaultChange],
  );

  const updateWeight = useCallback(
    (name: string, weight: number) => {
      const updated = loras.map((l) =>
        l.name === name ? { ...l, defaultWeight: weight } : l,
      );
      onLorasChange(updated);
    },
    [loras, onLorasChange],
  );

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        className={`
          relative border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer
          ${uploading ? 'border-orange-500/50 bg-orange-500/5' : 'border-neutral-700 hover:border-neutral-500 bg-black/20'}
        `}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".safetensors"
          onChange={handleUpload}
          className="hidden"
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-sm text-neutral-400">Uploading LoRA...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-neutral-500" />
            <p className="text-sm text-neutral-400">
              Drop a <span className="text-orange-400 font-medium">.safetensors</span> file here or click to upload
            </p>
            <p className="text-[10px] text-neutral-600">Max 500MB</p>
          </div>
        )}
      </div>

      {/* Error */}
      {uploadError && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {uploadError}
        </div>
      )}

      {/* LoRA list */}
      {loras.length > 0 && (
        <div className="space-y-3">
          {loras.map((lora, index) => (
            <Card
              key={lora.name}
              className={`
                bg-neutral-900/60 border transition-colors
                ${defaultLoraName === lora.name ? 'border-orange-500/50' : 'border-neutral-800'}
              `}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileCheck className="w-5 h-5 text-orange-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-200 truncate">
                        {lora.name}
                      </p>
                      <p className="text-[10px] text-neutral-500">
                        Uploaded {new Date(lora.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      type="button"
                      variant={defaultLoraName === lora.name ? 'default' : 'outline'}
                      size="sm"
                      className={`text-xs h-7 ${
                        defaultLoraName === lora.name
                          ? 'bg-orange-600 hover:bg-orange-700 text-white'
                          : 'border-neutral-700 text-neutral-400'
                      }`}
                      onClick={() =>
                        onDefaultChange(
                          defaultLoraName === lora.name ? undefined : lora.name,
                        )
                      }
                    >
                      {defaultLoraName === lora.name ? 'Default' : 'Set Default'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-neutral-500 hover:text-red-400"
                      onClick={() => removeLora(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Weight slider */}
                {(editingWeight === lora.name || defaultLoraName === lora.name) && (
                  <div className="mt-3 pt-3 border-t border-neutral-800">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-[10px] text-neutral-500 uppercase">
                        Default Weight
                      </Label>
                      <span className="text-xs text-orange-400 font-mono">
                        {lora.defaultWeight.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      value={[lora.defaultWeight]}
                      min={0}
                      max={1}
                      step={0.05}
                      onValueChange={([val]) => updateWeight(lora.name, val)}
                      className="w-full"
                    />
                  </div>
                )}

                {/* Toggle weight editor for non-defaults */}
                {defaultLoraName !== lora.name && editingWeight !== lora.name && (
                  <button
                    type="button"
                    className="mt-2 text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
                    onClick={() => setEditingWeight(lora.name)}
                  >
                    Adjust weight →
                  </button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {loras.length === 0 && (
        <p className="text-[10px] text-neutral-500 italic text-center">
          No LoRAs uploaded. Upload a .safetensors file to apply a custom style to generated images.
        </p>
      )}
    </div>
  );
}
