
export interface StockMediaMetadata {
  title: string;
  description: string;
  tags: string[];
  width?: number;
  height?: number;
  duration?: number;
  license?: string;
  author?: string;
  thumbnailUrl?: string; // Optional public thumbnail URL from source
}

export interface StockMediaRecord {
  id: string;
  source: 'wikimedia' | 'youtube' | 'other';
  external_id?: string;
  r2_key: string;
  metadata: StockMediaMetadata;
  similarity?: number;
}
