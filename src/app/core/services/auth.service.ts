
// src/app/core/services/auth.service.ts

import { Injectable } from '@angular/core';
import { Amplify } from 'aws-amplify';
import { signIn, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource';
import { Observable, from, BehaviorSubject, throwError, of, retry, delay } from 'rxjs';
import { map, catchError, switchMap, filter } from 'rxjs/operators';
import outputs from '../../../../amplify_outputs.json';
import { User } from '../models/financial.model';

interface CognitoUser {
  sub: string;
  email: string;
  groups: string[];
}

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
  private userSubject = new BehaviorSubject<CognitoUser | null>(null);
  private client = generateClient<Schema>();

  constructor() {
    Amplify.configure(outputs);
    Hub.listen('auth', ({ payload }: { payload: HubPayload }) => {
      const { event, data } = payload;
      if (event === 'signIn' && data?.tokens?.idToken?.payload) {
        const payloadData = data.tokens.idToken.payload as Record<string, unknown>;
        const sub = payloadData['sub'] as string;
        if (sub) {
          this.userSubject.next({
            sub,
            email: ((payloadData['email'] || payloadData['cognito:username'] || payloadData['preferred_username'] || data.username || '') as string),
            groups: Array.isArray(payloadData['cognito:groups']) ? payloadData['cognito:groups'] as string[] : [],
          });
        }
      } else if (event === 'signOut') {
        this.userSubject.next(null);
      }
    });
    this.getCurrentUser().subscribe((user) => this.userSubject.next(user));
  }

  signIn(username: string, password: string): Observable<CognitoUser> {
    return from(signIn({ username, password })).pipe(
      switchMap(() => this.getCurrentUser().pipe(filter((user): user is CognitoUser => user !== null))),
      catchError((error) => throwError(() => new Error(`Sign-in failed: ${error.message}`)))
    );
  }

  signOut(): Observable<void> {
    return from(signOut()).pipe(
      map(() => {
        this.userSubject.next(null);
        return undefined;
      }),
      catchError((error) => throwError(() => new Error(`Sign-out failed: ${error.message}`)))
    );
  }

  getCurrentUser(): Observable<CognitoUser | null> {
    return from(fetchAuthSession()).pipe(
      retry({ count: 3, delay: 100 }),  // Retry for session lag per Amplify docs
      map((session) => {
        if (!session.tokens?.idToken?.payload) return null;
        const payload = session.tokens.idToken.payload as Record<string, unknown>;
        const sub = payload['sub'] as string;
        if (!sub) return null;
        const user = {
          sub,
          email: ((payload['email'] || payload['cognito:username'] || payload['preferred_username'] || '') as string),
          groups: Array.isArray(payload['cognito:groups']) ? payload['cognito:groups'] as string[] : [],
        };
        console.log('getCurrentUser success:', user);  // Debug log
        return user;
      }),
      catchError((error) => {
        console.error('getCurrentUser error:', error);  // Debug log
        return of(null);
      })
    );
  }

  async getUserById(id: string): Promise<User> {
    const model = (this.client.models as any)['User'];
    const { data } = await model.get({ id });
    if (!data) throw new Error(`User with id ${id} not found`);
    return data as User;
  }

  getUserSub(): Observable<string | null> {
    return this.userSubject.asObservable().pipe(map((user) => user?.sub || null));
  }

  getUserEmail(): Observable<string | null> {
    return this.userSubject.asObservable().pipe(map((user) => user?.email || null));
  }

  getUserGroups(): Observable<string[]> {
    return this.userSubject.asObservable().pipe(map((user) => user?.groups || []));
  }
}