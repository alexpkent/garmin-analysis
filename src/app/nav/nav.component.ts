import { Component } from '@angular/core';

@Component({
  selector: 'app-nav',
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.scss'],
  standalone: false
})
export class NavComponent {
  navItems = [
    { label: 'Heatmap', icon: 'fas fa-fire', route: '/' },
    { label: 'Training Log', icon: 'fas fa-calendar-alt', route: '/log' }
  ];
}
