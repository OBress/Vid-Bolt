import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { LocalMediaFile } from "../types";
import { useAuth } from "@/hooks/use-auth";
import {
  uploadMediaFile as uploadToS3,
  getMedia,
  deleteMedia,
  MediaFile,
  UploadProgress,
} from "../services/media-storage-service";

interface LocalMediaContextType {
  localMediaFiles: LocalMediaFile[];
  addMediaFile: (file: File, onProgress?: (progress: UploadProgress) => void) => Promise<LocalMediaFile | void>;
  removeMediaFile: (id: string) => Promise<void>;
  clearMediaFiles: () => Promise<void>;
  refreshMedia: () => Promise<void>;
  isLoading: boolean;
  uploadProgress: UploadProgress | null;
}

const LocalMediaContext = createContext<LocalMediaContextType | undefined>(
  undefined
);

/**
 * Convert S3 MediaFile to LocalMediaFile format
 */
function toLocalMediaFile(media: MediaFile): LocalMediaFile {
  return {
    id: media.id,
    name: media.name,
    type: media.type,
    path: media.s3Url, // Use public S3 URL
    size: media.size,
    lastModified: new Date(media.createdAt).getTime(),
    thumbnail: media.thumbnail || "",
    duration: media.duration || 0,
    // Additional fields from S3
    s3Key: media.s3Key,
    width: media.width || undefined,
    height: media.height || undefined,
  };
}

/**
 * LocalMediaProvider Component
 *
 * Provides context for managing media files stored in S3.
 * All media is stored in S3 with metadata in Supabase for cross-device sync.
 */
export const LocalMediaProvider: React.FC<{ 
  children: React.ReactNode;
  projectId?: string;
}> = ({
  children,
  projectId,
}) => {
  const [localMediaFiles, setLocalMediaFiles] = useState<LocalMediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  
  const { user } = useAuth();

  // Load media files from Supabase on mount
  const loadMediaFiles = useCallback(async () => {
    if (!user?.id) {
      console.log('[LocalMedia] No authenticated user, skipping media load');
      setLocalMediaFiles([]);
      return;
    }

    try {
      setIsLoading(true);
      console.log('[LocalMedia] Loading media from S3/Supabase for project:', projectId || 'all');
      
      const mediaFiles = await getMedia(projectId);
      const files = mediaFiles.map(toLocalMediaFile);
      
      console.log(`[LocalMedia] Loaded ${files.length} media files`);
      setLocalMediaFiles(files);
    } catch (error) {
      console.error("[LocalMedia] Error loading media files:", error);
      // Don't throw - just set empty array
      setLocalMediaFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, projectId]);

  useEffect(() => {
    loadMediaFiles();
  }, [loadMediaFiles]);

  /**
   * Add a new media file to S3
   */
  const addMediaFile = useCallback(
    async (file: File, onProgress?: (progress: UploadProgress) => void): Promise<LocalMediaFile | void> => {
      if (!user?.id) {
        throw new Error("Must be authenticated to upload media");
      }

      setIsLoading(true);
      setUploadProgress({ loaded: 0, total: file.size, percentage: 0 });

      try {
        console.log(`[LocalMedia] Uploading ${file.name} to S3...`);
        
        // Upload to S3 and register in Supabase
        const media = await uploadToS3(file, projectId, (progress) => {
          setUploadProgress(progress);
          onProgress?.(progress);
        });

        const newMediaFile = toLocalMediaFile(media);
        console.log(`[LocalMedia] Upload complete: ${media.id} -> ${media.s3Url}`);

        // Update state with the new media file
        setLocalMediaFiles((prev) => {
          const exists = prev.some((item) => item.id === newMediaFile.id);
          if (exists) {
            return prev.map((item) =>
              item.id === newMediaFile.id ? newMediaFile : item
            );
          }
          return [...prev, newMediaFile];
        });

        return newMediaFile;
      } catch (error) {
        console.error("[LocalMedia] Error uploading media:", error);
        throw error;
      } finally {
        setIsLoading(false);
        setUploadProgress(null);
      }
    },
    [user?.id, projectId]
  );

  /**
   * Remove a media file
   */
  const removeMediaFile = useCallback(
    async (id: string): Promise<void> => {
      try {
        console.log(`[LocalMedia] Deleting media: ${id}`);
        
        // Delete from S3 and Supabase
        await deleteMedia(id);

        // Update state
        setLocalMediaFiles((prev) => prev.filter((file) => file.id !== id));
        
        console.log(`[LocalMedia] Media deleted: ${id}`);
      } catch (error) {
        console.error("[LocalMedia] Error removing media file:", error);
        throw error;
      }
    },
    []
  );

  /**
   * Clear all media files (for current project)
   */
  const clearMediaFiles = useCallback(async (): Promise<void> => {
    try {
      console.log('[LocalMedia] Clearing all media files...');
      
      // Delete each file
      for (const file of localMediaFiles) {
        try {
          await deleteMedia(file.id);
        } catch (error) {
          console.warn(`[LocalMedia] Failed to delete ${file.id}:`, error);
        }
      }

      setLocalMediaFiles([]);
      console.log('[LocalMedia] All media cleared');
    } catch (error) {
      console.error("[LocalMedia] Error clearing media files:", error);
    }
  }, [localMediaFiles]);

  /**
   * Refresh media from server
   */
  const refreshMedia = useCallback(async (): Promise<void> => {
    await loadMediaFiles();
  }, [loadMediaFiles]);

  const value = {
    localMediaFiles,
    addMediaFile,
    removeMediaFile,
    clearMediaFiles,
    refreshMedia,
    isLoading,
    uploadProgress,
  };

  return (
    <LocalMediaContext.Provider value={value}>
      {children}
    </LocalMediaContext.Provider>
  );
};

/**
 * Hook to use the local media context
 */
export const useLocalMedia = () => {
  const context = useContext(LocalMediaContext);
  if (context === undefined) {
    throw new Error("useLocalMedia must be used within a LocalMediaProvider");
  }
  return context;
};
