
// src/app/timesheet/review-form/review-form.component.ts


import { Component, OnInit, inject, AfterViewInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TimesheetService } from '../../core/services/timesheet.service';
import { AuthService } from '../../core/services/auth.service';
import { FinancialService } from '../../core/services/financial.service';
import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
import { EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { Timesheet, DailyAggregate, TimesheetEntry } from '../../core/models/timesheet.model';
import { ChargeCode } from '../../core/models/financial.model';
import { format, parse } from 'date-fns';
import { signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDialogRef } from '@angular/material/dialog';
import { UserProfile } from '../../core/models/user.model';
import { DayEntryDialogComponent } from '../calendar-view/day-entry-dialog.component'; // Adjust path as needed

@Component({
  standalone: true,
  imports: [CommonModule, FullCalendarModule, MatTableModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatRadioModule, MatButtonModule, MatSnackBarModule, MatDialogModule],
  templateUrl: './review-form.component.html',
})
export class ReviewComponent implements OnInit, AfterViewInit {
  @ViewChild('calendar') calendarComponent!: FullCalendarComponent;
  timesheet = signal<Timesheet | null>(null);
  events = signal<TimesheetEntry[]>([]);
  chargeCodes = signal<ChargeCode[]>([]);
  clientAggregates = signal<{chargeCode: string, totalHours: number, totalPay: number}[]>([]);
  dailyAggregates = signal<DailyAggregate[]>([]);
  userRate = signal<number>(0);
  otMultiplier = signal<number>(1.5);
  taxRate = signal<number>(0.015);
  allowEdit = signal<boolean>(false);
  userProfile = signal<UserProfile | null>(null); 

  entryColumns = ['date', 'startTime', 'endTime', 'hours', 'chargeCode', 'description'];
  dailyColumns = ['date', 'base', 'ot', 'regPay', 'otPay', 'subtotal'];
  clientColumns = ['chargeCode', 'totalHours', 'totalPay'];
  calendarOptions: any = {
    plugins: [dayGridPlugin, timeGridPlugin],
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
              title: `${entry.chargeCode}: ${entry.description}`,
              start: `${entry.date}T${entry.startTime}`,
              end: `${entry.date}T${entry.endTime}`,
              extendedProps: { entry },
            }))
          );
        },
      },
    ],
  };
  reviewForm: FormGroup;
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

async ngOnInit() {
  this.loadData();
}

