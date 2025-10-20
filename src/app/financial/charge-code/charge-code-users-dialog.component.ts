
// src/app/financial/charge-code-users-dialog.component.ts

// import { Component, Inject, OnInit } from '@angular/core';
// import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
// import { MatListModule } from '@angular/material/list';
// import { MatButtonModule } from '@angular/material/button';
// import { ReactiveFormsModule, FormControl } from '@angular/forms';
// import { CommonModule } from '@angular/common';
// import { AuthService } from '../../core/services/auth.service';
// import { User } from '../../core/models/financial.model';

// interface DialogData {
//   chargeCodeName: string;
// }

// @Component({
//   selector: 'app-charge-code-users-dialog',
//   standalone: true,
//   imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatListModule, MatButtonModule],
//   templateUrl: './charge-code-users-dialog.component.html',
// })
// export class ChargeCodeUsersDialogComponent implements OnInit {
//   users: User[] = [];
//   selectedUsers = new FormControl<string[]>([]);

//   constructor(
//     public dialogRef: MatDialogRef<ChargeCodeUsersDialogComponent>,
//     @Inject(MAT_DIALOG_DATA) public data: DialogData,
//     private authService: AuthService
//   ) {}

//   async ngOnInit() {
//     this.users = await this.authService.listUsers();
//   }

//   async save() {
//     const selectedEmails = this.selectedUsers.value || [];
//     const groupName = `chargecode-${this.data.chargeCodeName}`;
//     for (const email of selectedEmails) {
//       try {
//         await this.authService.addUserToGroup(email, groupName);
//       } catch (error: any) {
//         console.error(`Failed to add user ${email} to group ${groupName}:`, error);
//       }
//     }
//     this.dialogRef.close();
//   }
// }