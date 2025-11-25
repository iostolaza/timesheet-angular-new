
//src/app/timesheet/calendar-view/calendar.component.ts

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
import {
  format,
  startOfMonth,
  endOfMonth,
  addDays,
  parseISO,
  startOfWeek,
  endOfWeek,
} from 'date-fns';

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

  currentWeekRange = signal<string>('');
  currentWeekHours = signal<number>(0);
  currentWeekCost = signal<number>(0);
  periodTotalHours = signal<number>(0);
  periodTotalCost = signal<number>(0); 
  
  weeklyTotal = signal<number>(0);   
  totalCost = signal<number>(0);

  userEmail = signal<string>('');
  validationMessage = signal<string>('');
  chargeCodes = signal<ChargeCode[]>([]);
  currentTimesheetId = signal<string | null>(null);
  associatedChargeCodes = signal<ChargeCode[]>([]);
  periodStart = signal<string>('');
  periodEnd = signal<string>('');
  userRate = signal<number>(25);

  private tsService = inject(TimesheetService);
  private authService = inject(AuthService);
  private financialService = inject(FinancialService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
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
              backgroundColor: '#00B0FF',
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
    datesSet: this.handleDatesSet.bind(this),

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
    const email = this.authService.getCurrentUserSync()?.email ?? '';
    if (email) this.userEmail.set(email);

    const sub = await this.authService.getCurrentUserId();
    const user = await this.authService.getUserById(sub!);
    this.userRate.set(user?.rate || 25);

    // Only set pay period — DO NOT touch currentWeekRange here!
    const { startStr, endStr } = this.getSemiMonthlyPeriod(this.today);
    this.periodStart.set(startStr);
    this.periodEnd.set(endStr);

    await this.loadDraftAndEvents();

    console.log('Initialized calendar component', {
      userEmail: this.userEmail(),
      timesheetId: this.currentTimesheetId(),
    });
  } catch (error) {
    console.error('Failed to initialize component', error);
    this.openError('Failed to initialize timesheet. Please try again.');
  }
}

ngAfterViewInit() {
  this.calendarComponent.getApi().refetchEvents();
}

