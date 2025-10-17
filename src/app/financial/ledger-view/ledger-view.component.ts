
// src/financial/ledger-view/ledger-view.component.ts

import { Component, OnInit } from '@angular/core';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FinancialService } from '../../app/core/services/financial.service';
import { Account, Transaction } from '../../app/core/models/financial.model';
import { DatePipe } from '@angular/common';


@Component({
  selector: 'app-ledger-view',
  standalone: true,
  imports: [MatTableModule, CommonModule],
  providers: [DatePipe],
  templateUrl: './ledger-view.component.html'
})
export class LedgerViewComponent implements OnInit {
  account: Account | null = null;
  entriesDataSource = new MatTableDataSource<Transaction>();
  displayedColumns: string[] = [];
  private accountId: number | undefined = undefined;

  constructor(
    private route: ActivatedRoute,
    private financialService: FinancialService
  ) {}

  ngOnInit() {
    this.accountId = this.route.snapshot.paramMap.get('id') ? +this.route.snapshot.paramMap.get('id')! : undefined;
    this.displayedColumns = this.accountId
      ? ['date', 'ref', 'description', 'debit', 'credit', 'running']
      : ['account_name', 'date', 'ref', 'description', 'debit', 'credit', 'running'];

    if (this.accountId) {
      this.financialService.getAccount(this.accountId).subscribe(account => {
        this.account = account;
      });
    }

    this.financialService.getTransactions(this.accountId).subscribe(({ entries }) => {
      this.entriesDataSource.data = entries;
    });
  }

  getAccountName(accountId: number): string {
    return this.financialService.getAccountName(accountId);
  }
}