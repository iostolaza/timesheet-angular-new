
// src/app/core/services/auth.service.ts

import { Injectable, signal } from '@angular/core';
import { BehaviorSubject, from, Observable } from 'rxjs';
import { signIn, signUp, confirmSignUp, confirmSignIn, signOut, getCurrentUser, fetchUserAttributes, UserAttributeKey } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource'; 
import type { UserProfile } from '../models/user.model';

const client = generateClient<Schema>();

export type SignInResult =
  | { isSignedIn: true; user: UserProfile }
  | { isSignedIn: false; nextStep?: any };

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSub = new BehaviorSubject<UserProfile | null>(null);
  public currentUser$ = this.currentUserSub.asObservable();
  private currentUserSignal = signal<UserProfile | null>(null);

  constructor() {
    void this.setupAuthListener();
  }

  private async setupAuthListener(): Promise<void> {
    try {
      const { userId } = await getCurrentUser().catch(() => ({} as any));
      if (!userId) {
        this.emitUser(null);
        return;
      }
      const attributes = await fetchUserAttributes().catch(() => ({}) as Partial<Record<UserAttributeKey, string>>);
      const email = attributes.email;
      const profile = await this.loadUserProfile(userId, email);
      this.emitUser(profile);
    } catch (err) {
      console.error('setupAuthListener error', err);
      this.emitUser(null);
    }
  }

  private emitUser(u: UserProfile | null) {
    this.currentUserSub.next(u);
    this.currentUserSignal.set(u);
  }

  private async loadUserProfile(sub?: string, email?: string): Promise<UserProfile | null> {
    if (!sub && !email) return null;
    try {
      if (sub) {
        const resp = await client.models.User.get({ id: sub });
        if (resp.data) return resp.data as UserProfile;
      }
      if (email) {
        const resp = await client.models.User.list({
          filter: { email: { eq: email } },
          limit: 1
        });
        if (resp.data?.length) return resp.data[0] as UserProfile;
      }
      return null;
    } catch (err) {
      console.error('loadUserProfile error', err);
      return null;
    }
  }

  signUp(email: string, password: string): Observable<any> {
    return from(signUp({
      username: email,
      password,
      options: { userAttributes: { email } }
    }));
  }

  confirmSignUp(email: string, code: string): Observable<any> {
    return from(confirmSignUp({
      username: email,
      confirmationCode: code
    }));
  }

  signIn(email: string, password: string): Observable<SignInResult> {
    return from((async () => {
      const output = await signIn({ username: email, password });
      if (output.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        return { isSignedIn: false, nextStep: output.nextStep } as SignInResult;
      }
      const { userId } = await getCurrentUser();
      const attributes = await fetchUserAttributes();
      const emailAttr = attributes.email;
      let profile = await this.loadUserProfile(userId, emailAttr);
      if (!profile) {
        profile = await this.createUser({ id: userId, email: emailAttr } as Partial<UserProfile>);
      }
      this.emitUser(profile);
      return { isSignedIn: true, user: profile } as SignInResult;
    })());
  }

  confirmSignIn(newPassword: string): Observable<UserProfile> {
    return from((async () => {
      await confirmSignIn({ challengeResponse: newPassword });
      const { userId } = await getCurrentUser();
      const attributes = await fetchUserAttributes();
      const email = attributes.email;
      let profile = await this.loadUserProfile(userId, email);
      if (!profile) {
        profile = await this.createUser({ id: userId, email } as Partial<UserProfile>);
      }
      this.emitUser(profile);
      return profile;
    })());
  }

  signOut(): Observable<void> {
    return from((async () => {
      await signOut();
      this.emitUser(null);
    })());
  }

  getCurrentUser(): Observable<UserProfile | null> {
    return this.currentUser$;
  }

  async getCurrentUserId(): Promise<string | null> {
    const u = this.currentUserSignal();
    return u?.id ?? null;
  }

  async getCurrentUserEmail(): Promise<string | null> {
    const u = this.currentUserSignal();
    return u?.email ?? null;
  }

  async createUser(payload: Partial<UserProfile>): Promise<UserProfile> {
    const toCreate: Partial<UserProfile> = {
      id: payload.id || undefined,
      email: payload.email!,
      name: payload.name ?? '',
      role: payload.role ?? 'Employee',
      rate: payload.rate ?? 0,
      otMultiplier: payload.otMultiplier ?? 1.5,
      taxRate: payload.taxRate ?? 0.015,
    };
    const resp = await client.models.User.create(toCreate as any);
    const created = resp.data as UserProfile;
    this.emitUser(created);
    return created;
  }

  async updateUser(id: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
    try {
      const resp = await client.models.User.update({ id, ...updates } as any);
      const updated = resp.data as UserProfile;
      if (this.currentUserSignal()?.id === id) this.emitUser(updated);
      return updated;
    } catch (err) {
      console.error('updateUser error', err);
      return null;
    }
  }

  async getUserById(id: string): Promise<UserProfile | null> {
    try {
      const resp = await client.models.User.get({ id });
      return resp.data ?? null;
    } catch (err) {
      console.error('getUserById error', err);
      return null;
    }
  }

  async getCurrentUserProfile(): Promise<UserProfile | null> {
    return this.currentUserSignal();
  }

  async listUsers(limit = 50): Promise<UserProfile[]> {
    const resp = await client.models.User.list({ limit });
    return resp.data ?? [];
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      await client.models.User.delete({ id });
      if (this.currentUserSignal()?.id === id) this.emitUser(null);
      return true;
    } catch (err) {
      console.error('deleteUser error', err);
      return false;
    }
  }

  async getUserIdentity(): Promise<string | null> {
    try {
      const { userId } = await getCurrentUser().catch(() => ({} as any));
      if (userId) return userId;
      return this.currentUserSignal()?.id ?? null;
    } catch {
      return this.currentUserSignal()?.id ?? null;
    }
  }
}