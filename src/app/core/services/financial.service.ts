

// file: src/app/core/services/financial.service.ts
import { Injectable } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import type { Schema } from '../../../../amplify/data/resource';
import { Account, Transaction } from '../models/financial.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class FinancialService {
  private client = generateClient<Schema>();

  constructor(private authService: AuthService) {}

  /* ---------------------- TYPE MAPPING HELPERS ---------------------- */

  private mapAccountFromSchema(data: any): Account {
    // Parse charge codes from JSON string
    let chargeCodes: Account['chargeCodes'] = [];
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
      details: data.details || undefined,
      balance: data.balance,
      startingBalance: data.startingBalance || 0,
      endingBalance: data.endingBalance,
      date: data.date,
      type: data.type,
      chargeCodes,
    };
  }

  private mapTransactionFromSchema(data: any): Transaction {
    return {
      id: data.id,
      accountId: data.accountId,
      fromAccountId: data.fromAccountId || undefined,
      fromName: data.fromName || undefined,
      amount: data.amount,
      debit: data.debit,
      date: data.date,
      description: data.description,
      runningBalance: data.runningBalance,
    };
  }

  /* ---------------------- ACCOUNTS ---------------------- */

  async createAccount(account: Omit<Account, 'id' | 'accountNumber'>): Promise<Account> {
    const id = uuidv4();
    const accountNumber = this.generateAccountNumber(id);

    const input = {
      id,
      accountNumber,
      name: account.name,
      details: account.details ?? null,
      balance: account.balance ?? 0,
      startingBalance: account.startingBalance ?? account.balance ?? 0,
      endingBalance: account.endingBalance ?? account.balance ?? 0,
      date: account.date ?? new Date().toISOString().slice(0, 10),
      type: account.type,
      // Serialize charge codes to JSON string
      chargeCodesJson: JSON.stringify(account.chargeCodes ?? []),
    };

    const { data, errors } = await this.client.models.Account.create(input);
    if (errors?.length) {
      throw new Error(`Failed to create account: ${errors.map((e: any) => e.message).join(', ')}`);
    }
    return this.mapAccountFromSchema(data);
  }

  async getAccount(id: string): Promise<Account> {
    const { data, errors } = await this.client.models.Account.get({ id });
    if (errors?.length || !data) {
      throw new Error('Account not found');
    }
    return this.mapAccountFromSchema(data);
  }

  async listAccounts(): Promise<Account[]> {
    const { data, errors } = await this.client.models.Account.list({ limit: 100 });
    if (errors?.length) {
      throw new Error(`Failed to list accounts: ${errors.map((e: any) => e.message).join(', ')}`);
    }
    return (data ?? []).map((d: any) => this.mapAccountFromSchema(d));
  }

  async updateAccount(id: string, updates: Partial<Account>): Promise<Account> {
    const input: any = { id };
    
    // Copy simple fields
    if (updates.name !== undefined) input.name = updates.name;
    if (updates.details !== undefined) input.details = updates.details;
    if (updates.balance !== undefined) input.balance = updates.balance;
    if (updates.startingBalance !== undefined) input.startingBalance = updates.startingBalance;
    if (updates.endingBalance !== undefined) input.endingBalance = updates.endingBalance;
    if (updates.date !== undefined) input.date = updates.date;
    if (updates.type !== undefined) input.type = updates.type;
    
    // Serialize charge codes if provided
    if (updates.chargeCodes !== undefined) {
      input.chargeCodesJson = JSON.stringify(updates.chargeCodes);
    }

    const { data, errors } = await this.client.models.Account.update(input);
    if (errors?.length || !data) {
      throw new Error(`Failed to update account: ${errors.map((e: any) => e.message).join(', ')}`);
    }
    return this.mapAccountFromSchema(data);
  }

  async deleteAccount(id: string): Promise<void> {
    const { errors } = await this.client.models.Account.delete({ id });
    if (errors?.length) {
      throw new Error(`Failed to delete account: ${errors.map((e: any) => e.message).join(', ')}`);
    }
  }

  /* ---------------------- TRANSACTIONS ---------------------- */

  async createTransaction(tx: Omit<Transaction, 'id' | 'runningBalance' | 'date'>): Promise<Transaction> {
    const account = await this.getAccount(tx.accountId);
    const runningBalance = tx.debit ? account.balance - tx.amount : account.balance + tx.amount;

    const input = {
      id: uuidv4(),
      accountId: tx.accountId,
      fromAccountId: tx.fromAccountId ?? null,
      fromName: tx.fromName ?? null,
      amount: tx.amount,
      debit: tx.debit,
      date: new Date().toISOString(),
      description: tx.description,
      runningBalance,
    };

    const { data, errors } = await this.client.models.Transaction.create(input);
    if (errors?.length || !data) {
      throw new Error(`Failed to create transaction: ${errors.map((e: any) => e.message).join(', ')}`);
    }

    // Update account balance
    await this.updateAccount(account.id, { balance: runningBalance, endingBalance: runningBalance });
    return this.mapTransactionFromSchema(data);
  }

  async listTransactions(filter?: { accountId?: string }): Promise<Transaction[]> {
    const gqlFilter = filter?.accountId ? { accountId: { eq: filter.accountId } } : undefined;
    const { data, errors } = await this.client.models.Transaction.list({ 
      filter: gqlFilter, 
      limit: 200 
    });
    if (errors?.length) {
      throw new Error(`Failed to list transactions: ${errors.map((e: any) => e.message).join(', ')}`);
    }
    return (data ?? []).map((d: any) => this.mapTransactionFromSchema(d));
  }

  /* ---------------------- CHARGE CODES ---------------------- */

  private generateChargeCode(name: string, accountNumber: string): string {
    const short = (name || '').replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase() || 'CC';
    const mid = accountNumber.slice(-3);
    const rand = Math.floor(10 + Math.random() * 90);
    return `${short}-${mid}-${rand}`;
  }

  async createChargeCode(account: Account): Promise<Account['chargeCodes'][number]> {
    const name = this.generateChargeCode(account.name, account.accountNumber);
    const currentUser = await firstValueFrom(this.authService.getCurrentUser());
    const createdBy = currentUser?.id ?? 'system';

    const chargeCode = {
      name,
      cognitoGroup: `chargecode-${name}`,
      createdBy,
      date: new Date().toISOString(),
    };

    const updatedChargeCodes = [...(account.chargeCodes ?? []), chargeCode];
    await this.updateAccount(account.id, { chargeCodes: updatedChargeCodes });
    await this.authService.createGroup(chargeCode.cognitoGroup!);

    return chargeCode;
  }

  async listChargeCodes(accountId: string): Promise<Account['chargeCodes']> {
    const account = await this.getAccount(accountId);
    return account.chargeCodes ?? [];
  }

  /* ---------------------- FUNDS HELPERS ---------------------- */

  async addFunds(accountId: string, amount: number, description: string = 'Add funds'): Promise<Transaction> {
    return this.createTransaction({ accountId, amount, debit: false, description });
  }

  async subtractFunds(accountId: string, amount: number, description: string = 'Subtract funds'): Promise<Transaction> {
    return this.createTransaction({ accountId, amount, debit: true, description });
  }

  /* ---------------------- UTILITIES ---------------------- */

  private generateAccountNumber(id: string): string {
    const digits = Array.from(id).map(c => c.charCodeAt(0)).join('');
    return (digits + '0000000000000000').slice(0, 16);
  }
}