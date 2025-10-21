// src/app/edit-user-profile/edit-user-profile.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService, User } from '../core/services/user.service';

@Component({
  selector: 'app-edit-user-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './edit-user-profile.component.html'
})
export class EditUserProfileComponent implements OnInit {
  userForm!: FormGroup;
  errorMessage: string = '';
  successMessage: string = '';
  loading: boolean = false;
  currentUser: User | null = null;
  roles = ['Employee', 'Manager', 'Admin'];

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    public router: Router  // Make public
  ) {}

  async ngOnInit() {
    this.loading = true;
    
    try {
      this.currentUser = await this.userService.getCurrentUserProfile();
      
      if (!this.currentUser) {
        this.errorMessage = 'User profile not found. Please create your profile first.';
        setTimeout(() => {
          this.router.navigate(['/user/create']);
        }, 2000);
        return;
      }

      this.userForm = this.fb.group({
        id: [{ value: this.currentUser.id, disabled: true }],
        email: [{ value: this.currentUser.email, disabled: true }],
        name: [this.currentUser.name, [Validators.required, Validators.minLength(2)]],
        role: [this.currentUser.role, Validators.required],
        rate: [this.currentUser.rate, [Validators.required, Validators.min(0)]],
        groups: [this.currentUser.groups || []]
      });
    } catch (error) {
      this.errorMessage = 'Failed to load user profile';
      console.error('Error loading user profile:', error);
    } finally {
      this.loading = false;
    }
  }

  async save() {
    if (this.userForm.invalid || !this.currentUser) {
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const formValue = this.userForm.getRawValue();
      
      const updates: Partial<User> = {
        name: formValue.name,
        role: formValue.role,
        rate: formValue.rate,
        groups: formValue.groups || [],
      };

      const result = await this.userService.updateUser(this.currentUser.id, updates);
      
      if (result) {
        this.successMessage = 'Profile updated successfully!';
        this.currentUser = result;
      }
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to update profile';
      console.error('Error updating user profile:', error);
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

  async deleteProfile() {
    if (!this.currentUser) return;

    const confirmed = confirm('Are you sure you want to delete your profile? This action cannot be undone.');
    
    if (confirmed) {
      this.loading = true;
      try {
        const success = await this.userService.deleteUser(this.currentUser.id);
        if (success) {
          alert('Profile deleted successfully');
          this.router.navigate(['/']);
        }
      } catch (error) {
        this.errorMessage = 'Failed to delete profile';
        console.error('Error deleting profile:', error);
      } finally {
        this.loading = false;
      }
    }
  }
}