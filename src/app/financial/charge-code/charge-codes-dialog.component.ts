
// src/app/financial/charge-codes-dialog.component.ts

import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ChargeCodeUsersDialogComponent } from './charge-code-users-dialog.component';
import { Account } from '../../core/models/financial.model';

interface DialogData {
  account: Account;
}

@Component({
  selector: 'app-charge-codes-dialog',
  standalone: true,
  imports: [MatDialogModule, MatListModule, MatButtonModule, MatIconModule],
  templateUrl: './charge-codes-dialog.component.html',
})
export class ChargeCodesDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ChargeCodesDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private dialog: MatDialog
  ) {}

  openUsersDialog(chargeCodeName: string) {
    this.dialog.open(ChargeCodeUsersDialogComponent, {
      width: '400px',
      data: { chargeCodeName },
    });
  }
}