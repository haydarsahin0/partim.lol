/**
 * Oyunun kendi hesaplarını (açılış başkanları) işaretleyen nokta.
 *
 * Yanına "bot" yazmıyoruz: sıralamada hiç görünmedikleri için nokta zaten
 * ayırt edici. Yine de sessizce geçiştirmiyoruz — koltuğu parayla devralan
 * biri karşısındakinin gerçek bir oyuncu olmadığını görebilmeli; bu yüzden
 * işaretin bir başlığı var ve ekran okuyucular da okuyabiliyor.
 */
export function BotDot({ className }: { className?: string }) {
  return (
    <span
      className={className}
      title="Oyunun açılış hesabı"
      style={{ display: "inline-flex", alignItems: "center" }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          background: "rgba(255,255,255,0.92)",
          boxShadow: "0 0 0 2px rgba(255,255,255,0.14)",
        }}
      />
      <span className="sr-only">oyunun açılış hesabı</span>
    </span>
  );
}
