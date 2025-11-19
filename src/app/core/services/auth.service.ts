
// src/app/core/services/auth.service.ts

import { Injectable, signal } from '@angular/core';
import { BehaviorSubject, from, Observable } from 'rxjs';
import {
  signIn, signUp, confirmSignUp, confirmSignIn, signOut,
  getCurrentUser, fetchUserAttributes
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource';
import type { UserProfile } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _client: any = null;
  private get client() {
    if (!this._client) {
      this._client = generateClient<Schema>() as any;
    }
    return this._client;
  }

  private currentUser = signal<UserProfile | null>(null);
  private currentUser$ = new BehaviorSubject<UserProfile | null>(null);

  constructor() {
    Hub.listen('auth', (payload: any) => {
      try {
        const event = payload?.payload?.event ?? payload?.event;
        if (event === 'signedIn' || event === 'signedOut') {
          void this.loadCurrentUser();
        }
      } catch {}
    });

    void this.setupAuthListener();
  }

  private async setupAuthListener(): Promise<void> {
    await this.loadCurrentUser();
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      await getCurrentUser();
      return true;
    } catch {
      return false;
    }
  }

  async loadCurrentUser(): Promise<void> {
    try {
      const current = await getCurrentUser();
      const userId = current.userId; // sub

      const attrs = await fetchUserAttributes();
      const email = attrs.email ?? '';
      const profile = await this.syncUserProfile(userId, email);
      this.emitUser(profile);
    } catch (error) {
      console.error('Failed to load current user:', error);
      this.emitUser(null);
    }
  }

  private async syncUserProfile(sub: string, email: string): Promise<UserProfile | null> {
    try {
      const { data, errors } = await this.client.models.User.get({ id: sub });
      if (errors?.length) throw new Error(errors.map((e: { message: string }) => e.message).join(', '));
      if (data) return data as UserProfile;
    } catch (error) {
      console.error('Failed to get user by ID:', error);
    }

    try {
      const { data, errors } = await this.client.models.User.list({
        filter: { email: { eq: email } },
        limit: 1,
      });
      if (errors?.length) throw new Error(errors.map((e: { message: string }) => e.message).join(', '));
      const user = (data as any)?.[0];
      if (user) return user as UserProfile;
    } catch (error) {
      console.error('Failed to list user by email:', error);
    }

    if (!email) return null;

    try {
      return await this.createUser({ id: sub, email, name: email.split('@')[0] || 'New User', role: 'Employee', rate: 0 });
    } catch (error) {
      console.error('Failed to create user:', error);
      return null;
    }
  }

  private emitUser(user: UserProfile | null) {
    this.currentUser.set(user);
    this.currentUser$.next(user);
  }

  signUp(email: string, password: string): Observable<any> {
    return from(
      signUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      })
    );
  }

  confirmSignUp(email: string, code: string): Observable<any> {
    return from(confirmSignUp({ username: email, confirmationCode: code }));
  }

  signIn(email: string, password: string): Observable<any> {
    return from(
      (async () => {
        if (await this.isAuthenticated()) {
          await this.loadCurrentUser();
          return { isSignedIn: true, user: this.currentUser()! };
        }
        const result = await signIn({ username: email, password });
        if ((result as any).nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
          return { isSignedIn: false, nextStep: (result as any).nextStep };
        }
        await this.loadCurrentUser();
        if (!this.currentUser()) {
          throw new Error('Failed to load user profile after sign in');
        }
        return { isSignedIn: true, user: this.currentUser()! };
      })()
    );
  }

  confirmSignIn(newPassword: string): Observable<UserProfile> {
    return from(
      (async () => {
        await confirmSignIn({ challengeResponse: newPassword });
        await this.loadCurrentUser();
        if (!this.currentUser()) {
          throw new Error('Failed to load user profile after confirming sign in');
        }
        return this.currentUser()!;
      })()
    );
  }

  signOut(): Observable<void> {
    return from(
      signOut().then(() => {
        this.emitUser(null);
      })
    );
  }

  getCurrentUser(): Observable<UserProfile | null> {
    return this.currentUser$.asObservable();
  }

  getCurrentUserSync(): UserProfile | null {
    return this.currentUser();
  }

  async getCurrentUserId(): Promise<string | null> {
    return this.currentUser()?.id ?? null;
  }

  async isAdminOrManager(): Promise<boolean> {
    const sub = await this.getCurrentUserId();
    const user = await this.getUserById(sub ?? '');
    return user?.role === 'Admin' || user?.role === 'Manager' || false;
 }

  async createUser(payload: Partial<UserProfile>): Promise<UserProfile> {
    if (!payload.email) throw new Error('Email required for create');
    if (!payload.name) payload.name = 'New User';
    const input: any = {
      id: payload.id,
      email: payload.email!,
      name: payload.name,
      role: payload.role ?? 'Employee',
      rate: payload.rate ?? 0,
      otMultiplier: payload.otMultiplier ?? 1.5,
      taxRate: payload.taxRate ?? 0.015,
    };
    const { data, errors } = await this.client.models.User.create(input);
    if (errors?.length) {
      throw new Error(errors.map((e: { message: string }) => e.message).join(', '));
    }
    if (!data) {
      throw new Error('No data returned from create');
    }
    const user = data as UserProfile;
    this.emitUser(user);
    return user;
  }

  async updateUser(id: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
    console.log('Updating user:', id, updates);
    const { data, errors } = await this.client.models.User.update({ id, ...updates });
    if (errors?.length) {
      throw new Error(errors.map((e: { message: string }) => e.message).join(', '));
    }
    if (!data) {
      return null;
    }
    const updated = data as UserProfile;
    if (this.currentUser()?.id === id) this.emitUser(updated);
    return updated;
  }

  async getUserById(id: string): Promise<UserProfile | null> {
    try {
      const { data, errors } = await this.client.models.User.get({ id });
      if (errors?.length) throw new Error(errors.map((e: { message: string }) => e.message).join(', '));
      return data as UserProfile | null;
    } catch (err) {
      console.error('getUserById error', err);
      return null;
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      const { errors } = await this.client.models.User.delete({ id });
      if (errors?.length) throw new Error(errors.map((e: { message: string }) => e.message).join(', '));
      if (this.currentUser()?.id === id) this.emitUser(null);
      return true;
    } catch (err) {
      console.error('deleteUser error', err);
      return false;
    }
  }
}