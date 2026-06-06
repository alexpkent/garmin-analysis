import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'app-theme';
  private _isDark = new BehaviorSubject<boolean>(this.loadPreference());
  readonly isDark$ = this._isDark.asObservable();

  constructor() {
    this.applyTheme(this._isDark.value);
  }

  get isDark(): boolean {
    return this._isDark.value;
  }

  toggle(): void {
    const next = !this._isDark.value;
    this._isDark.next(next);
    localStorage.setItem(this.STORAGE_KEY, next ? 'dark' : 'light');
    this.applyTheme(next);
  }

  private loadPreference(): boolean {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private applyTheme(dark: boolean): void {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  /** Read a CSS custom property value from the document root at call time. */
  cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
}
