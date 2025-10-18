
// src/app/timesheet/review-list/review-list.component.ts

import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { TimesheetService } from '../../core/services/timesheet.service';
import { ReviewFormComponent } from '../../timesheet/review-form/review-form.component';
import { Timesheet } from '../../core/models/timesheet.model';

@Component({
  selector: 'app-review-list',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule],
  templateUrl: './review-list.component.html',
})
export class ReviewListComponent implements OnInit {
  displayedColumns: string[] = ['id', 'status', 'totalHours', 'actions'];
  dataSource: Timesheet[] = [];
  isManager = false;
  private tsService = inject(TimesheetService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);

  async ngOnInit() {
    this.dataSource = await this.tsService.listTimesheets('submitted');
    const groups = await firstValueFrom(this.authService.getUserGroups());
    this.isManager = groups.includes('Manager');
    if (this.isManager) this.displayedColumns.push('approve');
  }

  async edit(id: string) {
    console.log('Edit timesheet', id);  // Stub: Nav to calendar
  }

  async resubmit(id: string) {
    await this.tsService.submitTimesheet(id);
    this.ngOnInit();
  }

  openReview(id: string) {
    const dialogRef = this.dialog.open(ReviewFormComponent, { data: { id } });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        if (result.approved) {
          await this.tsService.approveTimesheet(id);
        } else {
          await this.tsService.rejectTimesheet(id, result.rejectionReason || '');
        }
        this.ngOnInit();
      }
    });
  }
}