
// src/app/timesheet/review-form/review-form.component.ts

import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-review-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatCheckboxModule],
  templateUrl: './review-form.component.html',
})
export class ReviewFormComponent {
  reviewForm: FormGroup;
  constructor(
    public dialogRef: MatDialogRef<ReviewFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { id: string },
    private fb: FormBuilder
  ) {
    this.reviewForm = this.fb.group({
      approved: [false],
      rejectionReason: ['', Validators.required],
    });
    this.reviewForm.get('rejectionReason')?.setValidators(this.reviewForm.get('approved')?.value ? null : Validators.required);
    this.reviewForm.get('approved')?.valueChanges.subscribe(approved => {
      const reason = this.reviewForm.get('rejectionReason');
      reason?.setValidators(approved ? null : Validators.required);
      reason?.updateValueAndValidity();
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.reviewForm.valid) {
      this.dialogRef.close(this.reviewForm.value);
    }
  }
}