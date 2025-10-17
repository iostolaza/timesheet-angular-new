
// src/timesheet/review-form/review-form.component.ts

import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-review-form',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, CommonModule],
  templateUrl: './review-form.component.html'
})
export class ReviewFormComponent {
  reviewForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<ReviewFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { timesheet: any }
  ) {
    this.reviewForm = this.fb.group({
      approved: [true],
      rejectionReason: ['', [this.rejectionReasonValidator.bind(this)]]
    });
  }

  rejectionReasonValidator(control: import('@angular/forms').AbstractControl) {
    const approved = this.reviewForm?.get('approved')?.value;
    if (!approved && !control.value) {
      return { required: true };
    }
    return null;
  }

  onSubmit() {
    if (this.reviewForm.valid) {
      this.dialogRef.close(this.reviewForm.value);
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}