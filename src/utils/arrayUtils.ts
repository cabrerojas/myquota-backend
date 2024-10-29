
/**
 * Divide un array en subarrays de tamaño máximo especificado.
 * @param array - El array a dividir.
 * @param chunkSize - El tamaño máximo de cada subarray.
 * @returns Un array de subarrays.
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}