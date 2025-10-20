
// src/core/services/financial.service.ts

import { Injectable, inject } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { Account, Transaction } from '../models/financial.model';
import { format } from 'date-fns';

@Injectable({
  providedIn: 'root'
})
export class FinancialService {
  private client = generateClient<Schema>({ authMode: 'userPool' });
  private authService = inject(AuthService);

  async listAccounts(): Promise<Account[]> {
    try {
      const { data, errors } = await (this.client.models as any)['Account'].list({});
      if (errors?.length) {
        throw new Error(`Failed to list accounts: ${errors.map((e: any) => e.message).join(', ')}`);
      }
      return (data ?? []) as Account[];
    } catch (error) {
      console.error('Error listing accounts:', error);
      throw error;
    }
  }

  async getAccount(id: string): Promise<Account> {
    try {
      const { data, errors } = await (this.client.models as any)['Account'].get({ id });
      if (errors?.length) {
        throw new Error(`Failed to get account: ${errors.map((e: any) => e.message).join(', ')}`);
      }
      if (!data) {
        throw new Error(`Account ${id} not found`);
      }
      return data as Account;
    } catch (error) {
      console.error('Error getting account:', error);
      throw error;
    }
  }

  async createAccount(account: Omit<Account, 'id'>): Promise<Account> {
    try {
      const groups = await firstValueFrom(this.authService.getUserGroups());
      if (!groups.includes('Admin')) {
        throw new Error('Admin access required');
      }
      const input = {
        accountNumber: account.accountNumber,
        name: account.name,
        details: account.details ?? null,
        balance: account.startingBalance ?? 0,
        startingBalance: account.startingBalance ?? 0,
        endingBalance: account.endingBalance ?? null,
        date: account.date,
        type: account.type,
        rate: account.rate,
        chargeCodes: account.chargeCodes ?? [],
      };
      const { data, errors } = await (this.client.models as any)['Account'].create({ data: input });
      if (errors?.length) {
        throw new Error(`Failed to create account: ${errors.map((e: any) => e.message).join(', ')}`);
      }
      if (!data) {
        console.error('No data returned from createAccount:', { input });
        throw new Error('Account creation failed: No data returned');
      }
      console.log('Raw createAccount response:', data);
      const createdAccount = data as Account;
      if (!createdAccount.id) {
        console.error('No id in response:', createdAccount);
        throw new Error('Account creation failed: No ID returned in response');
      }
      for (const cc of createdAccount.chargeCodes ?? []) {
        await this.authService.createGroup(`chargecode-${cc}`);
      }
      return createdAccount;
    } catch (error) {
      console.error('Error creating account:', error);
      throw error;
    }
  }

  async updateAccount(id: string, updates: Partial<Account>): Promise<Account> {
    try {
      const groups = await firstValueFrom(this.authService.getUserGroups());
      if (!groups.includes('Admin')) {
        throw new Error('Admin access required');
      }
      const input = {
        id,
        accountNumber: updates.accountNumber ?? undefined,
        name: updates.name ?? undefined,
        details: updates.details ?? undefined,
        balance: updates.balance ?? undefined,
        startingBalance: updates.startingBalance ?? undefined,
        endingBalance: updates.endingBalance ?? undefined,
        date: updates.date ?? undefined,
        type: updates.type ?? undefined,
        rate: updates.rate ?? undefined,
        chargeCodes: updates.chargeCodes ?? undefined,
      };
      const { data, errors } = await (this.client.models as any)['Account'].update({ id, data: input });
      if (errors?.length) {
        throw new Error(`Failed to update account: ${errors.map((e: any) => e.message).join(', ')}`);
      }
      if (!data) {
        throw new Error(`Account ${id} not found`);
      }
      for (const cc of updates.chargeCodes ?? []) {
        await this.authService.createGroup(`chargecode-${cc}`);
      }
      return data as Account;
    } catch (error) {
      console.error('Error updating account:', error);
      throw error;
    }
  }

  async deleteAccount(id: string): Promise<void> {
    try {
      const groups = await firstValueFrom(this.authService.getUserGroups());
      if (!groups.includes('Admin')) {
        throw new Error('Admin access required');
      }
      const { errors } = await (this.client.models as any)['Account'].delete({ id });
      if (errors?.length) {
        throw new Error(`Failed to delete account: ${errors.map((e: any) => e.message).join(', ')}`);
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  }

  async createTransaction(tx: Omit<Transaction, 'id' | 'runningBalance' | 'date'>): Promise<Transaction> {
    try {
      const groups = await firstValueFrom(this.authService.getUserGroups());
      if (!groups.includes('Admin')) {
        throw new Error('Admin access required');
      }
      const account = await this.getAccount(tx.accountId);
      const newBalance = tx.debit ? account.balance - tx.amount : account.balance + tx.amount;
      const fullTx: Omit<Transaction, 'id'> = {
        accountId: tx.accountId,
        fromAccountId: tx.fromAccountId ?? undefined,
        fromName: tx.fromName ?? undefined,
        amount: tx.amount,
        debit: tx.debit,
        date: format(new Date(), 'yyyy-MM-dd'),
        description: tx.description,
        runningBalance: newBalance,
      };
      const { data, errors } = await (this.client.models as any)['Transaction'].create({ data: fullTx });
      if (errors?.length) {
        throw new Error(`Failed to create transaction: ${errors.map((e: any) => e.message).join(', ')}`);
      }
      if (!data) {
        throw new Error('Transaction creation failed: No data returned');
      }
      await this.updateAccount(account.id, { balance: newBalance });
      return data as Transaction;
    } catch (error) {
      console.error('Error creating transaction:', error);
      throw error;
    }
  }

  async listTransactions(filter?: { accountId?: string }): Promise<Transaction[]> {
    try {
      const query: any = {};
      if (filter?.accountId) {
        query.filter = { accountId: { eq: filter.accountId } };
      }
      const { data, errors } = await (this.client.models as any)['Transaction'].list(query);
      if (errors?.length) {
        throw new Error(`Failed to list transactions: ${errors.map((e: any) => e.message).join(', ')}`);
      }
      return (data ?? []) as Transaction[];
    } catch (error) {
      console.error('Error listing transactions:', error);
      throw error;
    }
  }
}