
// src/app/core/services/financial.service.ts

import { Account, Transaction, ChargeCode, Employee, User, Permission } from '../../core/models/financial.model';
import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { DataStore } from '@aws-amplify/datastore';

@Injectable({ providedIn: 'root' })
export class FinancialService {
  constructor() {
    // Initialize with mock data if empty
    this.seedInitialData();
  }

  private async seedInitialData() {
    const accounts = await DataStore.query(Account);
    if (accounts.length === 0) {
      const initialAccounts: Partial<Account>[] = [
        { id: 1, account_number: '1001', name: 'Cash', details: 'Main cash account', balance: 10000, starting_balance: 10000, date: '2025-01-01', type: 'Asset' },
        { id: 2, account_number: '2001', name: 'Accounts Payable', details: 'Payables', balance: 5000, starting_balance: 5000, date: '2025-01-01', type: 'Liability' }
      ];
      await Promise.all(initialAccounts.map(acc => DataStore.save(new Account(acc))));
    }

    const employees = await DataStore.query(Employee);
    if (employees.length === 0) {
      const initialEmployees: Partial<Employee>[] = [
        { id: 1, name: 'Employee1' },
        { id: 2, name: 'Employee2' }
      ];
      await Promise.all(initialEmployees.map(emp => DataStore.save(new Employee(emp))));
    }

    const chargeCodes = await DataStore.query(ChargeCode);
    if (chargeCodes.length === 0) {
      const initialChargeCodes: Partial<ChargeCode>[] = [
        { id: 1, account_id: 1, employee_id: 1, charge_code: 'CC001' },
        { id: 2, account_id: 2, employee_id: 2, charge_code: 'CC002' }
      ];
      await Promise.all(initialChargeCodes.map(cc => DataStore.save(new ChargeCode(cc))));
    }

    const users = await DataStore.query(User);
    if (users.length === 0) {
      const initialUsers: Partial<User>[] = [
        { id: 1, name: 'Employee1', role: 'Employee' },
        { id: 2, name: 'Employee2', role: 'Employee' },
        { id: 3, name: 'Employee3', role: 'Employee' },
        { id: 4, name: 'Manager1', role: 'Manager' },
        { id: 5, name: 'Admin1', role: 'Admin' }
      ];
      await Promise.all(initialUsers.map(user => DataStore.save(new User(user))));
    }

    const permissions = await DataStore.query(Permission);
    if (permissions.length === 0) {
      const initialPermissions: Partial<Permission>[] = [
        { id: 1, user_id: 1, account_id: 1, can_view: true },
        { id: 2, user_id: 1, account_id: 2, can_view: true },
        { id: 3, user_id: 2, account_id: 1, can_view: true }
      ];
      await Promise.all(initialPermissions.map(perm => DataStore.save(new Permission(perm))));
    }
  }

  getAccounts(userId: number): Observable<Account[]> {
    return from(DataStore.query(Permission, p => p.user_id.eq(userId).and(p => p.can_view.eq(true)))).pipe(
      map(permissions => permissions.map(p => p.account_id)),
      mergeMap(accountIds => from(DataStore.query(Account, a => a.or(a => accountIds.map(id => a.id.eq(id))))))
    );
  }

  getAccount(accountId: number): Observable<Account> {
    return from(DataStore.query(Account, accountId)).pipe(
      map(account => {
        if (!account) throw new Error('Account not found');
        return account;
      })
    );
  }

  getTransactions(accountId?: number, page = 0, pageSize = 100): Observable<{ entries: Transaction[], total: number }> {
    return from(DataStore.query(Transaction, t => accountId ? t.account_id.eq(accountId) : t)).pipe(
      map(entries => {
        const total = entries.length;
        const paginated = entries.slice(page * pageSize, (page + 1) * pageSize);
        return { entries: paginated, total };
      })
    );
  }

  async addTransaction(tx: Partial<Transaction>): Promise<Transaction> {
    const account = await DataStore.query(Account, tx.account_id!);
    if (!account) throw new Error('Account not found');

    const isAssetOrExpense = account.type === 'Asset' || account.type === 'Expense';
    const balanceChange = (isAssetOrExpense ? 1 : -1) * (tx.debit ? 1 : -1) * tx.amount!;

    await DataStore.save(Account.copyOf(account, updated => {
      updated.balance += balanceChange;
    }));

    if (tx.from_account_id) {
      const fromAccount = await DataStore.query(Account, tx.from_account_id);
      if (!fromAccount) throw new Error('From account not found');
      const fromIsAssetOrExpense = fromAccount.type === 'Asset' || fromAccount.type === 'Expense';
      await DataStore.save(Account.copyOf(fromAccount, updated => {
        updated.balance += (fromIsAssetOrExpense ? -1 : 1) * (tx.debit ? -1 : 1) * tx.amount!;
      }));
    }

    const accountTransactions = (await DataStore.query(Transaction, t => t.account_id.eq(tx.account_id!)))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const lastTx = accountTransactions[accountTransactions.length - 1];
    const newTx = new Transaction({
      ...tx,
      id: (await DataStore.query(Transaction)).length + 1,
      running_balance: (lastTx ? lastTx.running_balance : account.starting_balance) + balanceChange
    });

    return await DataStore.save(newTx);
  }

  verifyChargeCode(code: string, accountId: number, employeeId: number, amount: number): Observable<boolean> {
    return from(DataStore.query(ChargeCode, cc => cc.charge_code.eq(code).account_id.eq(accountId).employee_id.eq(employeeId))).pipe(
      mergeMap(chargeCodes => {
        if (!chargeCodes.length) return of(false);
        return from(DataStore.query(User, employeeId)).pipe(
          mergeMap(user => {
            if (!user) return of(false);
            if (user.role === 'Manager' || user.role === 'Admin') {
              const tx: Partial<Transaction> = {
                account_id: accountId,
                amount,
                debit: false,
                date: new Date().toISOString(),
                description: `Charge by ${user.name} using code ${code}`,
                running_balance: 0
              };
              return from(this.addTransaction(tx)).pipe(map(() => true));
            }
            return of(true); // Placeholder for pending approval
          })
        );
      })
    );
  }

  async getAccountName(accountId: number): Promise<string> {
    const account = await DataStore.query(Account, accountId);
    return account?.name || 'Unknown';
  }

  async canPost(account: Account, userId: number): Promise<boolean> {
    const chargeCodes = await DataStore.query(ChargeCode, cc => cc.account_id.eq(account.id));
    const hasChargeCode = await Promise.all(chargeCodes.map(async cc => {
      const emp = await DataStore.query(Employee, cc.employee_id);
      return emp?.id === userId;
    })).then(results => results.some(Boolean));
    const hasPermission = await DataStore.query(Permission, p => p.user_id.eq(userId).account_id.eq(account.id).can_view.eq(true)).then(ps => ps.length > 0);
    return hasChargeCode && hasPermission;
  }
}