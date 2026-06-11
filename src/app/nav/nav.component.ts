import { Component } from '@angular/core';
import { ActivityService } from '../activity.service';

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
    { label: 'Compare', icon: 'fas fa-exchange-alt', route: '/compare' },
    { label: 'Records', icon: 'fas fa-trophy', route: '/records' }
  ];

  constructor(public activityService: ActivityService) {}
}
