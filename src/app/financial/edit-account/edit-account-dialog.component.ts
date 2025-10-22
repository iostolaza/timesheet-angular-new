// file: src/app/financial/edit-account/edit-account-dialog.component.ts
import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FinancialService } from '../../core/services/financial.service';
import { AuthService } from '../../core/services/auth.service';
import { Account } from '../../core/models/financial.model';
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
  errorMessage: string = '';
  loading: boolean = false;
  accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  chargeCodes: Array<{
    name: string;
    cognitoGroup: string;
    createdBy: string;
    date: string;
  }> = [];

  constructor(
    private fb: FormBuilder,
    private financialService: FinancialService,
    private authService: AuthService,
    public dialogRef: MatDialogRef<EditAccountDialogComponent>,
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: { account: Account }
  ) {}

  ngOnInit() {
    console.log('Initializing EditAccountDialogComponent', { accountId: this.data.account.id });
    const account = this.data.account;
    
    this.form = this.fb.group({
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
        console.log('Funds added', { accountId: this.data.account.id, amount: addFunds });
      }

      const updatedAccount = await this.financialService.getAccount(this.data.account.id);

      const updates: Partial<Account> = {
        accountNumber: this.data.account.accountNumber, // Preserve accountNumber
        name: formValue.name,
        details: formValue.details || undefined,
        balance: updatedAccount.balance,
        endingBalance: updatedAccount.balance,
        type: formValue.type,
        chargeCodes: this.chargeCodes,
      };

      const result = await this.financialService.updateAccount(
        this.data.account.id,
        updates
      );

      if (result) {
        console.log('Account updated successfully', { accountId: this.data.account.id });
        this.dialogRef.close(result);
      }
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
      const isAdmin = await this.authService.isAdmin();
      if (!isAdmin) {
        throw new Error('Admin access required to create charge codes');
      }

      const newChargeCode = await this.financialService.createChargeCode(this.data.account);
      this.chargeCodes = [...this.chargeCodes, newChargeCode];
      
      const updatedAccount = await this.financialService.getAccount(this.data.account.id);
      this.chargeCodes = updatedAccount.chargeCodes || [];
      
      console.log('Charge code added:', newChargeCode);
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to add charge code';
      console.error('Error adding charge code:', error);
    } finally {
      this.loading = false;
    }
  }

  async removeChargeCode(code: { name: string; cognitoGroup: string; createdBy: string; date: string }) {
    const confirmed = confirm(`Are you sure you want to remove charge code "${code.name}"?`);
    
    if (confirmed) {
      this.loading = true;
      this.errorMessage = '';

      try {
        const isAdmin = await this.authService.isAdmin();
        if (!isAdmin) {
          throw new Error('Admin access required to remove charge codes');
        }

        this.chargeCodes = this.chargeCodes.filter(c => c.name !== code.name);
        
        await this.financialService.updateAccount(this.data.account.id, {
          accountNumber: this.data.account.accountNumber, // Preserve accountNumber
          balance: this.data.account.balance,
          endingBalance: this.data.account.endingBalance,
          chargeCodes: this.chargeCodes,
        });

        console.log('Charge code removed:', code.name);
      } catch (error: any) {
        this.errorMessage = error.message || 'Failed to remove charge code';
        console.error('Error removing charge code:', error);
        this.chargeCodes = this.data.account.chargeCodes || [];
      } finally {
        this.loading = false;
      }
    }
  }

  openChargeCodeDialog(cognitoGroup: string) {
    console.log('Opening charge code dialog for group:', cognitoGroup);
    alert(`Charge Code Management for: ${cognitoGroup}\n\nThis will open a dialog to add/remove users from this charge code group.`);
  }
}
// file: src/app/financial/edit-account/edit-account-dialog.component.ts
// import { Component, Inject, ChangeDetectorRef, inject } from '@angular/core';
// import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
// import { MatButtonModule } from '@angular/material/button';
// import { MatIconModule } from '@angular/material/icon';
// import { MatSnackBar } from '@angular/material/snack-bar';
// import { CommonModule } from '@angular/common';
// import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
// import { FinancialService } from '../../core/services/financial.service';
// import { AuthService } from '../../core/services/auth.service';
// import { Account, Transaction } from '../../core/models/financial.model';
// import { ChargeCodeDialogComponent } from '../charge-code/charge-code-dialog.component';
// import { firstValueFrom, from } from 'rxjs';
// import { format } from 'date-fns';

// @Component({
//   selector: 'app-edit-account-dialog',
//   standalone: true,
//   imports: [
//     CommonModule,
//     FormsModule,
//     ReactiveFormsModule,
//     MatDialogModule,
//     MatButtonModule,
//     MatIconModule,
//   ],
//   templateUrl: './edit-account-dialog.component.html',
// })
// export class EditAccountDialogComponent {
//   form: FormGroup;
//   accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
//   chargeCodes: Array<{ name: string; linkedAccount: string; id?: string }> = [];
//   errorMessage: string | null = null;

//   private dialog = inject(MatDialog);
//   private snackBar = inject(MatSnackBar);

