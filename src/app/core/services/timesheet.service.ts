
// src/app/core/services/timesheet.service.ts


import { Timesheet, TimesheetEntry } from '../../core/models/timesheet.model';
import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import { FinancialService } from './financial.service';
import { Observable, from, of } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { startOfDay, endOfWeek, differenceInHours, parse } from 'date-fns';
import { Amplify } from 'aws-amplify';
import { DataStore } from '@aws-amplify/datastore';

@Injectable({
  providedIn: 'root'
})
export class TimesheetService {
  constructor(private financialService: FinancialService) {
    Amplify.configure({
      API: {
        GraphQL: {
          endpoint: 'YOUR_AMPLIFY_API_ENDPOINT', // Replace after amplify push
          region: 'YOUR_AWS_REGION', // e.g., 'us-east-1'
          defaultAuthMode: 'AWS_IAM'
        }
      }
    });
  }

  async createTimesheet(): Promise<string> {
    const id = uuidv4();
    const timesheet = new Timesheet({
      id,
      status: 'draft',
      totalHours: 0,
      totalCost: 0,
      owner: 'user1'
    });
    await DataStore.save(timesheet);
    return id;
  }

  async getTimesheets(status?: string): Promise<Timesheet[]> {
    const timesheets = await DataStore.query(Timesheet);
    const filtered = status ? timesheets.filter(t => t.status === status) : timesheets;
    return Promise.all(filtered.map(async timesheet => {
      const entries = await DataStore.query(TimesheetEntry, e => e.timesheetId.eq(timesheet.id));
      return {
        ...timesheet,
        entries: entries.filter(entry => {
          const start = parse(`${entry.date} ${entry.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
          const end = parse(`${entry.date} ${entry.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
          if (end <= start) {
            console.warn('Removing invalid timesheet entry:', { entry });
            return false;
          }
          return true;
        })
      };
    }));
  }

  async addEntry(entry: Omit<TimesheetEntry, 'id'>): Promise<void> {
    const timesheet = await DataStore.query(Timesheet, entry.timesheetId);
    if (!timesheet) throw new Error('Timesheet not found');

    const start = parse(`${entry.date} ${entry.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const end = parse(`${entry.date} ${entry.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const hours = differenceInHours(end, start);

    if (hours <= 0) {
      throw new Error('End time must be after start time');
    }

    const newEntry = new TimesheetEntry({
      id: uuidv4(),
      timesheetId: entry.timesheetId,
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      hours,
      description: entry.description,
      accountId: entry.accountId
    });

    const entries = await DataStore.query(TimesheetEntry, e => e.timesheetId.eq(timesheet.id));
    const updatedEntries = [...entries, newEntry];
    const totalHours = updatedEntries.reduce((sum: number, e: TimesheetEntry) => sum + e.hours, 0);

    const validationErrors = await this.validateHours(timesheet, updatedEntries);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join('\n'));
    }

    await DataStore.save(newEntry);
    await DataStore.save(Timesheet.copyOf(timesheet, updated => {
      updated.totalHours = totalHours;
    }));
  }

  async updateEntry(entry: TimesheetEntry): Promise<void> {
    const timesheet = await DataStore.query(Timesheet, entry.timesheetId);
    if (!timesheet) throw new Error('Timesheet not found');
    const existingEntry = await DataStore.query(TimesheetEntry, entry.id);
    if (!existingEntry) throw new Error('Entry not found');

    const start = parse(`${entry.date} ${entry.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const end = parse(`${entry.date} ${entry.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const hours = differenceInHours(end, start);

    if (hours <= 0) {
      throw new Error('End time must be after start time');
    }

    const updatedEntry = TimesheetEntry.copyOf(existingEntry, updated => {
      updated.date = entry.date;
      updated.startTime = entry.startTime;
      updated.endTime = entry.endTime;
      updated.hours = hours;
      updated.description = entry.description;
      updated.accountId = entry.accountId;
    });

    const entries = await DataStore.query(TimesheetEntry, e => e.timesheetId.eq(timesheet.id));
    const updatedEntries = entries.map(e => e.id === entry.id ? updatedEntry : e);
    const totalHours = updatedEntries.reduce((sum: number, e: TimesheetEntry) => sum + e.hours, 0);

    const validationErrors = await this.validateHours(timesheet, updatedEntries);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join('\n'));
    }

    await DataStore.save(updatedEntry);
    await DataStore.save(Timesheet.copyOf(timesheet, updated => {
      updated.totalHours = totalHours;
    }));
  }

  async submitTimesheet(timesheetId: string): Promise<void> {
    const timesheet = await DataStore.query(Timesheet, timesheetId);
    if (!timesheet) throw new Error('Timesheet not found');
    await DataStore.save(Timesheet.copyOf(timesheet, updated => {
      updated.status = 'submitted';
    }));
  }

  async approveTimesheet(timesheetId: string, entries: TimesheetEntry[]): Promise<void> {
    const timesheet = await DataStore.query(Timesheet, timesheetId);
    if (!timesheet) throw new Error('Timesheet not found');

    const filteredEntries = await Promise.all(entries.map(async entry => {
      const start = parse(`${entry.date} ${entry.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
      const end = parse(`${entry.date} ${entry.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
      if (end <= start) {
        console.warn('Removing invalid timesheet entry:', { entry });
        return null;
      }
      const existingEntry = await DataStore.query(TimesheetEntry, entry.id);
      if (!existingEntry) return null;
      return TimesheetEntry.copyOf(existingEntry, updated => {
        updated.date = entry.date;
        updated.startTime = entry.startTime;
        updated.endTime = entry.endTime;
        updated.hours = entry.hours;
        updated.description = entry.description;
        updated.accountId = entry.accountId;
      });
    }));

    const validEntries = filteredEntries.filter(entry => entry !== null) as TimesheetEntry[];
    const totalHours = validEntries.reduce((sum: number, e: TimesheetEntry) => sum + e.hours, 0);

    await Promise.all(validEntries.map(entry => DataStore.save(entry)));
    await DataStore.save(Timesheet.copyOf(timesheet, updated => {
      updated.status = 'approved';
      updated.totalHours = totalHours;
    }));
  }

  async rejectTimesheet(timesheetId: string, rejectionReason: string): Promise<void> {
    const timesheet = await DataStore.query(Timesheet, timesheetId);
    if (!timesheet) throw new Error('Timesheet not found');
    await DataStore.save(Timesheet.copyOf(timesheet, updated => {
      updated.status = 'rejected';
      updated.rejectionReason = rejectionReason;
    }));
  }

  async getAccounts(): Promise<FinancialAccount[]> {
    try {
      const accounts = await this.financialService.getAccounts(1).toPromise();
      return accounts;
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      return [];
    }
  }

  async getAccountName(accountId: number): Promise<string> {
    return this.financialService.getAccountName(accountId);
  }

  async validateHours(timesheet: Timesheet, entries?: TimesheetEntry[]): Promise<string[]> {
    const errors: string[] = [];
    const targetEntries = entries ?? await DataStore.query(TimesheetEntry, e => e.timesheetId.eq(timesheet.id));

    const entriesByDate = targetEntries.reduce((acc: Record<string, TimesheetEntry[]>, entry) => {
      const date = entry.date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(entry);
      return acc;
    }, {});

    Object.entries(entriesByDate).forEach(([date, entries]) => {
      const totalHours = entries.reduce((sum: number, e: TimesheetEntry) => sum + e.hours, 0);
      if (totalHours !== 8) {
        errors.push(`Date ${date} has ${totalHours} hours, expected 8 hours.`);
      }
    });

    const weekStart = startOfDay(targetEntries[0]?.date ? parse(targetEntries[0].date, 'yyyy-MM-dd', new Date()) : new Date());
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const weeklyEntries = targetEntries.filter(e => {
      const entryDate = parse(e.date, 'yyyy-MM-dd', new Date());
      return entryDate >= weekStart && entryDate <= weekEnd;
    });
    const weeklyHours = weeklyEntries.reduce((sum: number, e: TimesheetEntry) => sum + e.hours, 0);
    if (weeklyHours !== 40) {
      errors.push(`Week starting ${weekStart.toISOString().split('T')[0]} has ${weeklyHours} hours, expected 40 hours.`);
    }

    return errors;
  }

  getDailySubtotals(timesheetId: string): Observable<{ date: string, accountId: number, accountName: string, hours: number }[]> {
    return from(DataStore.query(Timesheet, timesheetId)).pipe(
      map(timesheet => {
        if (!timesheet) return [];
        return from(DataStore.query(TimesheetEntry, e => e.timesheetId.eq(timesheet.id))).pipe(
          map(entries => {
            const subtotals = entries.reduce((acc: Record<string, { date: string, accountId: number, accountName: string, hours: number }>, entry) => {
              const key = `${entry.date}:${entry.accountId}`;
              if (!acc[key]) {
                acc[key] = { date: entry.date, accountId: entry.accountId, accountName: '', hours: 0 };
              }
              acc[key].hours += entry.hours;
              return acc;
            }, {});
            return this.financialService.getAccounts(1).pipe(
              map(accounts => {
                const accountMap = new Map(accounts.map(a => [a.id, a.name]));
                return Object.values(subtotals).map(subtotal => ({
                  ...subtotal,
                  accountName: accountMap.get(subtotal.accountId) || 'Unknown'
                }));
              })
            );
          }),
          mergeMap(obs => obs)
        );
      }),
      mergeMap(obs => obs)
    );
  }
}