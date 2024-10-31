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