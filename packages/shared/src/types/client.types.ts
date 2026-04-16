export interface Client {
  id: string;
  organisationId: string;
  name: string;
  industry: string | null;
  website: string | null;
  logoUrl: string | null;
  companySize: string | null;
  abnTaxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientContactRecord {
  id: string;
  clientId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface ClientContract {
  id: string;
  clientId: string;
  name: string;
  contractType: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  billingRate: string | null;
  billingCurrency: string;
  slaTerms: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientWithDetails extends Client {
  contacts: ClientContactRecord[];
  contracts: ClientContract[];
  projectCount?: number;
}

// DTO types

export interface CreateClientDTO {
  name: string;
  industry?: string;
  website?: string;
  logoUrl?: string;
  companySize?: string;
  abnTaxId?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
}

export interface UpdateClientDTO {
  name?: string;
  industry?: string;
  website?: string;
  logoUrl?: string;
  companySize?: string;
  abnTaxId?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
}

export interface CreateClientContactDTO {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary?: boolean;
}

export interface UpdateClientContactDTO {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary?: boolean;
}

export interface CreateClientContractDTO {
  name: string;
  contractType?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  billingRate?: number;
  billingCurrency?: string;
  slaTerms?: string;
  notes?: string;
}

export interface UpdateClientContractDTO {
  name?: string;
  contractType?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  billingRate?: number;
  billingCurrency?: string;
  slaTerms?: string;
  notes?: string;
}
