
// src/app/financial/charge-codes-dialog.component.ts

import { Component, Inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { User } from '../../core/models/financial.model';

interface DialogData {
  chargeCodeName: string;
  account: { id: string; accountNumber: string };
}

@Component({
  selector: 'app-charge-code-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatListModule,
    MatInputModule,
  ],
  templateUrl: './charge-code-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChargeCodeDialogComponent {
  users: User[] = [];
  filteredUsers: User[] = [];
  selectedUsers = new FormControl<string[]>([]);
  searchQuery: string = '';
  errorMessage: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<ChargeCodeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.loadUsers();
  }

  async loadUsers() {
    try {
      this.users = await this.authService.listUsers();
      this.filteredUsers = this.users;
      this.cdr.markForCheck();
    } catch (error: any) {
      this.errorMessage = `Failed to load users: ${error.message || 'Unknown error'}`;
      this.cdr.markForCheck();
    }
  }

  searchUsers() {
    this.filteredUsers = this.users.filter(user =>
      user.email.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
      user.name.toLowerCase().includes(this.searchQuery.toLowerCase())
    );
    this.cdr.markForCheck();
  }

  async save() {
    try {
      const selectedEmails = this.selectedUsers.value || [];
      const groupName = `chargecode-${this.data.chargeCodeName}`;
      for (const email of selectedEmails) {
        await this.authService.addUserToGroup(email, groupName);
      }
      this.dialogRef.close();
    } catch (error: any) {
      this.errorMessage = `Failed to add users to group: ${error.message || 'Unknown error'}`;
      this.cdr.markForCheck();
    }
  }
}