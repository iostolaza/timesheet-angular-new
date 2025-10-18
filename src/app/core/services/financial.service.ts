
// src/app/core/services/financial.service.ts

import { Injectable, inject } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { Account, Transaction, User } from '../models/financial.model';

@Injectable({
  providedIn: 'root'
})
export class FinancialService {
  private client = generateClient<Schema>();
  private authService = inject(AuthService);

  async listAccounts(): Promise<Account[]> {
    const { data } = await this.client.models.Account.list();
    return data as Account[];
  }

  async getUserById(id: string): Promise<User> {
    const { data } = await this.client.models.User.get({ id });
    return data as User;
  }

  async createAccount(account: Omit<Account, 'id'>): Promise<Account> {
    const groups = await firstValueFrom(this.authService.getUserGroups());
    if (!groups.includes('Admin')) throw new Error('Admin access required');
    const { data } = await this.client.models.Account.create({ data: account });
    return data as Account;
  }

  async updateAccount(id: string, updates: Partial<Account>): Promise<Account> {
    const groups = await firstValueFrom(this.authService.getUserGroups());
    if (!groups.includes('Admin')) throw new Error('Admin access required');
    const { data } = await this.client.models.Account.update({ id, data: updates });
    return data as Account;
  }

  async deleteAccount(id: string): Promise<void> {
    const groups = await firstValueFrom(this.authService.getUserGroups());
    if (!groups.includes('Admin')) throw new Error('Admin access required');
    await this.client.models.Account.delete({ id });
  }

  async listTransactions(filter?: { accountId?: string }): Promise<Transaction[]> {
    const query: any = {};
    if (filter?.accountId) query.filter = { accountId: { eq: filter.accountId } };
    const { data } = await this.client.models.Transaction.list(query);
    return data as Transaction[];
  }
}