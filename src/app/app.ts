
// src/app/app.ts

import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';  // For *ngIf if needed

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: './app.html',  // Simplified
  styleUrl: './app.scss',
})
export class AppComponent implements OnInit {
  protected readonly title = signal('timesheet-app-new');

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit() {
    this.authService.getCurrentUser().subscribe({
      next: (user) => {
        this.router.navigate([user ? '/start' : '/auth']);
      },
      error: () => this.router.navigate(['/auth']),
    });
  }
}