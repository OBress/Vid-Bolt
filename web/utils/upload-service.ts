/**
 * Local Upload Service
 * 
 * This simplified upload service creates local object URLs for uploaded files,
 * allowing the video editor to work without a backend upload API.
 * 
 * For production, you would replace this with proper cloud storage
 * (e.g., Supabase Storage, AWS S3, etc.)
 */

export type UploadProgressCallback = (
  uploadId: string,
  progress: number
) => void;

export type UploadStatusCallback = (
  uploadId: string,
  status: "uploaded" | "failed",
  error?: string
) => void;

export interface UploadCallbacks {
  onProgress: UploadProgressCallback;
  onStatus: UploadStatusCallback;
}

export async function processFileUpload(
  uploadId: string,
  file: File,
  callbacks: UploadCallbacks
): Promise<any> {
  try {
    // Simulate upload progress
    callbacks.onProgress(uploadId, 0);
    
    // Create a local object URL for the file
    const objectUrl = URL.createObjectURL(file);
    
    // Simulate some upload time for better UX
    await new Promise(resolve => setTimeout(resolve, 500));
    callbacks.onProgress(uploadId, 50);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    callbacks.onProgress(uploadId, 100);

    // Construct upload data
    const uploadData = {
      id: uploadId,
      fileName: file.name,
      filePath: objectUrl,
      fileSize: file.size,
      contentType: file.type,
      metadata: { uploadedUrl: objectUrl },
      url: objectUrl,
      type: file.type.split("/")[0], // 'video', 'image', or 'audio'
      file: file,
      method: "local",
      origin: "user",
      status: "uploaded",
      isPreview: false
    };

    callbacks.onStatus(uploadId, "uploaded");
    return uploadData;
  } catch (error) {
    callbacks.onStatus(uploadId, "failed", (error as Error).message);
    throw error;
  }
}

export async function processUrlUpload(
  uploadId: string,
  url: string,
  callbacks: UploadCallbacks
): Promise<any[]> {
  try {
    // Start with 10% progress
    callbacks.onProgress(uploadId, 10);
    
    // For URL uploads, we just use the URL directly
    // In a real implementation, you might want to fetch and validate the URL
    const fileName = url.split('/').pop() || 'file';
    const contentType = getContentTypeFromUrl(url);

    callbacks.onProgress(uploadId, 50);

    const uploadData = {
      id: uploadId,
      fileName: fileName,
      filePath: url,
      fileSize: 0,
      contentType: contentType,
      metadata: { uploadedUrl: url, originalUrl: url },
      url: url,
      type: contentType.split("/")[0],
      method: "url",
      origin: "user",
      status: "uploaded",
      isPreview: false
    };

    // Complete
    callbacks.onProgress(uploadId, 100);
    callbacks.onStatus(uploadId, "uploaded");
    return [uploadData];
  } catch (error) {
    callbacks.onStatus(uploadId, "failed", (error as Error).message);
    throw error;
  }
}

function getContentTypeFromUrl(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export async function processUpload(
  uploadId: string,
  upload: { file?: File; url?: string },
  callbacks: UploadCallbacks
): Promise<any> {
  if (upload.file) {
    return await processFileUpload(uploadId, upload.file, callbacks);
  }
  if (upload.url) {
    return await processUrlUpload(uploadId, upload.url, callbacks);
  }
  callbacks.onStatus(uploadId, "failed", "No file or URL provided");
  throw new Error("No file or URL provided");
}
