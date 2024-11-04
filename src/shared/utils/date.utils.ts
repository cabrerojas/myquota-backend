import { toZonedTime, format } from 'date-fns-tz';

/**
 * Convierte una cadena de texto de fecha en el formato "dd/mm/yyyy hh:mm"
 * a un objeto Date de JavaScript.
 *
 * @param dateString - Cadena de texto de fecha en formato "dd/mm/yyyy hh:mm"
 * @returns Date - Objeto de fecha JavaScript, o null si la conversión falla.
 */
export function parseFirebaseDate(dateString: string): Date | null {
    const dateParts = dateString.match(/\d+/g);

    if (!dateParts || dateParts.length < 5) {
        console.error('Formato de fecha no válido:', dateString);
        return null;
    }

    const [day, month, year, hour, minute] = dateParts.map(Number);
    return new Date(year, month - 1, day, hour, minute);
}

/**
 * Convierte una fecha UTC a la zona horaria de Chile y la formatea.
 * @param date - La fecha en formato UTC.
 * @param dateFormat - El formato de salida deseado (por defecto es 'yyyy-MM-dd HH:mm:ss').
 * @returns La fecha convertida y formateada en la zona horaria de Chile.
 */
export function convertUtcToChileTime(date: Date | string, dateFormat: string = 'yyyy-MM-dd HH:mm:ss'): string {
    const timeZone = 'America/Santiago';
    const utcDate = typeof date === 'string' ? new Date(date) : date;

    // Convierte la fecha UTC a la zona horaria de Chile
    const zonedDate = toZonedTime(utcDate, timeZone);

    // Formatea la fecha convertida
    return format(zonedDate, dateFormat, { timeZone });
}