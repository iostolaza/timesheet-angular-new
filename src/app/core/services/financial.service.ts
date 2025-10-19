
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
  private client = generateClient<Schema>();
  private authService = inject(AuthService);

  async listAccounts(): Promise<Account[]> {
    const { data } = await (this.client.models as any)['Account'].list({});
    return data as Account[];
  }

  async getAccount(id: string): Promise<Account> {
    const { data } = await (this.client.models as any)['Account'].get({ id });
    if (!data) throw new Error(`Account ${id} not found`);
    return data as Account;
  }

  async createAccount(account: Omit<Account, 'id'>): Promise<Account> {
    const groups = await firstValueFrom(this.authService.getUserGroups());
    if (!groups.includes('Admin')) throw new Error('Admin access required');
    const { data } = await (this.client.models as any)['Account'].create({ data: { ...account, balance: account.startingBalance } });
    // Create groups for charge codes (strings)
    for (const cc of account.chargeCodes || []) {
      await this.authService.createGroup(`chargecode-${cc}`);
    }
    return data as Account;
  }

  async updateAccount(id: string, updates: Partial<Account>): Promise<Account> {
    const groups = await firstValueFrom(this.authService.getUserGroups());
    if (!groups.includes('Admin')) throw new Error('Admin access required');
    const { data } = await (this.client.models as any)['Account'].update({ id, data: updates });
    // Create groups for new/updated charge codes (idempotent)
    for (const cc of updates.chargeCodes || []) {
      await this.authService.createGroup(`chargecode-${cc}`);
    }
    return data as Account;
  }

  async deleteAccount(id: string): Promise<void> {
    const groups = await firstValueFrom(this.authService.getUserGroups());
    if (!groups.includes('Admin')) throw new Error('Admin access required');
    await (this.client.models as any)['Account'].delete({ id });
  }

  async createTransaction(tx: Omit<Transaction, 'id' | 'runningBalance' | 'date'>): Promise<Transaction> {
    const groups = await firstValueFrom(this.authService.getUserGroups());
    if (!groups.includes('Admin')) throw new Error('Admin access required');
    const account = await this.getAccount(tx.accountId);
    const newBalance = tx.debit ? account.balance - tx.amount : account.balance + tx.amount;
    const fullTx: Omit<Transaction, 'id'> = {
      ...tx,
      date: format(new Date(), 'yyyy-MM-dd'),
      runningBalance: newBalance
    };
    const { data } = await (this.client.models as any)['Transaction'].create({ data: fullTx });
    await this.updateAccount(account.id, { balance: newBalance });
    return data as Transaction;
  }

  async listTransactions(filter?: { accountId?: string }): Promise<Transaction[]> {
    const query: any = {};
    if (filter?.accountId) query.filter = { accountId: { eq: filter.accountId } };
    const { data } = await (this.client.models as any)['Transaction'].list(query);
    return data as Transaction[];
  }
}