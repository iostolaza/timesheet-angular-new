
// src/app/timesheet/timesheet-form/timesheet-form.component.ts

import { Component, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { FormsModule } from '@angular/forms';
import { TimesheetService } from '../../core/services/timesheet.service';
import { FinancialService } from '../../core/services/financial.service';
import { TimesheetEntry } from '../../core/models/timesheet.model';
import { Account } from '../../core/models/financial.model';
import { Observable } from 'rxjs';
import { differenceInHours, parse } from 'date-fns';

@Component({
  selector: 'app-timesheet-form',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    FormsModule
  ],
  templateUrl: './timesheet-form.component.html'
})
export class TimesheetFormDialogComponent {
  private dialogRef = inject(MatDialogRef<TimesheetFormDialogComponent>);
  private timesheetService = inject(TimesheetService);
  private financialService = inject(FinancialService);
  @Input() data: {
    mode: 'add' | 'edit';
    entry?: TimesheetEntry;
    date?: string;
    startTime?: string;
    endTime?: string;
  } = { mode: 'add' };

  accounts$: Observable<Account[]> = this.financialService.getAccounts(1);
  entry: Partial<TimesheetEntry> = this.data.entry || {
    date: this.data.date || new Date().toISOString().split('T')[0],
    startTime: this.data.startTime || '09:00',
    endTime: this.data.endTime || '17:00',
    description: '',
    accountId: undefined
  };

  async save() {
    if (!this.entry.date || !this.entry.startTime || !this.entry.endTime || !this.entry.accountId || !this.entry.description) {
      alert('Please fill all required fields');
      return;
    }

    const start = parse(`${this.entry.date} ${this.entry.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const end = parse(`${this.entry.date} ${this.entry.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const hours = differenceInHours(end, start);

    if (hours <= 0) {
      alert('End time must be after start time');
      return;
    }

    try {
      if (this.data.mode === 'edit' && this.data.entry) {
        await this.timesheetService.updateEntry({
          ...this.data.entry,
          ...this.entry,
          hours
        });
      } else {
        await this.timesheetService.addEntry({
          timesheetId: this.data.entry?.timesheetId || '',
          date: this.entry.date,
          startTime: this.entry.startTime,
          endTime: this.entry.endTime,
          description: this.entry.description,
          accountId: this.entry.accountId,
          hours
        });
      }
      this.dialogRef.close(this.entry);
    } catch (error: any) {
      alert(error.message);
    }
  }

  cancel() {
    this.dialogRef.close();
  }
}