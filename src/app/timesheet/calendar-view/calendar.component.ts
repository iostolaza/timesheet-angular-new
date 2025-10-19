

// src/app/timesheet/calendar-view/calendar.component.ts
import {
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
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
import { format, startOfWeek, endOfWeek } from 'date-fns';

interface ChargeCode {
  id: string;
  name: string;
  linkedAccount: string;
  active: boolean;
}

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
    FullCalendarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar.component.html',
})
export class CalendarComponent implements OnInit {
  events: any[] = [];
  weekRange = '';
  userName = '';
  weeklyTotal = 0;
  dailyAvg = 0;
  totalCost = 0;
  validationMessage = '';
  chargeCodes: ChargeCode[] = [];

  private tsService = inject(TimesheetService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  private currentTimesheetId = 'draft-ts-1';
  private userRate = 25;
  private today = new Date();

  // ---------------------------
  // FullCalendar Configuration
  // ---------------------------
  calendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'timeGridWeek',
    events: this.events,
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
    eventDrop: this.handleEventDrop.bind(this),
    eventResize: this.handleEventResize.bind(this),
  };

  async ngOnInit() {
    // ✅ get current user
    this.authService.getCurrentUser().subscribe(user => {
      if (user) this.userName = user.name;
    });

    // ✅ calculate current week range
    const start = startOfWeek(this.today, { weekStartsOn: 0 });
    const end = endOfWeek(this.today, { weekStartsOn: 0 });
    this.weekRange = `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`;

    await this.loadChargeCodes();
    await this.loadEvents();
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
      this.events = allEntries.map((entry) => ({
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

  // ------------------------------------------------------
  // DRAG / RESIZE / SELECT HANDLERS
  // ------------------------------------------------------

  private computeHoursDiff(start: Date, end: Date): number {
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  }

  /** ✅ Drag to create new entry (no dialog) */
  async handleSelect(info: any) {
    const startDate = new Date(info.start);
    const endDate = new Date(info.end);
    const startStr = startDate.toISOString().split('T')[1].substring(0, 5);
    const endStr = endDate.toISOString().split('T')[1].substring(0, 5);
    const dateStr = startDate.toISOString().split('T')[0];
    const hours = this.computeHoursDiff(startDate, endDate);

    // Temporary event for visual feedback
    const tmpEvent = {
      id: `tmp-${Date.now()}`,
      title: `New Entry: ${hours.toFixed(2)}h`,
      start: startDate,
      end: endDate,
      backgroundColor: '#81C784',
      borderColor: '#388E3C',
      editable: false,
      extendedProps: { tmp: true },
    };
    this.events = [...this.events, tmpEvent];
    this.cdr.markForCheck();

    const sub = await firstValueFrom(this.authService.getUserSub());
    const entryData: Omit<TimesheetEntry, 'id' | 'timesheetId'> = {
      date: dateStr,
      startTime: startStr,
      endTime: endStr,
      hours,
      owner: sub ?? 'default-user',
      chargeCode: 'Unassigned',
      description: 'Auto-created via drag',
    };
    await this.tsService.addEntry(entryData, this.currentTimesheetId);
    await this.loadEvents();
    info.view.calendar.unselect();
  }

  async handleEventDrop(info: any) {
    const entry = info.event.extendedProps.entry;
    const newDate = info.event.startStr.split('T')[0];
    const startTime = info.event.startStr.split('T')[1]?.substring(0, 5);
    const endTime = info.event.endStr.split('T')[1]?.substring(0, 5);
    const hours = this.computeHoursDiff(new Date(info.event.start), new Date(info.event.end));
    await this.tsService.updateEntry(
      { ...entry, date: newDate, startTime, endTime, hours },
      this.currentTimesheetId
    );
    await this.loadEvents();
  }

  async handleEventResize(info: any) {
    const entry = info.event.extendedProps.entry;
    const newStart = info.event.startStr.split('T')[1]?.substring(0, 5) || entry.startTime;
    const newEnd = info.event.endStr.split('T')[1]?.substring(0, 5) || entry.endTime;
    const hours = this.computeHoursDiff(new Date(info.event.start), new Date(info.event.end));
    await this.tsService.updateEntry(
      { ...entry, startTime: newStart, endTime: newEnd, hours },
      this.currentTimesheetId
    );
    await this.loadEvents();
  }

  // ------------------------------------------------------
  // SUMMARIES, VALIDATION, SUBMIT
  // ------------------------------------------------------

  private updateSummary() {
    this.weeklyTotal = this.events.reduce(
      (sum, e) => sum + (e.extendedProps.entry?.hours || 0),
      0
    );
    this.dailyAvg = this.weeklyTotal / 5;
    this.totalCost = this.events.reduce(
      (sum, e) => sum + (e.extendedProps.cost || 0),
      0
    );
    this.validate();
    this.cdr.markForCheck();
  }

  private validate() {
    let msg = '';
    const dailyExceed = this.events.filter(
      (e) => e.extendedProps.entry?.hours > 8
    );
    if (dailyExceed.length > 0) msg += 'Daily hours exceed 8h; ';
    if (this.weeklyTotal > 40) msg += 'Weekly hours exceed 40h. ';
    this.validationMessage = msg;
    if (msg) this.snackBar.open(msg, 'OK', { duration: 5000 });
    return !msg;
  }

  async submitTimesheet() {
    if (!this.validate()) return;
    const entries = this.events.map((e) => e.extendedProps.entry);
    const sub = await firstValueFrom(this.authService.getUserSub());
    const tsData = {
      entries,
      totalHours: this.weeklyTotal,
      totalCost: this.totalCost,
      status: 'draft' as const,
      owner: sub ?? 'default-user',
    };
    const ts = await this.tsService.createTimesheet(tsData);
    await this.tsService.submitTimesheet(ts.id);
    this.router.navigate(['/review', ts.id]);
  }

  openChargeCodeDialog() {
  // simple placeholder for now (can later open Angular Material dialog)
  this.snackBar.open('Charge code dialog coming soon', 'OK', { duration: 3000 });
}

isValid(): boolean {
  return !this.validationMessage; // true if no validation message set
}
}
