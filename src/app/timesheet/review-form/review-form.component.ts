// src/app/timesheet/review-form/review-form.component.ts

import {
  Component,
  OnInit,
  inject,
  AfterViewInit,
  ViewChild,
  ChangeDetectorRef,
  signal,
  ChangeDetectionStrategy
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule } from '@angular/material/dialog';

import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

import { TimesheetService } from '../../core/services/timesheet.service';
import { AuthService } from '../../core/services/auth.service';
import { FinancialService } from '../../core/services/financial.service';
import { Timesheet, DailyAggregate, TimesheetEntry } from '../../core/models/timesheet.model';
import { ChargeCode } from '../../core/models/financial.model';
import { UserProfile } from '../../core/models/user.model';
import { DayEntryDialogComponent } from '../calendar-view/day-entry-dialog.component';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FullCalendarModule,
    MatTableModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatButtonModule,
    MatSnackBarModule,
    MatDialogModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './review-form.component.html',
})
export class ReviewComponent implements OnInit, AfterViewInit {
  @ViewChild('calendar') calendarComponent!: FullCalendarComponent;

  // --- Signals ---
  timesheet = signal<Timesheet | null>(null);
  events = signal<TimesheetEntry[]>([]);
  chargeCodes = signal<ChargeCode[]>([]);
  clientAggregates = signal<{ chargeCode: string, totalHours: number, totalPay: number }[]>([]);
  dailyAggregates = signal<DailyAggregate[]>([]);
  userRate = signal<number>(0);
  otMultiplier = signal<number>(1.5);
  taxRate = signal<number>(0.015);
  allowEdit = signal<boolean>(false);
  userProfile = signal<UserProfile | null>(null);
  isAdminOrManager = signal<boolean>(false);

  // --- Table Columns ---
  entryColumns = ['date', 'startTime', 'endTime', 'hours', 'chargeCode', 'description'];
  dailyColumns = ['date', 'base', 'ot', 'regPay', 'otPay', 'subtotal'];
  clientColumns = ['chargeCode', 'totalHours', 'totalPay'];

