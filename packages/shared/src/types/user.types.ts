export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  subscriptionTier: string;
  isEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDTO {
  email: string;
  password: string;
  name: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: Omit<User, 'createdAt' | 'updatedAt'>;
  accessToken: string;
  pendingPlanId?: string | null;
}

export interface TokenPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  subscriptionTier: string;
  isEmailVerified: boolean;
}

export interface SessionStatus {
  unlimited: boolean;
  used: number;
  limit: number;
  remaining: number;
}
