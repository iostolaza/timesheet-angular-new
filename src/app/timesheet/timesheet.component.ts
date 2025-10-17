
// src/app/timesheet/timesheet.component.ts

import { Component, OnInit } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { TimesheetFormDialogComponent } from './timesheet-form/timesheet-form.component';
import { TimesheetService } from '../app/core/services/timesheet.service';
import { TimesheetEntry } from '../app/core/models/timesheet.model';
import { CommonModule } from '@angular/common';
import { inject } from '@angular/core';

@Component({
  selector: 'app-timesheet',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatTableModule, CommonModule],
  templateUrl: './timesheet.component.html'
})
export class TimesheetComponent implements OnInit {
  displayedColumns: string[] = ['date', 'startTime', 'endTime', 'hours', 'account', 'description', 'actions'];
  timesheetEntries: Array<TimesheetEntry & { accountName: string }> = [];
  currentTimesheetId: string | null = null;
  private timesheetService = inject(TimesheetService);
  private dialog = inject(MatDialog);

  async ngOnInit() {
    this.currentTimesheetId = await this.timesheetService.createTimesheet();
    this.loadTimesheetEntries();
  }

  async loadTimesheetEntries() {
    const timesheets = await this.timesheetService.getTimesheets('draft');
    this.timesheetEntries = await Promise.all(
      timesheets
        .filter(ts => ts.id === this.currentTimesheetId)
        .flatMap(ts =>
          (ts.entries || []).map(async entry => ({
            ...entry,
            timesheetId: ts.id,
            accountName: await this.timesheetService.getAccountName(entry.accountId)
          }))
        )
    );
  }

  openAddDialog(): void {
    if (!this.currentTimesheetId) return;
    const dialogRef = this.dialog.open(TimesheetFormDialogComponent, {
      width: '400px',
      data: { mode: 'add' }
    });

    dialogRef.afterClosed().subscribe(async (result: Partial<TimesheetEntry>) => {
      if (result && this.currentTimesheetId) {
        await this.timesheetService.addEntry({
          date: result.date!,
          startTime: result.startTime!,
          endTime: result.endTime!,
          hours: result.hours!,
          description: result.description!,
          accountId: result.accountId!,
          timesheetId: this.currentTimesheetId
        });
        this.loadTimesheetEntries();
      }
    });
  }

  openEditDialog(entry: TimesheetEntry): void {
    const dialogRef = this.dialog.open(TimesheetFormDialogComponent, {
      width: '400px',
      data: { mode: 'edit', entry }
    });

    dialogRef.afterClosed().subscribe(async (result: Partial<TimesheetEntry>) => {
      if (result && this.currentTimesheetId) {
        await this.timesheetService.updateEntry({
          id: entry.id,
          date: result.date!,
          startTime: result.startTime!,
          endTime: result.endTime!,
          hours: result.hours!,
          description: result.description!,
          accountId: result.accountId!,
          timesheetId: this.currentTimesheetId
        });
        this.loadTimesheetEntries();
      }
    });
  }
}