  // --- Calendar Options as signal for reactive updates
  calendarOptions = signal<any>({
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'timeGridTwoWeek',
    views: {
      timeGridTwoWeek: {
        type: 'timeGrid',
        duration: { weeks: 2 },
        buttonText: '2 weeks',
      },
    },
    slotMinTime: '07:00:00',
    slotMaxTime: '21:00:00',
    headerToolbar: {
      left: 'prev,next',
      center: 'title',
      right: 'timeGridTwoWeek,timeGridWeek',
    },
    eventSources: [
      {
        events: (fetchInfo: any, successCallback: any) => {
          successCallback(
            this.events().map(entry => ({
              id: entry.id,
              title: `${entry.chargeCode || ''}: ${entry.description || ''}`,
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
    editable: false, // Default, updated later
    selectable: false,
    select: undefined,
    eventClick: undefined,
    eventDrop: undefined,
    eventResize: undefined,
    eventOverlap: true,
    slotEventOverlap: false,
    allDaySlot: false,
    snapDuration: '00:15:00',
  });

  // --- Form ---
  reviewForm: FormGroup;

  // --- Services ---
  private tsService = inject(TimesheetService);
  private authService = inject(AuthService);
  private financialService = inject(FinancialService);
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ReviewComponent>);
  private data = inject(MAT_DIALOG_DATA);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);

  constructor() {
    this.reviewForm = this.fb.group({
      action: ['approve', Validators.required],
      rejectionReason: [''],
    });
  }

  // ----------------------
  // Lifecycle Hooks
  // ----------------------
  async ngOnInit() {
    try {
      await this.loadAllData();
      console.log('Initialized review component', {
        userEmail: this.userEmail(),
        timesheetId: this.timesheet()?.id,
      });
    } catch (error) {
      console.error('Failed to initialize component', error);
      this.openError('Failed to initialize timesheet. Please try again.');
    }

    this.reviewForm.get('action')!.valueChanges.subscribe(value => {
      const reasonCtrl = this.reviewForm.get('rejectionReason');
      if (value === 'reject') reasonCtrl!.setValidators([Validators.required]);
      else reasonCtrl!.clearValidators();
      reasonCtrl!.updateValueAndValidity();
    });
  }

  ngAfterViewInit() {
    this.refreshCalendar();
  }

  // ----------------------
  // Calendar Helpers
  // ----------------------
  private get calendarApi() {
    return this.calendarComponent?.getApi() ?? null;
  }

  private refreshCalendar() {
    const api = this.calendarApi;
    if (api) {
      api.updateSize(); // Fix layout issues in dialog
      api.refetchEvents();
      const startDate = this.timesheet()?.startDate;
      if (startDate) {
        api.gotoDate(startDate);
        console.log('Navigated calendar to startDate:', startDate);
      }
    } else {
      setTimeout(() => this.refreshCalendar(), 100);
    }
  }

  // ----------------------
  // Data Loading - Simplified to single method with Parallel loads
  // ----------------------
  private async loadAllData() {
    const id = this.data.id;
    if (!id) return;

    try {
      const tsFull = await this.tsService.getTimesheetWithEntries(id);
      const [user, accounts] = await Promise.all([
        this.authService.getUserById(tsFull.userId),
        this.financialService.listAccounts()
      ]);

      // Signals
      this.userProfile.set(user);
      this.userRate.set(user?.rate ?? 25);
      this.otMultiplier.set(user?.otMultiplier ?? 1.5);
      this.taxRate.set(user?.taxRate ?? 0.015);
      this.isAdminOrManager.set(await this.authService.isAdminOrManager());
      this.timesheet.set(tsFull);
      this.events.set(tsFull.entries);
      this.chargeCodes.set(accounts.flatMap(a => a.chargeCodes || []));

      // Permissions
      this.allowEdit.set(tsFull.status === 'draft' || tsFull.status === 'rejected'); // Lock if approved/submitted
      if (tsFull.status === 'approved') {
       this.openSuccess('Timesheet approved and locked.');
      }

      // Update calendar options reactively
      this.calendarOptions.update(opts => ({
        ...opts,
        editable: this.allowEdit(),
        selectable: this.allowEdit(),
        select: this.allowEdit() ? this.handleSelect.bind(this) : undefined,
        eventClick: this.allowEdit() ? this.handleEventClick.bind(this) : undefined,
        eventDrop: this.allowEdit() ? this.handleEventDrop.bind(this) : undefined,
        eventResize: this.allowEdit() ? this.handleEventResize.bind(this) : undefined,
      }));

      // Aggregates
      this.updateAggregates();

      this.cdr.markForCheck();
      this.refreshCalendar();
    } catch (error: any) {
      console.error(error);
      this.openError('Failed to load timesheet data.');
    }
  }

  // ----------------------
  // Calculations
  // ----------------------
  private updateAggregates() {
    const entries = this.events();

    // Daily aggregates
    const daily = this.computeDailyAggregates(entries, this.userRate(), this.otMultiplier(), this.taxRate());
    this.dailyAggregates.set(daily);

    // Client aggregates
    const grouped = entries.reduce((acc, e) => {
      if (!acc[e.chargeCode]) acc[e.chargeCode] = { totalHours: 0, totalPay: 0 };
      acc[e.chargeCode].totalHours += e.hours;
      acc[e.chargeCode].totalPay += this.computeEntryPay(e.hours, this.userRate(), this.otMultiplier());
      return acc;
    }, {} as Record<string, { totalHours: number; totalPay: number }>);
    this.clientAggregates.set(Object.entries(grouped).map(([chargeCode, data]) => ({ chargeCode, ...data })));

    // Optional: Update timesheet totals locally
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    this.timesheet.update(ts => ts ? { ...ts, totalHours } : ts);

    console.log('Updated aggregates', {
      dailyCount: this.dailyAggregates().length,
      clientCount: this.clientAggregates().length,
    });
    this.cdr.markForCheck();
  }

  private computeDailyAggregates(entries: TimesheetEntry[], rate: number, otMultiplier: number, taxRate: number): DailyAggregate[] {
    const grouped = entries.reduce((acc, e) => {
      if (!acc[e.date]) acc[e.date] = { hours: 0 };
      acc[e.date].hours += e.hours;
      return acc;
    }, {} as Record<string, { hours: number }>);
    return Object.entries(grouped).map(([date, { hours }]) => {
      const base = Math.min(8, hours);
      const ot = Math.max(0, hours - 8);
      const regPay = base * rate;
      const otPay = ot * rate * otMultiplier;
      return { date, base, ot, regPay, otPay, subtotal: regPay + otPay };
    });
  }

  private computeEntryPay(hours: number, rate: number, otMultiplier: number): number {
    const base = Math.min(8, hours);
    const ot = Math.max(0, hours - 8);
    return base * rate + ot * rate * otMultiplier;
  }

  private computeHoursDiff(start: Date, end: Date): number {
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return Math.max(0, hours);
  }

  displayedTimesheetIdSuffix() { return this.timesheet()?.id?.slice(-6) ?? ''; }
  userName() { return this.userProfile()?.name ?? ''; }
  userEmail() { return this.userProfile()?.email ?? ''; }

  // ----------------------
  // Event Handlers
  // ----------------------
  async handleSelect(info: any) {
    if (!this.allowEdit()) return;
    try {
      const date = info.startStr.split('T')[0];
      const startTime = info.startStr.split('T')[1]?.substring(0, 5) || '08:00';
      const endTime = info.endStr.split('T')[1]?.substring(0, 5) || '17:00';
      const hours = this.computeHoursDiff(info.start, info.end);

      const timesheetId = this.timesheet()!.id;
      const entryData: Omit<TimesheetEntry, 'id'> = {
        timesheetId,
        date,
        startTime,
        endTime,
        hours,
        userId: this.timesheet()!.userId,
        chargeCode: ' ',
        description: ' ',
      };

      const savedEntry = await this.tsService.addEntry(entryData, timesheetId);
      this.events.update(entries => [...entries, savedEntry]);
      await this.tsService.updateTotals(timesheetId);
      this.updateAggregates();
      this.openSuccess('Entry created. Edit details now.');
      console.log('Added entry', { entryId: savedEntry.id });

      const dialogRef = this.dialog.open(DayEntryDialogComponent, {
        width: '400px',
        data: { entry: savedEntry, availableChargeCodes: this.chargeCodes() },
      });

      dialogRef.afterClosed().subscribe(async (result: TimesheetEntry | 'delete' | undefined) => {
        if (result === 'delete') {
          await this.handleDelete(savedEntry);
          return;
        }
        if (result) {
          await this.tsService.updateEntry(result, timesheetId);
          await this.tsService.updateTotals(timesheetId);
          this.events.update(evts => evts.map(e => e.id === result.id ? result : e));
          this.updateAggregates();
          this.openSuccess('Entry updated.');
          console.log('Updated entry', { entryId: result.id });
        } else if (!savedEntry.chargeCode?.trim()) {
          this.openError('Charge code required. Click entry to edit.');
        }
        this.cdr.markForCheck();
        this.calendarApi?.refetchEvents();
      });
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
    if (!this.allowEdit()) return;
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
      const timesheetId = this.timesheet()!.id;
      if (result === 'delete') {
        await this.handleDelete(entry);
        return;
      }
      if (result) {
        await this.tsService.updateEntry(result, timesheetId);
        await this.tsService.updateTotals(timesheetId);
        this.events.update(evts => evts.map(e => e.id === result.id ? result : e));
        this.updateAggregates();
        this.openSuccess('Entry updated.');
        console.log('Updated entry', { entryId: result.id });
      }
      this.cdr.markForCheck();
      this.calendarApi?.refetchEvents();
    });
  }

  async handleEventDrop(info: any) {
    if (!this.allowEdit()) { info.revert(); return; }
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

      const timesheetId = this.timesheet()!.id;
      await this.tsService.updateEntry(updatedEntry, timesheetId);
      await this.tsService.updateTotals(timesheetId);
      this.events.update(events => events.map(e => e.id === entry.id ? updatedEntry : e));
      this.updateAggregates();
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
    if (!this.allowEdit()) { info.revert(); return; }
    const entry = info.event.extendedProps.entry;
    if (!entry) {
      console.error('No entry found for event resize', { eventId: info.event.id });
      info.revert();
      return;
    }

    try {
      const startTime = info.event.startStr.split('T')[1]?.substring(0, 5) || entry.startTime;
      const endTime = info.event.endStr.split('T')[1]?.substring(0, 5) || entry.endTime;
      const hours = this.computeHoursDiff(new Date(info.event.start), new Date(info.event.end));
      const updatedEntry = { ...entry, startTime, endTime, hours };

      const timesheetId = this.timesheet()!.id;
      await this.tsService.updateEntry(updatedEntry, timesheetId);
      await this.tsService.updateTotals(timesheetId);
      this.events.update(events => events.map(e => e.id === entry.id ? updatedEntry : e));
      this.updateAggregates();
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

  private async handleDelete(entry: TimesheetEntry) {
    if (!this.allowEdit()) return;

    try {
      const timesheetId = this.timesheet()!.id;
      if (!timesheetId) throw new Error('No timesheet ID');

      // Delete from backend
      await this.tsService.deleteEntry(entry.id, timesheetId);
      await this.tsService.updateTotals(timesheetId);

      // Update signal
      this.events.update(evts => evts.filter(e => e.id !== entry.id));

      // Update aggregates locally
      this.updateAggregates();

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
  }

  // ----------------------
  // Review & Save
  // ----------------------
  submitReview() {
    if (!this.reviewForm.valid) return;
    const { action, rejectionReason } = this.reviewForm.value;
    if (action === 'approve') console.log('Approving...');
    this.dialogRef.close({ approved: action === 'approve', rejectionReason });
  }

  async saveChanges() {
    try {
      const timesheetId = this.timesheet()!.id;
      await this.tsService.updateTotals(timesheetId);
      this.updateAggregates();
      this.openSuccess('Changes saved.');
    } catch (error: any) {
      this.openError(error.message || 'Failed to save changes.');
    } finally {
      this.cdr.markForCheck();
    }
  }

    async resubmitTimesheet() {
    const ts = this.timesheet();
    if (!ts) return;
    if (ts.status !== 'rejected') {
      this.openError('Can only resubmit rejected timesheets.');
      return;
    }
    try {
      await this.tsService.updateTimesheet({ id: ts.id, status: 'submitted', rejectionReason: undefined });
      console.log(`Resubmitted ${ts.id}`);
      this.timesheet.update(t => t ? { ...t, status: 'submitted', rejectionReason: undefined } : t);
      this.allowEdit.set(false); // Optional: Disable edits after resubmit
      this.openSuccess('Timesheet resubmitted.');
    } catch (error: any) {
      this.openError(error.message || 'Failed to resubmit.');
    }
  }

  // ----------------------
  // Snackbars
  // ----------------------
  private openError(message: string) {
    this.snackBar.open(message, 'Close', { duration: 7000, horizontalPosition: 'center', verticalPosition: 'top' });
  }

  private openSuccess(message: string) {
    this.snackBar.open(message, 'OK', { duration: 3000, horizontalPosition: 'center', verticalPosition: 'top' });
  }
}