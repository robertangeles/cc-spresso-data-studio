export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface CreateRoleDTO {
  name: string;
  description?: string;
  permissions?: string[];
}
export interface UpdateRoleDTO {
  name?: string;
  description?: string;
  permissions?: string[];
}
//# sourceMappingURL=role.types.d.ts.map
