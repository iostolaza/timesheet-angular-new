
// src/app/timesheet/calendar-view/day-entry-dialog.component.ts

import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-day-entry-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule],
  templateUrl: './day-entry-dialog.component.html',
})
export class DayEntryDialogComponent {
  form: FormGroup;
  get entries() { return this.form.get('entries') as FormArray; }

  constructor(
    public dialogRef: MatDialogRef<DayEntryDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { date: string; timesheetId: string; entry?: any },
    private fb: FormBuilder
  ) {
    const initialEntries = this.data.entry ? [this.data.entry] : [
      {
        startTime: ['', Validators.required],
        endTime: ['', Validators.required],
        description: ['', Validators.required],
        chargeCode: ['', Validators.required],
      }
    ];
    this.form = this.fb.group({
      entries: this.fb.array(initialEntries.map(e => this.fb.group({
        startTime: [e.startTime || '', Validators.required],
        endTime: [e.endTime || '', Validators.required],
        description: [e.description || '', Validators.required],
        chargeCode: [e.chargeCode || '', Validators.required],
      }))),
    });
  }

  addEntry() {
    this.entries.push(this.fb.group({
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      description: ['', Validators.required],
      chargeCode: ['', Validators.required],
    }));
  }

  removeEntry(i: number) {
    this.entries.removeAt(i);
  }

  save() {
    this.dialogRef.close(this.entries.value);
  }
}