//   constructor(
//     public dialogRef: MatDialogRef<EditAccountDialogComponent>,
//     @Inject(MAT_DIALOG_DATA) public data: { account: Account },
//     private fb: FormBuilder,
//     private financialService: FinancialService,
//     private authService: AuthService,
//     private cdr: ChangeDetectorRef
//   ) {
//     this.form = this.fb.group({
//       id: [{ value: data.account.id, disabled: true }],
//       accountNumber: [{ value: data.account.accountNumber, disabled: true }],
//       name: [data.account.name, [Validators.required, Validators.minLength(3)]],
//       details: [data.account.details || ''],
//       balance: [{ value: data.account.balance, disabled: true }],
//       addFunds: [0, [Validators.min(0)]],
//       type: [data.account.type, Validators.required],
//     });

//     this.chargeCodes = (data.account.chargeCodes || []).map((cc, index) => ({
//       name: cc.name,
//       linkedAccount: data.account.accountNumber,
//       id: `${data.account.accountNumber}-${index}`,
//     }));
//   }

//   private generateChargeCode(accountNumber: string): string {
//     const randomNum = Math.floor(1000 + Math.random() * 9000);
//     return `CC${accountNumber.slice(-4)}-${randomNum}`;
//   }

//   async addChargeCode() {
//     try {
//       const groups = await firstValueFrom(from(this.authService.getUserGroups()));
//       if (!groups.includes('Admin')) {
//         this.errorMessage = 'Admin access required to create charge codes';
//         this.cdr.markForCheck();
//         return;
//       }

//       const chargeCodeName = this.generateChargeCode(this.data.account.accountNumber);
//       const newChargeCode = {
//         name: chargeCodeName,
//         cognitoGroup: `chargecode-${chargeCodeName}`,
//         createdBy: (await firstValueFrom(this.authService.getCurrentUser()))?.id || 'system',
//         date: new Date().toISOString(),
//       };

//       this.chargeCodes.push({
//         name: newChargeCode.name,
//         linkedAccount: this.data.account.accountNumber,
//         id: `${this.data.account.accountNumber}-${this.chargeCodes.length}`,
//       });

//       await this.financialService.createGroup(newChargeCode.cognitoGroup!);
//       this.cdr.markForCheck();
//       this.openChargeCodeDialog(newChargeCode.name);
//     } catch (error: any) {
//       this.errorMessage = `Failed to add charge code: ${error.message || 'Unknown error'}`;
//       this.cdr.markForCheck();
//     }
//   }

//   async openChargeCodeDialog(chargeCodeName: string) {
//     try {
//       const groups = await firstValueFrom(from(this.authService.getUserGroups()));
//       if (!groups.includes('Admin')) {
//         this.errorMessage = 'Admin access required to manage charge code users';
//         this.cdr.markForCheck();
//         return;
//       }

//       const dialogRef = this.dialog.open(ChargeCodeDialogComponent, {
//         width: '600px',
//         data: { chargeCodeName, account: this.data.account },
//       });

//       await firstValueFrom(dialogRef.afterClosed());
//       this.snackBar.open(`Users assigned to charge code ${chargeCodeName}`, 'OK', { duration: 2000 });
//     } catch (error: any) {
//       this.errorMessage = `Failed to open charge code dialog: ${error.message || 'Unknown error'}`;
//       this.cdr.markForCheck();
//     }
//   }

//   removeChargeCode(code: { name: string; linkedAccount: string; id?: string }) {
//     this.chargeCodes = this.chargeCodes.filter(c => c.id !== code.id);
//     this.cdr.markForCheck();
//   }

//   async save() {
//     if (this.form.invalid) {
//       this.form.markAllAsTouched();
//       this.errorMessage = 'Please fill out all required fields correctly';
//       this.cdr.markForCheck();
//       return;
//     }

//     try {
//       const groups = await firstValueFrom(from(this.authService.getUserGroups()));
//       if (!groups.includes('Admin')) {
//         throw new Error('Admin access required');
//       }

//       const formValue = this.form.getRawValue();
//       const addFunds = formValue.addFunds || 0;
//       const newBalance = this.data.account.balance + addFunds;

//       if (addFunds > 0) {
//         const transaction: Omit<Transaction, 'id' | 'runningBalance' | 'date'> = {
//           accountId: this.data.account.id,
//           amount: addFunds,
//           debit: false,
//           description: `Funds added on ${format(new Date(), 'yyyy-MM-dd')}`,
//         };
//         await this.financialService.createTransaction(transaction);
//       }

//       const updatedChargeCodes = this.chargeCodes.map(cc => ({
//         name: cc.name,
//         cognitoGroup: `chargecode-${cc.name}`,
//         createdBy: this.data.account.chargeCodes?.find(c => c.name === cc.name)?.createdBy || 'system',
//         date: this.data.account.chargeCodes?.find(c => c.name === cc.name)?.date || new Date().toISOString(),
//       }));

//       const updatedAccount: Partial<Account> = {
//         name: formValue.name,
//         details: formValue.details || undefined,
//         type: formValue.type,
//         chargeCodes: updatedChargeCodes,
//       };

//       const result = await this.financialService.updateAccount(this.data.account.id, updatedAccount);
//       this.snackBar.open('Account updated successfully!', 'OK', { duration: 2000 });
//       this.dialogRef.close(result);
//     } catch (error: any) {
//       this.errorMessage = `Failed to update account: ${error.message || 'Unknown error'}`;
//       this.snackBar.open(this.errorMessage, 'OK', { duration: 5000 });
//       this.cdr.markForCheck();
//     }
//   }
// }