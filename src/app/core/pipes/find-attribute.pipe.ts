// src/app/core/pipes/find-attribute.pipe.ts
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'findAttribute', standalone: true })
export class FindAttributePipe implements PipeTransform {
  transform(attributes: any[], name: string, property?: string): any {
    const attr = attributes.find(attr => attr.Name === name);
    return property ? attr?.[property] : attr;
  }
}