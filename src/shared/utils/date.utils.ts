import { format, toDate } from "date-fns-tz";
import { Timestamp } from "@google-cloud/firestore";

const CHILE_TZ = "America/Santiago";

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
    console.error("Formato de fecha no válido:", dateString);
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
export function convertUtcToChileTime(
  date: Date | string | Timestamp,
  dateFormat: string = "yyyy-MM-dd HH:mm:ss",
): string {
  const timeZone = "America/Santiago";
  let utcDate: Date;

  if (date instanceof Timestamp) {
    utcDate = date.toDate();
  } else if (typeof date === "string") {
    utcDate = new Date(date);
  } else {
    utcDate = date;
  }

  if (isNaN(utcDate.getTime())) {
    throw new RangeError("Invalid time value");
  }

  // Convierte la fecha UTC a la zona horaria de Chile
  const zonedDate = toDate(utcDate, { timeZone });

  // Formatea la fecha convertida
  return format(zonedDate, dateFormat, { timeZone });
}

/**
 * Convierte una fecha a las 00:00:00 hora Chile y retorna en UTC.
 * Útil para normalizar fechas de inicio de período.
 */
export function toChileStartOfDay(date: Date | string): Date {
  const d =
    typeof date === "string" ? new Date(date) : new Date(date.getTime());
  // Obtener la fecha en Chile (solo día)
  const chileDate = format(d, "yyyy-MM-dd", { timeZone: CHILE_TZ });
  // Crear fecha a las 00:00:00 Chile
  return toDate(`${chileDate} 00:00:00`, { timeZone: CHILE_TZ });
}

/**
 * Convierte una fecha a las 23:59:59 hora Chile y retorna en UTC.
 * Útil para normalizar fechas de cierre de período.
 */
export function toChileEndOfDay(date: Date | string): Date {
  const d =
    typeof date === "string" ? new Date(date) : new Date(date.getTime());
  // Obtener la fecha en Chile (solo día)
  const chileDate = format(d, "yyyy-MM-dd", { timeZone: CHILE_TZ });
  // Crear fecha a las 23:59:59 Chile
  return toDate(`${chileDate} 23:59:59`, { timeZone: CHILE_TZ });
}
