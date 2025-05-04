import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'imageTransform',
  standalone: true
})
export class ImageTransformPipe implements PipeTransform {
  transform(value: string | undefined, width?: number, height?: number): string {
    if (!value) return 'assets/placeholder.jpeg'; // Fallback

    // Einfache Version: Gibt URL zurück.
    // TODO: Implementiere Logik, um _WIDTHxHEIGHT an die Shopify URL anzuhängen (vor dem '?v=')
    // Beispiel (vereinfacht, braucht robustere Logik für bestehende Parameter):
    // if (width && height) {
    //   const parts = value.split('?');
    //   const urlWithoutParams = parts[0];
    //   const params = parts[1] ? `?${parts[1]}` : '';
    //   const extensionIndex = urlWithoutParams.lastIndexOf('.');
    //   if (extensionIndex > -1) {
    //      const base = urlWithoutParams.substring(0, extensionIndex);
    //      const ext = urlWithoutParams.substring(extensionIndex);
    //      return `${base}_${width}x${height}${ext}${params}`;
    //   }
    // }
    return value;
  }
}