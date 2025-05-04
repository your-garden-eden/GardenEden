import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './maintenance.component.html',
  styleUrl: './maintenance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MaintenanceComponent implements OnInit, OnDestroy {
  // logoPath Eigenschaft entfernt

  targetDate!: Date;
  days: string = '00';
  hours: string = '00';
  minutes: string = '00';
  seconds: string = '00';
  countdownEnded = false;
  private intervalId: any;

  constructor(
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    this.startCountdown();
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private startCountdown(): void {
    // --- Zieljahr auf 2025 geändert ---
    this.targetDate = new Date('2025-05-11T15:00:00'); // 11. Mai 2025, 15:00 Uhr
    // --- Ende Zieljahr-Änderung ---

    console.log('Target Date set to:', this.targetDate); // Debugging

    this.updateCountdown();

    // Interval nur starten, wenn im Browser! (SSR-Fix)
    if (isPlatformBrowser(this.platformId)) {
      this.intervalId = setInterval(() => {
        this.updateCountdown();
      }, 1000);
    }
  }

  private updateCountdown(): void {
    const now = new Date().getTime(); // Holt die Zeit von deinem System (April 2025)
    if (!this.targetDate) {
      console.error("Target date is not set!");
      return;
    }

    // Debugging für Zeitstempel
    const targetTimestamp = this.targetDate.getTime(); // Zeitstempel für Mai 2025
    console.log('Target Timestamp:', targetTimestamp);
    console.log('Current Timestamp (now):', now);

    const distance = targetTimestamp - now; // Sollte jetzt POSITIV sein (Mai 2025 - April 2025)

    // Altes Debugging für Distanz
    if (this.seconds === '00' || distance <= 0) {
       console.log('Current Distance (ms):', distance);
       if(distance <= 0) {
           console.log('Countdown ended because distance is <= 0');
       } else {
           // Logge die positive Distanz, um sicherzugehen
           console.log('Countdown running, positive distance.');
       }
    }

    if (distance <= 0) {
      this.days = '00';
      this.hours = '00';
      this.minutes = '00';
      this.seconds = '00';
      this.countdownEnded = true;
      if (this.intervalId) {
         clearInterval(this.intervalId);
         this.intervalId = null;
       }
    } else {
      const d = Math.floor(distance / (1000 * 60 * 60 * 24));
      const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((distance % (1000 * 60)) / 1000);

      this.days = d.toString().padStart(2, '0');
      this.hours = h.toString().padStart(2, '0');
      this.minutes = m.toString().padStart(2, '0');
      this.seconds = s.toString().padStart(2, '0');
      this.countdownEnded = false;
    }
    this.cdr.markForCheck();
  }
}