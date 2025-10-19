// src/app/core/services/timesheet.service.ts

import { Injectable, inject } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource';
import { firstValueFrom } from 'rxjs';
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

  async createTimesheet(ts: Omit<Timesheet, 'id'>): Promise<Timesheet> {
    const sub = await firstValueFrom(this.authService.getUserSub());
    const { data } = await (this.client.models as any)['Timesheet'].create({
      data: { ...ts, owner: sub!, status: 'draft' },
    });
    return data as Timesheet;
  }

  async listTimesheets(status?: 'draft' | 'submitted' | 'rejected'): Promise<Timesheet[]> {
    const sub = await firstValueFrom(this.authService.getUserSub());
    const query: any = { filter: { owner: { eq: sub! } } };
    if (status) query.filter.status = { eq: status };
    const { data } = await (this.client.models as any)['Timesheet'].list(query);
    return data as Timesheet[];
  }

  async getTimesheetWithEntries(id: string): Promise<Timesheet & { entries: TimesheetEntry[] }> {
    const { data: ts } = await (this.client.models as any)['Timesheet'].get({ id });
    if (!ts) throw new Error(`Timesheet ${id} not found`);
    const { data: entries } = await (this.client.models as any)['TimesheetEntry'].list({
      filter: { timesheetId: { eq: id } },
    });
    return { ... (ts as Timesheet), entries: entries as TimesheetEntry[] };
  }

  async addEntry(entry: Omit<TimesheetEntry, 'id' | 'timesheetId'>, timesheetId: string)
: Promise<TimesheetEntry> {
    const sub = await firstValueFrom(this.authService.getUserSub());
    const fullEntry = { ...entry, owner: sub!, timesheetId };
    const { data: existing } = await (this.client.models as any)['TimesheetEntry'].list({
      filter: { timesheetId: { eq: timesheetId }, date: { eq: fullEntry.date } },
    });
    const dailyTotal = (existing as TimesheetEntry[]).reduce((sum, e) => sum + e.hours, 0) + fullEntry.hours;
    if (dailyTotal > 8) throw new Error('Daily hours exceed 8');

    const weekStart = startOfWeek(new Date(fullEntry.date)).toISOString().split('T')[0];
    const weekEnd = addDays(new Date(weekStart), 6).toISOString().split('T')[0];
    const { data: weekEntries } = await (this.client.models as any)['TimesheetEntry'].list({
      filter: { timesheetId: { eq: timesheetId }, date: { between: [weekStart, weekEnd] } },
    });
    const weeklyTotal = (weekEntries as TimesheetEntry[]).reduce((sum, e) => sum + e.hours, 0) + fullEntry.hours;
    if (weeklyTotal > 40) throw new Error('Weekly hours exceed 40');

    const groups = await firstValueFrom(this.authService.getUserGroups());
    const group = `chargecode-${fullEntry.chargeCode}`;
    if (!groups.includes(group)) throw new Error(`Access denied: Not in group ${group}`);

    const { data } = await (this.client.models as any)['TimesheetEntry'].create({ data: fullEntry });
    await this.updateTotals(timesheetId);
    return data as TimesheetEntry;
  }

  // New: Update existing entry (for drag-drop/edit)
  async updateEntry(entry: TimesheetEntry, timesheetId: string): Promise<TimesheetEntry> {
    const { data: existing } = await (this.client.models as any)['TimesheetEntry'].list({
      filter: { timesheetId: { eq: timesheetId }, date: { eq: entry.date } },
    });
    const dailyTotal = (existing as TimesheetEntry[]).reduce((sum, e) => sum + e.hours, 0) - entry.hours + entry.hours;  // Adjust for self
    if (dailyTotal > 8) throw new Error('Daily hours exceed 8');

    const weekStart = startOfWeek(new Date(entry.date)).toISOString().split('T')[0];
    const weekEnd = addDays(new Date(weekStart), 6).toISOString().split('T')[0];
    const { data: weekEntries } = await (this.client.models as any)['TimesheetEntry'].list({
      filter: { timesheetId: { eq: timesheetId }, date: { between: [weekStart, weekEnd] } },
    });
    const weeklyTotal = (weekEntries as TimesheetEntry[]).reduce((sum, e) => sum + e.hours, 0) - entry.hours + entry.hours;
    if (weeklyTotal > 40) throw new Error('Weekly hours exceed 40');

    const groups = await firstValueFrom(this.authService.getUserGroups());
    const group = `chargecode-${entry.chargeCode}`;
    if (!groups.includes(group)) throw new Error(`Access denied: Not in group ${group}`);

    const { data } = await (this.client.models as any)['TimesheetEntry'].update({
      id: entry.id,
      data: entry,
    });
    await this.updateTotals(timesheetId);
    return data as TimesheetEntry;
  }

  async submitTimesheet(id: string): Promise<Timesheet> {
    const tsWithEntries = await this.getTimesheetWithEntries(id);
    if (tsWithEntries.entries.length === 0) throw new Error('No entries');
    const { data } = await (this.client.models as any)['Timesheet'].update({
      id,
      data: { status: 'submitted' },
    });
    return data as Timesheet;
  }

  async approveTimesheet(id: string): Promise<Timesheet> {
    const groups = await firstValueFrom(this.authService.getUserGroups());
    if (!groups.includes('Manager')) throw new Error('Manager access required');
    const tsWithEntries = await this.getTimesheetWithEntries(id);
    if (tsWithEntries.status !== 'submitted') throw new Error('Only submitted timesheets can be approved');

    const user = await this.authService.getUserById(tsWithEntries.owner);
    let totalCost = 0;
    for (const entry of tsWithEntries.entries) {
      const { data: accounts } = await (this.client.models as any)['Account'].list({
        filter: { accountNumber: { eq: entry.chargeCode } },
      });
      if ((accounts as Account[]).length === 0) throw new Error(`Account not found for ${entry.chargeCode}`);
      const account = accounts[0] as Account;
      const amount = entry.hours * user.rate;
      totalCost += amount;

      await (this.client.models as any)['Transaction'].create({
        data: {
          accountId: account.id,
          amount,
          debit: true,
          date: new Date().toISOString().split('T')[0],
          description: `Approved timesheet: ${entry.description}`,
          runningBalance: account.balance - amount,
        },
      });

      await (this.client.models as any)['Account'].update({
        id: account.id,
        data: { balance: account.balance - amount },
      });
    }

    const { data } = await (this.client.models as any)['Timesheet'].update({
      id,
      data: { status: 'approved', totalCost },
    });
    return data as Timesheet;
  }

  async rejectTimesheet(id: string, reason: string): Promise<Timesheet> {
    const groups = await firstValueFrom(this.authService.getUserGroups());
    if (!groups.includes('Manager')) throw new Error('Manager access required');
    const { data } = await (this.client.models as any)['Timesheet'].update({
      id,
      data: { status: 'rejected', rejectionReason: reason },
    });
    return data as Timesheet;
  }

  private async updateTotals(id: string): Promise<void> {
    const tsWithEntries = await this.getTimesheetWithEntries(id);
    const totalHours = tsWithEntries.entries.reduce((sum, e) => sum + e.hours, 0);
    await (this.client.models as any)['Timesheet'].update({
      id,
      data: { totalHours },
    });
  }
}