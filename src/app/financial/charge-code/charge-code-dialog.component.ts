
// src/app/financial/charge-codes-dialog.component.ts

import { Component, Inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FinancialService } from '../../core/services/financial.service';
import { AuthService } from '../../core/services/auth.service';
import { Account, ChargeCode } from '../../core/models/financial.model';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-charge-code-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatListModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './charge-code-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChargeCodeDialogComponent {
  form: FormGroup;
  mode: 'create' | 'select' = 'select';
  availableCodes: (ChargeCode & { id?: string; active?: boolean })[] = [];
  errorMessage: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<ChargeCodeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { chargeCodes?: (ChargeCode & { id?: string })[]; account?: { id: string; accountNumber: string } },
    private fb: FormBuilder,
    private financialService: FinancialService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.mode = this.data.chargeCodes ? 'select' : 'create';
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
    });

    if (this.mode === 'select') {
      this.loadAvailableCodes();
    }
  }

  async loadAvailableCodes(): Promise<void> {
    try {
      const userGroups: string[] = await firstValueFrom(this.authService.getUserGroups());
      const allAccounts: Account[] = await this.financialService.listAccounts();
      this.availableCodes = allAccounts
        .flatMap((account: Account) =>
          account.chargeCodes.map((cc: string) => ({
            name: cc,
            linkedAccount: account.accountNumber,
            id: `${account.id}-${cc}`,
            active: false,
          }))
        )
        .filter((cc: ChargeCode & { id?: string }) =>
          userGroups.some((group: string) => group.startsWith('chargecode-') && cc.name.includes(group.split('-')[1]))
        );
      this.cdr.markForCheck();
    } catch (error) {
      this.errorMessage = 'Failed to load available charge codes';
      this.cdr.markForCheck();
    }
  }

  removeCode(code: ChargeCode & { id?: string }): void {
    if (this.data.chargeCodes) {
      this.data.chargeCodes = this.data.chargeCodes.filter(c => c.id !== code.id);
      this.cdr.markForCheck();
    }
  }

  async save(): Promise<void> {
    if (this.mode === 'create') {
      if (this.form.invalid) {
        this.form.markAllAsTouched();
        this.errorMessage = 'Please fill out all required fields';
        this.cdr.markForCheck();
        return;
      }
      const formValue = this.form.value;
      const chargeCode: ChargeCode = {
        name: `${formValue.name.toUpperCase().slice(0, 2)}${this.data.account?.id.slice(-3) || 'XXX'}`,
        linkedAccount: this.data.account?.accountNumber || 'ACC001',
      };
      this.dialogRef.close([chargeCode]);
    } else {
      const added = this.availableCodes
        .filter(c => c.active)
        .map(c => ({ name: c.name, linkedAccount: c.linkedAccount, id: c.id }));
      this.dialogRef.close([...(this.data.chargeCodes || []), ...added]);
    }
  }
}