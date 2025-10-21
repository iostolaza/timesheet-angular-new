// src/app/core/services/user.service.ts (Move to core/services)
import { Injectable } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import { getCurrentUser } from 'aws-amplify/auth';
import type { Schema } from '../../../../amplify/data/resource';

const client = generateClient<Schema>();

export interface User {
  id: string;
  email: string;
  name: string;
  role?: 'Employee' | 'Manager' | 'Admin' | null;
  rate: number;
  groups?: string[] | null;
  owner?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {

  async getCurrentUserId(): Promise<string> {
    try {
      const user = await getCurrentUser();
      return user.userId;
    } catch (error) {
      console.error('Error getting current user:', error);
      throw error;
    }
  }

  async getCurrentUserEmail(): Promise<string> {
    try {
      const user = await getCurrentUser();
      return user.signInDetails?.loginId || '';
    } catch (error) {
      console.error('Error getting user email:', error);
      throw error;
    }
  }

  async createUser(user: Omit<User, 'owner'>): Promise<User | null> {
    try {
      const { data, errors } = await client.models.User.create(user, { authMode: 'userPool' });
      
      if (errors) {
        console.error('Error creating user:', errors);
        throw new Error(errors[0].message);
      }
      
      return data as User;
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error;
    }
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    try {
      const { data, errors } = await client.models.User.update({
        id,
        ...updates
      }, { authMode: 'userPool' });
      
      if (errors) {
        console.error('Error updating user:', errors);
        throw new Error(errors[0].message);
      }
      
      return data as User;
    } catch (error) {
      console.error('Failed to update user:', error);
      throw error;
    }
  }

  async getUser(id: string): Promise<User | null> {
    try {
      const { data, errors } = await client.models.User.get({ id }, { authMode: 'userPool' });
      
      if (errors) {
        console.error('Error fetching user:', errors);
        return null;
      }
      
      return data as User;
    } catch (error) {
      console.error('Failed to fetch user:', error);
      return null;
    }
  }

  async getCurrentUserProfile(): Promise<User | null> {
    try {
      const userId = await this.getCurrentUserId();
      return await this.getUser(userId);
    } catch (error) {
      console.error('Failed to fetch current user profile:', error);
      return null;
    }
  }

  async listUsers(): Promise<User[]> {
    try {
      const { data, errors } = await client.models.User.list({ authMode: 'userPool' });
      
      if (errors) {
        console.error('Error listing users:', errors);
        return [];
      }
      
      return data as User[];
    } catch (error) {
      console.error('Failed to list users:', error);
      return [];
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      const { data, errors } = await client.models.User.delete({ id }, { authMode: 'userPool' });
      
      if (errors) {
        console.error('Error deleting user:', errors);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Failed to delete user:', error);
      return false;
    }
  }
}