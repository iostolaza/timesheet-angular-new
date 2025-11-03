// src/app/core/services/auth.service.ts

import { Injectable } from '@angular/core';
import { Amplify } from 'aws-amplify';
import { signIn, signOut, signUp, fetchAuthSession, confirmSignUp, confirmSignIn, getCurrentUser } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource';
import { Observable, from, BehaviorSubject, throwError, of, firstValueFrom } from 'rxjs';
import { map, switchMap, filter, catchError, timeout, debounceTime } from 'rxjs/operators';
import outputs from '../../../../amplify_outputs.json';
import { User } from '../models/financial.model';

interface HubPayload {
  event: string;
  data?: {
    tokens?: {
      idToken?: { payload: Record<string, unknown> };
    };
    username?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  private client = generateClient<Schema>();

  constructor() {
    Amplify.configure(outputs);
    this.setupAuthListener();
    this.loadUser();  // Load initial user if already authenticated
  }

  private setupAuthListener() {
    Hub.listen('auth', async ({ payload }: { payload: HubPayload }) => { 
      const { event } = payload;
      if (event === 'signedIn') {
        await this.loadUser();
      } else if (event === 'signedOut') {
        this.userSubject.next(null);
      }
    });
  }

  private async loadUser(): Promise<void> {
    try {
      const session = await fetchAuthSession();
      if (!session.tokens?.idToken?.payload) {
        this.userSubject.next(null);
        return;
      }
      const payload = session.tokens.idToken.payload as Record<string, unknown>;
      const sub = payload['sub'] as string;
      if (!sub) {
        this.userSubject.next(null);
        return;
      }
      const userData: User = {
        id: sub,
        email: (payload['email'] as string) || '',
        name: 'Default User',
        role: 'Employee',
        rate: 25.0,
        otMultiplier: 1.5,
        taxRate: 0.015,
      };
      const user = await this.getUserById(sub) || await this.createUser(userData);
      this.userSubject.next(user);
    } catch (error) {
      console.error('Failed to load user:', error);
      this.userSubject.next(null);
    }
  }

  signIn(email: string, password: string): Observable<any> {
    return from(signIn({ username: email, password })).pipe(
      timeout({ each: 10000, with: () => throwError(() => new Error('Sign-in timeout - check network/Cognito')) }),
      catchError((error: any) => {
        console.error('AuthService signIn pipe error:', error);
        return throwError(() => new Error(`Sign-in failed: ${error.message || error}`));
      })
    );
  }

  confirmSignIn(newPassword: string): Observable<User> {
    return from(confirmSignIn({ challengeResponse: newPassword })).pipe(
      switchMap(() => this.getCurrentUser().pipe(filter((user): user is User => user !== null))),
      catchError((error: any) => {
        console.error('AuthService confirmSignIn error:', error);
        return throwError(() => new Error(`Password confirmation failed: ${error.message || error}`));
      })
    );
  }

  signUp(email: string, password: string): Observable<any> {
    return from(signUp({
      username: email,
      password,
      options: { userAttributes: { email } }
    })).pipe(
      catchError((error: any) => {
        console.error('AuthService signUp error:', error);
        return throwError(() => new Error(`Sign-up failed: ${error.message || error}`));
      })
    );
  }

  confirmSignUp(email: string, code: string): Observable<any> {
    return from(confirmSignUp({ username: email, confirmationCode: code })).pipe(
      catchError((error: any) => {
        console.error('AuthService confirmSignUp error:', error);
        return throwError(() => new Error(`Confirmation failed: ${error.message || error}`));
      })
    );
  }

  signOut(): Observable<void> {
    return from(signOut()).pipe(
      map(() => {
        this.userSubject.next(null);
        return undefined;
      }),
      catchError((error: any) => throwError(() => new Error(`Sign-out failed: ${error.message}`)))
    );
  }

  getCurrentUser(): Observable<User | null> {
    return this.userSubject.asObservable().pipe(
      switchMap(user => user ? of(user) : from(this.loadUser()).pipe(map(() => this.userSubject.value)))
    );
  }

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

  async createUser(user: User): Promise<User> {
    try {
      const { data, errors } = await this.client.models.User.create(user);
      if (errors?.length) {
        console.error('Failed to create user:', errors);
        throw new Error(`Create failed: ${errors.map(e => e.message).join(', ')}`);
      }
      return data as User;
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error;
    }
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    try {
      const { data, errors } = await this.client.models.User.update({ id, ...updates });
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

  async getUserById(id: string): Promise<User | null> {
    try {
      const { data, errors } = await this.client.models.User.get({ id });
      if (errors) {
        console.error('Error fetching user:', errors);
        return null;
      }
      return data as User || null;
    } catch (error) {
      console.error('Failed to fetch user:', error);
      return null;
    }
  }

  async getCurrentUserProfile(): Promise<User | null> {
    try {
      const userId = await this.getCurrentUserId();
      return await this.getUserById(userId);
    } catch (error) {
      console.error('Failed to fetch current user profile:', error);
      return null;
    }
  }

  async listUsers(): Promise<User[]> {
    try {
      const { data, errors } = await this.client.models.User.list();
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
      const { errors } = await this.client.models.User.delete({ id });
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

  async getUserIdentity(): Promise<string> {
    try {
      const sub = await this.getCurrentUserId();
      const email = await this.getCurrentUserEmail();
      return `${sub}::${email}`;
    } catch (error) {
      console.error('Failed to get user identity:', error);
      throw error;
    }
  }

  getUserSub(): Observable<string | null> {
    return this.userSubject.asObservable().pipe(map((user) => user?.id || null));
  }

  getUserEmail(): Observable<string | null> {
    return this.userSubject.asObservable().pipe(map((user) => user?.email || null));
  }
}