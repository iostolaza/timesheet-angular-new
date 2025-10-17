// src/app/core/services/auth.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private isAuthenticated = new BehaviorSubject<boolean>(false);

  constructor() {
    const token = localStorage.getItem('mockToken');
    this.isAuthenticated.next(!!token);
  }

  login(username: string, password: string): Promise<{ username: string }> {
    console.log(`Mock login for ${username}`);
    localStorage.setItem('mockToken', 'fake-jwt-token');
    this.isAuthenticated.next(true);
    return Promise.resolve({ username });
  }

  signOut(): Promise<void> {
    console.log('Mock logout');
    localStorage.removeItem('mockToken');
    this.isAuthenticated.next(false);
    return Promise.resolve();
  }

  getCurrentUser(): Observable<boolean> {
    return this.isAuthenticated.asObservable();
  }
}