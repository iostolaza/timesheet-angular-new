
// src/app/timesheet/review-page/review-page.component.ts

import { Component, OnInit, inject } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { CommonModule } from '@angular/common';
import { TimesheetService } from '../../app/core/services/timesheet.service';
import { Timesheet } from '../../app/core/models/timesheet.model';
import { ReviewFormComponent } from '../review-form/review-form.component';

@Component({
  selector: 'app-review-page',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatTableModule, CommonModule],
  templateUrl: './review-page.component.html'
})
export class ReviewPageComponent implements OnInit {
  displayedColumns: string[] = ['id', 'status', 'totalHours', 'actions'];
  timesheets: Timesheet[] = [];
  private timesheetService = inject(TimesheetService);
  private dialog = inject(MatDialog);

  async ngOnInit() {
    this.timesheets = await this.timesheetService.getTimesheets('submitted');
  }

  openReviewForm(timesheet: Timesheet): void {
    const dialogRef = this.dialog.open(ReviewFormComponent, {
      width: '400px',
      data: { timesheet }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        if (result.approved) {
          await this.timesheetService.approveTimesheet(timesheet.id, timesheet.entries);
        } else {
          await this.timesheetService.rejectTimesheet(timesheet.id, result.rejectionReason);
        }
        this.timesheets = await this.timesheetService.getTimesheets('submitted');
      }
    });
  }
}