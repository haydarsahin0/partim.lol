import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { ProvinceDetailView } from "@/components/ProvinceDetailView";
import { PROVINCE_BY_ID } from "@/data/provinces";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * Haritadan seçilen il, ekranın ortasında açılan pencerede.
 *
 * Eskiden sağdaki yan panelde açılıyordu: masaüstünde haritanın kenarında
 * kalıyor, telefonda ise haritanın çok altına düşüyordu ve tıklayan kişi bir
 * şey olmadığını sanıyordu. Pencere her iki ekranda da tıklamanın karşılığını
 * doğrudan gözün önüne getiriyor.
 *
 * İçerik il sayfasının aynısı (ProvinceDetailView): sonuçlar, il başkanlığı
 * ve oy pusulası. İki ayrı görünüm yazmıyoruz — biri düzelirken diğerinin
 * geride kalması kaçınılmaz olurdu.
 */
export function ProvinceDialog({
  provinceId,
  onClose,
}: {
  /** null ise pencere kapalı */
  provinceId: string | null;
  onClose: () => void;
}) {
  const province = provinceId ? PROVINCE_BY_ID[provinceId] : null;

  return (
    <Dialog open={!!province} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        // p-0: panelin kendi başlığı ve dolgusu var.
        // [&>button]:hidden: Dialog'un hazır kapatma düğmesi panelin kendi
        // kapatma düğmesiyle üst üste biniyordu; panelinki kalsın.
        className="max-w-xl gap-0 p-0 [&>button]:hidden"
        onOpenAutoFocus={(event) => {
          // Odak otomatik olarak ilk düğmeye kayınca telefonda klavye
          // açılabiliyor ve pencere zıplıyor; başlıkta kalsın.
          event.preventDefault();
        }}
      >
        {/* Radix, erişilebilirlik için başlık ve açıklama bekler. Görsel
            başlık panelin kendi içinde; buradakiler ekran okuyucular için. */}
        <VisuallyHidden.Root>
          <DialogTitle>{province?.name ?? "İl"}</DialogTitle>
          <DialogDescription>
            {province?.name} için oy dağılımı, il başkanlıkları ve oy pusulası.
          </DialogDescription>
        </VisuallyHidden.Root>

        {province && (
          <ProvinceDetailView
            provinceId={province.id}
            showLink
            onClose={onClose}
            className="max-h-[calc(100dvh-3rem)]"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
