
// file: src/app/financial/edit-account/edit-account-dialog.component.ts
import { Component, Inject, ChangeDetectorRef, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { FinancialService } from '../../core/services/financial.service';
import { AuthService } from '../../core/services/auth.service';
import { Account, Transaction } from '../../core/models/financial.model';
import { ChargeCodeDialogComponent } from '../charge-code/charge-code-dialog.component';
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
    MatIconModule,
  ],
  templateUrl: './edit-account-dialog.component.html',
})
export class EditAccountDialogComponent {
  form: FormGroup;
  accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  chargeCodes: Array<{ name: string; linkedAccount: string; id?: string }> = [];
  errorMessage: string | null = null;

  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  constructor(
    public dialogRef: MatDialogRef<EditAccountDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { account: Account },
    private fb: FormBuilder,
    private financialService: FinancialService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    // Initialize form with account data
    this.form = this.fb.group({
      id: [{ value: data.account.id, disabled: true }],
      accountNumber: [{ value: data.account.accountNumber, disabled: true }],
      name: [data.account.name, [Validators.required, Validators.minLength(3)]],
      details: [data.account.details || ''],
      balance: [{ value: data.account.balance, disabled: true }],
      addFunds: [0, [Validators.min(0)]],
      type: [data.account.type, Validators.required],
    });

    // Map charge codes to display format
    this.chargeCodes = (data.account.chargeCodes || []).map((cc, index) => ({
      name: cc.name,
      linkedAccount: data.account.accountNumber,
      id: `${data.account.accountNumber}-${index}`,
    }));
  }

  private generateChargeCode(accountNumber: string): string {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `CC${accountNumber.slice(-4)}-${randomNum}`;
  }

  async addChargeCode() {
    try {
      const groups = await firstValueFrom(this.authService.getUserGroups());
      if (!groups.includes('Admin')) {
        this.errorMessage = 'Admin access required to create charge codes';
        this.cdr.markForCheck();
        return;
      }

      const chargeCodeName = this.generateChargeCode(this.data.account.accountNumber);
      const newChargeCode = {
        name: chargeCodeName,
        cognitoGroup: `chargecode-${chargeCodeName}`,
        createdBy: (await firstValueFrom(this.authService.getCurrentUser()))?.id || 'system',
        date: new Date().toISOString(),
      };

      // Add to local array
      this.chargeCodes.push({
        name: newChargeCode.name,
        linkedAccount: this.data.account.accountNumber,
        id: `${this.data.account.accountNumber}-${this.chargeCodes.length}`,
      });

      // Create Cognito group
      await this.authService.createGroup(newChargeCode.cognitoGroup!);
      this.cdr.markForCheck();

      // Open dialog to assign users
      this.openChargeCodeDialog(newChargeCode.name);
    } catch (error: any) {
      this.errorMessage = `Failed to add charge code: ${error.message || 'Unknown error'}`;
      this.cdr.markForCheck();
    }
  }

  async openChargeCodeDialog(chargeCodeName: string) {
    try {
      const groups = await firstValueFrom(this.authService.getUserGroups());
      if (!groups.includes('Admin')) {
        this.errorMessage = 'Admin access required to manage charge code users';
        this.cdr.markForCheck();
        return;
      }

      const dialogRef = this.dialog.open(ChargeCodeDialogComponent, {
        width: '600px',
        data: { chargeCodeName, account: this.data.account },
      });

      await firstValueFrom(dialogRef.afterClosed());
      this.snackBar.open(`Users assigned to charge code ${chargeCodeName}`, 'OK', { duration: 2000 });
    } catch (error: any) {
      this.errorMessage = `Failed to open charge code dialog: ${error.message || 'Unknown error'}`;
      this.cdr.markForCheck();
    }
  }

  removeChargeCode(code: { name: string; linkedAccount: string; id?: string }) {
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

      const formValue = this.form.getRawValue(); // Get all values including disabled
      const addFunds = formValue.addFunds || 0;
      const newBalance = this.data.account.balance + addFunds;

      // Create transaction if funds added
      if (addFunds > 0) {
        const transaction: Omit<Transaction, 'id' | 'runningBalance' | 'date'> = {
          accountId: this.data.account.id,
          amount: addFunds,
          debit: false,
          description: `Funds added on ${format(new Date(), 'yyyy-MM-dd')}`,
        };
        await this.financialService.createTransaction(transaction);
      }

      // Update account with new charge codes
      const updatedChargeCodes = this.chargeCodes.map(cc => ({
        name: cc.name,
        cognitoGroup: `chargecode-${cc.name}`,
        createdBy: this.data.account.chargeCodes?.find(c => c.name === cc.name)?.createdBy || 'system',
        date: this.data.account.chargeCodes?.find(c => c.name === cc.name)?.date || new Date().toISOString(),
      }));

      const updatedAccount: Partial<Account> = {
        name: formValue.name,
        details: formValue.details || undefined,
        type: formValue.type,
        chargeCodes: updatedChargeCodes,
      };

      const result = await this.financialService.updateAccount(this.data.account.id, updatedAccount);
      this.snackBar.open('Account updated successfully!', 'OK', { duration: 2000 });
      this.dialogRef.close(result);
    } catch (error: any) {
      this.errorMessage = `Failed to update account: ${error.message || 'Unknown error'}`;
      this.snackBar.open(this.errorMessage, 'OK', { duration: 5000 });
      this.cdr.markForCheck();
    }
  }
}