"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { getAgentEmoji } from "@/lib/utils";

interface PreviewDialogProps {
  previewImage: { mime_type: string; base64_data: string } | null;
  onClose: () => void;
}

export function PreviewDialog({ previewImage, onClose }: PreviewDialogProps) {
  return (
    <Dialog open={!!previewImage} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl glass-surface glass-noise">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
        </DialogHeader>
        {previewImage ? (
          <div className="flex items-center justify-center">
            <Image
              src={`data:${previewImage.mime_type};base64,${previewImage.base64_data}`}
              alt=""
              width={1200}
              height={800}
              unoptimized
              className="max-h-[70vh] h-auto w-auto rounded-lg"
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface AvatarPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avatarPickerTarget: { kind: "agent" | "group"; id: string } | null;
  avatarUrlMap: Record<string, string>;
  avatarCandidates: Array<{ seed: string; url: string }>;
  titleDisplay: string;
  onRandomize: () => Promise<void>;
  onSelectAvatar: (seed: string) => Promise<void>;
}

export function AvatarPickerDialog({
  open,
  onOpenChange,
  avatarPickerTarget,
  avatarUrlMap,
  avatarCandidates,
  titleDisplay,
  onRandomize,
  onSelectAvatar,
}: AvatarPickerDialogProps) {
  if (!avatarPickerTarget) return null;

  const key = `${avatarPickerTarget.kind}:${avatarPickerTarget.id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg glass-surface glass-noise">
        <DialogHeader>
          <DialogTitle>Avatar</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-muted overflow-hidden">
              {avatarUrlMap[key] ? (
                <Image
                  src={avatarUrlMap[key]}
                  alt=""
                  width={56}
                  height={56}
                  unoptimized
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xl">
                  {avatarPickerTarget.kind === "group" ? "👥" : getAgentEmoji(avatarPickerTarget.id)}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{titleDisplay}</p>
              <p className="text-xs text-muted-foreground truncate">Click a thumb to apply</p>
            </div>
            <Button variant="outline" size="sm" onClick={onRandomize}>
              Random
            </Button>
          </div>

          <div className="max-h-52 overflow-y-auto pr-1">
            <div className="grid grid-cols-5 gap-2">
              {avatarCandidates.map((c) => (
                <button
                  key={c.seed}
                  type="button"
                  className="h-12 w-12 rounded-full bg-muted overflow-hidden hover:ring-2 hover:ring-ring/40"
                  onClick={() => onSelectAvatar(c.seed)}
                  title="Apply"
                >
                  {c.url ? (
                    <Image
                      src={c.url}
                      alt=""
                      width={48}
                      height={48}
                      unoptimized
                      className="h-full w-full"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
