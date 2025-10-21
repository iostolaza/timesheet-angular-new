
// src/app/core/services/financial.service.ts

import { Injectable } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import type { Schema } from '../../../../amplify/data/resource';
import { Account, Transaction, AccountModel, TransactionModel, User } from '../models/financial.model';
import { AuthService } from './auth.service';
import { CognitoIdentityProviderClient, CreateGroupCommand, AdminAddUserToGroupCommand, AdminRemoveUserFromGroupCommand } from '@aws-sdk/client-cognito-identity-provider';

@Injectable({ providedIn: 'root' })
export class FinancialService {
  private client = generateClient<Schema>();
  private cognitoClient: CognitoIdentityProviderClient;
  private userPoolId: string;

  constructor(private authService: AuthService) {
    this.userPoolId = 'us-west-1_KfNSgZaRI';
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: 'us-west-1',
    });
  }

  /* ---------------------- TYPE MAPPING HELPERS ---------------------- */

  private mapAccountFromSchema(data: AccountModel): Account {
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
      details: data.details ?? undefined,
      balance: data.balance,
      startingBalance: data.startingBalance ?? 0,
      endingBalance: data.endingBalance ?? undefined,
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

  /* ---------------------- ACCOUNTS ---------------------- */

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
      date: account.date ?? new Date().toISOString().slice(0, 10),
      type: account.type,
      chargeCodesJson: JSON.stringify(account.chargeCodes ?? []),
    };

    const { data, errors } = await this.client.models['Account'].create(input);
    if (errors && errors.length > 0) {
      throw new Error(`Failed to create account: ${errors.map((e: any) => e.message).join(', ')}`);
    }
    if (!data) {
      throw new Error('No data returned from account creation');
    }
    return this.mapAccountFromSchema(data as AccountModel);
  }

  async getAccount(id: string): Promise<Account> {
    const { data, errors } = await this.client.models['Account'].get({ id });
    if (errors && errors.length > 0) {
      throw new Error(`Failed to get account: ${errors.map((e: any) => e.message).join(', ')}`);
    }
    if (!data) {
      throw new Error('Account not found');
    }
    return this.mapAccountFromSchema(data as AccountModel);
  }

  // async getAccountByNumber(accountNumber: string): Promise<Account | null> {
  //   const { data, errors } = await this.client.models.Account.list({
  //     filter: { accountNumber: { eq: accountNumber } }
  //   });
  //   if (errors?.length) {
  //     throw new Error(`Failed to get account: ${errors.map(e => e.message).join(', ')}`);
  //   }
  //   if (data.length === 0) return null;
  //   return this.mapAccountFromSchema(data[0]);
  // }

