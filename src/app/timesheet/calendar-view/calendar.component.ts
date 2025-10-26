
// src/app/timesheet/calendar-view/calendar.component.ts

import {
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { firstValueFrom } from 'rxjs';
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
export class CalendarComponent implements OnInit {
  events = signal<any[]>([]);
  draftEntries = signal<TimesheetEntry[]>([]);
  weekRange = signal('');
  userEmail = signal('');
  weeklyTotal = signal(0);
  dailyAvg = signal(0);
  totalCost = signal(0);
  validationMessage = signal('');
  chargeCodes = signal<ChargeCode[]>([]);

  private tsService = inject(TimesheetService);
  private authService = inject(AuthService);
  private financialService = inject(FinancialService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  private currentTimesheetId = 'draft-ts-1';
  private userRate = 25;
  private today = new Date();

  calendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'timeGridWeek',
    events: this.events(),
    editable: true,
    selectable: true,
    selectMirror: true,
    slotMinTime: '06:00:00',
    slotMaxTime: '18:00:00',
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
  };

  async ngOnInit() {
    try {
      this.authService.getUserEmail().subscribe(email => {
        if (email) this.userEmail.set(email);
      });

      const start = startOfWeek(this.today, { weekStartsOn: 0 });
      const end = endOfWeek(this.today, { weekStartsOn: 0 });
      this.weekRange.set(`${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`);

      await this.loadChargeCodes();
      await this.loadEvents();
      console.log('Initialized calendar component', { userEmail: this.userEmail() });
    } catch (error) {
      console.error('Failed to initialize component', error);
      this.snackBar.open('Failed to initialize timesheet', 'OK', { duration: 5000 });
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
      const timesheets = await this.tsService.listTimesheets();
      const allEntries: TimesheetEntry[] = [];
      for (const ts of timesheets) {
        const tsWithEntries = await this.tsService.getTimesheetWithEntries(ts.id);
        allEntries.push(...tsWithEntries.entries);
      }
      this.events.set(allEntries.map((entry) => ({
        id: entry.id,
        title: `${entry.chargeCode || 'Unassigned'}: ${entry.hours}h - ${entry.description}`,
        start: `${entry.date}T${entry.startTime}`,
        end: `${entry.date}T${entry.endTime}`,
        backgroundColor: '#00B0FF',
        borderColor: '#00B0FF',
        extendedProps: { entry, cost: entry.hours * this.userRate },
      })));
      this.updateSummary();
      console.log('Loaded timesheet events', { count: allEntries.length });
    } catch (error) {
      console.error('Failed to load events', error);
      this.snackBar.open('Failed to load events', 'OK', { duration: 5000 });
    }
  }

  private computeHoursDiff(start: Date, end: Date): number {
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  }

  async handleSelect(info: any) {
    try {
      const startDate = new Date(info.start);
      const endDate = new Date(info.end);
      const startStr = startDate.toISOString().split('T')[1].substring(0, 5);
      const endStr = endDate.toISOString().split('T')[1].substring(0, 5);
      const dateStr = startDate.toISOString().split('T')[0];
      const hours = this.computeHoursDiff(startDate, endDate);

      const tmpEventId = `tmp-${Date.now()}`;
      const tmpEvent = {
        id: tmpEventId,
        title: `New Entry: ${hours.toFixed(2)}h`,
        start: startDate,
        end: endDate,
        backgroundColor: '#81C784',
        borderColor: '#388E3C',
        editable: false,
        extendedProps: { tmp: true },
      };
      this.events.update(events => [...events, tmpEvent]);

      const sub = await firstValueFrom(this.authService.getUserSub());
      const entryData: TimesheetEntry = {
        id: tmpEventId,
        timesheetId: this.currentTimesheetId,
        date: dateStr,
        startTime: startStr,
        endTime: endStr,
        hours,
        owner: sub ?? 'default-user',
        chargeCode: 'Unassigned',
        description: 'Auto-created via drag',
      };
      this.draftEntries.update(entries => [...entries, entryData]);
      this.updateSummary();
      this.snackBar.open('Entry created. Click to edit charge code.', 'OK', { duration: 3000 });
      console.log('Added draft entry', { entryId: tmpEventId });
    } catch (error) {
      console.error('Failed to handle select', error);
      this.snackBar.open('Failed to create entry', 'OK', { duration: 5000 });
    }
    info.view.calendar.unselect();
  }

  handleEventClick(info: any) {
    const entry = info.event.extendedProps.entry || this.draftEntries().find(e => e.id === info.event.id);
    if (!entry || info.event.extendedProps.tmp) return;

    const dialogRef = this.dialog.open(DayEntryDialogComponent, {
      width: '400px',
      data: {
        entry,
        availableChargeCodes: this.chargeCodes(),
      },
    });

    dialogRef.afterClosed().subscribe(async (updatedEntry: TimesheetEntry | undefined) => {
      if (updatedEntry) {
        try {
          if (updatedEntry.id.startsWith('tmp-')) {
            this.draftEntries.update(entries => entries.map(e => e.id === updatedEntry.id ? updatedEntry : e));
            this.events.update(events => events.map(e => e.id === updatedEntry.id ? {
              ...e,
              title: `${updatedEntry.chargeCode || 'Unassigned'}: ${updatedEntry.hours}h - ${updatedEntry.description}`,
              extendedProps: { entry: updatedEntry, cost: updatedEntry.hours * this.userRate },
            } : e));
            console.log('Updated draft entry', { entryId: updatedEntry.id });
          } else {
            await this.tsService.updateEntry(updatedEntry, this.currentTimesheetId);
            await this.loadEvents();
            console.log('Updated persisted entry', { entryId: updatedEntry.id });
          }
          this.updateSummary();
          this.snackBar.open('Entry updated.', 'OK', { duration: 2000 });
        } catch (error) {
          console.error('Failed to update entry', error);
          this.snackBar.open('Failed to update entry', 'OK', { duration: 5000 });
        }
      }
    });
  }

  async handleEventDrop(info: any) {
    const entry = info.event.extendedProps.entry || this.draftEntries().find(e => e.id === info.event.id);
    if (!entry) return;
    try {
      const newDate = info.event.startStr.split('T')[0];
      const startTime = info.event.startStr.split('T')[1]?.substring(0, 5);
      const endTime = info.event.endStr.split('T')[1]?.substring(0, 5);
      const hours = this.computeHoursDiff(new Date(info.event.start), new Date(info.event.end));
      const updatedEntry = { ...entry, date: newDate, startTime, endTime, hours };

      if (entry.id.startsWith('tmp-')) {
        this.draftEntries.update(entries => entries.map(e => e.id === entry.id ? updatedEntry : e));
        this.events.update(events => events.map(e => e.id === entry.id ? {
          ...e,
          start: `${newDate}T${startTime}`,
          end: `${newDate}T${endTime}`,
          title: `${updatedEntry.chargeCode || 'Unassigned'}: ${hours}h - ${updatedEntry.description}`,
        } : e));
        console.log('Moved draft entry', { entryId: entry.id });
      } else {
        await this.tsService.updateEntry(updatedEntry, this.currentTimesheetId);
        await this.loadEvents();
        console.log('Moved persisted entry', { entryId: entry.id });
      }
      this.updateSummary();
    } catch (error) {
      console.error('Failed to handle event drop', error);
      this.snackBar.open('Failed to move entry', 'OK', { duration: 5000 });
    }
  }

  async handleEventResize(info: any) {
    const entry = info.event.extendedProps.entry || this.draftEntries().find(e => e.id === info.event.id);
    if (!entry) return;
    try {
      const newStart = info.event.startStr.split('T')[1]?.substring(0, 5) || entry.startTime;
      const newEnd = info.event.endStr.split('T')[1]?.substring(0, 5) || entry.endTime;
      const hours = this.computeHoursDiff(new Date(info.event.start), new Date(info.event.end));
      const updatedEntry = { ...entry, startTime: newStart, endTime: newEnd, hours };

      if (entry.id.startsWith('tmp-')) {
        this.draftEntries.update(entries => entries.map(e => e.id === entry.id ? updatedEntry : e));
        this.events.update(events => events.map(e => e.id === entry.id ? {
          ...e,
          title: `${updatedEntry.chargeCode || 'Unassigned'}: ${hours}h - ${updatedEntry.description}`,
        } : e));
        console.log('Resized draft entry', { entryId: entry.id });
      } else {
        await this.tsService.updateEntry(updatedEntry, this.currentTimesheetId);
        await this.loadEvents();
        console.log('Resized persisted entry', { entryId: entry.id });
      }
      this.updateSummary();
    } catch (error) {
      console.error('Failed to handle event resize', error);
      this.snackBar.open('Failed to resize entry', 'OK', { duration: 5000 });
    }
  }

  private updateSummary() {
    const allEntries = [...this.draftEntries(), ...this.events().map(e => e.extendedProps.entry).filter(e => e && !e.id.startsWith('tmp-'))];
    this.weeklyTotal.set(allEntries.reduce((sum, e) => sum + e.hours, 0));
    this.dailyAvg.set(this.weeklyTotal() / 5);
    this.totalCost.set(allEntries.reduce((sum, e) => sum + (e.hours * this.userRate), 0));
    this.validate();
    console.log('Updated summary', { totalHours: this.weeklyTotal(), totalCost: this.totalCost() });
  }

  private validate() {
    let msg = '';
    const allEntries = [...this.draftEntries(), ...this.events().map(e => e.extendedProps.entry).filter(e => e && !e.id.startsWith('tmp-'))];
    const dailyExceed = allEntries.filter(e => {
      const dailyTotal = allEntries.filter(entry => entry.date === e.date).reduce((sum, entry) => sum + entry.hours, 0);
      return dailyTotal > 8;
    });
    if (dailyExceed.length > 0) msg += 'Daily hours exceed 8h; ';
    if (this.weeklyTotal() > 40) msg += 'Weekly hours exceed 40h. ';
    this.validationMessage.set(msg);
    if (msg) this.snackBar.open(msg, 'OK', { duration: 5000 });
  }

  async submitTimesheet() {
    if (!this.isValid()) return;
    try {
      const sub = await firstValueFrom(this.authService.getUserSub());
      const tsData = {
        entries: this.draftEntries(),
        totalHours: this.weeklyTotal(),
        totalCost: this.totalCost(),
        status: 'submitted' as const,
        owner: sub ?? 'default-user',
      };
      const ts = await this.tsService.createTimesheet(tsData);
      for (const entry of this.draftEntries()) {
        await this.tsService.addEntry(entry, ts.id);
      }
      this.draftEntries.set([]);
      this.events.set([]);
      this.updateSummary();
      this.router.navigate(['/review', ts.id]);
      this.snackBar.open('Timesheet submitted.', 'OK', { duration: 2000 });
      console.log('Timesheet submitted', { timesheetId: ts.id });
    } catch (error) {
      console.error('Failed to submit timesheet', error);
      this.snackBar.open('Failed to submit timesheet', 'OK', { duration: 5000 });
    }
  }

  openChargeCodeDialog() {
    this.financialService.listAccounts().then(accounts => {
      this.chargeCodes.set(accounts.flatMap(account => account.chargeCodes || []));
      const dialogRef = this.dialog.open(ChargeCodeSearchDialogComponent, {
        width: '500px',
        data: { chargeCodes: this.chargeCodes() },
      });

      dialogRef.afterClosed().subscribe((selectedCode: ChargeCode | undefined) => {
        if (selectedCode) {
          console.log('Charge code selected', { code: selectedCode.name });
          this.snackBar.open(`Selected charge code: ${selectedCode.name}`, 'OK', { duration: 2000 });
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
}