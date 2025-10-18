
// src/app/timesheet/account-list/account-list.component.ts

import { Component, inject, OnInit } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FinancialService } from '../../core/services/financial.service';
import { Account } from '../../core/models/financial.model';

@Component({
  selector: 'app-account-list',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, CurrencyPipe],
  templateUrl: './account-list.component.html',
})
export class AccountListComponent implements OnInit {
  displayedColumns: string[] = ['name', 'accountNumber', 'details', 'balance', 'actions'];
  dataSource: Account[] = [];
  private financialService = inject(FinancialService);
  private router = inject(Router);

  async ngOnInit() {
    this.dataSource = await this.financialService.listAccounts();
  }

  canPost(account: Account): boolean {
    return true;  // Stub
  }

  openLedger(id?: string): void {
    this.router.navigate(['/accounts/ledger', id]);
  }

  openChargeModal(account: Account): void {
    console.log('Charge for', account);  
  }
}