/**
 * Media Storage Service
 * 
 * Handles media upload to S3 via presigned URLs and metadata storage in Supabase.
 * This replaces the local IndexedDB storage with cloud-based storage for cross-device sync.
 */

import { apiRequest } from '@/lib/api-client';

export interface MediaFile {
  id: string;
  userId: string;
  projectId: string | null;
  s3Key: string;
  s3Url: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  size: number;
  duration: number | null;
  thumbnail: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

/**
 * Get a presigned URL for uploading a file to S3
 */
export async function getUploadUrl(
  filename: string,
  contentType: string,
  size: number,
  projectId?: string
): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  const response = await apiRequest<{ success: boolean; error?: string; uploadUrl: string; key: string; publicUrl: string }>(
    '/api/video-editor/media/upload-url',
    {
      method: 'POST',
      body: {
        filename,
        contentType,
        size,
        projectId: projectId || null,
      },
    }
  );

  if (!response.success) {
    throw new Error(response.error || 'Failed to get upload URL');
  }

  return {
    uploadUrl: response.uploadUrl,
    key: response.key,
    publicUrl: response.publicUrl,
  };
}

/**
 * Upload a file directly to S3 using a presigned URL
 */
export async function uploadToS3(
  file: File,
  uploadUrl: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 100),
        });
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

/**
 * Register an uploaded file in the database
 */
export async function registerMedia(data: {
  id?: string;
  projectId?: string;
  s3Key: string;
  s3Url: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  size: number;
  duration?: number;
  thumbnail?: string;
  width?: number;
  height?: number;
}): Promise<MediaFile> {
  const response = await apiRequest<{ success: boolean; error?: string; media: MediaFile }>(
    '/api/video-editor/media/register',
    {
      method: 'POST',
      body: data,
    }
  );

  if (!response.success) {
    throw new Error(response.error || 'Failed to register media');
  }

  return response.media;
}

/**
 * Get all media files for the current user
 */
export async function getMedia(projectId?: string): Promise<MediaFile[]> {
  const url = projectId 
    ? `/api/video-editor/media?projectId=${projectId}`
    : '/api/video-editor/media';
    
  const response = await apiRequest<{ success: boolean; error?: string; media: MediaFile[] }>(url);

  if (!response.success) {
    throw new Error(response.error || 'Failed to get media');
  }

  return response.media || [];
}

/**
 * Delete a media file
 */
export async function deleteMedia(mediaId: string): Promise<void> {
  const response = await apiRequest<{ success: boolean; error?: string }>(
    `/api/video-editor/media/${mediaId}`,
    { method: 'DELETE' }
  );

  if (!response.success) {
    throw new Error(response.error || 'Failed to delete media');
  }
}

/**
 * Upload a thumbnail (base64) directly
 */
export async function uploadThumbnail(
  base64: string,
  projectId?: string,
  filename?: string
): Promise<{ url: string; key: string }> {
  const response = await apiRequest<{ success: boolean; error?: string; url: string; key: string }>(
    '/api/video-editor/media/upload-thumbnail',
    {
      method: 'POST',
      body: {
        base64,
        projectId: projectId || null,
        filename: filename || 'thumbnail',
      },
    }
  );

  if (!response.success) {
    throw new Error(response.error || 'Failed to upload thumbnail');
  }

  return {
    url: response.url,
    key: response.key,
  };
}

/**
 * Generate a video thumbnail from a file
 * Uses "cover" style cropping - centers and crops without stretching
 */
