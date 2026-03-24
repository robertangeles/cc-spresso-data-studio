import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Camera } from 'lucide-react';
import { Modal } from './Modal';

interface AvatarUploadProps {
  currentUrl?: string | null;
  initials: string;
  onUpload: (file: Blob) => Promise<void>;
}

export function AvatarUpload({ currentUrl, initials, onUpload }: AvatarUploadProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setShowCropper(true);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (!imageSrc || !croppedArea) return;
    setIsUploading(true);

    try {
      const croppedBlob = await getCroppedImage(imageSrc, croppedArea);
      await onUpload(croppedBlob);
      setShowCropper(false);
      setImageSrc(null);
    } catch {
      // Error handled by parent
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      {/* Avatar display */}
      <div className="relative inline-block">
        {currentUrl ? (
          <img src={currentUrl} alt="Avatar" className="h-20 w-20 rounded-full object-cover border-2 border-gray-200" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700 border-2 border-gray-200">
            {initials}
          </div>
        )}
        <label className="absolute bottom-0 right-0 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 transition-colors shadow-sm">
          <Camera className="h-3.5 w-3.5" />
          <input type="file" accept="image/*" onChange={onFileSelect} className="hidden" />
        </label>
      </div>

      {/* Crop modal */}
      <Modal
        isOpen={showCropper}
        onClose={() => { setShowCropper(false); setImageSrc(null); }}
        title="Crop Photo"
        confirmLabel={isUploading ? 'Uploading...' : 'Save'}
        onConfirm={handleSave}
        isLoading={isUploading}
      >
        <div className="relative h-64 w-full bg-gray-900 rounded-lg overflow-hidden">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-gray-500">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="flex-1"
          />
        </div>
      </Modal>
    </div>
  );
}

// Utility: crop image and return blob
async function getCroppedImage(imageSrc: string, cropArea: Area): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Output 256x256
  const size = 256;
  canvas.width = size;
  canvas.height = size;

  ctx.drawImage(
    image,
    cropArea.x, cropArea.y, cropArea.width, cropArea.height,
    0, 0, size, size,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to crop image'));
    }, 'image/jpeg', 0.9);
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}
