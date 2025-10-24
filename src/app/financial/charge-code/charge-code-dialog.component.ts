// file: src/app/financial/charge-code/charge-code-dialog.component.ts
import { Component, Inject, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CognitoGroupService } from '../../core/services/cognito-group.service';
import { AuthService } from '../../core/services/auth.service';
import { User, Account } from '../../core/models/financial.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import { debounceTime, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
  selector: 'app-charge-code-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
  ],
  templateUrl: './charge-code-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChargeCodeDialogComponent {
  // Signals for reactive state management
  searchQuery = signal<string>('');
  filteredUsers = signal<User[]>([]);
  groupMembers = signal<any[]>([]);
  loading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Form control for selected users
  selectedUsers = new FormControl<string[]>([]);

  // Computed property for charge code group name
  chargeCodeGroup = computed(() => `chargecode-${this.data.chargeCodeName}`);

  // Computed properties for charge code details
  createdBy = computed(() => {
    const chargeCode = this.data.account.chargeCodes?.find(cc => cc.name === this.data.chargeCodeName);
    return chargeCode?.createdBy || 'Unknown';
  });

  date = computed(() => {
    const chargeCode = this.data.account.chargeCodes?.find(cc => cc.name === this.data.chargeCodeName);
    return chargeCode?.date || '';
  });

  constructor(
    public dialogRef: MatDialogRef<ChargeCodeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { chargeCodeName: string; account: Account },
    private cognitoGroupService: CognitoGroupService,
    private authService: AuthService,
    private snackBar: MatSnackBar
  ) {
    // Initialize data load
    this.loadGroupMembers();

    // Debounced search
    this.selectedUsers.valueChanges.pipe(
      debounceTime(300),
      switchMap(() => this.searchUsers()),
      catchError(err => {
        this.errorMessage.set('Failed to search users: ' + err.message);
        return of([]);
      })
    ).subscribe();
  }

  async searchUsers() {
    this.loading.set(true);
    try {
      const filter = this.searchQuery();
      const cognitoUsers = await this.cognitoGroupService.listCognitoUsers(filter);
      const users: User[] = Array.isArray(cognitoUsers) ? cognitoUsers.map((u: any) => ({
        id: u.Username,
        email: u.Attributes?.find((a: any) => a.Name === 'email')?.Value || u.Username,
        name: u.Attributes?.find((a: any) => a.Name === 'name')?.Value || 'Unknown',
        rate: 25.0,
      })) : [];
      this.filteredUsers.set(users);
    } catch (err: any) {
      this.errorMessage.set('Failed to search users: ' + err.message);
      this.filteredUsers.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async loadGroupMembers() {
    this.loading.set(true);
    try {
      const members = await this.cognitoGroupService.listUsersInGroup(this.chargeCodeGroup());
      this.groupMembers.set(Array.isArray(members) ? members : []);
    } catch (err: any) {
      this.errorMessage.set('Failed to load group members: ' + err.message);
      this.groupMembers.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    this.loading.set(true);
    try {
      const selected = this.selectedUsers.value || [];
      for (const email of selected) {
        await this.cognitoGroupService.addUserToGroup(email, this.chargeCodeGroup());
      }
      await this.loadGroupMembers();
      this.snackBar.open('Users added to charge code group', 'OK', { duration: 3000 });
      this.selectedUsers.setValue([]);
      this.searchQuery.set('');
      this.filteredUsers.set([]);
    } catch (err: any) {
      this.errorMessage.set('Failed to save users: ' + err.message);
    } finally {
      this.loading.set(false);
    }
  }

  async removeUser(email: string) {
    this.loading.set(true);
    try {
      await this.cognitoGroupService.removeUserFromGroup(email, this.chargeCodeGroup());
      await this.loadGroupMembers();
      this.snackBar.open('User removed from charge code group', 'OK', { duration: 3000 });
    } catch (err: any) {
      this.errorMessage.set('Failed to remove user: ' + err.message);
    } finally {
      this.loading.set(false);
    }
  }
}