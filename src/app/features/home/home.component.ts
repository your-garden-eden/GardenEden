import { Component } from '@angular/core';
// import { RouterLink } from '@angular/router'; // Entfernt

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [/* RouterLink entfernt */], // Leer oder andere notwendige Imports
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  // Keine spezifische Logik nötig
}