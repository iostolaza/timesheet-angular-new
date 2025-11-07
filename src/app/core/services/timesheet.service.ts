// file: src/app/core/services/timesheet.service.ts
import { Injectable, inject } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource';
import { AuthService } from './auth.service';
import { FinancialService } from './financial.service';
import { Timesheet, TimesheetEntry, DailyAggregate } from '../models/timesheet.model';
import { ChargeCode } from '../models/financial.model';

@Injectable({
  providedIn: 'root',
})
export class TimesheetService {
  private client = generateClient<Schema>();
  private authService = inject(AuthService);
  private financialService = inject(FinancialService);

  private mapTimesheetFromSchema(data: any): Timesheet {
    const assocJsonRaw = data?.associatedChargeCodesJson ?? '[]';
    const dailyAggRaw = data?.dailyAggregatesJson ?? '[]';
    let parsedAssoc: ChargeCode[] = [];
    let parsedDaily: DailyAggregate[] = [];
    try { parsedAssoc = JSON.parse(assocJsonRaw); } catch { parsedAssoc = []; }
    try { parsedDaily = JSON.parse(dailyAggRaw); } catch { parsedDaily = []; }

    return {
      id: data.id,
      status: data.status,
      totalHours: data.totalHours,
      totalCost: data.totalCost ?? 0,
      userId: data.userId,
      rejectionReason: data.rejectionReason ?? undefined,
      associatedChargeCodes: parsedAssoc,
      dailyAggregates: parsedDaily,
      grossTotal: data.grossTotal ?? 0,
      taxAmount: data.taxAmount ?? 0,
      netTotal: data.netTotal ?? 0,
      startDate: data.startDate ?? undefined,
      endDate: data.endDate ?? undefined,
      entries: [],
    };
  }

  async ensureDraftTimesheet(startDate: string, endDate: string): Promise<Timesheet> {  
    const sub = await this.authService.getCurrentUserId();
    if (!sub) throw new Error('User not authenticated');

    const filter = { 
      userId: { eq: sub }, 
      status: { eq: 'draft' },
      startDate: { eq: startDate }, 
      endDate: { eq: endDate },
    };

    const { data } = await this.client.models.Timesheet.list({ filter });

    if (data && data.length > 0) {
      console.log('Found existing draft timesheet for period', data[0].id);
      return this.mapTimesheetFromSchema(data[0]);
    }

    console.log('No draft found for period, creating a new one...');
    return await this.createTimesheet({
      userId: sub,
      totalHours: 0,
      status: 'draft',
      startDate,
      endDate,
    });
  }

  async createTimesheet(ts: Omit<Timesheet, 'id' | 'entries'>): Promise<Timesheet> {
    const { data, errors } = await this.client.models.Timesheet.create({
      ...ts,
      associatedChargeCodesJson: JSON.stringify([]),
      dailyAggregatesJson: JSON.stringify([]),
    });
    if (errors?.length) throw new Error(errors.map(e => e.message).join(', '));
    return this.mapTimesheetFromSchema(data);
  }

  async updateTimesheet(ts: Partial<Timesheet> & { id: string }): Promise<Timesheet> {
    if (ts.associatedChargeCodes === undefined && ts.associatedChargeCodesJson === undefined) {
      (ts as any).associatedChargeCodesJson = JSON.stringify([]);
    }
    if (ts.dailyAggregates === undefined && ts.dailyAggregatesJson === undefined) {
      (ts as any).dailyAggregatesJson = JSON.stringify([]);
    }
    if (ts.associatedChargeCodes) {
      (ts as any).associatedChargeCodesJson = JSON.stringify(ts.associatedChargeCodes);
      delete (ts as any).associatedChargeCodes;
    }
    if (ts.dailyAggregates) {
      (ts as any).dailyAggregatesJson = JSON.stringify(ts.dailyAggregates);
      delete (ts as any).dailyAggregates;
    }

    const { data, errors } = await this.client.models.Timesheet.update(ts);
    if (errors?.length) throw new Error(errors.map(e => e.message).join(', '));
    return this.mapTimesheetFromSchema(data);
  }

  async listTimesheets(status?: 'draft' | 'submitted' | 'approved' | 'rejected', startDate?: string, endDate?: string): Promise<Timesheet[]> {
    const sub = await this.authService.getCurrentUserId();
    const filter: any = { userId: { eq: sub! } };
    if (status) filter.status = { eq: status };
    if (startDate) filter.startDate = { eq: startDate };
    if (endDate) filter.endDate = { eq: endDate };

    const { data, errors } = await this.client.models.Timesheet.list({ filter });
    if (errors?.length) throw new Error(errors.map(e => e.message).join(', '));
    return data.map(this.mapTimesheetFromSchema);
  }

