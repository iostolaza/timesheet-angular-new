
// src/app/financial/manage-accounts/manage-accounts.component.ts

import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
    RouterLink,
    MatButtonModule,
    MatDialogModule,
  ],
  templateUrl: './manage-accounts.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageAccountsComponent implements OnInit {
  accounts: Account[] = [];
  selectedAccountId: string = '';

  private financialService = inject(FinancialService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private cdr = inject(ChangeDetectorRef);

  async ngOnInit() {
    await this.loadAccounts();
  }

  async loadAccounts() {
    try {
      this.accounts = await this.financialService.listAccounts();
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
          data: { account },
        });

        dialogRef.afterClosed().subscribe(async (result: Account | undefined) => {
          if (result) {
            await this.loadAccounts();
            this.snackBar.open('Account updated successfully!', 'OK', { duration: 2000 });
          }
          this.selectedAccountId = ''; // Reset selection
          this.cdr.markForCheck();
        });
      }
    }
  }

  onChargeCodeSelect() {
    if (this.selectedAccountId) {
      const account = this.accounts.find(a => a.id === this.selectedAccountId);
      if (account) {
        this.dialog.open(ChargeCodeDialogComponent, {
          width: '500px',
          data: { account },
        });
      }
    }
  }
}