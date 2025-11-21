
// src/app/financial/account-list/account-list.component.ts

import { Component, inject, OnInit } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FinancialService } from '../../core/services/financial.service';
import { EditAccountDialogComponent } from '../edit-account/edit-account-dialog.component';
import { Account } from '../../core/models/financial.model';

import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatButtonModule} from '@angular/material/button';

@Component({
  selector: 'app-account-list',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatMenuModule,
    CurrencyPipe,
    // RouterLink
  ],
  templateUrl: './account-list.component.html',
})
export class AccountListComponent implements OnInit {
  displayedColumns: string[] = ['accountNumber', 'name', 'details', 'balance', 'actions'];
  dataSource: Account[] = [];
  private financialService = inject(FinancialService);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  async ngOnInit() {
    this.dataSource = await this.financialService.listAccounts();
  }

  editAccount(account: Account) {
    const dialogRef = this.dialog.open(EditAccountDialogComponent, {
      width: '600px',
      maxHeight: '80vh',
      data: { account },
    });

    dialogRef.afterClosed().subscribe(async (result: Account | undefined) => {
      if (result) {
        this.dataSource = await this.financialService.listAccounts();
      }
    });
  }

  openLedger(id?: string): void {
    this.router.navigate(['/accounts/ledger', id]);
  }

  goBack(): void {
  this.router.navigate(['/start']);
  // Or simply: this.router.navigateByUrl('/start');
  }
}