
// src/app/timesheet/calendar-view/day-entry-dialog.component.ts

import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { TimesheetEntry } from '../../core/models/timesheet.model';
import { ChargeCode } from '../../core/models/financial.model';

interface DialogData {
  entry: TimesheetEntry;
  availableChargeCodes: ChargeCode[];
}

@Component({
  selector: 'app-day-entry-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: './day-entry-dialog.component.html',
})
export class DayEntryDialogComponent {
  form: FormGroup;
  saving = false;

  constructor(
    public dialogRef: MatDialogRef<DayEntryDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      chargeCode: [this.data.entry.chargeCode || '', Validators.required],
      description: [this.data.entry.description || '', Validators.required],
    });
  }

  save() {
    if (this.form.valid) {
      this.saving = true;
      const updatedEntry: TimesheetEntry = {
        ...this.data.entry,
        ...this.form.value,
      };
      this.dialogRef.close(updatedEntry);
    }
  }

  delete() {
    this.dialogRef.close('delete');
  }

  cancel() {
    this.dialogRef.close();
  }
}