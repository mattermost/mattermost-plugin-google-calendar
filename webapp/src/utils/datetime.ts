export function getTodayString(): string {
    return new Date().toISOString().split('T')[0];
}