  async getTimesheetWithEntries(id: string): Promise<Timesheet & { entries: TimesheetEntry[] }> {
    const { data: ts } = await this.client.models.Timesheet.get({ id });
    const { data: entries } = await this.client.models.TimesheetEntry.list({
      filter: { timesheetId: { eq: id } },
    });
    return {
      ...this.mapTimesheetFromSchema(ts!),
      entries: entries as TimesheetEntry[],
    };
  }


  async addEntry(entry: Omit<TimesheetEntry, 'id' | 'timesheetId'>, timesheetId: string): Promise<TimesheetEntry> {
    const { data, errors } = await this.client.models.TimesheetEntry.create({ ...entry, timesheetId });
    if (errors?.length) throw new Error(errors.map(e => e.message).join(', '));
    await this.updateTotals(timesheetId);
    return data as TimesheetEntry;
  }

  async updateEntry(entry: TimesheetEntry, timesheetId: string): Promise<TimesheetEntry> {
    const { data, errors } = await this.client.models.TimesheetEntry.update(entry);
    if (errors?.length) throw new Error(errors.map(e => e.message).join(', '));
    await this.updateTotals(timesheetId);
    return data as TimesheetEntry;
  }

  async deleteEntry(id: string, timesheetId: string): Promise<void> {
    const { errors } = await this.client.models.TimesheetEntry.delete({ id });
    if (errors?.length) throw new Error(errors.map(e => e.message).join(', '));
    await this.updateTotals(timesheetId);
  }

  // --- Approval and rejection flows ---
  async approveTimesheet(id: string): Promise<Timesheet> {
    const ts = await this.getTimesheetWithEntries(id);
    if (ts.status !== 'submitted') throw new Error('Only submitted timesheets can be approved');

    const user = await this.authService.getUserById(ts.userId);
    if (!user) throw new Error('User not found');

    let totalCost = 0;
    for (const entry of ts.entries) {
      const account = await this.financialService.getAccountByNumber(entry.chargeCode);
      if (!account) throw new Error(`Account not found for ${entry.chargeCode}`);
      const amount = entry.hours * user.rate;
      totalCost += amount;

      await this.client.models.Transaction.create({
        accountId: account.id,
        amount,
        debit: true,
        date: new Date().toISOString().split('T')[0],
        description: `Approved timesheet: ${entry.description}`,
        runningBalance: account.balance - amount,
      });
      await this.client.models.Account.update({
        id: account.id,
        balance: account.balance - amount,
      });
    }

    const { data, errors } = await this.client.models.Timesheet.update({
      id,
      status: 'approved',
      totalCost,
    });
    if (errors?.length) throw new Error(errors.map(e => e.message).join(', '));
    return this.mapTimesheetFromSchema(data);
  }

  async rejectTimesheet(id: string, reason: string): Promise<Timesheet> {
    const { data, errors } = await this.client.models.Timesheet.update({
      id,
      status: 'rejected',
      rejectionReason: reason,
    });
    if (errors?.length) throw new Error(errors.map(e => e.message).join(', '));
    return this.mapTimesheetFromSchema(data);
  }

  // --- Totals recalculation ---
  private async calculateAggregates(entries: TimesheetEntry[], rate: number, otMultiplier: number, taxRate: number) {
    const grouped = entries.reduce((acc, e) => {
      acc[e.date] = acc[e.date] || { hours: 0 };
      acc[e.date].hours += e.hours;
      return acc;
    }, {} as Record<string, { hours: number }>);

    const dailyAggregates: DailyAggregate[] = Object.entries(grouped).map(([date, { hours }]) => {
      const base = Math.min(8, hours);
      const ot = Math.max(0, hours - 8);
      const regPay = base * rate;
      const otPay = ot * rate * otMultiplier;
      return { date, base, ot, regPay, otPay, subtotal: regPay + otPay };
    });

    const grossTotal = dailyAggregates.reduce((sum, d) => sum + d.subtotal, 0);
    const taxAmount = grossTotal * taxRate;
    const netTotal = grossTotal - taxAmount;
    return { dailyAggregates, grossTotal, taxAmount, netTotal };
  }

  public async updateTotals(id: string): Promise<void> {
    const ts = await this.getTimesheetWithEntries(id);
    const user = await this.authService.getUserById(ts.userId);
    if (!user) throw new Error('User not found');

    const { dailyAggregates, grossTotal, taxAmount, netTotal } = await this.calculateAggregates(
      ts.entries,
      user.rate,
      user.otMultiplier ?? 1.5,
      user.taxRate ?? 0.015
    );
    const totalHours = ts.entries.reduce((sum, e) => sum + e.hours, 0);
    await this.client.models.Timesheet.update({
      id,
      totalHours,
      dailyAggregatesJson: JSON.stringify(dailyAggregates),
      grossTotal,
      taxAmount,
      netTotal,
    });
  }
}