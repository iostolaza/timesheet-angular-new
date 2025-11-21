
// src/app/financial/manage-accounts/manage-accounts.component.ts

import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
// import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FinancialService } from '../../core/services/financial.service';
import { CreateAccountDialogComponent } from '../create-account/create-account-dialog.component';
import { ChargeCodeDialogComponent } from '../charge-code/charge-code-dialog.component';
import { EditAccountDialogComponent } from '../edit-account/edit-account-dialog.component';
import { Account } from '../../core/models/financial.model';

@Component({
  selector: 'app-manage-accounts',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    // RouterLink,
    MatButtonModule,
    MatDialogModule,
  ],
  templateUrl: './manage-accounts.component.html',
})
export class ManageAccountsComponent implements OnInit {
  accounts: Account[] = [];
  chargeCodes: Array<{ name: string; linkedAccount: string; id?: string }> = [];
  selectedAccountId: string = '';
  selectedChargeCode: string = '';

  private financialService = inject(FinancialService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private cdr = inject(ChangeDetectorRef);

  private router = inject(Router);

  async ngOnInit() {
    await this.loadAccounts();
  }

  async loadAccounts() {
    try {
      this.accounts = await this.financialService.listAccounts();
      // Flatten charge codes from all accounts
      this.chargeCodes = this.accounts.flatMap(account =>
        (account.chargeCodes || []).map((cc, index) => ({
          name: cc.name,
          linkedAccount: account.accountNumber,
          id: `${account.accountNumber}-${index}`,
        }))
      );
      this.cdr.markForCheck();
    } catch (error: any) {
      this.snackBar.open(`Failed to load accounts: ${error.message || 'Unknown error'}`, 'OK', { duration: 5000 });
    }
  }

  openCreateAccountDialog() {
    const dialogRef = this.dialog.open(CreateAccountDialogComponent, {
      width: '500px',
    });

    dialogRef.afterClosed().subscribe(async (result: Account | undefined) => {
      if (result) {
        await this.loadAccounts();
        this.snackBar.open('Account created successfully!', 'OK', { duration: 2000 });
      }
    });
  }

  onAccountSelect() {
    if (this.selectedAccountId) {
      const account = this.accounts.find(a => a.id === this.selectedAccountId);
      if (account) {
        const dialogRef = this.dialog.open(EditAccountDialogComponent, {
          width: '600px',
          maxHeight: '80vh',
          data: { account },
        });

        dialogRef.afterClosed().subscribe(async (result: Account | undefined) => {
          if (result) {
            await this.loadAccounts();
            this.snackBar.open('Account updated successfully!', 'OK', { duration: 2000 });
          }
          this.selectedAccountId = '';
          this.cdr.markForCheck();
        });
      }
    }
  }

  onChargeCodeSelect() {
    if (this.selectedChargeCode) {
      const chargeCode = this.chargeCodes.find(c => c.name === this.selectedChargeCode);
      if (chargeCode) {
        const account = this.accounts.find(a => a.accountNumber === chargeCode.linkedAccount);
        if (account) {
          this.dialog.open(ChargeCodeDialogComponent, {
            width: '600px',
            data: { chargeCodeName: chargeCode.name, account },
          });
        }
      }
    }
  }

    goBack(): void {
  this.router.navigate(['/start']);
  // Or simply: this.router.navigateByUrl('/start');
}
}