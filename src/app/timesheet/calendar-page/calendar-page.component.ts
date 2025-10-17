
// src/app/timesheet/calendar-page/calendar-page.component.ts

import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { CommonModule } from '@angular/common';
import { CalendarModule, CalendarEvent } from 'angular-calendar';
import { WeekViewHourSegment } from 'calendar-utils';
import { adapterFactory } from 'angular-calendar/date-adapters/date-fns';
import { TimesheetService } from '../../app/core/services/timesheet.service';
import { FinancialService } from '../../app/core/services/financial.service';
import { TimesheetEntry, Timesheet } from '../../app/core/models/timesheet.model';
import { TimesheetFormDialogComponent } from '../timesheet-form/timesheet-form.component';
import { CustomEventTitleFormatter } from '../../app/core/services/custom-event-title-formatter.service';
import { fromEvent } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { addDays, addMinutes, endOfWeek, differenceInHours, parse, format } from 'date-fns';
import { inject } from '@angular/core';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    MatTableModule,
    CalendarModule
  ],
  providers: [
    {
      provide: 'CalendarEventTitleFormatter',
      useClass: CustomEventTitleFormatter
    },
    {
      provide: 'CalendarDateAdapter',
      useFactory: adapterFactory
    }
  ],
  templateUrl: './calendar-page.component.html',
  styleUrls: ['./calendar-page.component.scss']
})
export class CalendarPageComponent implements OnInit {
  viewDate = new Date();
  events: CalendarEvent[] = [];
  dragToCreateActive = false;
  weekStartsOn: 0 = 0;
  currentTimesheetId: string | null = null;
  subtotalsDataSource = new MatTableDataSource<{ date: string, accountId: number, accountName: string, hours: number }>();
  subtotalColumns = ['date', 'accountName', 'hours'];

  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);
  private timesheetService = inject(TimesheetService);
  private financialService = inject(FinancialService);

  async ngOnInit() {
    // One-time cleanup of invalid localStorage data (remove after first run)
    // localStorage.removeItem('timesheets');
    this.currentTimesheetId = await this.timesheetService.createTimesheet();
    await this.loadTimesheetEntries();
    await this.loadSubtotals();
  }

  async loadTimesheetEntries() {
    const timesheets = await this.timesheetService.getTimesheets('draft');
    const entries: TimesheetEntry[] = timesheets.flatMap((ts: Timesheet) => ts.entries || []);
    const eventsPromises = entries.map(async (entry: TimesheetEntry) => {
      const start = parse(`${entry.date} ${entry.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
      const end = parse(`${entry.date} ${entry.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
      if (end <= start) {
        console.warn('Skipping invalid event: end time is before or equal to start time', { entry });
        return null;
      }
      return {
        id: entry.id as string | number, // Cast to match CalendarEvent.id
        title: `${await this.timesheetService.getAccountName(entry.accountId)}: ${entry.hours} hours - ${entry.description}`,
        start,
        end,
        meta: { entry }
      } as CalendarEvent;
    });
    this.events = (await Promise.all(eventsPromises)).filter(event => event !== null) as CalendarEvent[];
    console.log('Loaded events:', this.events);
    this.refresh();
  }

  async loadSubtotals() {
    if (this.currentTimesheetId) {
      this.timesheetService.getDailySubtotals(this.currentTimesheetId).subscribe((subtotals: { date: string, accountId: number, accountName: string, hours: number }[]) => {
        this.subtotalsDataSource.data = subtotals;
        console.log('Loaded subtotals:', subtotals);
        this.refresh();
      });
    }
  }

  startDragToCreate(segment: WeekViewHourSegment, mouseDownEvent: MouseEvent, segmentElement: HTMLElement) {
    if (!this.currentTimesheetId) return;
    
    const dragToSelectEvent: CalendarEvent = {
      id: this.events.length.toString(),
      title: 'New event',
      start: segment.date,
      meta: { tmpEvent: true }
    };
    this.events = [...this.events, dragToSelectEvent];
    const segmentPosition = segmentElement.getBoundingClientRect();
    this.dragToCreateActive = true;
    const endOfView = endOfWeek(this.viewDate, { weekStartsOn: this.weekStartsOn });

    fromEvent<MouseEvent>(document, 'mousemove')
      .pipe(
        finalize(() => {
          delete dragToSelectEvent.meta.tmpEvent;
          this.dragToCreateActive = false;
          if (dragToSelectEvent.end && dragToSelectEvent.end <= dragToSelectEvent.start) {
            console.warn('Invalid drag event: end time is before or equal to start time', dragToSelectEvent);
            this.events = this.events.filter(e => e !== dragToSelectEvent);
            alert('End time must be after start time');
            this.refresh();
            return;
          }
          this.openTimesheetForm(dragToSelectEvent);
          this.refresh();
        }),
        takeUntil(fromEvent(document, 'mouseup'))
      )
      .subscribe((mouseMoveEvent: MouseEvent) => {
        const minutesDiff = Math.ceil((mouseMoveEvent.clientY - segmentPosition.top) / 30) * 30;
        const daysDiff = Math.floor((mouseMoveEvent.clientX - segmentPosition.left) / segmentPosition.width);
        const newEnd = addDays(addMinutes(segment.date, minutesDiff), daysDiff);
        if (newEnd > segment.date && newEnd <= endOfView) {
          dragToSelectEvent.end = newEnd;
        }
        this.refresh();
      });
  }

  openTimesheetForm(event: CalendarEvent) {
    if (!this.currentTimesheetId) return;
    
    const dialogRef = this.dialog.open(TimesheetFormDialogComponent, {
      width: '400px',
      data: {
        mode: 'add',
        date: format(event.start, 'yyyy-MM-dd'),
        startTime: format(event.start, 'HH:mm'),
        endTime: event.end ? format(event.end, 'HH:mm') : '17:00'
      }
    });

    dialogRef.afterClosed().subscribe(async (result: Partial<TimesheetEntry>) => {
      if (result && result.date && result.startTime && result.endTime && result.accountId && result.description) {
        try {
          const start = parse(`${result.date} ${result.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
          const end = parse(`${result.date} ${result.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
          if (end <= start) {
            throw new Error('End time must be after start time');
          }
          await this.timesheetService.addEntry({
            timesheetId: this.currentTimesheetId!,
            date: result.date,
            startTime: result.startTime,
            endTime: result.endTime,
            description: result.description,
            accountId: result.accountId,
            hours: differenceInHours(end, start)
          });
          await this.loadTimesheetEntries();
          await this.loadSubtotals();
        } catch (error: any) {
          console.error('Failed to add timesheet entry:', error);
          alert(error.message);
        }
      } else {
        this.events = this.events.filter(e => e !== event);
        this.refresh();
      }
    });
  }

  handleEventClick({ event }: { event: CalendarEvent }) {
    if (!this.currentTimesheetId) return;
    const entry: TimesheetEntry = event.meta.entry;
    
    const dialogRef = this.dialog.open(TimesheetFormDialogComponent, {
      width: '400px',
      data: { mode: 'edit', entry }
    });

    dialogRef.afterClosed().subscribe(async (result: Partial<TimesheetEntry>) => {
      if (result && result.date && result.startTime && result.endTime && result.accountId && result.description) {
        try {
          const start = parse(`${result.date} ${result.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
          const end = parse(`${result.date} ${result.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
          if (end <= start) {
            throw new Error('End time must be after start time');
          }
          await this.timesheetService.updateEntry({
            id: entry.id,
            timesheetId: this.currentTimesheetId!,
            date: result.date,
            startTime: result.startTime,
            endTime: result.endTime,
            description: result.description,
            accountId: result.accountId,
            hours: differenceInHours(end, start)
          });
          await this.loadTimesheetEntries();
          await this.loadSubtotals();
        } catch (error: any) {
          console.error('Failed to update timesheet entry:', error);
          alert(error.message);
        }
      }
    });
  }

  private refresh() {
    this.events = [...this.events];
    this.cdr.detectChanges();
  }
}