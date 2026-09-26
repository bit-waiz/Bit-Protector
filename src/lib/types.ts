export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type MetadataCategory = 
  | 'location' 
  | 'device' 
  | 'author' 
  | 'timestamps' 
  | 'software' 
  | 'document' 
  | 'optics'
  | 'technical';

export interface MetadataItem {
  id: string;
  category: MetadataCategory;
  name: string;
  key: string;
  value: string;
  isSensitive: boolean;
  severity: RiskLevel;
  raw?: any;
}

export interface GPSInfo {
  present: boolean;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  formattedText?: string;
  details?: string;
}

export interface InspectionResult {
  fileName: string;
  fileSize: number;
  fileType: string;
  mimeType: string;
  riskLevel: RiskLevel;
  riskReason: string;
  riskSummary: string;
  gps: GPSInfo;
  items: MetadataItem[];
  categories: {
    location: MetadataItem[];
    device: MetadataItem[];
    author: MetadataItem[];
    timestamps: MetadataItem[];
    software: MetadataItem[];
    document: MetadataItem[];
    optics: MetadataItem[];
    technical: MetadataItem[];
  };
  totalTagsFound: number;
  sensitiveTagsCount: number;
  hasThumbnail: boolean;
  hasRevisionHistory: boolean;
  hasXmpStream: boolean;
  rawReport: Record<string, any>;
  dimensions?: { width: number; height: number };
}

export interface CleaningOptions {
  stripGps: boolean;
  stripDevice: boolean;
  stripAuthor: boolean;
  stripTimestamps: boolean;
}

export interface SanitizationResult {
  cleanedBlob: Blob;
  cleanedFileName: string;
  cleanedFileSize: number;
  bytesReduced: number;
  originalInspection: InspectionResult;
  afterInspection: InspectionResult;
  wipedTags: string[];
  remainingTags: string[];
  durationMs: number;
}
