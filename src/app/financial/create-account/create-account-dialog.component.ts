
// src/app/financial/create-account/create-account-dialog.component.ts

import { Component } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FinancialService } from '../../core/services/financial.service';
import { Account } from '../../core/models/financial.model';
import { format } from 'date-fns';

@Component({
  selector: 'app-create-account-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
  ],
  templateUrl: './create-account-dialog.component.html',
})
export class CreateAccountDialogComponent {
  accountForm: FormGroup;

  constructor(
    public dialogRef: MatDialogRef<CreateAccountDialogComponent>,
    private fb: FormBuilder,
    private financialService: FinancialService,
    private snackBar: MatSnackBar
  ) {
    this.accountForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      startingBalance: [0, [Validators.min(0)]],
      type: ['', Validators.required],
    });
  }

  async save() {
    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      return;
    }
    try {
      const formValue = this.accountForm.value;
      const accountNumber = Math.floor(10000 + Math.random() * 90000).toString();
      const accountData: Omit<Account, 'id'> = {
        name: formValue.name,
        accountNumber,
        details: formValue.description,
        balance: formValue.startingBalance ?? 0,
        startingBalance: formValue.startingBalance ?? 0,
        date: format(new Date(), 'yyyy-MM-dd'),
        type: formValue.type,
        chargeCodes: [],
        rate: 25.0,
      };
      const account = await this.financialService.createAccount(accountData);

      // Log the response for debugging
      console.log('Created account:', account);

      if (!account || !account.id) {
        throw new Error('Account creation failed: No ID returned');
      }

      this.snackBar.open('Account created successfully!', 'OK', { duration: 2000 });
      this.dialogRef.close(account);
    } catch (error: any) {
      console.error('Account creation error:', error);
      this.snackBar.open(`Failed to create account: ${error.message || 'Unknown error'}`, 'OK', { duration: 5000 });
    }
  }

  cancel() {
    this.dialogRef.close();
  }
}