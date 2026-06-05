import { Component } from '@angular/core';

@Component({
  selector: 'app-nav',
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.scss'],
  standalone: false
})
export class NavComponent {
  navItems = [
    { label: 'Analysis', icon: 'fas fa-chart-line', route: '/' },
    { label: 'Heatmap', icon: 'fas fa-fire', route: '/heatmap' },
    { label: 'Training Log', icon: 'fas fa-calendar-alt', route: '/log' },
    { label: 'Records', icon: 'fas fa-trophy', route: '/records' }
  ];
}
