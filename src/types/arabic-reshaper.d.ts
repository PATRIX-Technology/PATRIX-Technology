declare module 'arabic-reshaper' {
  export function convertArabic(text: string): string;
  export function convertArabicBack(text: string): string;
  const _default: { convertArabic: typeof convertArabic; convertArabicBack: typeof convertArabicBack };
  export default _default;
}
