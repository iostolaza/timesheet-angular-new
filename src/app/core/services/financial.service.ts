
// src/app/core/services/financial.service.ts

import { Injectable, inject } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import type { Schema } from '../../../../amplify/data/resource';
import { Account, Transaction, AccountModel, TransactionModel, ChargeCode } from '../models/financial.model';
import { AuthService } from './auth.service';
import { UserProfile } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class FinancialService {
  private client = generateClient<Schema>();
  private authService = inject(AuthService);

  private mapAccountFromSchema(data: AccountModel): Account {
    let chargeCodes: ChargeCode[] = [];
    if (data.chargeCodesJson) {
      try {
        chargeCodes = JSON.parse(data.chargeCodesJson);
      } catch (e) {
        console.error('Failed to parse charge codes:', e);
        chargeCodes = [];
      }
    }

    return {
      id: data.id,
      accountNumber: data.accountNumber,
      name: data.name,
      details: data.details,
      balance: data.balance,
      startingBalance: data.startingBalance ?? 0,
      endingBalance: data.endingBalance,
      date: data.date,
      type: data.type,
      chargeCodes,
    };
  }

  private mapTransactionFromSchema(data: TransactionModel): Transaction {
    return {
      id: data.id,
      accountId: data.accountId,
      fromAccountId: data.fromAccountId ?? undefined,
      fromName: data.fromName ?? undefined,
      amount: data.amount,
      debit: data.debit,
      date: data.date,
      description: data.description,
      runningBalance: data.runningBalance,
    };
  }

  async createAccount(account: Omit<Account, 'id' | 'accountNumber'>): Promise<Account> {
    const id = uuidv4();
    const accountNumber = this.generateAccountNumber(id);

    const input: AccountModel = {
      id,
      accountNumber,
      name: account.name,
      details: account.details ?? null,
      balance: account.balance ?? 0,
      startingBalance: account.startingBalance ?? account.balance ?? 0,
      endingBalance: account.endingBalance ?? account.balance ?? 0,
      date: account.date ?? new Date().toISOString().split('T')[0],
      type: account.type ?? null,
      chargeCodesJson: JSON.stringify(account.chargeCodes ?? []),
    };

    const { data, errors } = await this.client.models.Account.create(input);
    if (errors?.length) {
      throw new Error(`Failed to create account: ${errors.map((e: any) => e.message).join(', ')}`);
    }
    if (!data) {
      throw new Error('No data returned from account creation');
    }
    return this.mapAccountFromSchema(data as AccountModel);
  }

  async getAccount(id: string): Promise<Account> {
    const { data, errors } = await this.client.models.Account.get({ id });
    if (errors?.length) {
      throw new Error(`Failed to get account: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) {
      throw new Error('Account not found');
    }
    return this.mapAccountFromSchema(data as AccountModel);
  }

  async getAccountByNumber(accountNumber: string): Promise<Account | null> {
    const { data, errors } = await this.client.models.Account.list({
      filter: { accountNumber: { eq: accountNumber } },
    });
    if (errors?.length) {
      throw new Error(`Failed to get account: ${errors.map(e => e.message).join(', ')}`);
    }
    if (data.length === 0) return null;
    return this.mapAccountFromSchema(data[0] as AccountModel);
  }

  async listAccounts(): Promise<Account[]> {
    const { data, errors } = await this.client.models.Account.list({ limit: 100 });
    if (errors?.length) {
      throw new Error(`Failed to list accounts: ${errors.map(e => e.message).join(', ')}`);
    }
    return data.map(d => this.mapAccountFromSchema(d as AccountModel));
  }

  async updateAccount(id: string, updates: Partial<Account>): Promise<Account> {
    const currentAccount = await this.getAccount(id);
    if (!currentAccount.accountNumber) {
      console.error('Current account has no accountNumber:', currentAccount);
      throw new Error('Current account number is missing');
    }

    const input: AccountModel = {
      id,
      accountNumber: updates.accountNumber ?? currentAccount.accountNumber,
      name: updates.name ?? currentAccount.name,
      balance: updates.balance ?? currentAccount.balance,
      date: updates.date ?? currentAccount.date,
      type: updates.type ?? currentAccount.type,
      details: updates.details ?? currentAccount.details,
      startingBalance: updates.startingBalance ?? currentAccount.startingBalance,
      endingBalance: updates.endingBalance ?? currentAccount.endingBalance,
      chargeCodesJson: updates.chargeCodes ? JSON.stringify(updates.chargeCodes) : JSON.stringify(currentAccount.chargeCodes ?? []),
    };

    const { data, errors } = await this.client.models.Account.update(input);
    if (errors?.length) {
      throw new Error(`Failed to update account: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) {
      throw new Error('No data returned from account update');
    }
    return this.mapAccountFromSchema(data as AccountModel);
  }

  async deleteAccount(id: string): Promise<void> {
    const { errors } = await this.client.models.Account.delete({ id });
    if (errors?.length) {
      throw new Error(`Failed to delete account: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  async createTransaction(tx: Omit<Transaction, 'id' | 'runningBalance' | 'date'>): Promise<Transaction> {
    const account = await this.getAccount(tx.accountId);
    const runningBalance = tx.debit ? account.balance - tx.amount : account.balance + tx.amount;

    const input: TransactionModel = {
      id: uuidv4(),
      accountId: tx.accountId,
      fromAccountId: tx.fromAccountId ?? null,
      fromName: tx.fromName ?? null,
      amount: tx.amount,
      debit: tx.debit,
      date: new Date().toISOString().split('T')[0],
      description: tx.description,
      runningBalance,
    };

    const { data, errors } = await this.client.models.Transaction.create(input);
    if (errors?.length) {
      throw new Error(`Failed to create transaction: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) {
      throw new Error('No data returned from transaction creation');
    }
    await this.updateAccount(account.id, { balance: runningBalance, endingBalance: runningBalance });
    return this.mapTransactionFromSchema(data);
  }

  async listTransactions(filter?: { accountId?: string }): Promise<Transaction[]> {
    const gqlFilter = filter?.accountId ? { accountId: { eq: filter.accountId } } : undefined;
    const { data, errors } = await this.client.models.Transaction.list({ filter: gqlFilter, limit: 200 });
    if (errors?.length) {
      throw new Error(`Failed to list transactions: ${errors.map(e => e.message).join(', ')}`);
    }
    return data.map(this.mapTransactionFromSchema);
  }

  private generateChargeCode(name: string, accountNumber: string): string {
    const short = (name || '').replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase() || 'CC';
    const mid = accountNumber && accountNumber.length >= 3 ? accountNumber.slice(-3) : '000';
    const rand = Math.floor(100 + Math.random() * 900);
    console.log('Generating charge code:', { name, accountNumber, result: `${short}-${mid}-${rand}` });
    return `${short}-${mid}-${rand}`;
  }

  async createChargeCode(account: Account): Promise<ChargeCode> {
    if (!account.accountNumber) {
      console.error('Invalid account number for charge code creation:', account);
      throw new Error('Account number is required for charge code creation');
    }

    const name = this.generateChargeCode(account.name, account.accountNumber);
    const currentUser = await firstValueFrom(this.authService.getCurrentUser());
    const createdBy = currentUser?.id ?? 'system';

    const chargeCode = {
      name,
      createdBy,
      date: new Date().toISOString(),
    };

    const updatedChargeCodes = [...(account.chargeCodes ?? []), chargeCode];

    try {
      await this.updateAccount(account.id, {
        accountNumber: account.accountNumber,
        balance: account.balance,
        endingBalance: account.endingBalance,
        chargeCodes: updatedChargeCodes,
      });
      console.log('Charge code created:', chargeCode);
      return chargeCode;
    } catch (error: any) {
      console.error('Failed to create charge code:', error);
      throw new Error(`Failed to create charge code: ${error.message || error}`);
    }
  }

  async listChargeCodes(accountId: string): Promise<ChargeCode[]> {
    const account = await this.getAccount(accountId);
    return account.chargeCodes ?? [];
  }

  async addFunds(accountId: string, amount: number, description: string = 'Add funds'): Promise<Transaction> {
    return this.createTransaction({ accountId, amount, debit: false, description });
  }

  async subtractFunds(accountId: string, amount: number, description: string = 'Subtract funds'): Promise<Transaction> {
    return this.createTransaction({ accountId, amount, debit: true, description });
  }

  private generateAccountNumber(id: string): string {
    const digits = Array.from(id).map(c => c.charCodeAt(0)).join('');
    return (digits + '0000000000000000').slice(0, 16);
  }
}