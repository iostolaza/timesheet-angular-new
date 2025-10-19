
// src/app/financial/create-account/create-account-dialog.component.ts

import { Component, Inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormArray } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FinancialService } from '../../core/services/financial.service';
import { Account } from '../../core/models/financial.model';
import { format } from 'date-fns';

@Component({
  selector: 'app-create-account-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
  ],
  templateUrl: './create-account-dialog.component.html',
})
export class CreateAccountDialogComponent {
  form: FormGroup;

  constructor(
    public dialogRef: MatDialogRef<CreateAccountDialogComponent>,
    private fb: FormBuilder,
    private financialService: FinancialService,
    private snackBar: MatSnackBar
  ) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      startingBalance: [0, [Validators.required, Validators.min(0)]],
      type: ['Asset', Validators.required],
      rate: [25.0, Validators.required],
      chargeCodes: this.fb.array([]),
    });
  }

  get chargeCodesFormArray(): FormArray {
    return this.form.get('chargeCodes') as FormArray;
  }

  getChargeCodeControl(index: number): FormGroup {
    return this.chargeCodesFormArray.at(index) as FormGroup;
  }

  getChargeCodeDisplay(index: number): string {
    const name = this.getChargeCodeControl(index)?.get('name')?.value as string;
    return name ? name.toLowerCase().replace(/\s+/g, '-') : '';
  }

  addChargeCode() {
    this.chargeCodesFormArray.push(this.fb.group({ name: ['', Validators.required] }));
  }

  addAutoChargeCode() {
    const name = this.form.get('name')?.value as string;
    const time = format(new Date(), 'HHmm');
    const prefix = name.slice(0, 2).toUpperCase();
    const suffix = time.slice(-2);
    const autoCode = `${prefix}XXX${suffix}`; // Placeholder XXX; updated post-save
    this.chargeCodesFormArray.push(this.fb.group({ name: [autoCode, Validators.required] }));
  }

  removeChargeCode(index: number) {
    this.chargeCodesFormArray.removeAt(index);
  }

  async save() {
    if (this.form.invalid) return;
    try {
      const formValue = this.form.value;
      // Generate random 5-digit account number
      const accountNumber = Math.floor(10000 + Math.random() * 90000).toString();
      // Save account first to get AWS-generated ID
      const accountData: Omit<Account, 'id'> = {
        name: formValue.name,
        accountNumber,
        details: formValue.description,
        balance: formValue.startingBalance,
        startingBalance: formValue.startingBalance,
        date: format(new Date(), 'yyyy-MM-dd'),
        type: formValue.type,
        rate: formValue.rate,
        chargeCodes: [], // Save charge codes after ID
      };
      const account = await this.financialService.createAccount(accountData);

      // Generate charge codes with ID
      const chargeCodes: string[] = formValue.chargeCodes.map((cc: { name: string }) => {
        const prefix = cc.name.slice(0, 2).toUpperCase();
        const idPart = account.id.slice(-3); // Last 3 digits of AWS ID
        if (cc.name.includes('XXX')) {
          // Auto-generated: Replace XXX with ID + time suffix
          const time = format(new Date(), 'HHmm').slice(-2);
          return `${prefix}${idPart}${time}`;
        }
        // Manual: Use name + ID
        return `${prefix}${idPart}`;
      });

      // Update account with charge codes
      await this.financialService.updateAccount(account.id, { chargeCodes });
      this.snackBar.open('Account created successfully! Charge code groups updated.', 'OK', { duration: 2000 });
      this.dialogRef.close(account);
    } catch (error: any) {
      this.snackBar.open(error.message || 'Failed to create account', 'OK', { duration: 5000 });
    }
  }
}