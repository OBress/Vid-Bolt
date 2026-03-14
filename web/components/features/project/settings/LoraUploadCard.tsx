'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileCheck, Loader2, AlertCircle, Pencil, Trash2, Tag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { LoraConfig } from '@/types/settings';
import { getLoraUploadUrl } from '@/app/actions/lora-actions';

interface LoraUploadCardProps {
  loras: LoraConfig[];
  defaultLoraName?: string;
  onLorasChange: (loras: LoraConfig[]) => void;
  onDefaultChange: (name: string | undefined) => void;
  projectId: string;
}

/**
 * Upload a file directly to R2 via presigned PUT URL.
 * Uses XMLHttpRequest for upload progress tracking.
 */
function uploadFileToR2(
  putUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload was cancelled')));

    xhr.open('PUT', putUrl);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.send(file);
  });
}

/**
 * LoRA upload, management, and active selection card.
 * LoRAs apply only to Z-Image Turbo (image generation).
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const activeLora = loras.find((l) => l.name === defaultLoraName);

  // ── Upload (presigned URL → direct to R2) ─────────────────────────────
  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith('.safetensors')) {
        setUploadError('Only .safetensors files are supported');
        return;
      }
      if (file.size > 500 * 1024 * 1024) {
        setUploadError('File too large. Max 500MB.');
        return;
      }

      setUploading(true);
      setUploadProgress(0);
      setUploadError(null);

      try {
        // Step 1: Get presigned URL from server (tiny JSON request)
        const urlResult = await getLoraUploadUrl(file.name, file.size, projectId);
        if (urlResult.error) throw new Error(urlResult.error);
        if (!urlResult.putUrl || !urlResult.storageKey || !urlResult.publicUrl) {
          throw new Error('Server did not return upload URL');
        }

        // Step 2: Upload file directly to R2 (bypasses Cloudflare proxy)
        await uploadFileToR2(urlResult.putUrl, file, setUploadProgress);

        const newLora: LoraConfig = {
          name: file.name.replace(/\.safetensors$/i, ''),
          storageKey: urlResult.storageKey,
          url: urlResult.publicUrl,
          defaultWeight: 0.8,
          uploadedAt: new Date().toISOString(),
        };

        const updated = [...loras, newLora];
        onLorasChange(updated);
        if (!defaultLoraName) onDefaultChange(newLora.name);
        setShowUploader(false);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [loras, onLorasChange, onDefaultChange, defaultLoraName, projectId],
  );

  // Keep a ref to the latest loras so delete callbacks never read stale state
  const lorasRef = useRef(loras);
  lorasRef.current = loras;

  // ── Mutations ─────────────────────────────────────────────────────────
  const removeLora = useCallback(
    (name: string) => {
      const current = lorasRef.current;
      const updated = current.filter((l) => l.name !== name);
      onLorasChange(updated);
      if (defaultLoraName === name) {
        onDefaultChange(updated.length > 0 ? updated[0].name : undefined);
      }
      setConfirmDelete(null);
    },
    [onLorasChange, defaultLoraName, onDefaultChange],
  );

  const updateWeight = useCallback(
    (name: string, weight: number) => {
      onLorasChange(lorasRef.current.map((l) => (l.name === name ? { ...l, defaultWeight: weight } : l)));
    },
    [onLorasChange],
  );

  const updateTriggerWords = useCallback(
    (name: string, triggerWords: string) => {
      onLorasChange(
        lorasRef.current.map((l) =>
          l.name === name ? { ...l, triggerWords: triggerWords || undefined } : l,
        ),
      );
    },
    [onLorasChange],
  );

  const renameLora = useCallback(
    (oldName: string, newName: string) => {
      if (!newName.trim() || newName === oldName) {
        setEditingName(null);
        return;
      }
      onLorasChange(lorasRef.current.map((l) => (l.name === oldName ? { ...l, name: newName.trim() } : l)));
      if (defaultLoraName === oldName) onDefaultChange(newName.trim());
      setEditingName(null);
    },
    [onLorasChange, defaultLoraName, onDefaultChange],
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Active LoRA controls ─────────────────────────────────────── */}
      {loras.length > 0 && (
        <div className="space-y-3">
          {/* Dropdown */}
          <div className="space-y-2">
            <Label className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">
              Active LoRA for Z-Image Turbo
            </Label>
            <Select
              value={defaultLoraName || 'none'}
              onValueChange={(val) => onDefaultChange(val === 'none' ? undefined : val)}
            >
              <SelectTrigger className="bg-black/40 border-neutral-800 h-11 focus:border-orange-500/50">
                <SelectValue placeholder="Select a LoRA" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-900 border-neutral-800">
                <SelectItem value="none">
                  <span className="text-neutral-500">None (No LoRA)</span>
                </SelectItem>
                {loras.map((lora) => (
                  <SelectItem key={lora.name} value={lora.name}>
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-3.5 h-3.5 text-orange-500" />
                      <span>{lora.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Strength slider */}
          {activeLora && (
            <div className="p-3 rounded-xl bg-black/20 border border-orange-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-neutral-500 uppercase font-bold">
                  LoRA Strength
                </Label>
                <span className="text-xs text-orange-400 font-mono font-bold px-2 py-0.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  {activeLora.defaultWeight.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[activeLora.defaultWeight]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={([val]) => updateWeight(activeLora.name, val)}
                className="[&_[role=slider]]:bg-orange-500"
              />
              <p className="text-[9px] text-neutral-600 italic">
                0.0 = no effect · 0.8 = recommended · 1.0 = full strength
              </p>
            </div>
          )}

          {/* Trigger words */}
          {activeLora && (
            <div className="p-3 rounded-xl bg-black/20 border border-neutral-800 space-y-2">
              <div className="flex items-center gap-2">
                <Tag className="w-3 h-3 text-neutral-500" />
                <Label className="text-[10px] text-neutral-500 uppercase font-bold">
                  Trigger Words
                </Label>
              </div>
              <Input
                value={activeLora.triggerWords || ''}
                onChange={(e) => updateTriggerWords(activeLora.name, e.target.value)}
                placeholder="e.g. arcane style, arcanestyle"
                className="bg-black/40 border-neutral-800 h-9 text-sm focus:border-orange-500/50"
              />
              <p className="text-[9px] text-neutral-600 italic">
                Some LoRAs require specific trigger words to activate. These will be prepended to every image prompt.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Uploaded LoRAs library ───────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">
          Uploaded LoRAs ({loras.length})
        </Label>
        {loras.length > 0 ? (
          <div className="space-y-1.5">
            {loras.map((lora) => (
              <div
                key={lora.name}
                className={`
                  flex items-center justify-between p-2.5 rounded-lg transition-colors
                  ${defaultLoraName === lora.name
                    ? 'bg-orange-500/10 border border-orange-500/30'
                    : 'bg-black/20 border border-neutral-800/50 hover:border-neutral-700'}
                `}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <FileCheck className={`w-4 h-4 flex-shrink-0 ${
                    defaultLoraName === lora.name ? 'text-orange-500' : 'text-neutral-600'
                  }`} />
                  <div className="min-w-0 flex-1">
                    {editingName === lora.name ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => renameLora(lora.name, renameValue)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renameLora(lora.name, renameValue);
                          if (e.key === 'Escape') setEditingName(null);
                        }}
                        autoFocus
                        className="bg-black/60 border border-orange-500/50 rounded px-2 py-0.5 text-xs font-medium text-neutral-200 w-full outline-none focus:border-orange-500"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 group/name">
                        <span className="text-xs font-medium text-neutral-300 truncate">
                          {lora.name}
                        </span>
                        {lora.triggerWords && (
                          <span className="text-[9px] text-neutral-600 truncate max-w-[100px]" title={lora.triggerWords}>
                            ({lora.triggerWords})
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingName(lora.name);
                            setRenameValue(lora.name);
                          }}
                          className="opacity-0 group-hover/name:opacity-100 transition-opacity text-neutral-600 hover:text-orange-400"
                          title="Rename"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Delete */}
                {confirmDelete === lora.name ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => removeLora(lora.name)}
                    >
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-neutral-500 hover:text-white"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-neutral-600 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"
                    onClick={() => setConfirmDelete(lora.name)}
                    title="Delete LoRA"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-black/20 border border-neutral-800/50">
            <p className="text-[11px] text-neutral-500 italic text-center">
              No LoRAs uploaded yet.
            </p>
          </div>
        )}
      </div>

      {/* ── Upload area ──────────────────────────────────────────────── */}
      {loras.length > 0 && !showUploader && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full h-9 border-dashed border-neutral-700 text-neutral-500 hover:text-orange-400 hover:border-orange-500/30 text-xs"
          onClick={() => setShowUploader(true)}
        >
          <Upload className="w-3.5 h-3.5 mr-2" />
          Upload Another LoRA
        </Button>
      )}

      {(loras.length === 0 || showUploader) && (
        <>
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
              <div className="flex flex-col items-center gap-3 w-full">
                <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                <p className="text-sm text-neutral-400">Uploading LoRA… {uploadProgress}%</p>
                <div className="w-full max-w-xs h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-neutral-500" />
                <p className="text-sm text-neutral-400">
                  Drop a <span className="text-orange-400 font-medium">.safetensors</span> file here or click to upload
                </p>
                <p className="text-[10px] text-neutral-600">Max 500MB · For Z-Image Turbo only</p>
              </div>
            )}
          </div>

          {showUploader && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-[10px] text-neutral-500 hover:text-white"
              onClick={() => setShowUploader(false)}
            >
              Cancel
            </Button>
          )}
        </>
      )}

      {/* Error */}
      {uploadError && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {uploadError}
        </div>
      )}
    </div>
  );
}
