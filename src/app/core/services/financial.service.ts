
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

  private generateChargeCode(name: string, accountNumber: string): string {
    const prefix = name.slice(0, 2).toUpperCase();
    const suffix = accountNumber.slice(-3);
    return `${prefix}${suffix}`;
  }

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

  async createAccount(account: Omit<Account, 'id' | 'accountNumber'>): Promise<Account> {
    try {
      const groups = await firstValueFrom(this.authService.getUserGroups());
      if (!groups.includes('Admin')) {
        throw new Error('Admin access required');
      }
      const input = {
        name: account.name,
        details: account.details ?? null,
        balance: account.startingBalance ?? 0,
        startingBalance: account.startingBalance ?? 0,
        date: account.date,
        type: account.type,
        rate: account.rate,
        chargeCodes: [],
      };
      const { data, errors } = await (this.client.models as any)['Account'].create(input);
      if (errors?.length) {
        throw new Error(`Failed to create account: ${errors.map((e: any) => e.message).join(', ')}`);
      }
      if (!data || !data.id) {
        console.error('No data or ID returned from createAccount:', { input });
        throw new Error('Account creation failed: No ID returned');
      }
      const accountNumber = data.id.replace(/-/g, '').slice(-16);
      const defaultChargeCode = this.generateChargeCode(account.name, accountNumber);
      const updatedAccount = {
        id: data.id,
        accountNumber,
        chargeCodes: [defaultChargeCode],
      };
      const { data: updatedData, errors: updateErrors } = await (this.client.models as any)['Account'].update(updatedAccount);
      if (updateErrors?.length) {
        throw new Error(`Failed to update account with accountNumber: ${updateErrors.map((e: any) => e.message).join(', ')}`);
      }
      if (!updatedData) {
        throw new Error(`Account ${data.id} not found after update`);
      }
      const createdAccount = {
        ...data,
        ...updatedData,
        chargeCodes: [defaultChargeCode],
      } as Account;
      for (const cc of createdAccount.chargeCodes) {
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