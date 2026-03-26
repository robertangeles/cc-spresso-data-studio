export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
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
}
export interface TokenPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
}
//# sourceMappingURL=user.types.d.ts.map
