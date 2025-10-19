
// src/core/services/auth.service.ts

import { Injectable } from '@angular/core';
import { Amplify } from 'aws-amplify';
import { signIn, signOut, signUp, fetchAuthSession, confirmSignUp, confirmSignIn } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource';
import { Observable, from, BehaviorSubject, throwError, of, retry, delay, timeout, catchError } from 'rxjs';
import { map, switchMap, filter } from 'rxjs/operators';
import outputs from '../../../../amplify_outputs.json';
import { User } from '../models/financial.model';
import { CognitoIdentityProviderClient, 
         CreateGroupCommand, 
         AdminAddUserToGroupCommand, 
         ListUsersCommand,
         ListUsersCommandOutput } from '@aws-sdk/client-cognito-identity-provider';

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
  private cognitoClient: CognitoIdentityProviderClient;
  private userPoolId: string;

  constructor() {
    Amplify.configure(outputs);
    const config = Amplify.getConfig();
    this.userPoolId = config.Auth?.Cognito?.userPoolId || '';
    this.cognitoClient = new CognitoIdentityProviderClient({ 
      region: 'us-east-1' // Hardcoded default; adjust if multi-region
    });
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
        }
      } else if (event === 'signedOut') {
        this.userSubject.next(null);
      }
    });
    this.getCurrentUser().subscribe((user) => this.userSubject.next(user));
  }

  private deriveRoleFromGroups(groups: string[]): 'Employee' | 'Manager' | 'Admin' {
    if (groups.includes('Admin')) return 'Admin';
    if (groups.includes('Manager')) return 'Manager';
    return 'Employee';
  }

  signIn(email: string, password: string): Observable<any> {
    return from(signIn({ username: email, password })).pipe(
      timeout({ each: 10000, with: () => throwError(() => new Error('Sign-in timeout - check network/Cognito')) }),
      catchError((error) => {
        console.error('AuthService signIn pipe error:', error);
        return throwError(() => new Error(`Sign-in failed: ${error.message || error}`));
      })
    );
  }

  confirmSignIn(newPassword: string): Observable<User> {
    return from(confirmSignIn({ challengeResponse: newPassword })).pipe(
      switchMap(() => this.getCurrentUser().pipe(filter((user): user is User => user !== null))),
      catchError((error) => {
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
      catchError((error) => {
        console.error('AuthService signUp error:', error);
        return throwError(() => new Error(`Sign-up failed: ${error.message || error}`));
      })
    );
  }

  confirmSignUp(email: string, code: string): Observable<any> {
    return from(confirmSignUp({ username: email, confirmationCode: code })).pipe(
      catchError((error) => {
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
      catchError((error) => throwError(() => new Error(`Sign-out failed: ${error.message}`)))
    );
  }

  getCurrentUser(): Observable<User | null> {
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
      catchError((error) => {
        console.error('getCurrentUser error:', error);
        return of(null);
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
    if (!this.userPoolId) throw new Error('User pool ID not configured');
    const command = new ListUsersCommand({ 
      UserPoolId: this.userPoolId,
      Limit: 60
    });
    const response = await this.cognitoClient.send(command) as ListUsersCommandOutput;
    return response.Users?.map((user: any) => {
      const attributes = Object.fromEntries(
        user.Attributes.map((attr: any) => [attr.Name, attr.Value])
      ) as Record<string, string>;
      return {
        id: attributes['sub'] || '',
        email: attributes['email'] || '',
        name: attributes['name'] || user.Username || '',
        role: (attributes['custom:role'] || 'Employee') as 'Employee' | 'Manager' | 'Admin',
        rate: parseFloat(attributes['custom:rate'] || '0'),
        groups: [], // Not in listUsers; fetch if needed
      };
    }) || [];
  }

  async addUserToGroup(email: string, groupName: string): Promise<void> {
    if (!this.userPoolId) throw new Error('User pool ID not configured');
    const command = new AdminAddUserToGroupCommand({ 
      UserPoolId: this.userPoolId, 
      Username: email, // Cognito uses email as username
      GroupName: groupName 
    });
    await this.cognitoClient.send(command);
  }

  async createGroup(groupName: string): Promise<void> {
    if (!this.userPoolId) throw new Error('User pool ID not configured');
    const command = new CreateGroupCommand({ 
      GroupName: groupName, 
      UserPoolId: this.userPoolId 
    });
    try {
      await this.cognitoClient.send(command);
    } catch (error: any) {
      if (error.name === 'InvalidParameterException' && error.message.includes('Group already exists')) {
        console.log(`Group ${groupName} already exists`);
      } else {
        throw error;
      }
    }
  }
}