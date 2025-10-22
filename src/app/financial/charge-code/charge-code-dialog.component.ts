// file: src/app/financial/charge-code/charge-code-dialog.component.ts
import { Component, Inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { CognitoGroupService } from '../../core/services/cognito-group.service';
import { AuthService } from '../../core/services/auth.service';
import { User } from '../../core/models/financial.model';

interface DialogData {
  chargeCodeName: string;
  account: { id: string; accountNumber: string };
  createdBy: string;
  date: string;
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
    MatIconModule,
  ],
  templateUrl: './charge-code-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChargeCodeDialogComponent {
  users: User[] = [];
  filteredUsers: User[] = [];
  groupMembers: { Username: string }[] = [];
  selectedUsers = new FormControl<string[]>([]);
  searchQuery: string = '';
  errorMessage: string | null = null;
  loading = false;

  constructor(
    public dialogRef: MatDialogRef<ChargeCodeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private cognitoGroupService: CognitoGroupService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.loadUsers();
    this.loadGroupMembers();
  }

  async loadUsers() {
    this.loading = true;
    try {
      this.users = await this.authService.listUsers();
      this.filteredUsers = this.users;
      this.cdr.markForCheck();
    } catch (error: any) {
      this.errorMessage = `Failed to load users: ${error.message || 'Unknown error'}`;
      console.error('Error loading users:', error);
      this.cdr.markForCheck();
    } finally {
      this.loading = false;
    }
  }

  async loadGroupMembers() {
    this.loading = true;
    try {
      this.groupMembers = await this.cognitoGroupService.listUsersInGroup(`chargecode-${this.data.chargeCodeName}`);
      this.cdr.markForCheck();
    } catch (error: any) {
      this.errorMessage = `Failed to load group members: ${error.message || 'Unknown error'}`;
      console.error('Error loading group members:', error);
      this.cdr.markForCheck();
    } finally {
      this.loading = false;
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
    this.loading = true;
    this.errorMessage = null;
    try {
      const selectedEmails = this.selectedUsers.value || [];
      const groupName = `chargecode-${this.data.chargeCodeName}`;
      for (const email of selectedEmails) {
        if (!this.groupMembers.some(member => member.Username === email)) {
          await this.cognitoGroupService.addUserToGroup(email, groupName);
        }
      }
      await this.loadGroupMembers();
      this.dialogRef.close();
    } catch (error: any) {
      this.errorMessage = `Failed to add users to group: ${error.message || 'Unknown error'}`;
      console.error('Error saving group members:', error);
      this.cdr.markForCheck();
    } finally {
      this.loading = false;
    }
  }

  async removeUser(email: string) {
    this.loading = true;
    this.errorMessage = null;
    try {
      const groupName = `chargecode-${this.data.chargeCodeName}`;
      await this.cognitoGroupService.removeUserFromGroup(email, groupName);
      await this.loadGroupMembers();
    } catch (error: any) {
      this.errorMessage = `Failed to remove user: ${error.message || 'Unknown error'}`;
      console.error('Error removing user:', error);
      this.cdr.markForCheck();
    } finally {
      this.loading = false;
    }
  }
} 