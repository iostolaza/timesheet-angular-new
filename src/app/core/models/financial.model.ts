
// src/app/core/models/financial.model.ts

export interface ChargeCode {
  name: string;
  createdBy: string;
  date: string;
}

export interface Account {
  id: string;
  accountNumber: string;
  name: string;
  details: string | null;
  balance: number;
  startingBalance: number | null;
  endingBalance: number | null;
  date: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense' | null;
  chargeCodes: ChargeCode[];
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