
// src/app/core/services/auth.service.ts

import { Injectable } from '@angular/core';
import { Amplify } from 'aws-amplify';
import { Auth } from '@aws-amplify/auth';
import { Hub } from '@aws-amplify/utils';
import { Observable, from, BehaviorSubject, throwError, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import outputs from '../../../../amplify_outputs.json';

interface CognitoUser {
  sub: string;
  username: string;
  groups: string[];
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private userSubject = new BehaviorSubject<CognitoUser | null>(null);

  constructor() {
    Amplify.configure(outputs);
    Hub.listen('auth', (data) => {  // Hub payload direct
      const { payload: { event, data: hubData } } = data;
      if (event === 'signIn') {
        const payload = hubData.signInUserSession?.idToken.payload;
        this.userSubject.next({
          sub: payload.sub,
          username: hubData.username,
          groups: payload['cognito:groups'] || [],
        });
      } else if (event === 'signOut') {
        this.userSubject.next(null);
      }
    });
    this.getCurrentUser().subscribe((user) => this.userSubject.next(user));
  }

  signIn(username: string, password: string): Observable<CognitoUser> {
    return from(Auth.signIn({ username, password })).pipe(
      map((user) => {
        const payload = user.signInUserSession?.idToken.payload;
        const cognitoUser: CognitoUser = {
          sub: payload.sub,
          username: user.username,
          groups: payload['cognito:groups'] || [],
        };
        this.userSubject.next(cognitoUser);
        return cognitoUser;
      }),
      catchError((error) => throwError(() => new Error(`Sign-in failed: ${error.message}`)))
    );
  }

  signOut(): Observable<void> {
    return from(Auth.signOut()).pipe(
      map(() => {
        this.userSubject.next(null);
        return undefined;
      }),
      catchError((error) => throwError(() => new Error(`Sign-out failed: ${error.message}`)))
    );
  }

  getCurrentUser(): Observable<CognitoUser | null> {
    return from(Auth.fetchUser()).pipe(  // currentAuthenticatedUser -> fetchUser in v6
      map((user) => {
        const payload = user.signInUserSession?.idToken.payload;
        return {
          sub: payload.sub,
          username: user.username,
          groups: payload['cognito:groups'] || [],
        };
      }),
      catchError(() => of(null))
    );
  }

  getUserSub(): Observable<string | null> {
    return this.userSubject.asObservable().pipe(map((user) => user?.sub || null));
  }

  getUserGroups(): Observable<string[]> {
    return this.userSubject.asObservable().pipe(map((user) => user?.groups || []));
  }
}