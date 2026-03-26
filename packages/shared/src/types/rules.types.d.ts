export interface UserRule {
  id: string;
  userId: string;
  name: string;
  rules: string;
  isActive: boolean;
  category: 'writing' | 'formatting' | 'brand' | 'custom';
  createdAt: Date;
  updatedAt: Date;
}
export interface CreateRuleDTO {
  name: string;
  rules: string;
  category: 'writing' | 'formatting' | 'brand' | 'custom';
}
export interface UpdateRuleDTO {
  name?: string;
  rules?: string;
  isActive?: boolean;
  category?: 'writing' | 'formatting' | 'brand' | 'custom';
}
export interface UserProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  brandName: string | null;
  brandVoice: string | null;
  targetAudience: string | null;
  keyMessaging: string | null;
  defaultModel: string | null;
  defaultEditorModel: string | null;
  defaultEditorMaxRounds: number;
  defaultEditorApprovalMode: 'auto' | 'manual';
  timezone: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface UpdateProfileDTO {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  brandName?: string;
  brandVoice?: string;
  targetAudience?: string;
  keyMessaging?: string;
  defaultModel?: string;
  defaultEditorModel?: string;
  defaultEditorMaxRounds?: number;
  defaultEditorApprovalMode?: 'auto' | 'manual';
  timezone?: string;
}
//# sourceMappingURL=rules.types.d.ts.map
