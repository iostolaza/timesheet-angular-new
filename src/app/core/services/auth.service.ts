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
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    Amplify.configure(outputs);
    this.setupAuthListener();
  }

private setupAuthListener() {
  Hub.listen('auth', async ({ payload }: { payload: HubPayload }) => { 
    const { event, data } = payload;
    if (event === 'signedIn' && data?.tokens?.idToken?.payload) {
      const payloadData = data.tokens.idToken.payload as Record<string, unknown>;
      const sub = payloadData['sub'] as string;
      if (sub) {
        const user: User = {
          id: sub,
          email: ((payloadData['email'] || payloadData['cognito:username'] || payloadData['preferred_username'] || data.username || '') as string),
          name: 'Default User',
          role: 'Employee',
          rate: 25.0,
          otMultiplier: 1.5,
          taxRate: 0.015,
        };
        await this.createUserIfNotExists(user);  // Await the create
        this.userSubject.next(user);
      }
    } else if (event === 'signedOut') {
      this.userSubject.next(null);
      this.isInitialized = false;
      this.initializationPromise = null;
    }
  });
}


  private async initializeUser(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      this.isInitialized = true;
      try {
        const user = await firstValueFrom(this.getCurrentUser());
        this.userSubject.next(user);
      } catch (error) {
        console.error('AuthService initializeUser error:', error);
        this.userSubject.next(null);
      } finally {
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
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
        this.isInitialized = false;
        this.initializationPromise = null;
        return undefined;
      }),
      catchError((error: any) => throwError(() => new Error(`Sign-out failed: ${error.message}`)))
    );
  }

  getCurrentUser(): Observable<User | null> {
    return from(this.initializeUser()).pipe(
      switchMap(() => this.userSubject.asObservable().pipe(
        debounceTime(100),
        switchMap((cachedUser) => {
          if (cachedUser) return of(cachedUser);
          return from(fetchAuthSession({ forceRefresh: true })).pipe(
            map((session) => {
              if (!session.tokens?.idToken?.payload) return null;
              const payload = session.tokens.idToken.payload as Record<string, unknown>;
              const sub = payload['sub'] as string;
              if (!sub) return null;
              const user: User = {
                id: sub,
                email: ((payload['email'] || payload['cognito:username'] || payload['preferred_username'] || '') as string),
                name: 'Default User',
                role: 'Employee',
                rate: 25.0,
              };
              console.log('getCurrentUser success:', user);
              return user;
            }),
            catchError((error: any) => {
              console.error('getCurrentUser error:', error);
              return of(null);
            })
          );
        })
      ))
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

  async createUser(user: Omit<User, 'owner'>): Promise<User | null> {
    try {
      const { data, errors } = await this.client.models.User.create(user);
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

  async getUser(id: string): Promise<User | null> {
    try {
      const { data, errors } = await this.client.models.User.get({ id });
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

async createUserIfNotExists(user: User): Promise<void> {
  try {
    const existingUser = await this.getUserById(user.id);
    console.log('User already exists:', user.id);
  } catch (err) {
    try {
      const { data, errors } = await this.client.models.User.create(user);
      if (errors?.length) {
        console.error('Failed to create user during if-not-exists:', errors);
        throw new Error(`Create failed: ${errors.map(e => e.message).join(', ')}`);
      }
      console.log('Created new User:', data);
    } catch (createError) {
      console.error('Error in createUserIfNotExists:', createError);
      throw createError;  // Re-throw to bubble up
    }
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
  async getUserById(id: string): Promise<User> {
    const { data } = await this.client.models.User.get({ id });
    if (!data) throw new Error(`User with id ${id} not found`);
    return data as User;
  }

  getUserSub(): Observable<string | null> {
    return this.userSubject.asObservable().pipe(map((user) => user?.id || null));
  }

  getUserEmail(): Observable<string | null> {
    return this.userSubject.asObservable().pipe(map((user) => user?.email || null));
  }
}