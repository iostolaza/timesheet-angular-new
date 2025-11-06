
//src/app/create-user-profile/create-user-profile.component.ts

import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { UserProfile } from '../core/models/user.model';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-create-user-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
  ],
  templateUrl: './create-user-profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateUserProfileComponent implements OnInit {
  userForm!: FormGroup;
  errorMessage: string = '';
  successMessage: string = '';
  loading: boolean = false;
  roles = ['Employee', 'Manager', 'Admin'];

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    public router: Router
  ) {}

  async ngOnInit() {
    try {
      const userId = await this.authService.getCurrentUserId();
      const email = this.authService.getCurrentUserSync()?.email ?? '';

      this.userForm = this.fb.group({
        id: [userId, Validators.required],
        email: [{ value: email, disabled: true }, [Validators.required, Validators.email]],
        name: ['', [Validators.required, Validators.minLength(2)]],
        role: ['Employee', Validators.required],
        rate: [0, [Validators.required, Validators.min(0)]],

      });
    } catch (error) {
      console.error('Error initializing form:', error);
      this.errorMessage = 'Failed to load user information';
    }
  }

  async save() {
    if (this.userForm.invalid) {
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const formValue = this.userForm.getRawValue();
      
      const newUser: Partial<UserProfile> = {
        id: formValue.id,
        email: formValue.email,
        name: formValue.name,
        role: formValue.role,
        rate: formValue.rate,
  
      };

      const result = await this.authService.createUser(newUser);
      
      if (result) {
        this.successMessage = 'Profile created successfully!';
        setTimeout(() => {
          this.router.navigate(['/start']);
        }, 2000);
      }
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to create profile';
      console.error('Error creating user profile:', error);
    } finally {
      this.loading = false;
    }
  }

}