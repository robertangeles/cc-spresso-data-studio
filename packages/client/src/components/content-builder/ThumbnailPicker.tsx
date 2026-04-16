import { useState } from 'react';
import { Check, Image } from 'lucide-react';

interface ThumbnailPickerProps {
  /** Cloudinary video URL */
  videoUrl: string;
  /** Currently selected frame offset in milliseconds */
  selectedFrameMs?: number;
  /** Callback when user selects a frame */
  onFrameSelect?: (frameMs: number) => void;
  /** Video duration in seconds */
  durationSeconds?: number;
}

/**
 * Thumbnail frame picker for TikTok cover image.
 * Uses Cloudinary video transformations to extract frames at intervals.
 * Shows a grid of 6 frame options from evenly spaced points in the video.
 */
export function ThumbnailPicker({
  videoUrl,
  selectedFrameMs = 0,
  onFrameSelect,
  durationSeconds = 30,
}: ThumbnailPickerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Generate 6 evenly-spaced frame timestamps
  const frameCount = 6;
  const interval = Math.max(1, Math.floor(durationSeconds / (frameCount + 1)));
  const frames = Array.from({ length: frameCount }, (_, i) => (i + 1) * interval);

  // Generate Cloudinary thumbnail URL for a given timestamp
  // Cloudinary format: /video/upload/so_{seconds},w_160,h_284,c_fill/video.jpg
  function getFrameUrl(timestampSeconds: number): string {
    // Parse the Cloudinary URL to insert transformation
    const match = videoUrl.match(/^(.*\/video\/upload\/)(.*)$/);
    if (!match) {
      // Fallback: just use the video URL with a poster query
      return videoUrl;
    }
    const [, base, rest] = match;
    return `${base}so_${timestampSeconds},w_160,h_284,c_fill,f_jpg/${rest.replace(/\.[^.]+$/, '.jpg')}`;
  }

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-1.5 rounded-md border border-border-default bg-surface-3 px-2 py-1 text-xs text-text-secondary
                   hover:border-cyan-400/40 hover:text-cyan-400 transition-colors cursor-pointer"
      >
        <Image className="h-3 w-3" />
        <span>Choose cover</span>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-text-tertiary font-medium">Select cover frame</p>
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="text-[10px] text-text-tertiary hover:text-text-secondary"
        >
          Done
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {frames.map((sec) => {
          const ms = sec * 1000;
          const isSelected = selectedFrameMs === ms;
          return (
            <button
              key={sec}
              type="button"
              onClick={() => onFrameSelect?.(ms)}
              className={`relative aspect-[9/16] rounded-md overflow-hidden border-2 transition-all duration-150 cursor-pointer ${
                isSelected
                  ? 'border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.3)] scale-[1.03]'
                  : 'border-transparent hover:border-border-default hover:scale-[1.02]'
              }`}
            >
              <img
                src={getFrameUrl(sec)}
                alt={`Frame at ${sec}s`}
                className="w-full h-full object-cover bg-surface-3"
                loading="lazy"
              />
              {isSelected && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-400 shadow-md">
                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                </span>
              )}
              <span className="absolute bottom-0.5 left-0.5 text-[9px] text-white bg-black/50 rounded px-1">
                {sec}s
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
