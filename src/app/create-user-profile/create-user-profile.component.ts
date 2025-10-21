// src/app/create-user-profile/create-user-profile.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService } from '../core/services/user.service'; // FIXED PATH

@Component({
  selector: 'app-create-user-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-user-profile.component.html'
})
export class CreateUserProfileComponent implements OnInit {
  userForm!: FormGroup;
  errorMessage: string = '';
  successMessage: string = '';
  loading: boolean = false;
  roles = ['Employee', 'Manager', 'Admin'];

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    public router: Router
  ) {}

  async ngOnInit() {
    try {
      const userId = await this.userService.getCurrentUserId();
      const email = await this.userService.getCurrentUserEmail();

      this.userForm = this.fb.group({
        id: [userId, Validators.required],
        email: [{ value: email, disabled: true }, [Validators.required, Validators.email]],
        name: ['', [Validators.required, Validators.minLength(2)]],
        role: ['Employee', Validators.required],
        rate: [0, [Validators.required, Validators.min(0)]],
        groups: [[]]
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
      
      const newUser = {
        id: formValue.id,
        email: formValue.email,
        name: formValue.name,
        role: formValue.role,
        rate: formValue.rate,
        groups: formValue.groups || [],
      };

      const result = await this.userService.createUser(newUser);
      
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

  addGroup(group: string) {
    if (group && group.trim()) {
      const currentGroups = this.userForm.get('groups')?.value || [];
      if (!currentGroups.includes(group.trim())) {
        this.userForm.patchValue({
          groups: [...currentGroups, group.trim()]
        });
      }
    }
  }

  removeGroup(group: string) {
    const currentGroups = this.userForm.get('groups')?.value || [];
    this.userForm.patchValue({
      groups: currentGroups.filter((g: string) => g !== group)
    });
  }
}