
// src/app/financial/edit-account/edit-account-dialog.component.ts

import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FinancialService } from '../../core/services/financial.service';
import { AuthService } from '../../core/services/auth.service';
import { Account, ChargeCode } from '../../core/models/financial.model';
import { ChargeCodeDialogComponent } from '../charge-code/charge-code-dialog.component';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-edit-account-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    DatePipe,
  ],
  templateUrl: './edit-account-dialog.component.html',
})
export class EditAccountDialogComponent implements OnInit {
  form!: FormGroup;
  errorMessage = '';
  loading = false;
  accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  chargeCodes: ChargeCode[] = [];

  constructor(
    private fb: FormBuilder,
    private financialService: FinancialService,
    private authService: AuthService,
    public dialogRef: MatDialogRef<EditAccountDialogComponent>,
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: { account: Account }
  ) {}

  ngOnInit() {
    const account = this.data.account;
    this.form = this.fb.group({
      id: [{ value: account.id, disabled: true }],
      accountNumber: [{ value: account.accountNumber, disabled: true }],
      name: [account.name, [Validators.required, Validators.minLength(3)]],
      details: [account.details || ''],
      balance: [{ value: account.balance, disabled: true }],
      addFunds: [0, [Validators.min(0)]],
      type: [account.type || '', Validators.required],
    });
    this.chargeCodes = account.chargeCodes || [];
  }

  async save() {
    if (this.form.invalid) {
      this.errorMessage = 'Please fill in all required fields correctly';
      console.warn('Form invalid on save attempt', { formErrors: this.form.errors });
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    try {
      const formValue = this.form.value;
      const addFunds = formValue.addFunds || 0;

      if (addFunds > 0) {
        await this.financialService.addFunds(
          this.data.account.id,
          addFunds,
          'Funds added via edit dialog'
        );
      }

      const updatedAccount = await this.financialService.getAccount(this.data.account.id);

      const updates: Partial<Account> = {
        accountNumber: this.data.account.accountNumber,
        name: formValue.name,
        details: formValue.details || undefined,
        balance: updatedAccount.balance,
        endingBalance: updatedAccount.balance,
        type: formValue.type,
        chargeCodes: this.chargeCodes,
      };

      const result = await this.financialService.updateAccount(this.data.account.id, updates);
      this.dialogRef.close(result);
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to update account';
      console.error('Error updating account:', error);
    } finally {
      this.loading = false;
    }
  }

  async addChargeCode() {
    this.loading = true;
    this.errorMessage = '';

    try {
      const newChargeCode = await this.financialService.createChargeCode(this.data.account);
      this.chargeCodes = [...this.chargeCodes, newChargeCode];
      await this.financialService.getAccount(this.data.account.id);
      this.openChargeCodeDialog(newChargeCode);
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to add charge code';
      console.error('Error adding charge code:', error);
    } finally {
      this.loading = false;
    }
  }

  async removeChargeCode(code: ChargeCode) {
    const confirmed = confirm(`Are you sure you want to remove charge code "${code.name}"?`);
    if (confirmed) {
      this.loading = true;
      this.errorMessage = '';

      try {
        this.chargeCodes = this.chargeCodes.filter(c => c.name !== code.name);
        await this.financialService.updateAccount(this.data.account.id, {
          accountNumber: this.data.account.accountNumber,
          balance: this.data.account.balance,
          endingBalance: this.data.account.endingBalance,
          chargeCodes: this.chargeCodes,
        });
      } catch (error: any) {
        this.errorMessage = error.message || 'Failed to remove charge code';
        console.error('Error removing charge code:', error);
        this.chargeCodes = this.data.account.chargeCodes || [];
      } finally {
        this.loading = false;
      }
    }
  }

  openChargeCodeDialog(chargeCode: ChargeCode) {
    this.dialog.open(ChargeCodeDialogComponent, {
      width: '600px',
      data: {
        chargeCodeName: chargeCode.name,
        account: this.data.account,
        createdBy: chargeCode.createdBy,
        date: chargeCode.date,
      },
    });
  }
}