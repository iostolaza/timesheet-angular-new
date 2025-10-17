// src/app/core/models/timesheet.model.ts

export interface TimesheetEntry {
  id: string;
  timesheetId: string;
  date: string; // ISO date (e.g., "2025-10-16")
  startTime: string; // e.g., "09:00"
  endTime: string; // e.g., "12:00"
  hours: number; // Calculated from startTime/endTime
  description: string;
  accountId: number; // Matches Account.id from financial.model.ts
}

export interface Timesheet {
  id: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  entries: TimesheetEntry[];
  totalHours: number;
  totalCost?: number;
  owner: string;
  rejectionReason?: string;
}