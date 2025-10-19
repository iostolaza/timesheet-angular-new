
// src/app/financial/financial-account.component.ts

import { Component, inject, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormArray } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FinancialService } from '../../app/core/services/financial.service';
import { AuthService } from '../../app/core/services/auth.service';
import { Account } from '../../app/core/models/financial.model';
import { format } from 'date-fns';

@Component({
  selector: 'app-financial-account',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './financial-account.component.html',
})
export class FinancialAccountComponent implements OnInit {
  form: FormGroup;
  mode: 'edit' = 'edit';
  private fb = inject(FormBuilder);
  private financialService = inject(FinancialService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private snackBar = inject(MatSnackBar);

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

  constructor() {
    this.form = this.fb.group({
      name: ['', Validators.required],
      accountNumber: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
      description: [''],
      startingBalance: [0, [Validators.required, Validators.min(0)]],
      type: ['Asset', Validators.required],
      rate: [25.0, Validators.required],
      chargeCodes: this.fb.array([]),
      adjustment: this.fb.group({
        amount: [0],
        debit: [false],
        description: [''],
      }),
    });
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadAccount(id);
    }
  }

  private async loadAccount(id: string) {
    try {
      const account = await this.financialService.getAccount(id);
      this.form.patchValue({
        name: account.name,
        accountNumber: account.accountNumber,
        description: account.details || '',
        startingBalance: account.startingBalance,
        type: account.type,
        rate: account.rate,
      });
      this.chargeCodesFormArray.clear();
      (account.chargeCodes || []).forEach(cc => {
        this.chargeCodesFormArray.push(this.fb.group({ name: [cc, Validators.required] }));
      });
    } catch (error) {
      this.snackBar.open('Failed to load account', 'OK', { duration: 5000 });
      this.router.navigate(['/accounts/list']);
    }
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

  async onSubmit() {
    if (this.form.invalid) return;
    try {
      const formValue = this.form.value;
      const chargeCodes: string[] = formValue.chargeCodes.map((cc: { name: string }) => {
        const prefix = cc.name.slice(0, 2).toUpperCase();
        const idPart = this.route.snapshot.paramMap.get('id')!.slice(-3); // Last 3 digits of AWS ID
        if (cc.name.includes('XXX')) {
          // Auto-generated: Replace XXX with ID + time suffix
          const time = format(new Date(), 'HHmm').slice(-2);
          return `${prefix}${idPart}${time}`;
        }
        // Manual: Use name + ID
        return `${prefix}${idPart}`;
      });
      const accountData: Partial<Account> = {
        name: formValue.name,
        accountNumber: formValue.accountNumber,
        details: formValue.description,
        startingBalance: formValue.startingBalance,
        type: formValue.type,
        rate: formValue.rate,
        chargeCodes,
        date: format(new Date(), 'yyyy-MM-dd'),
      };
      const account = await this.financialService.updateAccount(this.route.snapshot.paramMap.get('id')!, accountData);
      const adj = formValue.adjustment;
      if (adj.amount && adj.amount !== 0) {
        await this.financialService.createTransaction({
          accountId: account.id,
          amount: Math.abs(adj.amount),
          debit: adj.debit,
          description: adj.description || 'Balance adjustment',
        });
      }
      this.snackBar.open('Account updated successfully! Charge code groups updated.', 'OK', { duration: 2000 });
      this.router.navigate(['/accounts/list']);
    } catch (error: any) {
      this.snackBar.open(error.message || 'Failed to save account', 'OK', { duration: 5000 });
    }
  }
}