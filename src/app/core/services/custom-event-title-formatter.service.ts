
// src/app/core/services/custom-event-title-formatter.service.ts

import { Injectable } from '@angular/core';
import { CalendarEventTitleFormatter, CalendarEvent } from 'angular-calendar';

@Injectable({
  providedIn: 'root'
})
export class CustomEventTitleFormatter extends CalendarEventTitleFormatter {
  override weekTooltip(event: CalendarEvent, title: string) {
    if (!event.meta?.tmpEvent) {
      return super.weekTooltip(event, title);
    }
    return '';
  }
}