async getAccountByNumber(accountNumber: string): Promise<Account | null> {
    const { data, errors } = await this.client.models.Account.list({
      filter: { accountNumber: { eq: accountNumber } }
    });
    if (errors?.length) {
      throw new Error(`Failed to get account: ${errors.map(e => e.message).join(', ')}`);
    }
    if (data.length === 0) return null;
    return this.mapAccountFromSchema(data[0] as AccountModel);
  }
  
  async listAccounts(): Promise<Account[]> {
    const { data, errors } = await this.client.models['Account'].list({ limit: 100 });
    if (errors && errors.length > 0) {
      throw new Error(`Failed to list accounts: ${errors.map((e: any) => e.message).join(', ')}`);
    }
    return (data as AccountModel[]).map((d: AccountModel) => this.mapAccountFromSchema(d));
  }

  async updateAccount(id: string, updates: Partial<Account>): Promise<Account> {
    const input: AccountModel = {
      id,
      accountNumber: '',
      name: '',
      balance: 0,
      date: '',
      type: 'Asset',
      details: updates.details ?? null,
      startingBalance: updates.startingBalance ?? null,
      endingBalance: updates.endingBalance ?? null,
      chargeCodesJson: updates.chargeCodes ? JSON.stringify(updates.chargeCodes) : null,
    };

    if (updates.name !== undefined) input.name = updates.name;
    if (updates.balance !== undefined) input.balance = updates.balance;
    if (updates.date !== undefined) input.date = updates.date;
    if (updates.type !== undefined) input.type = updates.type;

    const { data, errors } = await this.client.models['Account'].update(input);
    if (errors && errors.length > 0) {
      throw new Error(`Failed to update account: ${errors.map((e: any) => e.message).join(', ')}`);
    }
    if (!data) {
      throw new Error('No data returned from account update');
    }
    return this.mapAccountFromSchema(data as AccountModel);
  }

  async deleteAccount(id: string): Promise<void> {
    const { errors } = await this.client.models['Account'].delete({ id });
    if (errors && errors.length > 0) {
      throw new Error(`Failed to delete account: ${errors.map((e: any) => e.message).join(', ')}`);
    }
  }

  /* ---------------------- TRANSACTIONS ---------------------- */

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
      date: new Date().toISOString(),
      description: tx.description,
      runningBalance,
    };

    const { data, errors } = await this.client.models['Transaction'].create(input);
    if (errors && errors.length > 0) {
      throw new Error(`Failed to create transaction: ${errors.map((e: any) => e.message).join(', ')}`);
    }
    if (!data) {
      throw new Error('No data returned from transaction creation');
    }
    await this.updateAccount(account.id, { balance: runningBalance, endingBalance: runningBalance });
    return this.mapTransactionFromSchema(data as TransactionModel);
  }

  async listTransactions(filter?: { accountId?: string }): Promise<Transaction[]> {
    const gqlFilter = filter?.accountId ? { accountId: { eq: filter.accountId } } : undefined;
    const { data, errors } = await this.client.models['Transaction'].list({ filter: gqlFilter, limit: 200 });
    if (errors && errors.length > 0) {
      throw new Error(`Failed to list transactions: ${errors.map((e: any) => e.message).join(', ')}`);
    }
    return (data as TransactionModel[]).map((d: TransactionModel) => this.mapTransactionFromSchema(d));
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
    await this.updateAccount(account.id, { balance: account.balance, endingBalance: account.endingBalance, chargeCodes: updatedChargeCodes });
    await this.createGroup(chargeCode.cognitoGroup);

    return chargeCode;
  }

  async listChargeCodes(accountId: string): Promise<Account['chargeCodes']> {
    const account = await this.getAccount(accountId);
    return account.chargeCodes ?? [];
  }

  /* ---------------------- GROUP MANAGEMENT ---------------------- */

  async createGroup(groupName: string): Promise<void> {
    try {
      const isAdmin = await this.authService.isAdmin();
      if (!isAdmin) {
        throw new Error('Admin access required to create groups');
      }
      const command = new CreateGroupCommand({
        UserPoolId: this.userPoolId,
        GroupName: groupName,
      });
      await this.cognitoClient.send(command);
      console.log(`Group ${groupName} created`);
    } catch (error: any) {
      console.error('Error creating group:', error);
      throw new Error(`Failed to create group: ${error.message || error}`);
    }
  }

  async addUserToGroup(email: string, groupName: string): Promise<void> {
    try {
      const isAdmin = await this.authService.isAdmin();
      if (!isAdmin) {
        throw new Error('Admin access required to manage groups');
      }
      const command = new AdminAddUserToGroupCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        GroupName: groupName,
      });
      await this.cognitoClient.send(command);
      const users = await this.listUsers();
      const user = users.find(u => u.email === email);
      if (!user) {
        throw new Error(`User with email ${email} not found`);
      }
      const currentGroups = user.groups || [];
      if (!currentGroups.includes(groupName)) {
        const updatedGroups = [...currentGroups, groupName];
        await this.updateUserGroups(user.id, updatedGroups);
      }
      console.log(`Added user ${email} to group ${groupName}`);
    } catch (error: any) {
      console.error('Error adding user to group:', error);
      throw new Error(`Failed to add user to group: ${error.message || error}`);
    }
  }

  async removeUserFromGroup(email: string, groupName: string): Promise<void> {
    try {
      const isAdmin = await this.authService.isAdmin();
      if (!isAdmin) {
        throw new Error('Admin access required to manage groups');
      }
      const command = new AdminRemoveUserFromGroupCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        GroupName: groupName,
      });
      await this.cognitoClient.send(command);
      const users = await this.listUsers();
      const user = users.find(u => u.email === email);
      if (user) {
        const updatedGroups = (user.groups || []).filter(g => g !== groupName);
        await this.updateUserGroups(user.id, updatedGroups);
      }
      console.log(`Removed user ${email} from group ${groupName}`);
    } catch (error: any) {
      console.error('Error removing user from group:', error);
      throw new Error(`Failed to remove user from group: ${error.message || error}`);
    }
  }

  private async updateUserGroups(userId: string, groups: string[]): Promise<void> {
    try {
      const { data, errors } = await (this.client.models as any)['User'].update({
        id: userId,
        groups,
      });
      if (errors?.length) {
        throw new Error(`Failed to update user groups: ${errors.map((e: any) => e.message).join(', ')}`);
      }
      console.log('Updated user groups:', data);
    } catch (error) {
      console.error('Error updating user groups:', error);
      throw error;
    }
  }

  async listUsers(): Promise<User[]> {
    try {
      const { data, errors } = await (this.client.models as any)['User'].list({});
      if (errors?.length) {
        throw new Error(`Failed to list users: ${errors.map((e: any) => e.message).join(', ')}`);
      }
      return (data ?? []) as User[];
    } catch (error) {
      console.error('Error listing users:', error);
      throw error;
    }
  }

  async createUserIfNotExists(user: User): Promise<void> {
    try {
      await this.getUserById(user.id);
      console.log('User already exists:', user.id);
    } catch (err) {
      const { data } = await (this.client.models as any)['User'].create(user);
      console.log('Created new User:', data);
    }
  }

  async getUserById(id: string): Promise<User> {
    const { data } = await (this.client.models as any)['User'].get({ id });
    if (!data) throw new Error(`User with id ${id} not found`);
    return data as User;
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