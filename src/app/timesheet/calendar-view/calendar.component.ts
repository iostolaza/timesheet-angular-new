
// src/app/timesheet/calendar-view/calendar.component.ts

// src/app/timesheet/calendar-view/calendar.component.ts
import {
  Component,
  inject,
  OnInit,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Router } from '@angular/router';
import { TimesheetService } from '../../core/services/timesheet.service';
import { AuthService } from '../../core/services/auth.service';
import { FinancialService } from '../../core/services/financial.service';
import { TimesheetEntry } from '../../core/models/timesheet.model';
import { ChargeCode } from '../../core/models/financial.model';
import { DayEntryDialogComponent } from './day-entry-dialog.component';
import { ChargeCodeSearchDialogComponent } from '../../timesheet/charge-code-search/charge-code-search.component';
import { format, startOfWeek, endOfWeek } from 'date-fns';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatDialogModule,
    FullCalendarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar.component.html',
})
export class CalendarComponent implements OnInit, AfterViewInit {
  @ViewChild('calendar') calendarComponent!: FullCalendarComponent;
  events = signal<TimesheetEntry[]>([]);
  weekRange = signal('');
  userEmail = signal('');
  weeklyTotal = signal(0);
  dailyAvg = signal(0);
  totalCost = signal(0);
  validationMessage = signal('');
  chargeCodes = signal<ChargeCode[]>([]);
  currentTimesheetId = signal<string | null>(null);
  associatedChargeCodes = signal<ChargeCode[]>([]);

  private tsService = inject(TimesheetService);
  private authService = inject(AuthService);
  private financialService = inject(FinancialService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  private userRate = 25;
  private today = new Date();

  calendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'timeGridWeek',
    eventSources: [
      {
        events: (fetchInfo: any, successCallback: any) => {
          successCallback(
            this.events().map(entry => ({
              id: entry.id,
              title: `${entry.chargeCode || 'Unassigned'}:  \n ${entry.description}`,
              start: `${entry.date}T${entry.startTime}`,
              end: `${entry.date}T${entry.endTime}`,
              backgroundColor: '#32a852',
              borderColor: '#00B0FF',
              extendedProps: { entry },
            }))
          );
        },
      },
    ],
    editable: true,
    selectable: true,
    selectMirror: true,
    slotMinTime: '06:00:00',
    slotMaxTime: '21:00:00',
    allDaySlot: false,
    snapDuration: '00:15:00',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'timeGridWeek,timeGridDay,dayGridMonth',
    },
    select: this.handleSelect.bind(this),
    eventClick: this.handleEventClick.bind(this),
    eventDrop: this.handleEventDrop.bind(this),
    eventResize: this.handleEventResize.bind(this),

