
// src/app/financial/account-list/account-list.component.ts

import { Component, inject, OnInit } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FinancialService } from '../../core/services/financial.service';
import { ChargeCodesDialogComponent } from '../../financial/charge-code/charge-codes-dialog.component';
import { CreateAccountDialogComponent } from '../../financial/create-account/create-account-dialog.component';
import { Account } from '../../core/models/financial.model';

@Component({
  selector: 'app-account-list',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule, MatDialogModule, CurrencyPipe],
  templateUrl: './account-list.component.html',
})
export class AccountListComponent implements OnInit {
  displayedColumns: string[] = ['name', 'accountNumber', 'details', 'balance', 'actions'];
  dataSource: Account[] = [];
  private financialService = inject(FinancialService);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  async ngOnInit() {
    this.dataSource = await this.financialService.listAccounts();
  }

  canPost(account: Account): boolean {
    return true; // Stub
  }

  openCreateAccountDialog() {
    const dialogRef = this.dialog.open(CreateAccountDialogComponent, {
      width: '500px',
    });

    dialogRef.afterClosed().subscribe(async (result: Account | undefined) => {
      if (result) {
        this.dataSource = await this.financialService.listAccounts();
      }
    });
  }

  editAccount(id: string) {
    this.router.navigate(['/accounts/edit', id]);
  }

  openLedger(id?: string): void {
    this.router.navigate(['/accounts/ledger', id]);
  }

  openChargeModal(account: Account): void {
    console.log('Charge for', account);
  }

  manageChargeCodes(account: Account) {
    this.dialog.open(ChargeCodesDialogComponent, {
      width: '500px',
      data: { account },
    });
  }
}