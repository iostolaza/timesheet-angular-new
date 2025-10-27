// src/app/financial/create-account/create-account-dialog.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { FinancialService } from '../../core/services/financial.service';
import { Account } from '../../core/models/financial.model';

@Component({
  selector: 'app-create-account-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
  ],
  templateUrl: './create-account-dialog.component.html'
})
export class CreateAccountDialogComponent implements OnInit {
  accountForm!: FormGroup;
  errorMessage: string = '';
  loading: boolean = false;
  accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

  constructor(
    private fb: FormBuilder,
    private financialService: FinancialService,
    public dialogRef: MatDialogRef<CreateAccountDialogComponent>
  ) {}

  ngOnInit() {
    this.accountForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      details: [''],
      startingBalance: [0, [Validators.min(0)]],
      type: ['', Validators.required],
    });
  }

  async save() {
    if (this.accountForm.invalid) {
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    try {
      const formValue = this.accountForm.value;
      
      const newAccount: Omit<Account, 'id' | 'accountNumber'> = {
        name: formValue.name,
        details: formValue.details || undefined,
        balance: formValue.startingBalance || 0,
        startingBalance: formValue.startingBalance || 0,
        endingBalance: formValue.startingBalance || 0,
        date: new Date().toISOString().split('T')[0],
        type: formValue.type,
        chargeCodes: [],
      };

      const result = await this.financialService.createAccount(newAccount);
      
      if (result) {
        this.dialogRef.close(result);
      }
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to create account';
      console.error('Error creating account:', error);
    } finally {
      this.loading = false;
    }
  }

  cancel() {
    this.dialogRef.close();
  }
}