private async loadData() {
  const id = this.data.id;
  if (!id) {
    console.error('No timesheet ID provided');
    return;
  }
  console.log('Loading timesheet ID:', id);
  try {
    const tsFull = await this.tsService.getTimesheetWithEntries(id);
    const user = await this.authService.getUserById(tsFull.userId);
    this.userProfile.set(user);
    this.userRate.set(user?.rate ?? 25);
    this.otMultiplier.set(user?.otMultiplier ?? 1.5);
    this.taxRate.set(user?.taxRate ?? 0.015);

    // Set full data with rates now available
    this.timesheet.set(tsFull);
    this.events.set(tsFull.entries);

    let daily = tsFull.dailyAggregates || [];
    if (daily.length === 0) {
      daily = this.computeDailyAggregates(tsFull.entries, this.userRate(), this.otMultiplier(), this.taxRate());
    }
    this.dailyAggregates.set(daily);

    const grouped = tsFull.entries.reduce((acc, e) => {
      if (!acc[e.chargeCode]) {
        acc[e.chargeCode] = { totalHours: 0, totalPay: 0 };
      }
      acc[e.chargeCode].totalHours += e.hours;
      acc[e.chargeCode].totalPay += this.computeEntryPay(e.hours, this.userRate(), this.otMultiplier());
      return acc;
    }, {} as Record<string, {totalHours: number, totalPay: number}>);
    this.clientAggregates.set(
      Object.entries(grouped).map(([chargeCode, data]) => ({ chargeCode, ...data }))
    );

    this.allowEdit.set(['submitted', 'rejected'].includes(tsFull.status));

    await this.loadChargeCodes();

    if (this.allowEdit()) {
      // Create new options object to trigger change detection
      this.calendarOptions = {
        ...this.calendarOptions,
        plugins: [...this.calendarOptions.plugins, interactionPlugin],
        editable: true,
        selectable: true,
        selectMirror: true,
        allDaySlot: false,
        snapDuration: '00:15:00',
        eventOverlap: true,
        slotEventOverlap: false,
        select: this.handleSelect.bind(this),
        eventClick: this.handleEventClick.bind(this),
        eventDrop: this.handleEventDrop.bind(this),
        eventResize: this.handleEventResize.bind(this),
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
    }

    // Conditional validators
    this.reviewForm.get('action')!.valueChanges.subscribe(value => {
      const reasonCtrl = this.reviewForm.get('rejectionReason');
      if (value === 'reject') {
        reasonCtrl!.setValidators([Validators.required]);
      } else {
        reasonCtrl!.clearValidators();
      }
      reasonCtrl!.updateValueAndValidity();
    });

    // Force change detection after data load (triggers *ngIf)
    this.cdr.detectChanges();
  } catch (error) {
    console.error('Failed to load timesheet:', error);
  }
}

  ngAfterViewInit() {
    if (this.calendarComponent) {
      this.calendarComponent.getApi().refetchEvents();
    }
  }

  displayedTimesheetIdSuffix() {
    return this.timesheet()?.id?.slice(-6) ?? '';
  }

  userName() {
    return this.userProfile()?.name ?? '';
  }

  userEmail() {
    return this.userProfile()?.email ?? '';
  }

  private async loadChargeCodes() {
    try {
      const accounts = await this.financialService.listAccounts();
      this.chargeCodes.set(accounts.flatMap(account => account.chargeCodes || []));
    } catch (error) {
      console.error('Failed to load charge codes', error);
      this.openError('Failed to load charge codes. Please refresh.');
    }
  }

  private async refreshData() {
    const id = this.data.id;
    if (!id) return;
    const ts = await this.tsService.getTimesheetWithEntries(id);
    this.timesheet.set(ts);
    this.events.set(ts.entries);

    let daily = ts.dailyAggregates || [];
    if (daily.length === 0) {
      daily = this.computeDailyAggregates(ts.entries, this.userRate(), this.otMultiplier(), this.taxRate());
    }
    this.dailyAggregates.set(daily);

    const grouped = ts.entries.reduce((acc, e) => {
      if (!acc[e.chargeCode]) {
        acc[e.chargeCode] = { totalHours: 0, totalPay: 0 };
      }
      acc[e.chargeCode].totalHours += e.hours;
      acc[e.chargeCode].totalPay += this.computeEntryPay(e.hours, this.userRate(), this.otMultiplier());
      return acc;
    }, {} as Record<string, {totalHours: number, totalPay: number}>);
    this.clientAggregates.set(
      Object.entries(grouped).map(([chargeCode, data]) => ({ chargeCode, ...data }))
    );
    this.cdr.markForCheck();
    if (this.calendarComponent) {
      this.calendarComponent.getApi().refetchEvents();
    }
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

  async handleSelect(info: any) {
    if (!this.allowEdit()) return;
    try {
      const dateStr = info.startStr.split('T')[0];
      const startStr = info.startStr.split('T')[1].substring(0, 5);
      const endStr = info.endStr.split('T')[1].substring(0, 5);
      const hours = this.computeHoursDiff(info.start, info.end);

      const timesheetId = this.timesheet()!.id;
      const userId = this.timesheet()!.userId;

      const entryData: Omit<TimesheetEntry, 'id'> = {
        timesheetId,
        date: dateStr,
        startTime: startStr,
        endTime: endStr,
        hours,
        userId,
        chargeCode: ' ',
        description: ' ',
      };

      const savedEntry = await this.tsService.addEntry(entryData, timesheetId);
      await this.tsService.updateTotals(timesheetId);
      await this.refreshData();
      this.openSuccess('Entry created. Editing details...');

      const dialogRef = this.dialog.open(DayEntryDialogComponent, {
        width: '400px',
        data: { entry: savedEntry, availableChargeCodes: this.chargeCodes() },
      });

      dialogRef.afterClosed().subscribe(async (result: TimesheetEntry | 'delete' | undefined) => {
        if (result === 'delete') {
          await this.handleDelete(savedEntry);
        } else if (result) {
          await this.tsService.updateEntry(result, timesheetId!);
          await this.tsService.updateTotals(timesheetId);
          await this.refreshData();
          this.openSuccess('Entry updated.');
        } else {
          if (!savedEntry.chargeCode || savedEntry.chargeCode.trim() === ' ') {
            this.openError('Charge code is required. Click the entry to edit.');
          }
        }
      });
    } catch (error: any) {
      this.openError(error.message || 'Failed to create entry. Please try again.');
    } finally {
      info.view.calendar.unselect();
    }
  }

  async handleEventClick(info: any) {
    if (!this.allowEdit()) return;
    const entry = info.event.extendedProps.entry;
    if (!entry) return;

    const dialogRef = this.dialog.open(DayEntryDialogComponent, {
      width: '400px',
      data: { entry, availableChargeCodes: this.chargeCodes() },
    });

    dialogRef.afterClosed().subscribe(async (result: TimesheetEntry | 'delete' | undefined) => {
      const timesheetId = this.timesheet()!.id;
      if (result === 'delete') {
        await this.tsService.deleteEntry(entry.id, timesheetId);
        await this.tsService.updateTotals(timesheetId);
        await this.refreshData();
        this.openSuccess('Entry deleted.');
      } else if (result) {
        await this.tsService.updateEntry(result, timesheetId);
        await this.tsService.updateTotals(timesheetId);
        await this.refreshData();
        this.openSuccess('Entry updated.');
      }
    });
  }

  async handleEventDrop(info: any) {
    if (!this.allowEdit()) {
      info.revert();
      return;
    }
    const entry = info.event.extendedProps.entry;
    if (!entry) {
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
      await this.refreshData();
    } catch (error: any) {
      this.openError(error.message || 'Failed to move entry. Please try again.');
      info.revert();
    }
  }

  async handleEventResize(info: any) {
    if (!this.allowEdit()) {
      info.revert();
      return;
    }
    const entry = info.event.extendedProps.entry;
    if (!entry) {
      info.revert();
      return;
    }

    try {
      const newStart = info.event.startStr.split('T')[1]?.substring(0, 5) || entry.startTime;
      const newEnd = info.event.endStr.split('T')[1]?.substring(0, 5) || entry.endTime;
      const hours = this.computeHoursDiff(new Date(info.event.start), new Date(info.event.end));
      const updatedEntry = { ...entry, startTime: newStart, endTime: newEnd, hours };

      const timesheetId = this.timesheet()!.id;
      await this.tsService.updateEntry(updatedEntry, timesheetId);
      await this.tsService.updateTotals(timesheetId);
      await this.refreshData();
    } catch (error: any) {
      this.openError(error.message || 'Failed to resize entry. Please try again.');
      info.revert();
    }
  }

  private async handleDelete(entry: TimesheetEntry) {
    if (!this.allowEdit()) return;
    try {
      const timesheetId = this.timesheet()!.id;
      await this.tsService.deleteEntry(entry.id, timesheetId);
      await this.tsService.updateTotals(timesheetId);
      await this.refreshData();
      this.openSuccess('Entry deleted.');
    } catch (error: any) {
      this.openError(error.message || 'Failed to delete entry. Please try again.');
    }
  }

  submitReview() {
    if (this.reviewForm.valid) {
      const { action, rejectionReason } = this.reviewForm.value;
      this.dialogRef.close({ approved: action === 'approve', rejectionReason });
    }
  }

  async saveChanges() {
  try {
    await this.tsService.updateTotals(this.timesheet()!.id);
    await this.refreshData();
    this.openSuccess('Changes saved.');
  } catch (error) {
    this.openError('Failed to save changes.');
  }
}

  private openError(message: string) {
    this.snackBar.open(message, 'Close', {
      duration: 7000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
    });
  }

  private openSuccess(message: string) {
    this.snackBar.open(message, 'OK', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
    });
  }
}