export type LeadStatus = 'new' | 'contacted' | 'replied' | 'converted' | 'discarded';
export type LeadSource = 'followers_list' | 'post_comments' | 'manual';

export interface Lead {
  id: string;
  username: string;
  fullName?: string;
  bio?: string;
  profilePicUrl?: string;
  followerCount?: number;
  isBusiness?: boolean;
  sourceType: LeadSource;
  sourceRef: string;
  capturedAt: number;
  status: LeadStatus;
  score?: number;
  scoreReason?: string;
  tags: string[];
  notes: string;
}

export interface Template {
  id: string;
  name: string;
  body: string;
}

export interface Settings {
  groqApiKey?: string;
  groqModel: string;
  icpKeywords: string;
  dailyContactSoftLimit: number;
}

export interface DailyStats {
  date: string;
  contactedCount: number;
}

export const DEFAULT_SETTINGS: Settings = {
  groqApiKey: undefined,
  groqModel: 'llama-3.1-8b-instant',
  icpKeywords: '',
  dailyContactSoftLimit: 15,
};

export interface CapturedProfile {
  username: string;
  fullName?: string;
  bio?: string;
  profilePicUrl?: string;
  followerCount?: number;
  isBusiness?: boolean;
}
