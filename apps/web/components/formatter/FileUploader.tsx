'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Upload, ChevronDown, ChevronUp, FileImage, Loader2, Plus, X, Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type FileAddAction = 'append' | 'replace' | 'cancel';

interface FileUploaderProps {
  onFileProcess: (files: File[], customInstructions: string) => Promise<void>;
  isLoading: boolean;
  customPrompt: string;
  onCustomPromptChange: (value: string) => void;
  onBeforeFileAdd?: () => Promise<FileAddAction> | FileAddAction;
  onClearAll?: () => void;
}

interface ExamplePrompt {
  title: string;
  prompt: string;
}

const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    title: 'Date format',
    prompt: 'Dates are in DD/MM/YYYY format',
  },
  {
    title: 'Filter reversals',
    prompt: "Ignore transactions marked as 'REVERSAL'",
  },
  {
    title: 'Statement year',
    prompt: 'If December appears, assume it belongs to last calendar year',
  },
];

export function FileUploader({ onFileProcess, isLoading, customPrompt, onCustomPromptChange, onBeforeFileAdd, onClearAll }: FileUploaderProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showCustom, setShowCustom] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string } | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (previewFile?.url) {
        URL.revokeObjectURL(previewFile.url);
      }
    };
  }, [previewFile]);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    let mode: FileAddAction = 'append';
    if (onBeforeFileAdd) {
      mode = await onBeforeFileAdd();
    }

    if (mode === 'cancel') {
      return;
    }

    setSelectedFiles((prev) => {
      const base = mode === 'replace' ? [] : prev;
      const existing = new Set(base.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const nextFiles = files.filter((file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (existing.has(key)) {
          return false;
        }
        existing.add(key);
        return true;
      });
      return [...base, ...nextFiles];
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    await handleFiles(files);
    event.target.value = '';
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files || []);
    await handleFiles(files);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleClear = () => {
    setSelectedFiles([]);
    onClearAll?.();
  };

  const openPreview = (file: File) => {
    if (previewFile?.url) {
      URL.revokeObjectURL(previewFile.url);
    }
    const url = URL.createObjectURL(file);
    setPreviewFile({ name: file.name, url });
    setIsPreviewOpen(true);
  };

  const closePreview = () => {
    if (previewFile?.url) {
      URL.revokeObjectURL(previewFile.url);
    }
    setPreviewFile(null);
    setIsPreviewOpen(false);
  };

  const handleProcess = async () => {
    if (selectedFiles.length === 0 || isLoading) {
      return;
    }
    await onFileProcess(selectedFiles, customPrompt);
  };

  const totalSize = selectedFiles.reduce((acc, file) => acc + file.size, 0);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const addExamplePrompt = (prompt: string) => {
    if (!prompt) return;
    if (!customPrompt) {
      onCustomPromptChange(prompt);
      return;
    }
    if (customPrompt.includes(prompt)) {
      return;
    }
    onCustomPromptChange(`${customPrompt.trim()}${customPrompt.endsWith('.') ? '' : '.'} ${prompt}`.trim());
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'relative rounded-lg border-2 border-dashed transition-colors bg-card',
          isDragging ? 'border-primary/70 bg-primary/5' : 'border-muted-foreground/30',
          isLoading && 'opacity-70 cursor-not-allowed'
        )}
        onDragOver={(event) => {
          if (isLoading) return;
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (isLoading) return;
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={async (event) => {
          if (isLoading) {
            return;
          }
          await handleDrop(event);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.png,.jpg,.jpeg,.webp"
          className="hidden"
          multiple
          onChange={async (event) => {
            if (isLoading) {
              event.target.value = '';
              return;
            }
            await handleFileSelect(event);
          }}
          disabled={isLoading}
        />
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <Upload className="h-12 w-12 text-muted-foreground mb-4" />
          {selectedFiles.length === 0 ? (
            <>
              <h3 className="text-lg font-semibold mb-2">Drop your statements here</h3>
              <p className="text-sm text-muted-foreground mb-4">
                or{' '}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => fileInputRef.current?.click()}
                >
                  browse files
                </button>
              </p>
              <p className="text-xs text-muted-foreground">PNG, JPG, JPEG or WebP images</p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold mb-2">
                {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} selected
              </h3>
              <p className="text-sm text-muted-foreground mb-4">Total size: {formatBytes(totalSize)}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                  disabled={isLoading}
                >
                  + Add more
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  type="button"
                >
                  {isLoading ? 'Clear all and cancel' : 'Clear all'}
                </Button>
                <Button onClick={handleProcess} disabled={isLoading} type="button">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Process files'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {selectedFiles.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-3 px-4 py-3">
              <FileImage className="h-5 w-5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)} · {file.type || 'unknown type'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => openPreview(file)}
                  aria-label={`Preview ${file.name}`}
                  className="h-8 w-8"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <button type="button" onClick={() => removeFile(index)} aria-label={`Remove ${file.name}`}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border rounded-lg bg-card">
        <button
          type="button"
          className="flex w-full items-center justify-between p-3 hover:bg-accent/30"
          onClick={() => setShowCustom((prev) => !prev)}
        >
          <div>
            <p className="text-sm font-medium">Custom instructions</p>
            <p className="text-xs text-muted-foreground">Fine-tune extraction for bank quirks</p>
          </div>
          {showCustom ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showCustom && (
          <div className="p-3 pt-0 space-y-3">
            <Textarea
              value={customPrompt}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onCustomPromptChange(event.target.value)}
              placeholder="E.g. Dates are DD/MM, ignore records marked REVERSAL, show FX currency in memo"
              className="min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground">
              Additional instructions save automatically in local storage and stay here for your next round.
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <Badge
                  key={prompt.title}
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => addExamplePrompt(prompt.prompt)}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {prompt.title}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
      <Dialog open={isPreviewOpen && !!previewFile} onOpenChange={(open) => {
        if (!open) {
          closePreview();
        } else if (previewFile) {
          setIsPreviewOpen(true);
        }
      }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
            <DialogDescription>Uploaded statement preview</DialogDescription>
          </DialogHeader>
          {previewFile && (
            <div className="mt-4">
              <img src={previewFile.url} alt={previewFile.name} className="w-full rounded border" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
