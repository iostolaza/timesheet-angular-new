// src/app/core/services/timesheet.service.ts
import { Injectable, inject } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { FinancialService } from './financial.service';
import { Timesheet, TimesheetEntry } from '../models/timesheet.model';
import { addDays, startOfWeek } from 'date-fns';

@Injectable({
  providedIn: 'root'
})
export class TimesheetService {
  private client = generateClient<Schema>();
  private authService = inject(AuthService);
  private financialService = inject(FinancialService);

  private mapTimesheetFromSchema(data: any): Timesheet {
    return {
      id: data.id,
      status: data.status,
      totalHours: data.totalHours,
      totalCost: data.totalCost ?? undefined,
      owner: data.owner,
      rejectionReason: data.rejectionReason ?? undefined,
      entries: [],
    };
  }

  async createTimesheet(ts: Omit<Timesheet, 'id'>): Promise<Timesheet> {
    const sub = await firstValueFrom(this.authService.getUserSub());
    const { data, errors } = await this.client.models.Timesheet.create({
      ...ts,
      owner: sub!,
      status: ts.status, // Respect the provided status
    });
    if (errors?.length) {
      console.error('Failed to create timesheet', errors);
      throw new Error(`Failed to create timesheet: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) throw new Error('No data returned from timesheet creation');
    console.log('Timesheet created', { id: data.id, status: ts.status });
    return this.mapTimesheetFromSchema(data);
  }

  async updateTimesheet(ts: Partial<Timesheet> & { id: string }): Promise<Timesheet> {
  const { data, errors } = await this.client.models.Timesheet.update(ts);
  if (errors?.length) {
    console.error('Failed to update timesheet', errors);
    throw new Error(`Failed to update timesheet: ${errors.map(e => e.message).join(', ')}`);
  }
  if (!data) throw new Error('No data returned from timesheet update');
  console.log('Timesheet updated', { id: data.id, status: data.status });
  return this.mapTimesheetFromSchema(data);
}


  async listTimesheets(status?: 'draft' | 'submitted' | 'approved' | 'rejected'): Promise<Timesheet[]> {
    const sub = await firstValueFrom(this.authService.getUserSub());
    const query: any = { filter: { owner: { eq: sub! } } };
    if (status) query.filter.status = { eq: status };
    const { data, errors } = await this.client.models.Timesheet.list(query);
    if (errors?.length) {
      console.error('Failed to list timesheets', errors);
      throw new Error(`Failed to list timesheets: ${errors.map(e => e.message).join(', ')}`);
    }
    console.log('Listed timesheets', { count: data.length });
    return data.map(this.mapTimesheetFromSchema);
  }

  async getTimesheetWithEntries(id: string): Promise<Timesheet & { entries: TimesheetEntry[] }> {
    const { data: ts, errors: tsErrors } = await this.client.models.Timesheet.get({ id });
    if (tsErrors?.length) {
      console.error('Failed to get timesheet', tsErrors);
      throw new Error(`Failed to get timesheet: ${tsErrors.map(e => e.message).join(', ')}`);
    }
    if (!ts) throw new Error(`Timesheet ${id} not found`);
    const { data: entries, errors: entryErrors } = await this.client.models.TimesheetEntry.list({
      filter: { timesheetId: { eq: id } },
    });
    if (entryErrors?.length) {
      console.error('Failed to list timesheet entries', entryErrors);
      throw new Error(`Failed to list timesheet entries: ${entryErrors.map(e => e.message).join(', ')}`);
    }
    console.log('Fetched timesheet with entries', { id, entryCount: entries.length });
    return {
      ...this.mapTimesheetFromSchema(ts),
      entries: entries as TimesheetEntry[],
    };
  }

  async addEntry(entry: Omit<TimesheetEntry, 'id' | 'timesheetId'>, timesheetId: string): Promise<TimesheetEntry> {
    const sub = await firstValueFrom(this.authService.getUserSub());
    const fullEntry = { ...entry, owner: sub!, timesheetId };
    console.log('Adding timesheet entry', { timesheetId, date: fullEntry.date });

    const { data, errors } = await this.client.models.TimesheetEntry.create(fullEntry);
    if (errors?.length) {
      console.error('Failed to create timesheet entry', errors);
      throw new Error(`Failed to create timesheet entry: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) {
      console.error('No data returned from timesheet entry creation');
      throw new Error('No data returned from timesheet entry creation');
    }
    await this.updateTotals(timesheetId);
    console.log('Timesheet entry created', { id: data.id });
    return data as TimesheetEntry;
  }

  async updateEntry(entry: TimesheetEntry, timesheetId: string): Promise<TimesheetEntry> {
    console.log('Updating timesheet entry', { id: entry.id });
    const { data: originalEntry, errors: originalErrors } = await this.client.models.TimesheetEntry.get({ id: entry.id });
    if (originalErrors?.length) {
      console.error('Failed to get timesheet entry', originalErrors);
      throw new Error(`Failed to get timesheet entry: ${originalErrors.map(e => e.message).join(', ')}`);
    }
    if (!originalEntry) {
      console.error('Entry not found', { id: entry.id });
      throw new Error('Entry not found');
    }

    const { data, errors } = await this.client.models.TimesheetEntry.update(entry);
    if (errors?.length) {
      console.error('Failed to update timesheet entry', errors);
      throw new Error(`Failed to update timesheet entry: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) {
      console.error('No data returned from timesheet entry update');
      throw new Error('No data returned from timesheet entry update');
    }
    await this.updateTotals(timesheetId);
    console.log('Timesheet entry updated', { id: data.id });
    return data as TimesheetEntry;
  }
  
async deleteEntry(id: string, timesheetId: string): Promise<void> {
  const { errors } = await this.client.models.TimesheetEntry.delete({ id });
  if (errors?.length) {
    console.error('Failed to delete timesheet entry', errors);
    throw new Error(`Failed to delete entry: ${errors.map(e => e.message).join(', ')}`);
  }
  await this.updateTotals(timesheetId);
  console.log('Timesheet entry deleted', { id });
}

  async approveTimesheet(id: string): Promise<Timesheet> {
    const tsWithEntries = await this.getTimesheetWithEntries(id);
    if (tsWithEntries.status !== 'submitted') {
      console.error('Invalid timesheet status for approval', { status: tsWithEntries.status });
      throw new Error('Only submitted timesheets can be approved');
    }

    const user = await this.authService.getUserById(tsWithEntries.owner);
    let totalCost = 0;
    for (const entry of tsWithEntries.entries) {
      const account = await this.financialService.getAccountByNumber(entry.chargeCode);
      if (!account) {
        console.error('Account not found for charge code', { chargeCode: entry.chargeCode });
        throw new Error(`Account not found for ${entry.chargeCode}`);
      }
      const amount = entry.hours * user.rate;
      totalCost += amount;

      const { data: txData, errors: txErrors } = await this.client.models.Transaction.create({
        accountId: account.id,
        amount,
        debit: true,
        date: new Date().toISOString().split('T')[0],
        description: `Approved timesheet: ${entry.description}`,
        runningBalance: account.balance - amount,
      });
      if (txErrors?.length) {
        console.error('Failed to create transaction', txErrors);
        throw new Error(`Failed to create transaction: ${txErrors.map(e => e.message).join(', ')}`);
      }
      if (!txData) {
        console.error('No data returned from transaction creation');
        throw new Error('No data returned from transaction creation');
      }

      const { data: accountData, errors: accountUpdateErrors } = await this.client.models.Account.update({
        id: account.id,
        balance: account.balance - amount,
      });
      if (accountUpdateErrors?.length) {
        console.error('Failed to update account', accountUpdateErrors);
        throw new Error(`Failed to update account: ${accountUpdateErrors.map(e => e.message).join(', ')}`);
      }
      if (!accountData) {
        console.error('No data returned from account update');
        throw new Error('No data returned from account update');
      }
      console.log('Created transaction and updated account', { transactionId: txData.id, accountId: account.id });
    }

    const { data, errors } = await this.client.models.Timesheet.update({
      id,
      status: 'approved',
      totalCost,
    });
    if (errors?.length) {
      console.error('Failed to approve timesheet', errors);
      throw new Error(`Failed to approve timesheet: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) {
      console.error('No data returned from timesheet update');
      throw new Error('No data returned from timesheet update');
    }
    console.log('Timesheet approved', { id });
    return this.mapTimesheetFromSchema(data);
  }

  async rejectTimesheet(id: string, reason: string): Promise<Timesheet> {
    const { data, errors } = await this.client.models.Timesheet.update({
      id,
      status: 'rejected',
      rejectionReason: reason,
    });
    if (errors?.length) {
      console.error('Failed to reject timesheet', errors);
      throw new Error(`Failed to reject timesheet: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) {
      console.error('No data returned from timesheet update');
      throw new Error('No data returned from timesheet update');
    }
    console.log('Timesheet rejected', { id, reason });
    return this.mapTimesheetFromSchema(data);
  }

  private async updateTotals(id: string): Promise<void> {
    const tsWithEntries = await this.getTimesheetWithEntries(id);
    const totalHours = tsWithEntries.entries.reduce((sum, e) => sum + e.hours, 0);
    const { data, errors } = await this.client.models.Timesheet.update({
      id,
      totalHours,
    });
    if (errors?.length) {
      console.error('Failed to update timesheet totals', errors);
      throw new Error(`Failed to update timesheet totals: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) {
      console.error('No data returned from timesheet update');
      throw new Error('No data returned from timesheet update');
    }
    console.log('Updated timesheet totals', { id, totalHours });
  }
}