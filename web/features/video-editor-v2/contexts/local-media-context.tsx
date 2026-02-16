import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
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
  loadMore: () => Promise<void>;
  isLoading: boolean;
  uploadProgress: UploadProgress | null;
  hasMore: boolean;
  totalCount: number;
}

const LocalMediaContext = createContext<LocalMediaContextType | undefined>(
  undefined
);

const PAGE_SIZE = 50;

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
 * Supports pagination for large media libraries.
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
  const [totalCount, setTotalCount] = useState(0);
  const currentOffsetRef = useRef(0);
  
  const { user } = useAuth();

  const hasMore = localMediaFiles.length < totalCount;

  // Load media files from Supabase on mount (first page)
  const loadMediaFiles = useCallback(async (reset = true) => {
    if (!user?.id) {
      console.log('[LocalMedia] No authenticated user, skipping media load');
      // Avoid creating new empty array refs if already empty
      setLocalMediaFiles(prev => prev.length === 0 ? prev : []);
      setTotalCount(prev => prev === 0 ? prev : 0);
      return;
    }

    try {
      setIsLoading(true);
      const offset = reset ? 0 : currentOffsetRef.current;
      console.log('[LocalMedia] Loading media from S3/Supabase for project:', projectId || 'all', 'offset:', offset);
      
      const { media, total } = await getMedia(projectId, { limit: PAGE_SIZE, offset });
      const files = media.map(toLocalMediaFile);
      
      console.log(`[LocalMedia] Loaded ${files.length} media files (total: ${total})`);
      
      if (reset) {
        setLocalMediaFiles(files);
        currentOffsetRef.current = PAGE_SIZE;
      } else {
        setLocalMediaFiles((prev) => [...prev, ...files]);
        currentOffsetRef.current += PAGE_SIZE;
      }
      setTotalCount(total);
    } catch (error) {
      console.error("[LocalMedia] Error loading media files:", error);
      if (reset) {
        setLocalMediaFiles(prev => prev.length === 0 ? prev : []);
        setTotalCount(prev => prev === 0 ? prev : 0);
      }
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
   * Refresh media from server (resets to first page)
   */
  const refreshMedia = useCallback(async (): Promise<void> => {
    await loadMediaFiles(true);
  }, [loadMediaFiles]);

  /**
   * Load more media (next page)
   */
  const loadMore = useCallback(async (): Promise<void> => {
    if (!hasMore || isLoading) return;
    await loadMediaFiles(false);
  }, [loadMediaFiles, hasMore, isLoading]);

  const value = useMemo(() => ({
    localMediaFiles,
    addMediaFile,
    removeMediaFile,
    clearMediaFiles,
    refreshMedia,
    loadMore,
    isLoading,
    uploadProgress,
    hasMore,
    totalCount,
  }), [localMediaFiles, addMediaFile, removeMediaFile, clearMediaFiles, refreshMedia, loadMore, isLoading, uploadProgress, hasMore, totalCount]);

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