handleDatesSet(info: any) {
  const calendarApi = this.calendarComponent.getApi();
  if (!calendarApi) return;

  const view = calendarApi.view;
  const start = new Date(view.activeStart); // First visible day (always Sunday)
  const end = new Date(view.activeEnd);     // Next Sunday (exclusive)

  // Convert exclusive end to inclusive Saturday
  const weekEnd = new Date(end);
  weekEnd.setDate(weekEnd.getDate() - 1);

  const range = `${format(start, 'MMMM d')} – ${format(weekEnd, 'd, yyyy')}`;
  this.currentWeekRange.set(range);

  console.log('datesSet → Correct week range (Sun–Sat):', range);

  // Pay period logic — use the visible week's Sunday as reference
  const { startStr, endStr } = this.getSemiMonthlyPeriod(start);
  if (startStr !== this.periodStart() || endStr !== this.periodEnd()) {
    this.periodStart.set(startStr);
    this.periodEnd.set(endStr);
    this.loadDraftAndEvents();
  } else {
    this.updateSummary();
  }
}

  private async loadDraftAndEvents() {
    const draft = await this.tsService.ensureDraftTimesheet(this.periodStart(), this.periodEnd());
    this.currentTimesheetId.set(draft.id);
    this.associatedChargeCodes.set(draft.associatedChargeCodes || []);
    await this.loadChargeCodes();
    await this.loadEvents();
  }

  private getSemiMonthlyPeriod(date: Date): { startStr: string; endStr: string } {
    const day = date.getDate();
    const monthStart = startOfMonth(date);
    if (day <= 15) {
      return {
        startStr: format(monthStart, 'yyyy-MM-dd'),
        endStr: format(addDays(monthStart, 14), 'yyyy-MM-dd'),  // 1-15
      };
    } else {
      return {
        startStr: format(addDays(monthStart, 15), 'yyyy-MM-dd'),  // 16-EOM
        endStr: format(endOfMonth(date), 'yyyy-MM-dd'),
      };
    }
  }

  private async loadChargeCodes() {
    try {
      const accounts = await this.financialService.listAccounts();
      this.chargeCodes.set(accounts.flatMap(account => account.chargeCodes || []));
      console.log('Loaded charge codes', { count: this.chargeCodes().length });
    } catch (error) {
      console.error('Failed to load charge codes', error);
      this.openError('Failed to load charge codes. Please refresh.');
    }
  }

  async loadEvents() {
    try {
      const tsId = this.currentTimesheetId();
      if (!tsId) throw new Error('No current timesheet ID - reinitialize.');

      const tsWithEntries = await this.tsService.getTimesheetWithEntries(tsId);  
      this.events.set(tsWithEntries.entries);
      this.updateSummary();
      console.log('Loaded timesheet events', { count: this.events().length });
      this.cdr.markForCheck();

      const calendarApi = this.calendarComponent?.getApi();
      if (calendarApi) {
        calendarApi.refetchEvents();
      }
    } catch (error) {
      console.error('Failed to load events', error);
      this.openError('Failed to load events. Please refresh.');
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

      const sub = await this.authService.getCurrentUserId();
      const timesheetId = this.currentTimesheetId();
      if (!timesheetId) throw new Error('No timesheet ID available');

      const entryData: Omit<TimesheetEntry, 'id'> = {
        timesheetId,
        date: dateStr,
        startTime: startStr,
        endTime: endStr,
        hours,
        userId: sub ?? 'default-user',
        chargeCode: ' ',
        description: ' ',
      };

      const tempEvents = [...this.events(), entryData as TimesheetEntry];
      const dailyTotal = tempEvents
        .filter(e => e.date === dateStr)
        .reduce((sum, e) => sum + e.hours, 0);
      const weeklyTotal = this.calculateWeeklyTotal(tempEvents, dateStr); // EDIT: Use per-week total
      if (dailyTotal > 8) console.warn('Daily hours exceed 8');
      if (weeklyTotal > 40) console.warn('Weekly hours exceed 40');

      const savedEntry = await this.tsService.addEntry(entryData, timesheetId);
      this.events.update(events => [...events, savedEntry]);
      this.updateSummary();
      this.openSuccess('Entry created. Editing details...');

      // Open dialog immediately
      const dialogRef = this.dialog.open(DayEntryDialogComponent, {
        width: '400px',
        data: { entry: savedEntry, availableChargeCodes: this.chargeCodes() },
      });

      dialogRef.afterClosed().subscribe(async (result: TimesheetEntry | 'delete' | undefined) => {
        if (result === 'delete') {
          await this.handleDelete(savedEntry);
        } else if (result) {
          await this.tsService.updateEntry(result, timesheetId!);
          this.events.update(events => events.map(e => e.id === result.id ? result : e));
          this.updateSummary();
          this.openSuccess('Entry updated.');
        } else {
          // Cancel: Check if chargeCode empty, alert
          if (!savedEntry.chargeCode || savedEntry.chargeCode.trim() === ' ') {
            this.openError('Charge code is required. Click the entry to edit.');
          }
        }
        this.cdr.markForCheck();
        this.calendarComponent.getApi().refetchEvents();
      });

      console.log('Added entry', { entryId: savedEntry.id });
    } catch (error: any) {
      console.error('Failed to handle select', error);
      this.openError(error.message || 'Failed to create entry. Please try again.');
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
          this.openSuccess('Entry deleted.');
          console.log('Deleted entry', { entryId: entry.id });
        } catch (error: any) {
          console.error('Failed to delete entry', error);
          this.openError(error.message || 'Failed to delete entry. Please try again.');
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
          const weeklyTotal = this.calculateWeeklyTotal(tempEvents, result.date);
          if (dailyTotal > 8) console.warn('Daily hours exceed 8');
          if (weeklyTotal > 40) console.warn('Weekly hours exceed 40');

          await this.tsService.updateEntry(result, timesheetId);
          this.events.update(events =>
            events.map(e => (e.id === result.id ? result : e))
          );
          this.updateSummary();
          this.openSuccess('Entry updated.');
          console.log('Updated entry', { entryId: result.id });
        } catch (error: any) {
          console.error('Failed to update entry', error);
          this.openError(error.message || 'Failed to update entry. Please try again.');
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

private calculateWeeklyTotal(entries: TimesheetEntry[], referenceDate: string): number {
  const refDate = parseISO(referenceDate);
  const dayOfWeek = refDate.getDay(); // 0 = Sunday, 6 = Saturday

  const sunday = new Date(refDate);
  sunday.setDate(refDate.getDate() - dayOfWeek);

  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);

  return entries
    .filter(e => {
      const d = parseISO(e.date);
      return d >= sunday && d <= saturday;
    })
    .reduce((sum, e) => sum + e.hours, 0);
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
      this.openError(error.message || 'Failed to move entry. Please try again.');
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
      this.openError(error.message || 'Failed to resize entry. Please try again.');
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

    // Determine currently visible week start
    const calendarApi = this.calendarComponent?.getApi();
    const viewStart = calendarApi
    ? new Date(calendarApi.view.activeStart)
    : this.today;

    const weekHours = this.calculateWeeklyTotal(allEntries, format(viewStart, 'yyyy-MM-dd'));

    // Update all signals
    this.currentWeekHours.set(weekHours);
    this.currentWeekCost.set(weekHours * this.userRate());

    const periodHours = allEntries.reduce((sum, e) => sum + e.hours, 0);
    this.periodTotalHours.set(periodHours);
    this.periodTotalCost.set(periodHours * this.userRate());

    // Legacy signals (still used by submit & old validation logic)
    this.weeklyTotal.set(weekHours);
    this.totalCost.set(periodHours * this.userRate());

    this.validate();
    this.cdr.markForCheck();
  }

private validate() {
    let msg = '';
    const allEntries = this.events();

    // Daily limit
    const dateTotals = new Map<string, number>();
    allEntries.forEach(e => {
      dateTotals.set(e.date, (dateTotals.get(e.date) || 0) + e.hours);
    });
    if (Array.from(dateTotals.values()).some(total => total > 8)) {
      msg += 'Daily hours exceed 8h; ';
    }

    // Weekly limit (across entire pay period)
    const weekTotals = new Map<string, number>();
    allEntries.forEach(e => {
      const weekKey = format(startOfWeek(parseISO(e.date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      weekTotals.set(weekKey, (weekTotals.get(weekKey) || 0) + e.hours);
    });
    if (Array.from(weekTotals.values()).some(total => total > 40)) {
      msg += 'Weekly hours exceed 40h; ';
    }

    // Charge code requirement
    if (allEntries.some(e => !e.chargeCode || e.chargeCode.trim() === ' ' || e.chargeCode === 'Unassigned')) {
      msg += 'All entries must have a valid charge code; ';
    }

    this.validationMessage.set(msg);
    if (msg) this.openError(msg);
    this.cdr.markForCheck();
  }

async submitTimesheet() {
    if (!this.isValid()) {
      this.openError('Cannot submit: ' + this.validationMessage());
      return;
    }

    try {
      const timesheetId = this.currentTimesheetId();
      if (!timesheetId) throw new Error('No timesheet ID available');
      const sub = await this.authService.getCurrentUserId();
      const uniqueChargeCodes = [...new Set(this.events().map(e => e.chargeCode))].filter(code => code.trim() !== '').map(code => ({ name: code, createdBy: sub ?? 'system', date: new Date().toISOString() }));
      const tsData = {
        id: timesheetId,
        startDate: this.periodStart(),
        endDate: this.periodEnd(),
        totalHours: this.events().reduce((sum, e) => sum + e.hours, 0), // Full period
        totalCost: this.totalCost(),
        status: 'submitted' as const,
        userId: sub ?? 'default-user',
        associatedChargeCodes: uniqueChargeCodes,
      };
      await this.tsService.updateTimesheet(tsData);
      this.events.set([]);
      this.updateSummary();
      this.router.navigate(['/review', timesheetId]);
      this.openSuccess('Timesheet submitted.');
      console.log('Timesheet submitted', { timesheetId });
    } catch (error: any) {
      console.error('Failed to submit timesheet', error);
      this.openError(error.message || 'Failed to submit timesheet. Please try again.');
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
          this.associatedChargeCodes.update(codes => [...new Set([...codes, selectedCode])]);
          this.cdr.markForCheck();
        }
      });
    }).catch(error => {
      console.error('Failed to load charge codes for dialog', error);
      this.openError('Failed to load charge codes. Please refresh.');
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
      this.openError(error.message || 'Failed to delete entry. Please try again.');
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

private openError(message: string) {
    this.snackBar.open(message, 'Close', {
      duration: 7000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['error-snack', 'bg-red-600', 'text-white'], 
    });
  }

  private openSuccess(message: string) {
    this.snackBar.open(message, 'OK', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['success-snack', 'bg-green-600', 'text-white'],
    });
  }
}