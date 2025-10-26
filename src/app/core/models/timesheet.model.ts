
//src/app/core/models/timesheet.model.ts

export interface Timesheet {
  id: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  entries: TimesheetEntry[];
  totalHours: number;
  totalCost?: number;
  owner: string;
  rejectionReason?: string;
}

export interface TimesheetEntry {
  id: string;
  timesheetId: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  description: string;
  chargeCode: string; 
  owner: string;
}
