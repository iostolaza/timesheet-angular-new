
// src/app/start-page/start-page.component.ts

import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-start-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './start-page.component.html',
})
export class StartPageComponent {
  private router = inject(Router);
  private authService = inject(AuthService);

  logout() {
    this.authService.signOut().subscribe(() => this.router.navigate(['/auth']));
  }
}
