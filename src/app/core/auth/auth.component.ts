
// src/app/core/auth/auth.component.ts

import { Component, inject, signal, OnInit } from '@angular/core'; // Added OnInit
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import type { UserProfile } from '../models/user.model';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './auth.component.html',
})
export class AuthComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private authService = inject(AuthService);
  authState = signal<'signin' | 'signup' | 'confirmSignup' | 'newPassword'>('signin');
  currentEmail = signal<string>('');
  error: string | null = null;
  success: string | null = null;

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });
  signupForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });
  confirmForm = this.fb.group({
    code: ['', [Validators.required]],
  });
  newPasswordForm = this.fb.group({
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  async ngOnInit() {
    if (await this.authService.isAuthenticated()) {
      this.router.navigate(['/start']);
    }
  }

  toggleMode() {
    this.error = null;
    this.success = null;
    this.authState.set(this.authState() === 'signup' ? 'signin' : 'signup');
  }

  get currentForm() {
    switch (this.authState()) {
      case 'confirmSignup': return this.confirmForm;
      case 'newPassword': return this.newPasswordForm;
      case 'signup': return this.signupForm;
      default: return this.loginForm;
    }
  }

  getSubmitLabel() {
    switch (this.authState()) {
      case 'signup': return 'Sign Up';
      case 'confirmSignup': return 'Confirm';
      case 'signin': return 'Sign In';
      case 'newPassword': return 'Set New Password';
      default: return 'Submit';
    }
  }

  onSubmit() {
    const form = this.currentForm;
    if (!form.valid) return;
    this.error = null;
    const val = form.value;
    switch (this.authState()) {
      case 'signup': return this.handleSignup(val);
      case 'confirmSignup': return this.handleConfirmSignup(val);
      case 'signin': return this.handleSignin(val);
      case 'newPassword': return this.handleNewPassword(val);
    }
  }

  private handleSignup({ email, password }: any) {
    this.currentEmail.set(email);
    this.authService.signUp(email, password).subscribe({
      next: () => {
        this.success = 'Signup successful. Check your email for the code.';
        this.authState.set('confirmSignup');
      },
      error: (err) => {
        this.error = (err as Error)?.message ?? String(err);
      }
    });
  }

  private handleConfirmSignup({ code }: any) {
    this.authService.confirmSignUp(this.currentEmail(), code).subscribe({
      next: () => {
        this.success = 'Confirmed. Please sign in.';
        this.authState.set('signin');
      },
      error: (err) => this.error = (err as Error)?.message ?? String(err)
    });
  }

  private async handleSignin({ email, password }: any) {
    if (await this.authService.isAuthenticated()) {
      await this.authService.loadCurrentUser();
      this.router.navigate(['/start']);
      return;
    }
    this.authService.signIn(email, password).subscribe({
      next: (result: any) => {
        if (result.isSignedIn) {
          this.router.navigate(['/start']);
        } else {
          this.authState.set('newPassword');
          this.success = 'Please set a new permanent password.';
        }
      },
      error: (err) => this.error = (err as Error)?.message ?? String(err)
    });
  }

  private handleNewPassword({ newPassword }: any) {
    this.authService.confirmSignIn(newPassword).subscribe({
      next: () => {
        this.router.navigate(['/start']);
      },
      error: (err) => this.error = (err as Error)?.message ?? String(err)
    });
  }
}