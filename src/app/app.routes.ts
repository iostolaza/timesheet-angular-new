import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './core/services/auth.service';

const authGuard = () => {
  const authService = inject(AuthService);
  return async () => {
    const user = await firstValueFrom(authService.getCurrentUser());
    if (!user) return '/auth';
    return true;
  };
};

const managerGuard = () => {
  const authService = inject(AuthService);
  return async () => {
    const groups = await firstValueFrom(authService.getUserGroups());
    if (!groups.includes('Manager')) return '/review';  // Redirect to user view
    return true;
  };
};

export const routes: Routes = [
  { path: '', redirectTo: '/start', pathMatch: 'full' },
  { path: 'auth', loadComponent: () => import('./core/auth/auth.component').then(m => m.AuthComponent) },
  { path: 'start', loadComponent: () => import('./start-page/start-page.component').then(m => m.StartPageComponent), canActivate: [authGuard] },
  { path: 'calendar', loadComponent: () => import('./timesheet/calendar-view/calendar.component').then(m => m.CalendarComponent), canActivate: [authGuard] },
  { path: 'review', loadComponent: () => import('./timesheet/review-list/review-list.component').then(m => m.ReviewListComponent), canActivate: [authGuard] },
  { path: 'accounts/list', loadComponent: () => import('./financial/account-list/account-list.component').then(m => m.AccountListComponent), canActivate: [authGuard] },
  { path: 'accounts/ledger/:id?', loadComponent: () => import('./financial/ledger-view/ledger-view.component').then(m => m.LedgerViewComponent), canActivate: [authGuard] },
  { path: '**', redirectTo: '/start' },
];