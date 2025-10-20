
// src/core/services/auth.service.ts

import { Injectable } from '@angular/core';
import { Amplify } from 'aws-amplify';
import { signIn, signOut, signUp, fetchAuthSession, confirmSignUp, confirmSignIn } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource';
import { Observable, from, BehaviorSubject, throwError, of, retry, delay, catchError, firstValueFrom, timeout } from 'rxjs';
import { map, switchMap, filter } from 'rxjs/operators';
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
  private userPoolId: string;
  private isInitialized = false;

  constructor() {
    Amplify.configure(outputs);
    const config = Amplify.getConfig();
    this.userPoolId = config.Auth?.Cognito?.userPoolId || '';
    this.initializeUser();

    Hub.listen('auth', ({ payload }: { payload: HubPayload }) => {
      const { event, data } = payload;
      if (event === 'signedIn' && data?.tokens?.idToken?.payload) {
        const payloadData = data.tokens.idToken.payload as Record<string, unknown>;
        const sub = payloadData['sub'] as string;
        if (sub) {
          const groups = Array.isArray(payloadData['cognito:groups']) ? payloadData['cognito:groups'] as string[] : [];
          const derivedUser: User = {
            id: sub,
            email: ((payloadData['email'] || payloadData['cognito:username'] || payloadData['preferred_username'] || data.username || '') as string),
            name: 'Default User',
            role: this.deriveRoleFromGroups(groups),
            rate: 25.0,
            groups,
          };
          this.userSubject.next(derivedUser);
          // Sync Cognito groups to User model
          this.updateUserGroups(sub, groups);
        }
      } else if (event === 'signedOut') {
        this.userSubject.next(null);
        this.isInitialized = false;
      }
    });
  }

  private async initializeUser() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    try {
      const user = await firstValueFrom(this.getCurrentUser());
      this.userSubject.next(user);
    } catch (error) {
      console.error('AuthService initializeUser error:', error);
      this.userSubject.next(null);
    }
  }

  private deriveRoleFromGroups(groups: string[]): 'Employee' | 'Manager' | 'Admin' {
    if (groups.includes('Admin')) return 'Admin';
    if (groups.includes('Manager')) return 'Manager';
    return 'Employee';
  }

  private async updateUserGroups(userId: string, groups: string[]): Promise<void> {
    try {
      const existingUser = await this.getUserById(userId);
      if (!existingUser.groups || !existingUser.groups.every(g => groups.includes(g))) {
        const { data, errors } = await (this.client.models as any)['User'].update({
          id: userId,
          groups,
        });
        if (errors?.length) {
          throw new Error(`Failed to update user groups: ${errors.map((e: any) => e.message).join(', ')}`);
        }
        console.log('Updated user groups:', data);
      }
    } catch (error) {
      console.error('Error updating user groups:', error);
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
      options: {
        userAttributes: { email }
      }
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
        return undefined;
      }),
      catchError((error: any) => throwError(() => new Error(`Sign-out failed: ${error.message}`)))
    );
  }

  getCurrentUser(): Observable<User | null> {
    return this.userSubject.asObservable().pipe(
      switchMap((cachedUser) => {
        if (cachedUser) return of(cachedUser);
        return from(fetchAuthSession()).pipe(
          retry({ count: 3, delay: 100 }),
          map((session) => {
            if (!session.tokens?.idToken?.payload) return null;
            const payload = session.tokens.idToken.payload as Record<string, unknown>;
            const sub = payload['sub'] as string;
            if (!sub) return null;
            const groups = Array.isArray(payload['cognito:groups']) ? payload['cognito:groups'] as string[] : [];
            const user: User = {
              id: sub,
              email: ((payload['email'] || payload['cognito:username'] || payload['preferred_username'] || '') as string),
              name: 'Default User',
              role: this.deriveRoleFromGroups(groups),
              rate: 25.0,
              groups,
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
    );
  }

  async createUserIfNotExists(user: User): Promise<void> {
    try {
      await this.getUserById(user.id);
      console.log('User already exists:', user.id);
    } catch (err) {
      const model = (this.client.models as any)['User'];
      const { data } = await model.create(user);
      console.log('Created new User:', data);
    }
  }

  async getUserById(id: string): Promise<User> {
    const model = (this.client.models as any)['User'];
    const { data } = await model.get({ id });
    if (!data) throw new Error(`User with id ${id} not found`);
    return data as User;
  }

  getUserSub(): Observable<string | null> {
    return this.userSubject.asObservable().pipe(map((user) => user?.id || null));
  }

  getUserEmail(): Observable<string | null> {
    return this.userSubject.asObservable().pipe(map((user) => user?.email || null));
  }

  getUserGroups(): Observable<string[]> {
    return this.userSubject.asObservable().pipe(map((user) => user?.groups || []));
  }

  async listUsers(): Promise<User[]> {
    try {
      const model = (this.client.models as any)['User'];
      const { data, errors } = await model.list({});
      if (errors?.length) {
        throw new Error(`Failed to list users: ${errors.map((e: any) => e.message).join(', ')}`);
      }
      return (data ?? []) as User[];
    } catch (error) {
      console.error('Error listing users:', error);
      throw error;
    }
  }

  async addUserToGroup(email: string, groupName: string): Promise<void> {
    try {
      const users = await this.listUsers();
      const user = users.find(u => u.email === email);
      if (!user) {
        throw new Error(`User with email ${email} not found`);
      }
      const currentGroups = user.groups || [];
      if (!currentGroups.includes(groupName)) {
        const updatedGroups = [...currentGroups, groupName];
        const { data, errors } = await (this.client.models as any)['User'].update({
          id: user.id,
          groups: updatedGroups,
        });
        if (errors?.length) {
          throw new Error(`Failed to add user to group: ${errors.map((e: any) => e.message).join(', ')}`);
        }
        console.log(`Added user ${email} to group ${groupName}`);
      }
    } catch (error: any) {
      console.error('Error adding user to group:', error);
      throw new Error(`Failed to add user to group: ${error.message || error}`);
    }
  }

  async createGroup(groupName: string): Promise<void> {
    try {
      const users = await this.listUsers();
      const groupExists = users.some(user => user.groups?.includes(groupName));
      if (!groupExists) {
        console.log(`Group ${groupName} created (no-op in User model)`);
      }
    } catch (error: any) {
      console.error('Error creating group:', error);
      throw new Error(`Failed to create group: ${error.message || error}`);
    }
  }
}