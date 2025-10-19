
// src/app/timesheet/calendar-view/charge-code-dialog.component.ts

import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CommonModule } from '@angular/common';  // CommonModule only
import { FormsModule } from '@angular/forms';  // FormsModule for ngModel

interface ChargeCode { id: string; name: string; linkedAccount: string; active: boolean; }

@Component({
  selector: 'app-charge-code-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatListModule, MatButtonModule, MatCheckboxModule, MatIconModule],  // Fixed: FormsModule added
  templateUrl: './charge-code-dialog.component.html',
})
export class ChargeCodeDialogComponent {
  availableCodes: ChargeCode[] = [];  // Load from service

  constructor(
    public dialogRef: MatDialogRef<ChargeCodeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { chargeCodes: ChargeCode[] }
  ) {
    this.availableCodes = [
      { id: 'new1', name: 'New Project', linkedAccount: 'ACC001', active: false },
      { id: 'new2', name: 'Marketing', linkedAccount: 'ACC002', active: false },
    ];
  }

  removeCode(code: ChargeCode) {
    this.data.chargeCodes = this.data.chargeCodes.filter(c => c.id !== code.id);
  }

  save() {
    const added = this.availableCodes.filter(c => c.active).map(c => ({ ...c, active: true }));
    this.dialogRef.close([...this.data.chargeCodes, ...added]);
  }
}