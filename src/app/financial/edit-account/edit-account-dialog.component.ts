
// src/app/financial/edit-account/edit-account-dialog.component.ts

import { Component, Inject, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FinancialService } from '../../core/services/financial.service';
import { AuthService } from '../../core/services/auth.service';
import { Account, ChargeCode, Transaction } from '../../core/models/financial.model';
import { ChargeCodeDialogComponent } from '../charge-code/charge-code-dialog.component';
import { ChargeCodeUsersDialogComponent } from '../charge-code/charge-code-users-dialog.component';
import { firstValueFrom } from 'rxjs';
import { format } from 'date-fns';

@Component({
  selector: 'app-edit-account-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatListModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './edit-account-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditAccountDialogComponent {
  form: FormGroup;
  accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  chargeCodes: (ChargeCode & { id?: string })[] = [];
  errorMessage: string | null = null;

  private dialog = inject(MatDialog);

  constructor(
    public dialogRef: MatDialogRef<EditAccountDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { account: Account },
    private fb: FormBuilder,
    private financialService: FinancialService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      id: [{ value: data.account.id, disabled: true }],
      accountNumber: [{ value: data.account.accountNumber, disabled: true }],
      name: [data.account.name, [Validators.required, Validators.minLength(3)]],
      details: [data.account.details || ''],
      balance: [{ value: data.account.balance, disabled: true }, [Validators.required, Validators.min(0)]],
      addFunds: [0, [Validators.min(0)]],
      type: [data.account.type, Validators.required],
      rate: [data.account.rate, [Validators.required, Validators.min(0)]],
    });
    this.chargeCodes = data.account.chargeCodes.map((cc, index) => ({
      name: cc,
      linkedAccount: data.account.accountNumber,
      id: `${data.account.accountNumber}-${index}`,
    }));
  }

  async openCreateChargeCodeDialog() {
    const groups = await firstValueFrom(this.authService.getUserGroups());
    if (!groups.includes('Admin')) {
      this.errorMessage = 'Admin access required to create charge codes';
      this.cdr.markForCheck();
      return;
    }
    const dialogRef = this.dialog.open(ChargeCodeDialogComponent, {
      width: '500px',
      data: { account: { id: this.data.account.id, accountNumber: this.data.account.accountNumber } },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result && Array.isArray(result)) {
      const newChargeCode = result[0] as ChargeCode & { id?: string };
      this.chargeCodes.push({ ...newChargeCode, id: `${this.data.account.accountNumber}-${this.chargeCodes.length}` });
      await this.authService.createGroup(`chargecode-${newChargeCode.name}`);
      this.cdr.markForCheck();
      this.openChargeCodeUsersDialog(newChargeCode.name);
    }
  }

  async openChargeCodeUsersDialog(chargeCodeName: string) {
    const groups = await firstValueFrom(this.authService.getUserGroups());
    if (!groups.includes('Admin')) {
      this.errorMessage = 'Admin access required to manage charge code users';
      this.cdr.markForCheck();
      return;
    }
    const dialogRef = this.dialog.open(ChargeCodeUsersDialogComponent, {
      width: '500px',
      data: { chargeCodeName },
    });

    await firstValueFrom(dialogRef.afterClosed());
    this.snackBar.open(`Users assigned to charge code ${chargeCodeName}`, 'OK', { duration: 2000 });
  }

  removeChargeCode(code: ChargeCode & { id?: string }) {
    this.chargeCodes = this.chargeCodes.filter(c => c.id !== code.id);
    this.cdr.markForCheck();
  }

  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Please fill out all required fields correctly';
      this.cdr.markForCheck();
      return;
    }

    try {
      const groups = await firstValueFrom(this.authService.getUserGroups());
      if (!groups.includes('Admin')) {
        throw new Error('Admin access required');
      }
      const formValue = this.form.value;
      const addFunds = formValue.addFunds || 0;
      const newBalance = this.data.account.balance + addFunds;

      if (addFunds > 0) {
        const transaction: Omit<Transaction, 'id' | 'runningBalance' | 'date'> = {
          accountId: this.data.account.id,
          amount: addFunds,
          debit: false,
          description: `Funds added on ${format(new Date(), 'yyyy-MM-dd')}`,
        };
        await this.financialService.createTransaction(transaction);
      }

      const updatedAccount: Partial<Account> = {
        id: this.data.account.id,
        accountNumber: this.data.account.accountNumber,
        name: formValue.name,
        details: formValue.details || undefined,
        balance: newBalance,
        startingBalance: this.data.account.startingBalance,
        endingBalance: newBalance,
        date: format(new Date(), 'yyyy-MM-dd'),
        type: formValue.type,
        rate: formValue.rate,
        chargeCodes: this.chargeCodes.map(c => c.name),
      };

      const result = await this.financialService.updateAccount(this.data.account.id, updatedAccount);
      this.dialogRef.close(result);
    } catch (error: any) {
      this.errorMessage = `Failed to update account: ${error.message || 'Unknown error'}`;
      this.snackBar.open(this.errorMessage, 'OK', { duration: 5000 });
      this.cdr.markForCheck();
    }
  }
}