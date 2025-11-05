
// src/app/timesheet/review-form/review-form.component.ts

import { Component, OnInit, inject, AfterViewInit, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TimesheetService } from '../../core/services/timesheet.service';
import { AuthService } from '../../core/services/auth.service';
import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
import { EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { Timesheet, DailyAggregate, TimesheetEntry } from '../../core/models/timesheet.model';
import { format, parse } from 'date-fns';
import { signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  standalone: true,
  imports: [CommonModule, FullCalendarModule, MatTableModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatRadioModule, MatButtonModule],
  templateUrl: './review-form.component.html',
})
export class ReviewComponent implements OnInit, AfterViewInit {
  @ViewChild('calendar') calendarComponent!: FullCalendarComponent;
  timesheet = signal<Timesheet | null>(null);
  clientAggregates = signal<{chargeCode: string, totalHours: number, totalPay: number}[]>([]);
  dailyAggregates = signal<DailyAggregate[]>([]);
  userRate = signal<number>(0);
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
    editable: false,
    headerToolbar: {
      left: 'prev,next',
      center: 'title',
      right: 'timeGridTwoWeek,timeGridWeek',
    },
    events: [] as EventInput[],
  };

  reviewForm: FormGroup;

  private tsService = inject(TimesheetService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ReviewComponent>);
  private data = inject(MAT_DIALOG_DATA);

  constructor() {
    this.reviewForm = this.fb.group({
      action: ['approve', Validators.required],
      rejectionReason: [''],
    });
  }

  async ngOnInit() {
    const id = this.data.id;
    if (!id) {
      console.error('No timesheet ID provided');
      return;
    }

    console.log('Loading timesheet ID:', id);
    try {
      const ts = await this.tsService.getTimesheetWithEntries(id);
      console.log('Loaded timesheet:', ts);
      this.timesheet.set(ts);

      const user = await this.authService.getUserById(ts.owner);
      const rate = user?.rate || 25;
      this.userRate.set(rate);

      // Update calendar events
      this.calendarOptions = {
        ...this.calendarOptions,
        events: ts.entries.map(entry => ({
          title: `${entry.chargeCode}: ${entry.description}`,
          start: `${entry.date}T${entry.startTime}`,
          end: `${entry.date}T${entry.endTime}`,
        }))
      };

      // Daily aggregates (parse or compute)
      let daily = ts.dailyAggregates || [];
      if (daily.length === 0) {
        daily = this.computeDailyAggregates(ts.entries, rate, 1.5, 0.015);
      }
      this.dailyAggregates.set(daily);

      // Client aggregates
      const grouped = ts.entries.reduce((acc, e) => {
        if (!acc[e.chargeCode]) {
          acc[e.chargeCode] = { totalHours: 0, totalPay: 0 };
        }
        acc[e.chargeCode].totalHours += e.hours;
        acc[e.chargeCode].totalPay += this.computeEntryPay(e.hours, rate, 1.5);
        return acc;
      }, {} as Record<string, {totalHours: number, totalPay: number}>);

      this.clientAggregates.set(
        Object.entries(grouped).map(([chargeCode, data]) => ({ chargeCode, ...data }))
      );

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
    } catch (error) {
      console.error('Failed to load timesheet:', error);
    }
  }

  ngAfterViewInit() {
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

  submitReview() {
    if (this.reviewForm.valid) {
      const { action, rejectionReason } = this.reviewForm.value;
      this.dialogRef.close({ approved: action === 'approve', rejectionReason });
    }
  }
}