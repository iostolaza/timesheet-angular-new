
// src/app/timesheet/review-form/review-form.component.ts


import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TimesheetService } from '../../core/services/timesheet.service';
import { FullCalendarModule } from '@fullcalendar/angular';
import { EventInput } from '@fullcalendar/core';  // Import from core
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { Timesheet, DailyAggregate, TimesheetEntry } from '../../core/models/timesheet.model';
import { format } from 'date-fns';

@Component({
  standalone: true,
  imports: [CommonModule, FullCalendarModule, MatTableModule],
  templateUrl: './review-form.component.html',
})
export class ReviewComponent implements OnInit {
  timesheet: Timesheet | null = null;
  clientAggregates: {chargeCode: string, totalHours: number, totalPay: number}[] = [];
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

  private tsService = inject(TimesheetService);
  private route = inject(ActivatedRoute);

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.timesheet = await this.tsService.getTimesheetWithEntries(id);
      this.calendarOptions.events = this.timesheet.entries.map(entry => ({
        title: `${entry.chargeCode}: ${entry.description}`,
        start: `${entry.date}T${entry.startTime}`,
        end: `${entry.date}T${entry.endTime}`,
      }));
      const grouped = this.timesheet.entries.reduce((acc, e) => {
        if (!acc[e.chargeCode]) acc[e.chargeCode] = { totalHours: 0, totalPay: 0 };
        acc[e.chargeCode].totalHours += e.hours;
        acc[e.chargeCode].totalPay += e.hours * this.timesheet!.totalCost! / this.timesheet!.totalHours;
        return acc;
      }, {} as Record<string, {totalHours: number, totalPay: number}>);
      this.clientAggregates = Object.entries(grouped).map(([chargeCode, data]) => ({ chargeCode, ...data }));
    }
  }
}