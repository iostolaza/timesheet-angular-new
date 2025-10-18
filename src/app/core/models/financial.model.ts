
// src/app/core/models/financial.model.ts

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
  rate: number;
  chargeCodes: string[];
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
}