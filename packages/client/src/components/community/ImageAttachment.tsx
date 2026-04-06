import { useState, useCallback } from 'react';
import { X, Maximize2 } from 'lucide-react';

interface ImageAttachmentProps {
  url: string;
  fileName: string | null;
}

export function ImageAttachment({ url, fileName }: ImageAttachmentProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const openLightbox = useCallback(() => setLightboxOpen(true), []);
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
    },
    [closeLightbox],
  );

  return (
    <>
      <button
        type="button"
        onClick={openLightbox}
        className="group/img mt-2 block max-w-sm rounded-xl overflow-hidden transition-all duration-200 ease-spring hover:-translate-y-0.5 hover:shadow-[0_0_12px_rgba(255,214,10,0.08)] cursor-pointer relative"
      >
        <img
          src={url}
          alt={fileName || 'Image attachment'}
          className="max-h-80 w-auto object-contain transition-transform duration-200 ease-spring group-hover/img:scale-[1.02]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-all duration-200 flex items-center justify-center">
          <Maximize2 className="h-6 w-6 text-white opacity-0 group-hover/img:opacity-80 transition-opacity duration-200 drop-shadow-lg" />
        </div>
      </button>

      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-scale-in"
          onClick={closeLightbox}
          onKeyDown={handleKeyDown}
          tabIndex={-1}
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 rounded-full bg-surface-3/80 backdrop-blur-sm text-text-secondary hover:text-text-primary hover:bg-surface-3 hover:scale-110 transition-all duration-200 ease-spring"
            aria-label="Close lightbox"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={url}
            alt={fileName || 'Image attachment'}
            className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-[0_0_30px_rgba(255,214,10,0.12)] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
