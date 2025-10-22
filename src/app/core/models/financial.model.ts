// file: src/app/core/models/financial.model.ts
export interface User {
  id: string;
  email: string;
  name: string;
  role?: 'Employee' | 'Manager' | 'Admin' | null;
  rate: number;
  groups?: string[] | null;
}

export interface Account {
  id: string;
  accountNumber: string;
  name: string;
  details: string | null; // Aligned with AccountModel
  balance: number;
  startingBalance: number | null; // Aligned with AccountModel
  endingBalance: number | null; // Aligned with AccountModel
  date: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense' | null; // Aligned with AccountModel
  chargeCodes: Array<{
    name: string;
    cognitoGroup: string;
    createdBy: string;
    date: string;
  }>;
}

export interface Transaction {
  id: string;
  accountId: string;
  fromAccountId?: string;
  fromName?: string;
  amount: number;
  debit: boolean;
  date: string;
  description: string;
  runningBalance: number;
}

// Schema models for type safety
export interface AccountModel {
  id: string;
  accountNumber: string;
  name: string;
  details: string | null;
  balance: number;
  startingBalance: number | null;
  endingBalance: number | null;
  date: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense' | null;
  chargeCodesJson: string | null;
}

export interface TransactionModel {
  id: string;
  accountId: string;
  fromAccountId: string | null;
  fromName: string | null;
  amount: number;
  debit: boolean;
  date: string;
  description: string;
  runningBalance: number;
}