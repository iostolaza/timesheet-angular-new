
// src/app/timesheet/calendar-view/calendar.component.ts

import { Component, inject, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import {
  CalendarMonthViewComponent,
  CalendarCommonModule,
  CalendarEvent,
} from 'angular-calendar';
import { adapterFactory } from 'angular-calendar/date-adapters/date-fns';
import { enUS } from 'date-fns/locale';
import { TimesheetService } from '../../core/services/timesheet.service';
import { AuthService } from '../../core/services/auth.service';
import { TimesheetEntry } from '../../core/models/timesheet.model';
import { DayEntryDialogComponent } from './day-entry-dialog.component';  // Separate

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, CalendarMonthViewComponent, CalendarCommonModule],
  providers: [
    {
      provide: 'dateAdapter',
      useFactory: () => adapterFactory(enUS),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar.component.html',
})
export class CalendarComponent implements OnInit {
  viewDate: Date = new Date();
  events: CalendarEvent[] = [];
  private tsService = inject(TimesheetService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);
  private currentTimesheetId = 'draft-ts-1';

  ngOnInit() {
    this.loadEvents();
  }

  async loadEvents() {
    try {
      const timesheets = await this.tsService.listTimesheets();
      const allEntries: TimesheetEntry[] = [];
      for (const ts of timesheets) {
        const tsWithEntries = await this.tsService.getTimesheetWithEntries(ts.id);
        allEntries.push(...tsWithEntries.entries);
      }
      this.events = allEntries.map(entry => ({
        title: `${entry.chargeCode}: ${entry.hours}h - ${entry.description}`,
        start: new Date(`${entry.date}T${entry.startTime}`),
        end: new Date(`${entry.date}T${entry.endTime}`),
        color: { primary: '#00B0FF', secondary: '#00B0FF' },
        meta: { entry },
      }));
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  }

  handleDayClick(date: Date): void {
    const dialogRef = this.dialog.open(DayEntryDialogComponent, {
      data: { date: date.toISOString().split('T')[0], timesheetId: this.currentTimesheetId },
    });
    dialogRef.afterClosed().subscribe(async (entries: any[]) => {
      if (entries) {
        const sub = await firstValueFrom(this.authService.getUserSub());
        for (const form of entries) {
          const hours = this.calculateHours(form.startTime, form.endTime);
          await this.tsService.addEntry({ ...form, date: date.toISOString().split('T')[0], hours, owner: sub! }, this.currentTimesheetId);
        }
        this.loadEvents();
      }
    });
  }

  private calculateHours(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return (eh * 60 + em - sh * 60 - sm) / 60;
  }
}