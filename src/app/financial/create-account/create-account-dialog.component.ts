// file: src/app/financial/create-account/create-account-dialog.component.ts
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
  errorMessage: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<CreateAccountDialogComponent>,
    private fb: FormBuilder,
    private financialService: FinancialService,
    private snackBar: MatSnackBar
  ) {
    this.accountForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      details: [''],
      startingBalance: [0, [Validators.min(0)]],
      type: ['', Validators.required],
    });
  }

  async save() {
    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      this.errorMessage = 'Please fill out all required fields correctly';
      return;
    }
    try {
      const formValue = this.accountForm.value;
      const accountData: Omit<Account, 'id' | 'accountNumber'> = {
        name: formValue.name,
        details: formValue.details || undefined,
        balance: formValue.startingBalance ?? 0,
        startingBalance: formValue.startingBalance ?? 0,
        endingBalance: formValue.startingBalance ?? 0,
        date: format(new Date(), 'yyyy-MM-dd'),
        type: formValue.type,
        chargeCodes: [],
      };
      const account = await this.financialService.createAccount(accountData);
      this.snackBar.open('Account created successfully!', 'OK', { duration: 2000 });
      this.dialogRef.close(account);
    } catch (error: any) {
      console.error('Account creation error:', error);
      this.errorMessage = `Failed to create account: ${error.message || 'Unknown error'}`;
      this.snackBar.open(this.errorMessage, 'OK', { duration: 5000 });
    }
  }

  cancel() {
    this.dialogRef.close();
  }
}