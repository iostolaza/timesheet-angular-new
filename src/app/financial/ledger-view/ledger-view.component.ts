
// src/app/financial/ledger-view/ledger-view.component.ts

import { Component, inject, OnInit } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FinancialService } from '../../core/services/financial.service';
import { Transaction, Account } from '../../core/models/financial.model';
import { Router } from '@angular/router';

@Component({
  selector: 'app-ledger-view',
  standalone: true,
  imports: [CommonModule, MatTableModule, DatePipe, DecimalPipe],
  templateUrl: './ledger-view.component.html',
})
export class LedgerViewComponent implements OnInit {
  displayedColumns: string[] = ['date', 'ref', 'description', 'debit', 'credit', 'running'];
  dataSource: Transaction[] = [];
  account: Account | null = null;
  accountsMap: Map<string, Account> = new Map();
  loading = false;
  error: string | null = null;

  private financialService = inject(FinancialService);
  private route = inject(ActivatedRoute);

  private router = inject(Router);

  async ngOnInit() {
    this.loading = true;
    try {
      const id = this.route.snapshot.paramMap.get('id');
      
      if (id) {
        // Single account ledger
        this.account = await this.financialService.getAccount(id);
        this.dataSource = await this.financialService.listTransactions({ accountId: id });
      } else {
        // Global ledger - need accounts map for names
        const accounts = await this.financialService.listAccounts();
        accounts.forEach(acc => this.accountsMap.set(acc.id, acc));
        this.dataSource = await this.financialService.listTransactions();
        this.displayedColumns.unshift('account_name');
      }

      console.log('Ledger data loaded:', this.dataSource.length, 'transactions');
    } catch (err) {
      console.error('Ledger load error:', err);
      this.error = 'Failed to load ledger data. Check console.';
    } finally {
      this.loading = false;
    }
  }

  getAccountName(accountId: string): string {
    if (this.account) {
      return this.account.name;
    }
    return this.accountsMap.get(accountId)?.name || 'Unknown Account';
  }

  goBack(): void {
  this.router.navigate(['/start']);
  // Or simply: this.router.navigateByUrl('/start');
  }
}