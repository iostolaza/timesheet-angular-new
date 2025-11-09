
// src/app/timesheet/review-list/review-list.component.ts

import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TimesheetService } from '../../core/services/timesheet.service';
import { AuthService } from '../../core/services/auth.service';
import { ReviewComponent } from '../review-form/review-form.component';
import { Timesheet } from '../../core/models/timesheet.model';
import { format, parseISO } from 'date-fns';

@Component({
  selector: 'app-review-list',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatDialogModule],
  templateUrl: './review-list.component.html',
})
export class ReviewListComponent implements OnInit {
  displayedColumns: string[] = ['id', 'userName', 'period', 'totalHours', 'status', 'actions'];
  dataSource: (Timesheet & { userName: string; period: string })[] = [];
  private tsService = inject(TimesheetService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);

  async ngOnInit() {
    const timesheets = await this.tsService.listTimesheets('submitted'); // Use existing, assuming optional userId now null for all
    const enriched = await Promise.all(
      timesheets.map(async (ts) => {
        const user = await this.authService.getUserById(ts.userId);
        const period = ts.startDate && ts.endDate
          ? `${format(parseISO(ts.startDate), 'MMM d')} – ${format(parseISO(ts.endDate), 'd, yyyy')}`
          : 'N/A';
        return { ...ts, userName: user?.name || 'Unknown', period };
      })
    );
    this.dataSource = enriched;
  }

  openReview(id: string) {
    const dialogRef = this.dialog.open(ReviewComponent, { 
      data: { id },
      width: '1000px', 
      height: '1000px',
      maxWidth: '100vw',
      maxHeight: '90vw'
    });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        if (result.approved) {
          await this.tsService.approveTimesheet(id);
        } else {
          await this.tsService.rejectTimesheet(id, result.rejectionReason || '');
        }
        await this.ngOnInit(); // Reload list
      }
    });
  }
}