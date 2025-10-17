
// src/app/timesheet/auth/auth.component.ts


import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './auth.component.html'
})
export class AuthComponent {
  private router = inject(Router);
  private authService = inject(AuthService);
  username = '';
  password = '';
  isLoading = false;
  error: string | null = null;

  async onLogin() {
    this.isLoading = true;
    this.error = null;
    try {
      await this.authService.login(this.username, this.password);
      this.router.navigate(['/']);
    } catch (error) {
      this.error = 'Login failed';
      console.error(error);
    } finally {
      this.isLoading = false;
    }
  }
}