    eventOverlap: true,
    slotEventOverlap: false,
    eventDidMount: (info: any) => {
      info.el.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        if (confirm('Delete this entry?')) {
          const entry = info.event.extendedProps.entry;
          if (entry) {
            this.handleDelete(entry);
          }
        }
      });
    },
  };

  async ngOnInit() {
    try {
      this.authService.getCurrentUserEmail().then(email => {
        if (email) {
          this.userEmail.set(email);
          this.cdr.markForCheck();
        }
      });

      const start = startOfWeek(this.today, { weekStartsOn: 0 });
      const end = endOfWeek(this.today, { weekStartsOn: 0 });
      this.weekRange.set(`${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`);

      const sub = await this.authService.getUserIdentity();
      const timesheet = await this.tsService.createTimesheet({
        status: 'draft',
        totalHours: 0,
        owner: sub!
      });
      const tsWithEntries = await this.tsService.getTimesheetWithEntries(timesheet.id);
      this.associatedChargeCodes.set(tsWithEntries.associatedChargeCodes || []);
      this.currentTimesheetId.set(timesheet.id);

      await this.loadChargeCodes();
      await this.loadEvents();
      console.log('Initialized calendar component', {
        userEmail: this.userEmail(),
        timesheetId: this.currentTimesheetId(),
      });
    } catch (error) {
      console.error('Failed to initialize component', error);
      this.snackBar.open('Failed to initialize timesheet', 'OK', { duration: 5000 });
    }
  }

  ngAfterViewInit() {
    try {
      this.calendarComponent.getApi().refetchEvents();
    } catch (error) {
      console.error('Failed initial refetch', error);
    }
  }

  private async loadChargeCodes() {
    try {
      const accounts = await this.financialService.listAccounts();
      this.chargeCodes.set(accounts.flatMap(account => account.chargeCodes || []));
      console.log('Loaded charge codes', { count: this.chargeCodes().length });
    } catch (error) {
      console.error('Failed to load charge codes', error);
      this.snackBar.open('Failed to load charge codes', 'OK', { duration: 5000 });
    }
  }

  async loadEvents() {
    try {
      const timesheets = await this.tsService.listTimesheets('draft');
      const allEntries: TimesheetEntry[] = [];
      for (const ts of timesheets) {
        const tsWithEntries = await this.tsService.getTimesheetWithEntries(ts.id);
        allEntries.push(...tsWithEntries.entries);
      }
      this.events.set(allEntries);
      this.updateSummary();
      console.log('Loaded timesheet events', { count: allEntries.length });
      this.cdr.markForCheck();

      const calendarApi = this.calendarComponent?.getApi();
      if (calendarApi) {
        try {
          calendarApi.refetchEvents();
        } catch (error) {
          console.error('Failed to refetch events in loadEvents', error);
        }
      }
    } catch (error) {
      console.error('Failed to load events', error);
      this.snackBar.open('Failed to load events', 'OK', { duration: 5000 });
    }
  }

  private computeHoursDiff(start: Date, end: Date): number {
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return Math.max(0, hours);
  }

  async handleSelect(info: any) {
    try {
      const dateStr = info.startStr.split('T')[0];
      const startStr = info.startStr.split('T')[1].substring(0, 5);
      const endStr = info.endStr.split('T')[1].substring(0, 5);
      const hours = this.computeHoursDiff(info.start, info.end);

      const sub = await this.authService.getUserIdentity();
      const timesheetId = this.currentTimesheetId();
      if (!timesheetId) throw new Error('No timesheet ID available');

      const entryData: Omit<TimesheetEntry, 'id'> = {
        timesheetId,
        date: dateStr,
        startTime: startStr,
        endTime: endStr,
        hours,
        owner: sub ?? 'default-user',
        chargeCode: ' ',
        description: ' ',
      };

      const tempEvents = [...this.events(), entryData as TimesheetEntry];
      const dailyTotal = tempEvents
        .filter(e => e.date === dateStr)
        .reduce((sum, e) => sum + e.hours, 0);
      const weeklyTotal = tempEvents.reduce((sum, e) => sum + e.hours, 0);
      if (dailyTotal > 8) console.warn('Daily hours exceed 8');
      if (weeklyTotal > 40) console.warn('Weekly hours exceed 40');

      const savedEntry = await this.tsService.addEntry(entryData, timesheetId);
      this.events.update(events => [...events, savedEntry]);
      this.updateSummary();
      this.snackBar.open('Entry created. Click to edit charge code.', 'OK', { duration: 3000 });
      console.log('Added entry', { entryId: savedEntry.id });
    } catch (error: any) {
      console.error('Failed to handle select', error);
      this.snackBar.open(error.message || 'Failed to create entry', 'OK', { duration: 5000 });
      // info.revert();
    } finally {
      this.cdr.markForCheck();
      const calendarApi = this.calendarComponent?.getApi();
      if (calendarApi) {
        try {
          calendarApi.refetchEvents();
        } catch (error) {
          console.error('Failed to refetch events after select', error);
        }
      }
      info.view.calendar.unselect();
    }
  }

  async handleEventClick(info: any) {
    const entry = info.event.extendedProps.entry;
    if (!entry) {
      console.error('No entry found for event', { eventId: info.event.id });
      return;
    }

    const dialogRef = this.dialog.open(DayEntryDialogComponent, {
      width: '400px',
      data: { entry, availableChargeCodes: this.chargeCodes() },
    });

    dialogRef.afterClosed().subscribe(async (result: TimesheetEntry | 'delete' | undefined) => {
      if (result === 'delete') {
        try {
          const timesheetId = this.currentTimesheetId();
          if (!timesheetId) throw new Error('No timesheet ID available');
          await this.tsService.deleteEntry(entry.id, timesheetId);
          this.events.update(events => events.filter(e => e.id !== entry.id));
          this.updateSummary();
          this.snackBar.open('Entry deleted.', 'OK', { duration: 2000 });
          console.log('Deleted entry', { entryId: entry.id });
        } catch (error: any) {
          console.error('Failed to delete entry', error);
          this.snackBar.open(error.message || 'Failed to delete entry', 'OK', { duration: 5000 });
        } finally {
          this.cdr.markForCheck();
          const calendarApi = this.calendarComponent?.getApi();
          if (calendarApi) {
            try {
              calendarApi.refetchEvents();
            } catch (error) {
              console.error('Failed to refetch events after delete', error);
            }
          }
        }
      } else if (result) {
        try {
          const timesheetId = this.currentTimesheetId();
          if (!timesheetId) throw new Error('No timesheet ID available');

          const tempEvents = this.events().map(e =>
            e.id === result.id ? result : e
          );
          const dailyTotal = tempEvents
            .filter(e => e.date === result.date)
            .reduce((sum, e) => sum + e.hours, 0);
          const weeklyTotal = tempEvents.reduce((sum, e) => sum + e.hours, 0);
          if (dailyTotal > 8) console.warn('Daily hours exceed 8');
          if (weeklyTotal > 40) console.warn('Weekly hours exceed 40');

          await this.tsService.updateEntry(result, timesheetId);
          this.events.update(events =>
            events.map(e => (e.id === result.id ? result : e))
          );
          this.updateSummary();
          this.snackBar.open('Entry updated.', 'OK', { duration: 2000 });
          console.log('Updated entry', { entryId: result.id });
        } catch (error: any) {
          console.error('Failed to update entry', error);
          this.snackBar.open(error.message || 'Failed to update entry', 'OK', { duration: 5000 });
        } finally {
          this.cdr.markForCheck();
          const calendarApi = this.calendarComponent?.getApi();
          if (calendarApi) {
            try {
              calendarApi.refetchEvents();
            } catch (error) {
              console.error('Failed to refetch events after click', error);
            }
          }
        }
      }
    });
  }

  async handleEventDrop(info: any) {
    const entry = info.event.extendedProps.entry;
    if (!entry) {
      console.error('No entry found for event drop', { eventId: info.event.id });
      info.revert();
      return;
    }

    try {
      const newDate = info.event.startStr.split('T')[0];
      const startTime = info.event.startStr.split('T')[1]?.substring(0, 5) || entry.startTime;
      const endTime = info.event.endStr.split('T')[1]?.substring(0, 5) || entry.endTime;
      const hours = this.computeHoursDiff(new Date(info.event.start), new Date(info.event.end));
      const updatedEntry = { ...entry, date: newDate, startTime, endTime, hours };

      const tempEvents = this.events().map(e => (e.id === entry.id ? updatedEntry : e));
      const dailyTotal = tempEvents
        .filter(e => e.date === newDate)
        .reduce((sum, e) => sum + e.hours, 0);
      const weeklyTotal = tempEvents.reduce((sum, e) => sum + e.hours, 0);
      if (dailyTotal > 8) console.warn('Daily hours exceed 8');
      if (weeklyTotal > 40) console.warn('Weekly hours exceed 40');

      const timesheetId = this.currentTimesheetId();
      if (!timesheetId) throw new Error('No timesheet ID available');
      await this.tsService.updateEntry(updatedEntry, timesheetId);
      this.events.update(events =>
        events.map(e => (e.id === entry.id ? updatedEntry : e))
      );
      this.updateSummary();
      console.log('Moved entry', { entryId: entry.id });
    } catch (error: any) {
      console.error('Failed to handle event drop', error);
      this.snackBar.open(error.message || 'Failed to move entry', 'OK', { duration: 5000 });
      info.revert();
    } finally {
      this.cdr.markForCheck();
      const calendarApi = this.calendarComponent?.getApi();
      if (calendarApi) {
        try {
          calendarApi.refetchEvents();
        } catch (error) {
          console.error('Failed to refetch events after drop', error);
        }
      }
    }
  }

  async handleEventResize(info: any) {
    const entry = info.event.extendedProps.entry;
    if (!entry) {
      console.error('No entry found for event resize', { eventId: info.event.id });
      info.revert();
      return;
    }

    try {
      const newStart = info.event.startStr.split('T')[1]?.substring(0, 5) || entry.startTime;
      const newEnd = info.event.endStr.split('T')[1]?.substring(0, 5) || entry.endTime;
      const hours = this.computeHoursDiff(new Date(info.event.start), new Date(info.event.end));
      const updatedEntry = { ...entry, startTime: newStart, endTime: newEnd, hours };

      const tempEvents = this.events().map(e => (e.id === entry.id ? updatedEntry : e));
      const dailyTotal = tempEvents
        .filter(e => e.date === entry.date)
        .reduce((sum, e) => sum + e.hours, 0);
      const weeklyTotal = tempEvents.reduce((sum, e) => sum + e.hours, 0);
      if (dailyTotal > 8) console.warn('Daily hours exceed 8');
      if (weeklyTotal > 40) console.warn('Weekly hours exceed 40');

      const timesheetId = this.currentTimesheetId();
      if (!timesheetId) throw new Error('No timesheet ID available');
      await this.tsService.updateEntry(updatedEntry, timesheetId);
      this.events.update(events =>
        events.map(e => (e.id === entry.id ? updatedEntry : e))
      );
      this.updateSummary();
      console.log('Resized entry', { entryId: entry.id });
    } catch (error: any) {
      console.error('Failed to handle event resize', error);
      this.snackBar.open(error.message || 'Failed to resize entry', 'OK', { duration: 5000 });
      info.revert();
    } finally {
      this.cdr.markForCheck();
      const calendarApi = this.calendarComponent?.getApi();
      if (calendarApi) {
        try {
          calendarApi.refetchEvents();
        } catch (error) {
          console.error('Failed to refetch events after resize', error);
        }
      }
    }
  }

  private updateSummary() {
    const allEntries = this.events();
    this.weeklyTotal.set(allEntries.reduce((sum, e) => sum + e.hours, 0));
    this.dailyAvg.set(this.weeklyTotal() / 5);
    this.totalCost.set(allEntries.reduce((sum, e) => sum + e.hours * this.userRate, 0));
    this.validate();
    console.log('Updated summary', {
      totalHours: this.weeklyTotal(),
      totalCost: this.totalCost(),
    });
    this.cdr.markForCheck();
  }

  private validate() {
    let msg = '';
    const allEntries = this.events();
    const dailyExceed = allEntries.filter(e => {
      const dailyTotal = allEntries
        .filter(entry => entry.date === e.date)
        .reduce((sum, entry) => sum + entry.hours, 0);
      return dailyTotal > 8;
    });
    if (dailyExceed.length > 0) msg += 'Daily hours exceed 8h; ';
    if (this.weeklyTotal() > 40) msg += 'Weekly hours exceed 40h. ';
    const hasUnassignedChargeCode = allEntries.some(e => e.chargeCode === 'Unassigned');
    if (hasUnassignedChargeCode) msg += 'All entries must have a valid charge code; ';
    this.validationMessage.set(msg);
    if (msg) this.snackBar.open(msg, 'OK', { duration: 5000 });
    this.cdr.markForCheck();
  }

  async submitTimesheet() {
    if (!this.isValid()) {
      this.snackBar.open('Cannot submit: ' + this.validationMessage(), 'OK', { duration: 5000 });
      return;
    }

    try {
      const timesheetId = this.currentTimesheetId();
      if (!timesheetId) throw new Error('No timesheet ID available');
      const sub = await this.authService.getUserIdentity();
      const tsData = {
        id: timesheetId,
        totalHours: this.weeklyTotal(),
        totalCost: this.totalCost(),
        status: 'submitted' as const,
        owner: sub ?? 'default-user',
      };
      await this.tsService.updateTimesheet(tsData);
      this.events.set([]);
      this.updateSummary();
      this.router.navigate(['/review', timesheetId]);
      this.snackBar.open('Timesheet submitted.', 'OK', { duration: 2000 });
      console.log('Timesheet submitted', { timesheetId });
    } catch (error: any) {
      console.error('Failed to submit timesheet', error);
      this.snackBar.open(error.message || 'Failed to submit timesheet', 'OK', { duration: 5000 });
    } finally {
      this.cdr.markForCheck();
      const calendarApi = this.calendarComponent?.getApi();
      if (calendarApi) {
        try {
          calendarApi.refetchEvents();
        } catch (error) {
          console.error('Failed to refetch events after submit', error);
        }
      }
    }
  }

  openChargeCodeDialog() {
    this.financialService.listAccounts().then(accounts => {
      this.chargeCodes.set(accounts.flatMap(account => account.chargeCodes || []));
      const dialogRef = this.dialog.open(ChargeCodeSearchDialogComponent, {
        width: '500px',
        data: { chargeCodes: this.chargeCodes() },
      });

      dialogRef.afterClosed().subscribe(async (selectedCode: ChargeCode | undefined) => {
        if (selectedCode) {
          console.log('Charge code selected', { code: selectedCode.name });
          this.snackBar.open(`Selected charge code: ${selectedCode.name}`, 'OK', { duration: 2000 });
          const timesheetId = this.currentTimesheetId();
          if (timesheetId) {
            const updatedTs = await this.tsService.addAssociatedChargeCode(timesheetId, selectedCode);
            this.associatedChargeCodes.set(updatedTs.associatedChargeCodes || []);
            this.chargeCodes.update(codes => [...new Set([...codes, selectedCode])]);
          }
          this.cdr.markForCheck();
        }
      });
    }).catch(error => {
      console.error('Failed to load charge codes for dialog', error);
      this.snackBar.open('Failed to load charge codes', 'OK', { duration: 5000 });
    });
  }

  isValid(): boolean {
    return !this.validationMessage();
  }

  private async handleDelete(entry: TimesheetEntry) {
    try {
      const timesheetId = this.currentTimesheetId();
      if (!timesheetId) throw new Error('No timesheet ID available');
      await this.tsService.deleteEntry(entry.id, timesheetId);
      this.events.update(events => events.filter(e => e.id !== entry.id));
      this.updateSummary();
      this.snackBar.open('Entry deleted.', 'OK', { duration: 2000 });
      console.log('Deleted entry', { entryId: entry.id });
    } catch (error: any) {
      console.error('Failed to delete entry', error);
      this.snackBar.open(error.message || 'Failed to delete entry', 'OK', { duration: 5000 });
    } finally {
      this.cdr.markForCheck();
      const calendarApi = this.calendarComponent?.getApi();
      if (calendarApi) {
        try {
          calendarApi.refetchEvents();
        } catch (error) {
          console.error('Failed to refetch events after delete', error);
        }
      }
    }
  }
}