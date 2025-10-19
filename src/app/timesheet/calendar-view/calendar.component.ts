
// src/app/timesheet/calendar-view/calendar.component.ts

import { Component, inject, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';  // Fixed: Correct path for ngModel/forms
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { TimesheetService } from '../../core/services/timesheet.service';
import { AuthService } from '../../core/services/auth.service';
import { TimesheetEntry } from '../../core/models/timesheet.model';
import { DayEntryDialogComponent } from './day-entry-dialog.component';
import { ChargeCodeDialogComponent } from './charge-code-dialog.component';

interface ChargeCode { id: string; name: string; linkedAccount: string; active: boolean; }

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    FullCalendarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar.component.html',
})
export class CalendarComponent implements OnInit {
  events: any[] = [];
  calendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'timeGridWeek',
    events: this.events,
    dateClick: this.handleDayClick.bind(this),
    eventClick: this.handleEventClick.bind(this),
    eventDrop: this.handleEventDrop.bind(this),
    eventResize: this.handleEventResize.bind(this),
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay,dayGridMonth' },
    height: '600px',
    editable: true,
    selectable: true,
    select: this.handleSelect.bind(this),
    slotMinTime: '09:00:00',
    slotMaxTime: '18:00:00',
    allDaySlot: false,
    snapDuration: '00:15:00',  // 15min snap for drag-drop
  };
  weekRange = '';
  userName = '';
  weeklyTotal = 0;
  dailyAvg = 0;
  totalCost = 0;
  validationMessage = '';
  chargeCodes: ChargeCode[] = [];
  private tsService = inject(TimesheetService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private currentTimesheetId = 'draft-ts-1';
  private userRate = 25;

  ngOnInit() {
    this.userName = 'Jules Winnfield';
    this.weekRange = 'Oct 12 – 18, 2025';
    this.loadChargeCodes();
    this.loadEvents();
  }

  private async loadChargeCodes() {
    this.chargeCodes = [
      { id: 'code1', name: 'Client A - Project X', linkedAccount: 'ACC001', active: true },
      { id: 'code2', name: 'Client B - Marketing', linkedAccount: 'ACC002', active: true },
    ];
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
        id: entry.id,
        title: `${entry.chargeCode}: ${entry.hours}h - ${entry.description}`,
        start: `${entry.date}T${entry.startTime}`,
        end: `${entry.date}T${entry.endTime}`,
        backgroundColor: '#00B0FF',
        borderColor: '#00B0FF',
        extendedProps: { entry, cost: entry.hours * this.userRate },
      }));
      this.updateSummary();
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  }

  handleDayClick(info: any) {
    this.openEntryDialog(info.dateStr.split('T')[0], undefined);
  }

  handleEventClick(info: any) {
    const entry = info.event.extendedProps.entry;
    this.openEntryDialog(entry.date, entry);
  }

  async handleEventDrop(info: any) {
    const entry = info.event.extendedProps.entry;
    const newDate = info.event.startStr.split('T')[0];
    if (newDate !== entry.date) {
      // Prompt charge code if needed
      const chargeCode = this.promptChargeCode();  // Custom prompt or dialog
      if (chargeCode) {
        entry.chargeCode = chargeCode;
      }
      await this.tsService.updateEntry({ ...entry, date: newDate }, this.currentTimesheetId);
      this.loadEvents();
    }
  }

  async handleEventResize(info: any) {
    const entry = info.event.extendedProps.entry;
    const newStart = info.event.startStr.split('T')[1]?.substring(0, 5) || entry.startTime;
    const newEnd = info.event.endStr.split('T')[1]?.substring(0, 5) || entry.endTime;
    const hours = this.calculateHours(newStart, newEnd);
    await this.tsService.updateEntry({ ...entry, startTime: newStart, endTime: newEnd, hours }, this.currentTimesheetId);
    this.loadEvents();
  }

  handleSelect(info: any) {
    const start = info.startStr.split('T')[1].substring(0, 5);
    const end = info.endStr.split('T')[1].substring(0, 5);
    const hours = this.calculateHours(start, end);
    this.openEntryDialog(info.startStr.split('T')[0], undefined, { startTime: start, endTime: end, hours });
    info.view.calendar.unselect();
  }

  private openEntryDialog(date: string, existingEntry?: TimesheetEntry, prefill?: { startTime: string; endTime: string; hours: number }) {
    const dialogRef = this.dialog.open(DayEntryDialogComponent, {
      data: { date, timesheetId: this.currentTimesheetId, entry: existingEntry, prefill },
    });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        const sub = await firstValueFrom(this.authService.getUserSub());
        for (const form of result.entries) {
          const hours = form.hours || this.calculateHours(form.startTime, form.endTime);
          const entryData = { ...form, date, hours, owner: sub ?? 'default-user', cost: hours * this.userRate };  // Fixed: ?? for null
          if (existingEntry) {
            await this.tsService.updateEntry(entryData as TimesheetEntry, this.currentTimesheetId);
          } else {
            await this.tsService.addEntry(entryData, this.currentTimesheetId);
          }
        }
        this.loadEvents();
      }
    });
  }

  openChargeCodeDialog() {
    const dialogRef = this.dialog.open(ChargeCodeDialogComponent, { data: { chargeCodes: this.chargeCodes } });
    dialogRef.afterClosed().subscribe((updatedCodes) => {
      if (updatedCodes) {
        this.chargeCodes = updatedCodes;
      }
    });
  }

  private promptChargeCode(): string | null {
    // Simple prompt; use dialog for production
    const code = prompt('Select Charge Code:', '');
    return code || null;
  }

  private updateSummary() {
    this.weeklyTotal = this.events.reduce((sum, e) => sum + (e.extendedProps.entry.hours || 0), 0);
    this.dailyAvg = this.weeklyTotal / 5;
    this.totalCost = this.events.reduce((sum, e) => sum + e.extendedProps.cost, 0);
    this.validate();
    this.cdr.markForCheck();
  }

  private validate() {
    let msg = '';
    const dailyExceed = this.events.filter(e => e.extendedProps.entry.hours > 8);
    if (dailyExceed.length > 0) msg += 'Daily hours exceed 8h; ';
    if (this.weeklyTotal > 40) msg += 'Weekly hours exceed 40h. ';
    this.validationMessage = msg;
    if (msg) this.snackBar.open(msg, 'OK', { duration: 5000 });
    return !msg;
  }

  isValid() {
    return this.validate();
  }

  async submitTimesheet() {
    if (!this.isValid()) return;
    const entries = this.events.map(e => e.extendedProps.entry);
    const sub = await firstValueFrom(this.authService.getUserSub());
    const tsData = { entries, totalHours: this.weeklyTotal, totalCost: this.totalCost, status: 'draft' as const, owner: sub ?? 'default-user' };  // Fixed: Null-safe owner
    const ts = await this.tsService.createTimesheet(tsData);
    await this.tsService.submitTimesheet(ts.id);
    this.router.navigate(['/review', ts.id]);
  }

  private calculateHours(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return (eh * 60 + em - sh * 60 - sm) / 60;
  }
}