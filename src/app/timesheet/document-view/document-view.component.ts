// src/app/timesheet/document-view/document-view.component.ts
import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-document-view',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './document-view.component.html'
})
export class DocumentViewDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<DocumentViewDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { document: string }
  ) {}

  onClose() {
    this.dialogRef.close();
  }
}