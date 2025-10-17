
// src/financial/account-list/account-list.component.ts

import { Component, OnInit } from '@angular/core';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FinancialService } from '../../app/core/services/financial.service';
import { AuthService } from '../../app/core/services/auth.service';
import { Account } from '../../app/core/models/financial.model';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-account-list',
  standalone: true,
  imports: [MatTableModule, MatButtonModule, CommonModule, MatDialogModule],
  templateUrl: './account-list.component.html'
})
export class AccountListComponent implements OnInit {
  displayedColumns: string[] = ['name', 'account_number', 'details', 'balance', 'actions'];
  accountsDataSource = new MatTableDataSource<Account>();
  private userId = 1; // Mock, get from AuthService

  constructor(
    private financialService: FinancialService,
    private authService: AuthService,
    private router: Router,
    private dialog: MatDialog
  ) {}

  async ngOnInit() {
    // In real app, get userId from AuthService
    this.financialService.getAccounts(this.userId).subscribe(accounts => {
      this.accountsDataSource.data = accounts;
    });
  }

  openLedger(accountId: number): void {
    this.router.navigate(['/ledger', accountId]);
  }

  canPost(account: Account): boolean {
    return this.financialService.canPost(account, this.userId);
  }

  openChargeModal(account: Account): void {
    // Placeholder: Open a dialog to input charge code and amount
    // In real app, create a ChargeRequestComponent
    const chargeCode = prompt('Enter charge code:');
    const amount = parseFloat(prompt('Enter amount:') || '0');
    if (chargeCode && amount) {
      this.financialService.verifyChargeCode(chargeCode, account.id!, this.userId, amount).subscribe(success => {
        if (success) {
          alert('Charge request processed');
          this.ngOnInit(); // Refresh accounts
        } else {
          alert('Invalid charge code');
        }
      });
    }
  }
}