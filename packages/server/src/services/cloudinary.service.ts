import { logger } from '../config/logger.js';
import { getSetting } from './admin.service.js';

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  uploadFolder: string;
}

interface UploadResult {
  url: string;
  publicId: string;
}

/**
 * Fetch and validate Cloudinary credentials from the database.
 */
async function getCloudinaryConfig(): Promise<CloudinaryConfig> {
  const setting = await getSetting('cloudinary');
  if (!setting) throw new Error('Cloudinary not configured');

  const config = JSON.parse(setting.value) as Partial<CloudinaryConfig>;
  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    throw new Error('Cloudinary credentials incomplete');
  }

  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    uploadFolder: config.uploadFolder || 'draftpunk',
  };
}

/**
 * Generate a SHA-1 signature for authenticated Cloudinary uploads.
 */
async function generateSignature(
  params: Record<string, string>,
  apiSecret: string,
): Promise<string> {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const toSign = sorted.map(([k, v]) => `${k}=${v}`).join('&') + apiSecret;

  const encoder = new TextEncoder();
  const data = encoder.encode(toSign);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Upload an image to Cloudinary.
 *
 * @param file - base64 data URI string (e.g. "data:image/png;base64,...")
 *               or a raw base64 string
 * @param options.folder - subfolder within the configured upload folder (e.g. "content", "avatars")
 * @param options.publicId - unique identifier for the image
 * @param options.overwrite - whether to overwrite an existing image with the same publicId
 */
export async function uploadImage(
  file: string,
  options: { folder: string; publicId: string; overwrite?: boolean },
): Promise<UploadResult> {
  const config = await getCloudinaryConfig();
  const uploadUrl = `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`;
  const folder = `${config.uploadFolder}/${options.folder}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const overwrite = options.overwrite ? 'true' : 'false';

  const signature = await generateSignature(
    { folder, public_id: options.publicId, overwrite, timestamp },
    config.apiSecret,
  );

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file,
      folder,
      public_id: options.publicId,
      overwrite: options.overwrite ?? false,
      api_key: config.apiKey,
      timestamp: Number(timestamp),
      signature,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    logger.error({ status: res.status, body: errText }, 'Cloudinary upload failed');
    throw new Error(`Cloudinary upload failed: ${errText}`);
  }

  const data = (await res.json()) as { secure_url: string; public_id: string };
  logger.info({ publicId: data.public_id }, 'Image uploaded to Cloudinary');

  return { url: data.secure_url, publicId: data.public_id };
}

/**
 * Delete an image from Cloudinary by its public ID.
 */
export async function deleteImage(publicId: string): Promise<void> {
  const config = await getCloudinaryConfig();
  const timestamp = String(Math.floor(Date.now() / 1000));

  const signature = await generateSignature({ public_id: publicId, timestamp }, config.apiSecret);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/destroy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      public_id: publicId,
      api_key: config.apiKey,
      timestamp: Number(timestamp),
      signature,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    logger.error({ status: res.status, body: errText }, 'Cloudinary delete failed');
    throw new Error(`Cloudinary delete failed: ${errText}`);
  }

  const data = (await res.json()) as { result: string };
  logger.info({ publicId, result: data.result }, 'Image deleted from Cloudinary');
}

/**
 * Extract the Cloudinary public ID from a secure_url.
 * URL format: https://res.cloudinary.com/{cloud}/image/upload/v{ver}/{folder}/{publicId}.{ext}
 */
export function extractPublicId(cloudinaryUrl: string): string | null {
  const match = cloudinaryUrl.match(/\/upload\/v\d+\/(.+)\.\w+$/);
  return match ? match[1] : null;
}
