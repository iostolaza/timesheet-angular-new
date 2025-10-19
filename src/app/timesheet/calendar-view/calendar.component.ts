
// src/app/timesheet/calendar-view/calendar.component.ts

import { Component, inject, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';  // For dialogs
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { FullCalendarModule } from '@fullcalendar/angular';  // Angular wrapper v6.1.15
import dayGridPlugin from '@fullcalendar/daygrid';  // Month view
import timeGridPlugin from '@fullcalendar/timegrid';  // Week/day views
import interactionPlugin from '@fullcalendar/interaction';  // Clicks/drag
import { firstValueFrom } from 'rxjs';
import { TimesheetService } from '../../core/services/timesheet.service';
import { AuthService } from '../../core/services/auth.service';
import { TimesheetEntry } from '../../core/models/timesheet.model';
import { DayEntryDialogComponent } from './day-entry-dialog.component';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, FullCalendarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar.component.html',
})
export class CalendarComponent implements OnInit {
  events: any[] = [];
  calendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    events: this.events,
    dateClick: this.handleDayClick.bind(this),
    eventClick: this.handleEventClick.bind(this),
    eventDrop: this.handleEventDrop.bind(this),  // Drag-drop save
    eventResize: this.handleEventResize.bind(this),  // Resize save
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
    height: 'auto',
    editable: true,  // Enable drag-drop/resize
    selectable: true,  // Allow multi-day select for new events
    select: this.handleSelect.bind(this),  // Select range for new entry
  };
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
        id: entry.id,  // For updates
        title: `${entry.chargeCode}: ${entry.hours}h - ${entry.description}`,
        start: `${entry.date}T${entry.startTime}`,
        end: `${entry.date}T${entry.endTime}`,
        backgroundColor: '#00B0FF',
        borderColor: '#00B0FF',
        extendedProps: { entry },
      }));
      this.cdr.markForCheck();  // Refresh
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  }

  handleDayClick(info: any) {
    const date = info.dateStr.split('T')[0];
    this.openEntryDialog(date, undefined);  // Fixed: undefined for optional
  }

  handleEventClick(info: any) {
    const entry = info.event.extendedProps.entry;
    this.openEntryDialog(entry.date, entry);  // Edit existing
  }

  async handleEventDrop(info: any) {
    const entry = info.event.extendedProps.entry;
    const newDate = info.event.startStr.split('T')[0];
    if (newDate !== entry.date) {
      await this.tsService.updateEntry({ ...entry, date: newDate }, this.currentTimesheetId);
      this.loadEvents();  // Refresh
    }
  }

  async handleEventResize(info: any) {
    const entry = info.event.extendedProps.entry;
    const newStart = info.event.startStr.split('T')[1]?.substring(0, 5) || entry.startTime;
    const newEnd = info.event.endStr.split('T')[1]?.substring(0, 5) || entry.endTime;
    const hours = this.calculateHours(newStart, newEnd);
    await this.tsService.updateEntry({ ...entry, startTime: newStart, endTime: newEnd, hours }, this.currentTimesheetId);
    this.loadEvents();  // Refresh
  }

  handleSelect(info: any) {  // Multi-select for new event
    const startDate = info.startStr.split('T')[0];
    this.openEntryDialog(startDate, undefined);  // Fixed: undefined for optional
    info.view.calendar.unselect();  // Clear selection
  }

  private openEntryDialog(date: string, existingEntry?: TimesheetEntry) {
    const dialogRef = this.dialog.open(DayEntryDialogComponent, {
      data: { date, timesheetId: this.currentTimesheetId, entry: existingEntry },
    });
    dialogRef.afterClosed().subscribe(async (entries: any[]) => {
      if (entries && entries.length > 0) {
        const sub = await firstValueFrom(this.authService.getUserSub());
        for (const form of entries) {
          const hours = this.calculateHours(form.startTime, form.endTime);
          const entryData = { ...form, date, hours, owner: sub! };
          if (existingEntry) {
            await this.tsService.updateEntry(entryData, this.currentTimesheetId);  // Edit
          } else {
            await this.tsService.addEntry(entryData, this.currentTimesheetId);  // New
          }
        }
        this.loadEvents();  // Refresh
      }
    });
  }

  private calculateHours(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return (eh * 60 + em - sh * 60 - sm) / 60;
  }
}