export function generateVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const timeoutId = setTimeout(() => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Thumbnail generation timed out'));
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(video.src);
    };

    const captureFrame = () => {
      try {
        const canvas = document.createElement('canvas');
        const targetWidth = 320;
        const targetHeight = 180;
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          cleanup();
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // "Cover" style: crop and center, no stretching
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const targetRatio = targetWidth / targetHeight; // 16:9 = 1.78
        const videoRatio = vw / vh;

        let sx = 0, sy = 0, sw = vw, sh = vh;

        if (videoRatio > targetRatio) {
          // Video is wider than target - crop sides
          sw = vh * targetRatio;
          sx = (vw - sw) / 2;
        } else {
          // Video is taller than target - crop top/bottom
          sh = vw / targetRatio;
          sy = (vh - sh) / 2;
        }

        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
        
        const thumbnail = canvas.toDataURL('image/jpeg', 0.85);
        cleanup();
        resolve(thumbnail);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    video.onloadedmetadata = () => {
      // Seek to 1 second or middle of video
      video.currentTime = Math.min(1, video.duration / 2);
    };

    video.onseeked = captureFrame;

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to load video for thumbnail'));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Generate an image thumbnail from a file
 */
export function generateImageThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        resolve(result);
      } else {
        reject(new Error('Failed to read image'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Get video duration from a file
 */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    const timeoutId = setTimeout(() => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Duration detection timed out'));
    }, 10000);

    video.onloadedmetadata = () => {
      clearTimeout(timeoutId);
      const duration = video.duration;
      URL.revokeObjectURL(video.src);
      resolve(duration);
    };

    video.onerror = () => {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Get audio duration from a file
 */
export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    const timeoutId = setTimeout(() => {
      URL.revokeObjectURL(audio.src);
      reject(new Error('Duration detection timed out'));
    }, 10000);

    audio.onloadedmetadata = () => {
      clearTimeout(timeoutId);
      const duration = audio.duration;
      URL.revokeObjectURL(audio.src);
      resolve(duration);
    };

    audio.onerror = () => {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(audio.src);
      reject(new Error('Failed to load audio'));
    };

    audio.src = URL.createObjectURL(file);
  });
}

/**
 * Full upload flow: get URL, upload to S3, register in database
 */
export async function uploadMediaFile(
  file: File,
  projectId?: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<MediaFile> {
  // Determine file type
  let type: 'video' | 'image' | 'audio';
  if (file.type.startsWith('video/')) {
    type = 'video';
  } else if (file.type.startsWith('image/')) {
    type = 'image';
  } else if (file.type.startsWith('audio/')) {
    type = 'audio';
  } else {
    throw new Error('Unsupported file type');
  }

  // Generate thumbnail and get duration
  let thumbnail: string | undefined;
  let duration: number | undefined;
  let width: number | undefined;
  let height: number | undefined;

  try {
    if (type === 'video') {
      [thumbnail, duration] = await Promise.all([
        generateVideoThumbnail(file).catch(() => undefined),
        getVideoDuration(file).catch(() => undefined),
      ]);
    } else if (type === 'image') {
      thumbnail = await generateImageThumbnail(file).catch(() => undefined);
    } else if (type === 'audio') {
      duration = await getAudioDuration(file).catch(() => undefined);
    }
  } catch (error) {
    console.warn('Failed to generate metadata:', error);
  }

  // Get presigned upload URL
  const { uploadUrl, key, publicUrl } = await getUploadUrl(
    file.name,
    file.type,
    file.size,
    projectId
  );

  // Upload to S3
  await uploadToS3(file, uploadUrl, onProgress);

  // Upload thumbnail to S3 if we have one
  let thumbnailUrl: string | undefined;
  if (thumbnail) {
    try {
      const thumbResult = await uploadThumbnail(thumbnail, projectId, `${file.name}-thumb`);
      thumbnailUrl = thumbResult.url;
    } catch (error) {
      console.warn('Failed to upload thumbnail:', error);
      thumbnailUrl = thumbnail; // Keep as base64 fallback
    }
  }

  // Register in database
  const media = await registerMedia({
    projectId,
    s3Key: key,
    s3Url: publicUrl,
    name: file.name,
    type,
    size: file.size,
    duration,
    thumbnail: thumbnailUrl,
    width,
    height,
  });

  return media;
}
