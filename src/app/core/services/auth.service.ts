
// src/app/core/services/auth.service.ts

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

  private async loadCurrentUser(): Promise<void> {
    try {
      const current = await getCurrentUser();
      const userId =
        (current as any)?.userId ??
        (current as any)?.attributes?.sub ??
        (current as any)?.username;

      const attrs = await fetchUserAttributes();
      const email = (attrs as any)?.email ?? (attrs as any)?.Attributes?.email;
      const profile = await this.syncUserProfile(userId, email);
      this.emitUser(profile);
    } catch {
      this.emitUser(null);
    }
  }

  private async syncUserProfile(sub: string, email?: string): Promise<UserProfile | null> {
    try {
      const { data } = await this.client.models['User']['get']({ id: sub });
      if (data) return data as UserProfile;
    } catch {}

    if (email) {
      try {
        const { data } = await this.client.models['User']['list']({
          filter: { email: { eq: email } },
          limit: 1,
        });
        const user = (data as any)?.[0];
        if (user) return user as UserProfile;
      } catch {}
    }

    return this.createUser({ id: sub, email: email!, name: '', rate: 0 });
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
        const result = await signIn({ username: email, password });
        if ((result as any).nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
          return { isSignedIn: false, nextStep: (result as any).nextStep };
        }
        await this.loadCurrentUser();
        return { isSignedIn: true, user: this.currentUser()! };
      })()
    );
  }

  confirmSignIn(newPassword: string): Observable<UserProfile> {
    return from(
      (async () => {
        await confirmSignIn({ challengeResponse: newPassword });
        await this.loadCurrentUser();
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

  async createUser(payload: Partial<UserProfile>): Promise<UserProfile> {
    const input: any = {
      id: payload.id,
      email: payload.email!,
      name: payload.name ?? '',
      role: payload.role ?? 'Employee',
      rate: payload.rate ?? 0,
      otMultiplier: payload.otMultiplier ?? 1.5,
      taxRate: payload.taxRate ?? 0.015,
    };
    const { data } = await this.client.models['User']['create'](input);
    const user = data as UserProfile;
    this.emitUser(user);
    return user;
  }

  async updateUser(id: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
    const { data } = await this.client.models['User']['update']({ id, ...updates });
    const updated = data as UserProfile;
    if (this.currentUser()?.id === id) this.emitUser(updated);
    return updated;
  }

  async getUserById(id: string): Promise<UserProfile | null> {
    try {
      const { data } = await this.client.models['User']['get']({ id });
      return data as UserProfile | null;
    } catch (err) {
      console.error('getUserById error', err);
      return null;
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      await this.client.models['User']['delete']({ id });
      if (this.currentUser()?.id === id) this.emitUser(null);
      return true;
    } catch (err) {
      console.error('deleteUser error', err);
      return false;
    }
  }
}
