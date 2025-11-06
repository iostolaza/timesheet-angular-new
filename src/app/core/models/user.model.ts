
//src/app/core/models/user.model.ts

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role?: 'Employee' | 'Manager' | 'Admin' | null;
  rate: number;
  otMultiplier?: number | null;
  taxRate?: number | null;
  createdAt: string; 
  updatedAt: string;
}