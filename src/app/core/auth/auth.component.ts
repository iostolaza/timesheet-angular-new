
// src/app/core/auth/auth.component.ts

import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';  // Removed: No CognitoUser needed
import { User } from '../../core/models/financial.model';  // Added: For type in handleSuccess
import { CommonModule } from '@angular/common';

type AuthState = 'idle' | 'signup' | 'confirmSignup' | 'signin' | 'newPassword' | 'success';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './auth.component.html',
})
export class AuthComponent {
  authState = signal<AuthState>('idle');
  currentEmail = signal<string>('');  // Track email across steps
  loginForm: FormGroup;
  signupForm: FormGroup;
  confirmForm: FormGroup;
  newPasswordForm: FormGroup;
  error: string | null = null;
  success: string | null = null;

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  constructor() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
    this.signupForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
    this.confirmForm = this.fb.group({
      code: ['', Validators.required],
    });
    this.newPasswordForm = this.fb.group({
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  toggleMode() {
    const newState = this.authState() === 'signup' ? 'signin' : 'signup';
    this.authState.set(newState);
    this.error = null;
    this.success = null;
  }

  get currentForm(): FormGroup {
    switch (this.authState()) {
      case 'confirmSignup': return this.confirmForm;
      case 'newPassword': return this.newPasswordForm;
      case 'signup': return this.signupForm;
      default: return this.loginForm;
    }
  }

  getSubmitLabel(): string {
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
    if (form.valid) {
      this.error = null;
      const formValue = form.value;
      switch (this.authState()) {
        case 'signup':
          this.handleSignup(formValue);
          break;
        case 'confirmSignup':
          this.handleConfirmSignup(formValue);
          break;
        case 'signin':
          this.handleSignin(formValue);
          break;
        case 'newPassword':
          this.handleNewPassword(formValue);
          break;
      }
    }
  }

  private handleSignup({ email, password }: any) {
    this.currentEmail.set(email);
    this.authService.signUp(email, password).subscribe({
      next: () => {
        this.success = 'Signup successful! Check your email for confirmation code.';
        this.authState.set('confirmSignup');
      },
      error: (err) => {
        console.error('Signup error:', err);
        this.error = err.message || 'Signup failed.';
      },
    });
  }

  private handleConfirmSignup({ code }: any) {
    this.authService.confirmSignUp(this.currentEmail(), code).subscribe({
      next: () => {
        this.success = 'Account confirmed! Please sign in.';
        this.authState.set('signin');
      },
      error: (err) => {
        console.error('Confirm signup error:', err);
        this.error = err.message || 'Confirmation failed.';
      },
    });
  }

  private handleSignin({ email, password }: any) {
    this.currentEmail.set(email);
    this.authService.signIn(email, password).subscribe({
      next: (result) => {
        if (result.isSignedIn) {
          this.handleSuccess(result);
        } else if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
          this.authState.set('newPassword');
          this.success = 'Please set a new permanent password.';
        } else {
          this.error = `Unexpected step: ${result.nextStep?.signInStep}`;
        }
      },
      error: (err) => {
        console.error('Signin error:', err);
        this.error = err.message || 'Sign-in failed.';
      },
    });
  }

  private handleNewPassword({ newPassword }: any) {
    this.authService.confirmSignIn(newPassword).subscribe({
      next: (user) => this.handleSuccess(user),
      error: (err) => {
        console.error('New password error:', err);
        this.error = err.message || 'Password update failed.';
      },
    });
  }

  private handleSuccess(user: User) {  // Updated: Type as schema User
    this.authService.createUserIfNotExists(user).then(() => {  // Pass full User
      console.log('User sync complete');
      this.router.navigate(['/start']);
    });
  }
}