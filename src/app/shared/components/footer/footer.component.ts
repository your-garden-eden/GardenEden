import { Component } from '@angular/core';
import { RouterLink } from '@angular/router'; // Import für RouterLink

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink], // RouterLink hinzufügen
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent {
  currentYear = new Date().getFullYear();
}