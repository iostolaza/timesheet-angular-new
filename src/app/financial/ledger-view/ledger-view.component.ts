
// src/app/financial/ledger-view/ledger-view.component.ts

import { Component, inject, OnInit } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FinancialService } from '../../core/services/financial.service';
import { Transaction, Account } from '../../core/models/financial.model';

@Component({
  selector: 'app-ledger-view',
  standalone: true,
  imports: [CommonModule, MatTableModule, DatePipe],
  templateUrl: './ledger-view.component.html',
})
export class LedgerViewComponent implements OnInit {
  displayedColumns: string[] = ['date', 'ref', 'description', 'debit', 'credit', 'running'];
  dataSource: Transaction[] = [];
  account: Account | null = null;
  private financialService = inject(FinancialService);
  private route = inject(ActivatedRoute);

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.account = await this.getAccountById(id);
      this.dataSource = await this.financialService.listTransactions({ accountId: id });
    } else {
      this.dataSource = await this.financialService.listTransactions();
      this.displayedColumns.unshift('account_name');
    }
  }

  getAccountName(accountId: string): string {
    return 'Account Name';  // Stub
  }

  private async getAccountById(id: string): Promise<Account> {
    const accounts = await this.financialService.listAccounts();
    return accounts.find(a => a.id === id)!;
  }
}