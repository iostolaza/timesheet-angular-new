// src/app/core/services/timesheet.service.ts

import { Injectable, inject } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource';
import { firstValueFrom, from } from 'rxjs';
import { AuthService } from './auth.service';
import { FinancialService } from './financial.service';
import { Timesheet, TimesheetEntry } from '../models/timesheet.model';
import { Account } from '../models/financial.model';
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
      entries: [] // Entries are fetched separately
    };
  }

  async createTimesheet(ts: Omit<Timesheet, 'id'>): Promise<Timesheet> {
    const sub = await firstValueFrom(this.authService.getUserSub());
    const { data, errors } = await this.client.models.Timesheet.create({
      ...ts,
      owner: sub!,
      status: 'draft'
    });
    if (errors?.length) {
      throw new Error(`Failed to create timesheet: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) throw new Error('No data returned from timesheet creation');
    return this.mapTimesheetFromSchema(data);
  }

  async listTimesheets(status?: 'draft' | 'submitted' | 'rejected'): Promise<Timesheet[]> {
    const sub = await firstValueFrom(this.authService.getUserSub());
    const query: any = { filter: { owner: { eq: sub! } } };
    if (status) query.filter.status = { eq: status };
    const { data, errors } = await this.client.models.Timesheet.list(query);
    if (errors?.length) {
      throw new Error(`Failed to list timesheets: ${errors.map(e => e.message).join(', ')}`);
    }
    return data.map(this.mapTimesheetFromSchema);
  }

  async getTimesheetWithEntries(id: string): Promise<Timesheet & { entries: TimesheetEntry[] }> {
    const { data: ts, errors: tsErrors } = await this.client.models.Timesheet.get({ id });
    if (tsErrors?.length) {
      throw new Error(`Failed to get timesheet: ${tsErrors.map(e => e.message).join(', ')}`);
    }
    if (!ts) throw new Error(`Timesheet ${id} not found`);
    const { data: entries, errors: entryErrors } = await this.client.models.TimesheetEntry.list({
      filter: { timesheetId: { eq: id } }
    });
    if (entryErrors?.length) {
      throw new Error(`Failed to list timesheet entries: ${entryErrors.map(e => e.message).join(', ')}`);
    }
    return {
      ...this.mapTimesheetFromSchema(ts),
      entries: entries as TimesheetEntry[]
    };
  }

  async addEntry(entry: Omit<TimesheetEntry, 'id' | 'timesheetId'>, timesheetId: string): Promise<TimesheetEntry> {
    const sub = await firstValueFrom(this.authService.getUserSub());
    const fullEntry = { ...entry, owner: sub!, timesheetId };
    const { data: existing, errors: existingErrors } = await this.client.models.TimesheetEntry.list({
      filter: { timesheetId: { eq: timesheetId }, date: { eq: fullEntry.date } }
    });
    if (existingErrors?.length) {
      throw new Error(`Failed to list timesheet entries: ${existingErrors.map(e => e.message).join(', ')}`);
    }
    const dailyTotal = (existing as TimesheetEntry[]).reduce((sum, e) => sum + e.hours, 0) + fullEntry.hours;
    if (dailyTotal > 8) throw new Error('Daily hours exceed 8');

    const weekStart = startOfWeek(new Date(fullEntry.date)).toISOString().split('T')[0];
    const weekEnd = addDays(new Date(weekStart), 6).toISOString().split('T')[0];
    const { data: weekEntries, errors: weekErrors } = await this.client.models.TimesheetEntry.list({
      filter: { timesheetId: { eq: timesheetId }, date: { between: [weekStart, weekEnd] } }
    });
    if (weekErrors?.length) {
      throw new Error(`Failed to list weekly timesheet entries: ${weekErrors.map(e => e.message).join(', ')}`);
    }
    const weeklyTotal = (weekEntries as TimesheetEntry[]).reduce((sum, e) => sum + e.hours, 0) + fullEntry.hours;
    if (weeklyTotal > 40) throw new Error('Weekly hours exceed 40');

    const groups = await firstValueFrom(from(this.authService.getUserGroups()));
    if (!groups.includes(`chargecode-${fullEntry.chargeCode}`)) {
      throw new Error(`Access denied: Not in group chargecode-${fullEntry.chargeCode}`);
    }

    const { data, errors } = await this.client.models.TimesheetEntry.create(fullEntry);
    if (errors?.length) {
      throw new Error(`Failed to create timesheet entry: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) throw new Error('No data returned from timesheet entry creation');
    await this.updateTotals(timesheetId);
    return data as TimesheetEntry;
  }

  async updateEntry(entry: TimesheetEntry, timesheetId: string): Promise<TimesheetEntry> {
    const { data: originalEntry, errors: originalErrors } = await this.client.models.TimesheetEntry.get({ id: entry.id });
    if (originalErrors?.length) {
      throw new Error(`Failed to get timesheet entry: ${originalErrors.map(e => e.message).join(', ')}`);
    }
    if (!originalEntry) throw new Error('Entry not found');

    const oldHours = (originalEntry as TimesheetEntry).hours;
    const oldDate = (originalEntry as TimesheetEntry).date;

    const { data: existing, errors: existingErrors } = await this.client.models.TimesheetEntry.list({
      filter: { timesheetId: { eq: timesheetId }, date: { eq: entry.date } }
    });
    if (existingErrors?.length) {
      throw new Error(`Failed to list timesheet entries: ${existingErrors.map(e => e.message).join(', ')}`);
    }
    let dailyTotal = (existing as TimesheetEntry[]).reduce((sum, e) => sum + e.hours, 0);
    if (oldDate === entry.date) {
      dailyTotal = dailyTotal - oldHours + entry.hours;
    } else {
      dailyTotal += entry.hours;
    }
    if (dailyTotal > 8) throw new Error('Daily hours exceed 8');

    const weekStart = startOfWeek(new Date(entry.date)).toISOString().split('T')[0];
    const weekEnd = addDays(new Date(weekStart), 6).toISOString().split('T')[0];
    const { data: weekEntries, errors: weekErrors } = await this.client.models.TimesheetEntry.list({
      filter: { timesheetId: { eq: timesheetId }, date: { between: [weekStart, weekEnd] } }
    });
    if (weekErrors?.length) {
      throw new Error(`Failed to list weekly timesheet entries: ${weekErrors.map(e => e.message).join(', ')}`);
    }
    let weeklyTotal = (weekEntries as TimesheetEntry[]).reduce((sum, e) => sum + e.hours, 0);
    weeklyTotal = weeklyTotal - oldHours + entry.hours;
    if (weeklyTotal > 40) throw new Error('Weekly hours exceed 40');

    const groups = await firstValueFrom(from(this.authService.getUserGroups()));
    if (!groups.includes(`chargecode-${entry.chargeCode}`)) {
      throw new Error(`Access denied: Not in group chargecode-${entry.chargeCode}`);
    }

    const { data, errors } = await this.client.models.TimesheetEntry.update(entry);
    if (errors?.length) {
      throw new Error(`Failed to update timesheet entry: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) throw new Error('No data returned from timesheet entry update');
    await this.updateTotals(timesheetId);
    return data as TimesheetEntry;
  }

  async submitTimesheet(id: string): Promise<Timesheet> {
    const tsWithEntries = await this.getTimesheetWithEntries(id);
    if (tsWithEntries.entries.length === 0) throw new Error('No entries');
    const { data, errors } = await this.client.models.Timesheet.update({
      id,
      status: 'submitted'
    });
    if (errors?.length) {
      throw new Error(`Failed to submit timesheet: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) throw new Error('No data returned from timesheet update');
    return this.mapTimesheetFromSchema(data);
  }

  async approveTimesheet(id: string): Promise<Timesheet> {
    const groups = await firstValueFrom(from(this.authService.getUserGroups()));
    if (!groups.includes('Manager') && !groups.includes('Admin')) {
      throw new Error('Manager or Admin access required');
    }
    const tsWithEntries = await this.getTimesheetWithEntries(id);
    if (tsWithEntries.status !== 'submitted') throw new Error('Only submitted timesheets can be approved');

    const user = await this.authService.getUserById(tsWithEntries.owner);
    let totalCost = 0;
    for (const entry of tsWithEntries.entries) {
      const account = await this.financialService.getAccountByNumber(entry.chargeCode);
      if (!account) throw new Error(`Account not found for ${entry.chargeCode}`);
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
        throw new Error(`Failed to create transaction: ${txErrors.map(e => e.message).join(', ')}`);
      }
      if (!txData) throw new Error('No data returned from transaction creation');

      const { data: accountData, errors: accountUpdateErrors } = await this.client.models.Account.update({
        id: account.id,
        balance: account.balance - amount
      });
      if (accountUpdateErrors?.length) {
        throw new Error(`Failed to update account: ${accountUpdateErrors.map(e => e.message).join(', ')}`);
      }
      if (!accountData) throw new Error('No data returned from account update');
    }

    const { data, errors } = await this.client.models.Timesheet.update({
      id,
      status: 'approved',
      totalCost
    });
    if (errors?.length) {
      throw new Error(`Failed to approve timesheet: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) throw new Error('No data returned from timesheet update');
    return this.mapTimesheetFromSchema(data);
  }

  async rejectTimesheet(id: string, reason: string): Promise<Timesheet> {
    const groups = await firstValueFrom(from(this.authService.getUserGroups()));
    if (!groups.includes('Manager') && !groups.includes('Admin')) {
      throw new Error('Manager or Admin access required');
    }
    const { data, errors } = await this.client.models.Timesheet.update({
      id,
      status: 'rejected',
      rejectionReason: reason
    });
    if (errors?.length) {
      throw new Error(`Failed to reject timesheet: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) throw new Error('No data returned from timesheet update');
    return this.mapTimesheetFromSchema(data);
  }

  private async updateTotals(id: string): Promise<void> {
    const tsWithEntries = await this.getTimesheetWithEntries(id);
    const totalHours = tsWithEntries.entries.reduce((sum, e) => sum + e.hours, 0);
    const { data, errors } = await this.client.models.Timesheet.update({
      id,
      totalHours
    });
    if (errors?.length) {
      throw new Error(`Failed to update timesheet totals: ${errors.map(e => e.message).join(', ')}`);
    }
    if (!data) throw new Error('No data returned from timesheet update');
  }
}