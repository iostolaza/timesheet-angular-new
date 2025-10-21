// file: src/app/core/models/financial.model.ts
export interface Account {
  id: string;
  accountNumber: string;
  name: string;
  details?: string;
  balance: number;
  startingBalance: number;
  endingBalance?: number;
  date: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  chargeCodes: { name: string; cognitoGroup?: string; createdBy?: string; date?: string }[];
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

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'Employee' | 'Manager' | 'Admin';
  rate: number;
  groups?: string[];
}

export interface AccountModel {
  id: string;
  accountNumber: string;
  name: string;
  details?: string | null;
  balance: number;
  startingBalance?: number | null;
  endingBalance?: number | null;
  date: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  chargeCodesJson?: string | null;
}

export interface TransactionModel {
  id: string;
  accountId: string;
  fromAccountId?: string | null;
  fromName?: string | null;
  amount: number;
  debit: boolean;
  date: string;
  description: string;
  runningBalance: number;
}